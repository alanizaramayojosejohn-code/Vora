-- =============================================================================
-- SaasGym · Products: has_stock
-- has_stock = true  → requiere stock > 0 para aparecer en ventas (comportamiento anterior).
-- has_stock = false → siempre disponible para venta, no decrementa stock.
-- Existentes quedan en true (sin cambio de comportamiento).
-- =============================================================================

alter table public.products
  add column has_stock boolean not null default true;

-- =============================================================================
-- register_order: omitir validación y decremento cuando has_stock = false
-- =============================================================================

create or replace function public.register_order(
  p_client_id      uuid    default null,
  p_payment_method text    default 'cash',
  p_items          jsonb   default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_caller_type     text;
  v_order_id        uuid;
  v_total           numeric(12,2) := 0;
  v_item            jsonb;
  v_item_type       text;
  v_product         public.products%rowtype;
  v_plan            public.membership_plans%rowtype;
  v_cm_id           uuid;
  v_end_date        date;
  v_start_date      date;
  v_quantity        int;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();
  v_caller_type     := public.current_user_business_type();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if p_payment_method not in ('cash', 'card', 'qr') then
    raise exception 'Método de pago inválido: %', p_payment_method;
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La orden debe tener al menos un ítem';
  end if;

  if p_client_id is not null then
    if not exists (
      select 1 from public.clients
      where id = p_client_id and business_id = v_caller_business
    ) then
      raise exception 'El cliente no pertenece a este negocio';
    end if;
  end if;

  -- Primera pasada: validar todo y calcular total
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_type := v_item->>'type';

    if v_item_type = 'product' then
      v_quantity := (v_item->>'quantity')::int;
      if coalesce(v_quantity, 0) <= 0 then
        raise exception 'La cantidad debe ser mayor a 0';
      end if;

      select * into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid;

      if v_product.id is null then
        raise exception 'Producto % no encontrado', v_item->>'product_id';
      end if;
      if v_product.deleted_at is not null then
        raise exception 'El producto "%" fue eliminado', v_product.name;
      end if;
      if v_product.business_id is distinct from v_caller_business then
        raise exception 'El producto pertenece a otro negocio';
      end if;
      -- Solo validar stock si el producto lo gestiona
      if v_product.has_stock and v_product.stock < v_quantity then
        raise exception 'Stock insuficiente para "%": disponible %, solicitado %',
          v_product.name, v_product.stock, v_quantity;
      end if;

      v_total := v_total + (v_product.price * v_quantity);

    elsif v_item_type = 'membership' then
      if v_caller_type is distinct from 'gym' then
        raise exception 'Las membresías solo están disponibles en negocios de tipo gym';
      end if;
      if p_client_id is null then
        raise exception 'Se requiere cliente para registrar una membresía';
      end if;

      select * into v_plan
      from public.membership_plans
      where id = (v_item->>'plan_id')::uuid;

      if v_plan.id is null then
        raise exception 'Plan % no encontrado', v_item->>'plan_id';
      end if;
      if v_plan.business_id is distinct from v_caller_business then
        raise exception 'El plan pertenece a otro negocio';
      end if;

      v_total := v_total + v_plan.price;
    else
      raise exception 'Tipo de ítem inválido: %', v_item_type;
    end if;
  end loop;

  -- Crear orden
  insert into public.orders (business_id, client_id, payment_method, total_amount, created_by)
  values (v_caller_business, p_client_id, p_payment_method, v_total, auth.uid())
  returning id into v_order_id;

  -- Segunda pasada: crear items y efectos colaterales
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_type := v_item->>'type';

    if v_item_type = 'product' then
      v_quantity := (v_item->>'quantity')::int;

      select * into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid;

      insert into public.order_items (
        order_id, business_id, type, product_id, quantity, unit_price
      ) values (
        v_order_id, v_caller_business, 'product',
        v_product.id, v_quantity, v_product.price
      );

      -- Solo decrementar stock si el producto lo gestiona
      if v_product.has_stock then
        update public.products
        set stock = stock - v_quantity
        where id = v_product.id;
      end if;

    elsif v_item_type = 'membership' then
      v_start_date := coalesce((v_item->>'start_date')::date, current_date);

      select * into v_plan
      from public.membership_plans
      where id = (v_item->>'plan_id')::uuid;

      v_end_date := v_start_date + (v_plan.duration_days || ' days')::interval;

      insert into public.client_memberships (
        business_id, client_id, plan_id, start_date, end_date, sessions_left
      ) values (
        v_caller_business, p_client_id, v_plan.id,
        v_start_date, v_end_date, v_plan.sessions_number
      )
      returning id into v_cm_id;

      insert into public.order_items (
        order_id, business_id, type, plan_id, client_membership_id, quantity, unit_price
      ) values (
        v_order_id, v_caller_business, 'membership',
        v_plan.id, v_cm_id, 1, v_plan.price
      );
    end if;
  end loop;

  return v_order_id;
end;
$$;

-- =============================================================================
-- cancel_order: no revertir stock si el producto no lo gestiona
-- =============================================================================

create or replace function public.cancel_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_order           public.orders%rowtype;
  v_item            public.order_items%rowtype;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_order.business_id is distinct from v_caller_business then
    raise exception 'La orden pertenece a otro negocio';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'La orden ya está cancelada';
  end if;

  for v_item in
    select * from public.order_items where order_id = p_order_id
  loop
    if v_item.type = 'product' then
      -- Solo revertir stock si el producto lo gestiona y no fue eliminado
      update public.products
      set stock = stock + v_item.quantity
      where id = v_item.product_id
        and deleted_at is null
        and has_stock = true;
    elsif v_item.type = 'membership' then
      update public.client_memberships
      set cancelled_at = now()
      where id = v_item.client_membership_id
        and cancelled_at is null;
    end if;
  end loop;

  update public.orders
  set cancelled_at = now(),
      cancelled_by = auth.uid()
  where id = p_order_id;
end;
$$;

grant execute on function public.register_order(uuid, text, jsonb) to authenticated;
grant execute on function public.cancel_order(uuid)                 to authenticated;
