-- Vora – Suscripción vencida = modo solo lectura
-- ---------------------------------------------------------------------------
-- Antes: `register_order` rechazaba la venta y el guard de Angular sacaba al
-- negocio de toda la app. Efecto real: el cliente perdía el acceso a sus
-- propios datos, que no es lo que queremos.
--
-- Ahora: el negocio LEE todo con normalidad — historial, inventario, reportes,
-- arqueos — y no puede escribir nada. Sin vender, sin agregar productos, sin
-- editar. Suficiente presión de cobro sin secuestrarle la información.
--
-- Se implementa con un trigger uniforme por tabla en vez de reescribir las
-- policies de RLS: las policies actuales usan `for all using (...)`, donde el
-- USING gobierna también el SELECT. Meter la condición ahí bloquearía la
-- lectura, que es justo lo contrario de lo buscado.
-- ---------------------------------------------------------------------------

create or replace function assert_subscription_writable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El super_admin nunca se bloquea: es quien registra el pago que reactiva.
  if not is_super_admin() and subscription_blocked(current_user_business_id()) then
    raise exception 'Suscripción vencida. El sistema está en modo solo lectura hasta regularizar el pago.'
      using errcode = 'VORA1';
  end if;
  return null; -- trigger de sentencia: el valor de retorno se ignora
end;
$$;

-- Se aplica a las tablas operativas del negocio.
--
-- Quedan FUERA a propósito:
--   business_subscriptions, subscription_payments → registrar el pago es
--     justamente lo que levanta el bloqueo; bloquearlas sería un candado
--     cerrado sobre su propia llave.
--   businesses, profiles → los administra el super_admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'clients', 'products', 'suppliers',
    'orders', 'order_items',
    'acquisitions', 'acquisition_items',
    'purchase_orders', 'purchase_order_items',
    'employees', 'salary_payments',
    'cash_sessions'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabla % no existe todavía, se omite', t;
      continue;
    end if;

    execute format('drop trigger if exists trg_subscription_writable on %I', t);
    execute format(
      'create trigger trg_subscription_writable
         before insert or update or delete on %I
         for each statement execute function assert_subscription_writable()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Se quitan los chequeos propios de register_order y open_cash_session.
--
-- Ya no hacen falta: el trigger cubre esas tablas. Y sobre todo, decían "el
-- sistema está bloqueado", que con solo-lectura pasó a ser falso — el cajero
-- vería un mensaje distinto según qué intentara hacer. Un solo lugar que
-- levanta el error es un solo mensaje.
-- ---------------------------------------------------------------------------

create or replace function open_cash_session(p_opening_float numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_session_id  uuid;
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;

  if p_opening_float < 0 then
    raise exception 'El fondo de caja no puede ser negativo.';
  end if;

  insert into cash_sessions (business_id, opening_float, opened_by)
  values (v_business_id, coalesce(p_opening_float, 0), auth.uid())
  returning id into v_session_id;

  return v_session_id;
exception when unique_violation then
  raise exception 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.';
end;
$$;

create or replace function register_order(
  p_client_id       uuid,
  p_payment_method  text,
  p_items           jsonb,       -- [{product_id, quantity, unit_price}]
  p_notes           text default null,
  p_client_uuid     uuid default null,
  p_cash_session_id uuid default null
)
returns uuid language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_order_id    uuid;
  v_session_id  uuid;
  v_item        jsonb;
  v_total       numeric(12,2) := 0;
  v_product_id  uuid;
  v_quantity    integer;
  v_unit_price  numeric(12,2);
  v_has_stock   boolean;
  v_stock       integer;
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

  -- Turno: el que mande el cliente (validado contra el negocio) o el abierto.
  if p_cash_session_id is not null then
    select id into v_session_id
    from cash_sessions
    where id = p_cash_session_id and business_id = v_business_id;
  end if;

  if v_session_id is null then
    select id into v_session_id
    from cash_sessions
    where business_id = v_business_id
      and opened_by = auth.uid()
      and status = 'open';
  end if;

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
    insert into orders (business_id, client_id, payment_method, notes, created_by, client_uuid, cash_session_id)
    values (
      v_business_id,
      p_client_id,
      p_payment_method,
      nullif(trim(coalesce(p_notes, '')), ''),
      auth.uid(),
      p_client_uuid,
      v_session_id
    )
    returning id into v_order_id;
  exception when unique_violation then
    select id into v_order_id
    from orders
    where business_id = v_business_id and client_uuid = p_client_uuid;
    return v_order_id;
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

  -- Update total
  update orders set total_amount = v_total where id = v_order_id;

  return v_order_id;
end;
$$;
