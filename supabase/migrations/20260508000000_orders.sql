-- =============================================================================
-- SaasGym · Orders
-- Reemplaza la tabla `sales` (una fila por producto/membresía) por un modelo
-- de órdenes: `orders` (cabecera) + `order_items` (líneas de detalle).
-- Beneficios:
--   · Un carrito de N productos = 1 orden + N items → factura agrupada.
--   · Productos y membresías conviven en la misma orden.
--   · `register_order` es la única RPC de venta; atómica.
-- Migración incluye: datos existentes de `sales`, vistas, RPCs y drop de `sales`.
-- =============================================================================

-- =============================================================================
-- 1. Tabla orders
-- =============================================================================

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  client_id      uuid          references public.clients(id)   on delete set null,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'qr')),
  total_amount   numeric(12,2) not null default 0 check (total_amount >= 0),
  notes          text,
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index idx_orders_business    on public.orders(business_id, created_at desc);
create index idx_orders_active      on public.orders(business_id, created_at)
  where cancelled_at is null;

-- =============================================================================
-- 2. Tabla order_items
-- =============================================================================

create table public.order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  business_id          uuid not null references public.businesses(id) on delete cascade,
  type                 text not null check (type in ('product', 'membership')),
  product_id           uuid references public.products(id)          on delete set null,
  plan_id              uuid references public.membership_plans(id)   on delete set null,
  client_membership_id uuid references public.client_memberships(id) on delete set null,
  quantity             int  not null default 1 check (quantity > 0),
  unit_price           numeric(12,2) not null check (unit_price >= 0),
  created_at           timestamptz not null default now()
);

create index idx_order_items_order    on public.order_items(order_id);
create index idx_order_items_business on public.order_items(business_id);
create index idx_order_items_product  on public.order_items(product_id) where product_id is not null;

-- =============================================================================
-- 3. RLS
-- =============================================================================

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- SELECT: admin + caja del tenant (super_admin pasa siempre).
create policy "orders_select" on public.orders
  for select to authenticated
  using (
    public.is_super_admin()
    or business_id = public.current_user_business_id()
  );

-- WRITE: solo super_admin via RLS — todo el flujo normal usa RPCs SECURITY DEFINER.
create policy "orders_super_admin_write" on public.orders
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

create policy "order_items_select" on public.order_items
  for select to authenticated
  using (
    public.is_super_admin()
    or business_id = public.current_user_business_id()
  );

create policy "order_items_super_admin_write" on public.order_items
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

-- =============================================================================
-- 4. Migrar datos existentes de sales → orders + order_items
-- =============================================================================

do $$
declare
  v_sale    record;
  v_ord_id  uuid;
  v_plan_id uuid;
begin
  for v_sale in
    select * from public.sales order by created_at
  loop
    insert into public.orders (
      business_id, client_id, payment_method, total_amount,
      created_by, created_at, cancelled_at, cancelled_by
    ) values (
      v_sale.business_id,
      v_sale.client_id,
      'cash',
      v_sale.amount,
      v_sale.created_by,
      v_sale.created_at,
      v_sale.cancelled_at,
      v_sale.cancelled_by
    )
    returning id into v_ord_id;

    if v_sale.type = 'product' then
      insert into public.order_items (
        order_id, business_id, type, product_id, quantity, unit_price
      ) values (
        v_ord_id,
        v_sale.business_id,
        'product',
        v_sale.product_id,
        v_sale.quantity,
        v_sale.amount / greatest(v_sale.quantity, 1)
      );
    else
      select plan_id into v_plan_id
      from public.client_memberships
      where id = v_sale.client_membership_id;

      insert into public.order_items (
        order_id, business_id, type, plan_id, client_membership_id, quantity, unit_price
      ) values (
        v_ord_id,
        v_sale.business_id,
        'membership',
        v_plan_id,
        v_sale.client_membership_id,
        1,
        v_sale.amount
      );
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- 5. Recrear vistas que referenciaban sales
-- =============================================================================

drop view if exists public.income_daily;
drop view if exists public.monthly_income;

create or replace view public.income_daily
with (security_invoker = true) as
select
  o.business_id,
  date_trunc('day', o.created_at)::date as day,
  oi.type,
  sum(oi.unit_price * oi.quantity)       as total,
  count(distinct o.id)                   as transactions
from public.orders o
join public.order_items oi on oi.order_id = o.id
where o.cancelled_at is null
group by o.business_id, date_trunc('day', o.created_at), oi.type;

create or replace view public.monthly_income
with (security_invoker = true) as
select
  o.business_id,
  date_trunc('month', o.created_at)::date as month,
  oi.type,
  count(distinct o.id)                    as transactions,
  sum(oi.unit_price * oi.quantity)        as total
from public.orders o
join public.order_items oi on oi.order_id = o.id
where o.cancelled_at is null
group by o.business_id, date_trunc('month', o.created_at), oi.type;

revoke all on public.income_daily   from public, anon;
revoke all on public.monthly_income from public, anon;
grant select on public.income_daily   to authenticated;
grant select on public.monthly_income to authenticated;

-- =============================================================================
-- 6. Drop RPCs antiguas
-- =============================================================================

drop function if exists public.register_sale_product(uuid, integer, uuid);
drop function if exists public.register_sale_membership(uuid, uuid, date);
drop function if exists public.cancel_sale(uuid);

-- =============================================================================
-- 7. RPC: register_order
-- =============================================================================
-- Registra una orden completa de forma atómica.
-- p_items: jsonb array de objetos:
--   · { "type": "product",    "product_id": "uuid", "quantity": N }
--   · { "type": "membership", "plan_id": "uuid", "start_date": "yyyy-mm-dd" }
-- Valida stock antes de operar. Devuelve order_id.
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

  -- Validar cliente
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
      if v_product.stock < v_quantity then
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

      update public.products
      set stock = stock - v_quantity
      where id = v_product.id;

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
-- 8. RPC: cancel_order
-- =============================================================================
-- Cancela toda la orden y revierte los efectos por item:
--   · product   → devuelve stock (si el producto no fue eliminado).
--   · membership → cancela la client_membership asociada.
-- Idempotente: falla si ya está cancelada.
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
      update public.products
      set stock = stock + v_item.quantity
      where id = v_item.product_id
        and deleted_at is null;
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

-- =============================================================================
-- 9. Permisos RPCs nuevas
-- =============================================================================

revoke all on function public.register_order(uuid, text, jsonb) from public;
revoke all on function public.cancel_order(uuid)                 from public;

grant execute on function public.register_order(uuid, text, jsonb) to authenticated;
grant execute on function public.cancel_order(uuid)                to authenticated;

-- =============================================================================
-- 10. Drop tabla sales (ya migrada, vistas y RPCs actualizadas)
-- =============================================================================

drop table public.sales;
