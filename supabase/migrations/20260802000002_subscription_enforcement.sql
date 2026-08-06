-- Vora – La suscripción vencida bloquea la operación
-- ---------------------------------------------------------------------------
-- Hasta ahora `end_date` era decorativo: los guards solo miran sesión y rol, y
-- ningún RPC consultaba la suscripción. Un negocio que dejó de pagar seguía
-- vendiendo con normalidad.
--
-- El bloqueo tiene que vivir acá y no en Angular: un guard del cliente se
-- esquiva con la consola abierta. Se bloquea SOLO la venta (register_order),
-- que es la palanca de cobro; inventario y reportes siguen accesibles para que
-- el negocio no pierda sus datos ni el acceso a su historial.
--
-- Redefine register_order conservando la idempotencia de 20260802000001.
-- ---------------------------------------------------------------------------

-- Gracia de 5 días después de end_date antes de cortar.
-- Debe coincidir con SUBSCRIPTION_GRACE_DAYS en subscription.model.ts.
create or replace function subscription_blocked(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.status = 'cancelled'
          or (current_date - s.end_date) > 5
      from business_subscriptions s
      where s.business_id = p_business_id
    ),
    -- Sin suscripción registrada NO se bloquea: negocios creados antes del
    -- módulo de facturación, demos y pruebas deben poder operar. Bloquear por
    -- ausencia de datos deja gente afuera por un descuido de carga.
    false
  );
$$;

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

  if subscription_blocked(v_business_id) then
    raise exception 'Suscripción vencida. El sistema está bloqueado hasta regularizar el pago.'
      using errcode = 'VORA1';
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

  -- Insert order header. El bloque anidado cubre la carrera de dos
  -- sincronizaciones simultáneas de la misma venta.
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
