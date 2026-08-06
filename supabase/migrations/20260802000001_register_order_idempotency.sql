-- Vora – Idempotencia en register_order
-- ---------------------------------------------------------------------------
-- Problema: si el servidor registra la venta pero la respuesta se pierde
-- (timeout, señal cortada a media petición), la cola offline nunca borra la
-- orden y la reenvía al reconectar → venta duplicada y stock descontado dos
-- veces.
--
-- Solución: el cliente genera un UUID por venta (ya lo hace en
-- offline-queue.service.ts) y lo manda. Si el par (business_id, client_uuid)
-- ya existe, devolvemos la orden existente sin volver a insertar nada.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists client_uuid uuid;

-- Único POR NEGOCIO: evita que un tenant pueda sondear las órdenes de otro
-- mandando UUIDs ajenos.
create unique index if not exists idx_orders_business_client_uuid
  on orders (business_id, client_uuid)
  where client_uuid is not null;

create or replace function register_order(
  p_client_id      uuid,
  p_payment_method text,
  p_items          jsonb,       -- [{product_id, quantity, unit_price}]
  p_notes          text default null,
  p_client_uuid    uuid default null
)
returns uuid language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_order_id    uuid;
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
  if p_client_uuid is not null then
    select id into v_order_id
    from orders
    where business_id = v_business_id and client_uuid = p_client_uuid;

    if found then
      return v_order_id;
    end if;
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

  -- Insert order header (notes trimmed; stored as null if blank).
  -- El bloque anidado cubre la carrera de dos sincronizaciones simultáneas de
  -- la misma venta: la segunda choca contra el índice único y devuelve la que
  -- ya quedó registrada, sin duplicar items ni stock.
  begin
    insert into orders (business_id, client_id, payment_method, notes, created_by, client_uuid)
    values (
      v_business_id,
      p_client_id,
      p_payment_method,
      nullif(trim(coalesce(p_notes, '')), ''),
      auth.uid(),
      p_client_uuid
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
