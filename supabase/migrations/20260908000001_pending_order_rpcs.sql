-- Vora – RPCs de pedidos pendientes (spec 001)
-- ---------------------------------------------------------------------------
-- Tres operaciones, y las tres tienen que poder viajar en la cola offline:
--
--   register_order      crear (cobrando o dejándolo pendiente)
--   add_items_to_order  agregar lo que la mesa siguió pidiendo
--   settle_order        cobrar un pendiente
--
-- Las dos nuevas referencian el pedido por `client_uuid` y no por `id`: una
-- operación encolada offline puede apuntar a un pedido que todavía no existe
-- en el servidor, y que recién nacerá cuando sincronice el `create` que va
-- antes en la cadena (RF-21, RF-22).
--
-- Códigos de error propios, para que el cliente distinga qué hacer con cada
-- fallo en vez de leer el texto:
--   VORA4  la mesa ya tiene un pendiente abierto        → ofrecer agregar ahí
--   VORA5  las líneas de pago no suman el total         → corregir el reparto
--   VORA6  el total cambió desde que se cobró           → rehacer el cobro
--   VORA7  el pedido ya está saldado o cancelado        → cobrar aparte
--   VORA8  no es tu pendiente y no eres admin           → permiso
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Registrar las líneas de pago de un pedido
-- ---------------------------------------------------------------------------
-- Compartida por el cobro inmediato y el saldado de un pendiente: la regla de
-- que la suma tiene que dar exacto (RF-11) es la misma en los dos casos y no
-- puede vivir en dos lugares.
--
-- Devuelve el método único cuando el pago fue simple, o null cuando fue
-- dividido, para dejarlo en orders.payment_method (columna heredada).

create or replace function apply_order_payments(
  p_business_id     uuid,
  p_order_id        uuid,
  p_payments        jsonb,   -- [{method, amount}]
  p_cash_session_id uuid,
  p_total           numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    jsonb;
  v_method  text;
  v_amount  numeric(12,2);
  v_sum     numeric(12,2) := 0;
  v_methods text[] := array[]::text[];
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_method := v_line->>'method';
    v_amount := (v_line->>'amount')::numeric(12,2);

    if v_method is null or v_method not in ('cash', 'card', 'qr') then
      raise exception 'Método de pago inválido: %', coalesce(v_method, 'ninguno');
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Cada línea de pago debe tener un monto mayor a cero.';
    end if;

    v_sum := v_sum + v_amount;
    if not (v_method = any (v_methods)) then
      v_methods := v_methods || v_method;
    end if;
  end loop;

  -- RF-11. numeric(12,2) contra numeric(12,2): la comparación es exacta, no
  -- hay margen de coma flotante que perdonar.
  if v_sum <> p_total then
    raise exception 'El pago suma % y el total del pedido es %. Ajusta el reparto antes de cobrar.', v_sum, p_total
      using errcode = 'VORA5';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into order_payments (business_id, order_id, method, amount, cash_session_id, created_by)
    values (
      p_business_id,
      p_order_id,
      v_line->>'method',
      (v_line->>'amount')::numeric(12,2),
      p_cash_session_id,
      auth.uid()
    );
  end loop;

  if array_length(v_methods, 1) = 1 then
    return v_methods[1];
  end if;
  return null;
end;
$$;

-- Turno al que se imputa un cobro: el que mande el cliente (validado contra el
-- negocio) o, si no manda ninguno, el abierto del cajero. Lo primero es lo que
-- hace que un cobro registrado offline entre al turno en que ocurrió y no al
-- que esté abierto cuando por fin sincroniza (RF-27).
create or replace function resolve_cash_session(
  p_business_id     uuid,
  p_cash_session_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from cash_sessions
      where id = p_cash_session_id and business_id = p_business_id),
    (select id from cash_sessions
      where business_id = p_business_id and opened_by = auth.uid() and status = 'open')
  );
$$;

-- ---------------------------------------------------------------------------
-- register_order
-- ---------------------------------------------------------------------------
-- Se dropean las firmas viejas antes de crear la nueva. `create or replace`
-- con parámetros nuevos NO reemplaza: crea una sobrecarga, y desde el momento
-- en que dos sobrecargas aceptan la misma llamada por nombre, PostgREST falla
-- con "function is not unique". La cuenta arrastraba tres versiones (3, 5 y 6
-- argumentos) de las migraciones anteriores; acá queda una sola.

drop function if exists register_order(uuid, text, jsonb);
drop function if exists register_order(uuid, text, jsonb, text, uuid);
drop function if exists register_order(uuid, text, jsonb, text, uuid, uuid);

create or replace function register_order(
  p_client_id       uuid,
  p_payment_method  text,
  p_items           jsonb,       -- [{product_id, quantity, unit_price}]
  p_notes           text default null,
  p_client_uuid     uuid default null,
  p_cash_session_id uuid default null,
  p_table_id        uuid default null,
  p_is_takeaway     boolean default false,
  p_status          text default 'settled',
  p_payments        jsonb default null   -- [{method, amount}]; null = pago simple
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_business_id   uuid;
  v_order_id      uuid;
  v_session_id    uuid;
  v_item          jsonb;
  v_total         numeric(12,2) := 0;
  v_product_id    uuid;
  v_quantity      integer;
  v_unit_price    numeric(12,2);
  v_has_stock     boolean;
  v_stock         integer;
  v_table_active  boolean;
  v_is_pending    boolean;
  v_payments      jsonb;
  v_method        text;
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;

  -- Idempotencia: si esta venta ya se registró, devolver la misma orden.
  -- Va antes de cualquier escritura, así que un reintento sobre una venta ya
  -- registrada sigue funcionando aunque la suscripción haya vencido entretanto.
  if p_client_uuid is not null then
    select id into v_order_id
    from orders
    where business_id = v_business_id and client_uuid = p_client_uuid;

    if found then
      return v_order_id;
    end if;
  end if;

  if p_status not in ('pending', 'settled') then
    raise exception 'Estado de pedido inválido: %', p_status;
  end if;
  v_is_pending := p_status = 'pending';

  if p_is_takeaway and p_table_id is not null then
    raise exception 'Un pedido es de mesa o para llevar, no las dos cosas.';
  end if;

  -- Mesa: del negocio y activa. Un pendiente por mesa (RF-6): el índice único
  -- parcial es el que manda, pero comprobarlo acá permite devolver el mensaje
  -- que el cajero necesita — la opción de sumar los ítems al pedido que ya
  -- está abierto en esa mesa.
  if p_table_id is not null then
    select is_active into v_table_active
    from tables
    where id = p_table_id and business_id = v_business_id;

    if not found then
      raise exception 'La mesa seleccionada no existe.';
    end if;

    if not v_table_active then
      raise exception 'La mesa seleccionada está desactivada.';
    end if;

    if v_is_pending and exists (
      select 1 from orders
      where business_id = v_business_id
        and table_id = p_table_id
        and status = 'pending'
        and cancelled_at is null
    ) then
      raise exception 'Esa mesa ya tiene un pedido pendiente abierto.'
        using errcode = 'VORA4';
    end if;
  end if;

  v_session_id := resolve_cash_session(v_business_id, p_cash_session_id);

  -- Validate items
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    select has_stock, stock
    into v_has_stock, v_stock
    from products
    where id = v_product_id and business_id = v_business_id and deleted_at is null;

    if not found then
      raise exception 'product % not found', v_product_id;
    end if;

    if v_has_stock and v_stock < v_quantity then
      raise exception 'insufficient stock for product %', v_product_id;
    end if;
  end loop;

  -- Insert order header. El bloque anidado cubre la carrera de dos
  -- sincronizaciones simultáneas de la misma venta.
  begin
    insert into orders (
      business_id, client_id, payment_method, notes, created_by, client_uuid,
      cash_session_id, table_id, is_takeaway, status, settled_at, settled_by
    )
    values (
      v_business_id,
      p_client_id,
      case when v_is_pending then null else p_payment_method end,
      nullif(trim(coalesce(p_notes, '')), ''),
      auth.uid(),
      p_client_uuid,
      v_session_id,
      p_table_id,
      coalesce(p_is_takeaway, false),
      p_status,
      case when v_is_pending then null else now() end,
      case when v_is_pending then null else auth.uid() end
    )
    returning id into v_order_id;
  exception
    when unique_violation then
      -- Puede ser la misma venta reenviada (client_uuid) o una segunda cuenta
      -- para una mesa que ya tiene la suya abierta (RF-6).
      select id into v_order_id
      from orders
      where business_id = v_business_id and client_uuid = p_client_uuid;

      if found then
        return v_order_id;
      end if;

      raise exception 'Esa mesa ya tiene un pedido pendiente abierto.'
        using errcode = 'VORA4';
  end;

  -- Insert items and accumulate total
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);

    insert into order_items (order_id, business_id, product_id, quantity, unit_price)
    values (v_order_id, v_business_id, v_product_id, v_quantity, v_unit_price);

    v_total := v_total + (v_unit_price * v_quantity);

    -- Decrement stock if tracked
    update products
    set stock = stock - v_quantity
    where id = v_product_id and has_stock = true;
  end loop;

  update orders set total_amount = v_total where id = v_order_id;

  -- Un pendiente no genera líneas de pago: por eso no entra al arqueo ni a los
  -- reportes de ingresos hasta que se salde (RF-5, RF-20).
  if not v_is_pending then
    v_payments := coalesce(
      p_payments,
      case
        when v_total > 0 then jsonb_build_array(
          jsonb_build_object('method', coalesce(p_payment_method, 'cash'), 'amount', v_total)
        )
        else '[]'::jsonb
      end
    );
    v_method := apply_order_payments(v_business_id, v_order_id, v_payments, v_session_id, v_total);
    update orders set payment_method = v_method where id = v_order_id;
  end if;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resolver un pedido por su client_uuid (o por id, para los que no lo tengan)
-- ---------------------------------------------------------------------------

create or replace function resolve_order_ref(
  p_business_id  uuid,
  p_client_uuid  uuid,
  p_order_id     uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from orders
  where business_id = p_business_id
    and (
      (p_client_uuid is not null and client_uuid = p_client_uuid)
      or (p_client_uuid is null and p_order_id is not null and id = p_order_id)
    )
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- add_items_to_order (RF-8, RF-9, RF-24, RF-26)
-- ---------------------------------------------------------------------------
-- Acumulativo a propósito: los ítems se insertan como líneas nuevas en vez de
-- fusionarse con las existentes. Dos dispositivos sumando a la misma mesa no
-- están en conflicto, y "el último gana" perdería consumo ya servido.

create or replace function add_items_to_order(
  p_operation_uuid   uuid,
  p_order_client_uuid uuid,
  p_items            jsonb,
  p_order_id         uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_order_id    uuid;
  v_order       orders%rowtype;
  v_item        jsonb;
  v_product_id  uuid;
  v_quantity    integer;
  v_unit_price  numeric(12,2);
  v_has_stock   boolean;
  v_stock       integer;
  v_total       numeric(12,2);
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;

  v_order_id := resolve_order_ref(v_business_id, p_order_client_uuid, p_order_id);
  if v_order_id is null then
    raise exception 'El pedido no existe o no pertenece a este negocio.';
  end if;

  -- Idempotencia ANTES de mirar el estado (RF-23): si esta misma operación ya
  -- se aplicó y el pedido se saldó después, el reintento tiene que devolver
  -- "ya está" y no "ese pedido ya se cobró".
  begin
    insert into applied_operations (operation_uuid, business_id, order_id, kind)
    values (p_operation_uuid, v_business_id, v_order_id, 'add_items');
  exception when unique_violation then
    select total_amount into v_total from orders where id = v_order_id;
    return jsonb_build_object(
      'order_id', v_order_id, 'total_amount', v_total, 'already_applied', true
    );
  end;

  select * into v_order from orders where id = v_order_id for update;

  if v_order.cancelled_at is not null then
    raise exception 'Ese pedido fue cancelado. Estos productos deben cobrarse en un pedido aparte.'
      using errcode = 'VORA7';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Ese pedido ya fue cobrado. Estos productos deben cobrarse en un pedido aparte.'
      using errcode = 'VORA7';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    select has_stock, stock
    into v_has_stock, v_stock
    from products
    where id = v_product_id and business_id = v_business_id and deleted_at is null;

    if not found then
      raise exception 'product % not found', v_product_id;
    end if;

    if v_has_stock and v_stock < v_quantity then
      raise exception 'insufficient stock for product %', v_product_id;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);

    insert into order_items (order_id, business_id, product_id, quantity, unit_price)
    values (v_order_id, v_business_id, v_product_id, v_quantity, v_unit_price);

    update products
    set stock = stock - v_quantity
    where id = v_product_id and has_stock = true;
  end loop;

  -- El total se recalcula desde los ítems, no se acumula sobre el anterior:
  -- así el resultado no depende de cuántas veces ni en qué orden llegaron.
  select coalesce(sum(unit_price * quantity), 0) into v_total
  from order_items where order_id = v_order_id;

  update orders set total_amount = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id, 'total_amount', v_total, 'already_applied', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_order (RF-10 a RF-16, RF-25)
-- ---------------------------------------------------------------------------
-- `p_expected_total` es el bloqueo optimista: viaja el total que el dispositivo
-- tenía al cobrar, y si el servidor tiene otro (porque otro dispositivo le
-- agregó ítems que este nunca vio), el cobro se rechaza en vez de aceptar un
-- pago incompleto en silencio.

create or replace function settle_order(
  p_operation_uuid    uuid,
  p_order_client_uuid uuid,
  p_payments          jsonb,    -- [{method, amount}]
  p_expected_total    numeric default null,
  p_cash_session_id   uuid default null,
  p_order_id          uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_role        text;
  v_order_id    uuid;
  v_order       orders%rowtype;
  v_session_id  uuid;
  v_method      text;
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;
  v_role := current_user_role();

  v_order_id := resolve_order_ref(v_business_id, p_order_client_uuid, p_order_id);
  if v_order_id is null then
    raise exception 'El pedido no existe o no pertenece a este negocio.';
  end if;

  -- Idempotencia antes que nada: un reintento del mismo cobro no vuelve a
  -- registrar líneas de pago (RF-23).
  begin
    insert into applied_operations (operation_uuid, business_id, order_id, kind)
    values (p_operation_uuid, v_business_id, v_order_id, 'settle');
  exception when unique_violation then
    select * into v_order from orders where id = v_order_id;
    return jsonb_build_object(
      'order_id', v_order_id, 'total_amount', v_order.total_amount, 'already_applied', true
    );
  end;

  select * into v_order from orders where id = v_order_id for update;

  if v_order.cancelled_at is not null then
    raise exception 'Ese pedido fue cancelado.' using errcode = 'VORA7';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Ese pedido ya fue cobrado.' using errcode = 'VORA7';
  end if;

  -- RF-15 / RF-16: el pendiente lo salda quien lo abrió, o cualquier admin.
  if v_order.created_by is distinct from auth.uid()
     and v_role not in ('admin', 'super_admin') then
    raise exception 'Solo el cajero que abrió este pedido o un administrador pueden cobrarlo.'
      using errcode = 'VORA8';
  end if;

  -- RF-25
  if p_expected_total is not null and v_order.total_amount <> p_expected_total::numeric(12,2) then
    raise exception 'El pedido cambió: ahora suma % y tú cobraste sobre %. Revísalo y vuelve a cobrar.',
      v_order.total_amount, p_expected_total
      using errcode = 'VORA6';
  end if;

  v_session_id := resolve_cash_session(v_business_id, p_cash_session_id);

  v_method := apply_order_payments(
    v_business_id, v_order_id, p_payments, v_session_id, v_order.total_amount
  );

  update orders
  set status         = 'settled',
      settled_at     = now(),
      settled_by     = auth.uid(),
      payment_method = v_method,
      -- Solo si el pedido nació sin turno: el turno del pedido es dato
      -- histórico, el que manda para el arqueo es el de cada línea de pago.
      cash_session_id = coalesce(cash_session_id, v_session_id)
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id, 'total_amount', v_order.total_amount, 'already_applied', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Los ayudantes NO se exponen como RPC
-- ---------------------------------------------------------------------------
-- Son SECURITY DEFINER y reciben el business_id como parámetro en vez de
-- deducirlo: expuestos vía PostgREST, cualquiera podría llamar a
-- apply_order_payments() con el negocio y el pedido que quisiera e inventarse
-- líneas de pago. Los RPC de arriba (que sí deducen el negocio de la sesión)
-- los siguen llamando sin problema: corren como su dueño.

revoke all on function apply_order_payments(uuid, uuid, jsonb, uuid, numeric) from public, anon, authenticated;
revoke all on function resolve_cash_session(uuid, uuid)                       from public, anon, authenticated;
revoke all on function resolve_order_ref(uuid, uuid, uuid)                    from public, anon, authenticated;
