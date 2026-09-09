-- Vora – Costo congelado por línea de venta (spec 002)
-- ---------------------------------------------------------------------------
-- Hasta acá `products.cost` era un dato de catálogo sin ningún uso: se carga
-- en el formulario de producto y ahí se queda. Ningún reporte lo lee, así que
-- no hay forma de saber cuánto deja de ganancia una venta.
--
-- La regla de esta migración: el costo se CONGELA en `order_items.unit_cost`
-- en el momento de vender, igual que ya se congela `unit_price`. Sin esto, si
-- mañana sube el costo del café, la ganancia de las ventas de hoy cambiaría
-- sola y un mes ya cerrado dejaría de ser comparable con el resto.
--
-- Lo escribe el servidor, nunca el cliente: `register_order` y
-- `add_items_to_order` leen `products.cost` en la misma consulta con la que ya
-- validan el producto y el stock. Aceptar un costo mandado por el cliente
-- dejaría a cualquiera con acceso al POS declarar el margen que quiera.
-- ---------------------------------------------------------------------------

alter table order_items add column if not exists unit_cost numeric(12, 2) not null default 0;

-- Backfill: no es el costo real que tuvieron esas ventas —ese dato no existe
-- en ningún lado—, es la mejor aproximación disponible (el costo actual del
-- producto) para dejar el sistema en un estado uniforme desde hoy. De acá en
-- adelante el dato es exacto. Los productos eliminados (product_id null tras
-- el ON DELETE SET NULL, o ya sin fila) quedan en 0: es preferible subestimar
-- a inventar un costo.
update order_items oi
set unit_cost = p.cost
from products p
where oi.product_id = p.id
  and oi.unit_cost = 0;

-- ---------------------------------------------------------------------------
-- register_order: se dropea la firma anterior (10 argumentos, de
-- 20260908000001) y se redefine leyendo el costo del catálogo.
-- ---------------------------------------------------------------------------

drop function if exists register_order(uuid, text, jsonb, text, uuid, uuid, uuid, boolean, text, jsonb);

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
  v_unit_cost     numeric(12,2);
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

  -- Insert items and accumulate total. El costo se lee del catálogo, nunca
  -- del cliente (spec 002, RF-2).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);

    select cost into v_unit_cost
    from products
    where id = v_product_id and business_id = v_business_id;

    insert into order_items (order_id, business_id, product_id, quantity, unit_price, unit_cost)
    values (v_order_id, v_business_id, v_product_id, v_quantity, v_unit_price, coalesce(v_unit_cost, 0));

    v_total := v_total + (v_unit_price * v_quantity);

    -- Decrement stock if tracked
    update products
    set stock = stock - v_quantity
    where id = v_product_id and has_stock = true;
  end loop;

  update orders set total_amount = v_total where id = v_order_id;

  -- Un pendiente no genera líneas de pago: por eso no entra al arqueo ni a los
  -- reportes de ingresos hasta que se salde (RF-5, RF-20 de la spec 001).
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
-- add_items_to_order: mismo criterio de costo que register_order (RF-4).
-- ---------------------------------------------------------------------------

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
  v_unit_cost   numeric(12,2);
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

  -- Idempotencia ANTES de mirar el estado (RF-23 de la spec 001): si esta
  -- misma operación ya se aplicó y el pedido se saldó después, el reintento
  -- tiene que devolver "ya está" y no "ese pedido ya se cobró".
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

    select cost into v_unit_cost
    from products
    where id = v_product_id and business_id = v_business_id;

    insert into order_items (order_id, business_id, product_id, quantity, unit_price, unit_cost)
    values (v_order_id, v_business_id, v_product_id, v_quantity, v_unit_price, coalesce(v_unit_cost, 0));

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
