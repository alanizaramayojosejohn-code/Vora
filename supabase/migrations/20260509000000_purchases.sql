-- =============================================================================
-- SaasGym · Purchases Module
-- Proveedores, llegadas de productos (adquisiciones) y pedidos de compra.
-- =============================================================================
-- Tablas:
--   · suppliers           → catálogo de proveedores por negocio
--   · acquisitions        → llegadas de productos (aumenta stock)
--   · acquisition_items   → ítems de cada llegada
--   · purchase_orders     → pedidos de compra (NO aumenta stock hasta recibir)
--   · purchase_order_items → ítems de cada pedido
--
-- RPCs (todas SECURITY DEFINER, solo admin/super_admin):
--   · register_acquisition    → crea llegada + ítems + actualiza stock
--   · create_purchase_order   → crea pedido + ítems
--   · receive_purchase_order  → recibe pedido → genera adquisición + actualiza stock
--   · cancel_purchase_order   → cancela pedido (no genera adquisición)
--
-- RLS:
--   · suppliers, purchase_orders: SELECT admin+caja, WRITE solo admin
--   · acquisitions, acquisition_items, purchase_order_items: SELECT admin+caja, WRITE super_admin
--     (el flujo normal va por RPCs SECURITY DEFINER que bypasean RLS)
-- =============================================================================

-- =============================================================================
-- 1. Tablas
-- =============================================================================

-- 1.1 Suppliers --------------------------------------------------------------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  contact     text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index idx_suppliers_business on public.suppliers(business_id);

-- 1.2 Acquisitions (llegadas de productos) -----------------------------------
create table public.acquisitions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  total_cost  numeric(12,2) not null default 0 check (total_cost >= 0),
  notes       text,
  acquired_at date not null default current_date,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index idx_acquisitions_business on public.acquisitions(business_id, acquired_at desc);

-- 1.3 Acquisition items ------------------------------------------------------
create table public.acquisition_items (
  id             uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null references public.acquisitions(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete restrict,
  quantity       int not null check (quantity > 0),
  unit_cost      numeric(12,2) not null check (unit_cost >= 0),
  created_at     timestamptz not null default now()
);

create index idx_acq_items_acquisition on public.acquisition_items(acquisition_id);
create index idx_acq_items_product     on public.acquisition_items(product_id);

-- 1.4 Purchase orders (pedidos de compra) ------------------------------------
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  expected_date date,
  status        text not null default 'pending'
    check (status in ('pending', 'received', 'cancelled')),
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_purchase_orders_business on public.purchase_orders(business_id, created_at desc);
create index idx_purchase_orders_pending  on public.purchase_orders(business_id)
  where status = 'pending';

-- 1.5 Purchase order items ---------------------------------------------------
create table public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete restrict,
  quantity_ordered  int not null check (quantity_ordered > 0),
  unit_cost_estimate numeric(12,2) check (unit_cost_estimate is null or unit_cost_estimate >= 0),
  created_at        timestamptz not null default now()
);

create index idx_po_items_order on public.purchase_order_items(purchase_order_id);

-- =============================================================================
-- 2. RLS
-- =============================================================================

alter table public.suppliers            enable row level security;
alter table public.acquisitions         enable row level security;
alter table public.acquisition_items    enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;

-- 2.1 suppliers: SELECT admin+caja, WRITE solo admin -------------------------
create policy "suppliers_select" on public.suppliers
  for select to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "suppliers_admin_write" on public.suppliers
  for all to authenticated
  using  (public.is_admin_in_business(business_id))
  with check (public.is_admin_in_business(business_id));

-- 2.2 acquisitions: SELECT admin+caja, WRITE super_admin (flujo via RPC) ----
create policy "acquisitions_select" on public.acquisitions
  for select to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "acquisitions_super_admin_write" on public.acquisitions
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

-- 2.3 acquisition_items: igual que acquisitions ------------------------------
create policy "acquisition_items_select" on public.acquisition_items
  for select to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "acquisition_items_super_admin_write" on public.acquisition_items
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

-- 2.4 purchase_orders: SELECT admin+caja, WRITE super_admin (via RPC) --------
create policy "purchase_orders_select" on public.purchase_orders
  for select to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "purchase_orders_super_admin_write" on public.purchase_orders
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

-- 2.5 purchase_order_items: igual que purchase_orders ------------------------
create policy "purchase_order_items_select" on public.purchase_order_items
  for select to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "purchase_order_items_super_admin_write" on public.purchase_order_items
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

-- =============================================================================
-- 3. RPCs
-- =============================================================================

-- 3.1 register_acquisition ---------------------------------------------------
-- Registra una llegada de productos de forma atómica:
--   · Crea la adquisición con su total calculado.
--   · Crea los ítems.
--   · Actualiza products.stock (solo para productos con has_stock = true).
-- p_items: [{ product_id, quantity, unit_cost }]
-- =============================================================================
create or replace function public.register_acquisition(
  p_supplier_id uuid    default null,
  p_notes       text    default null,
  p_acquired_at date    default null,
  p_items       jsonb   default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_acq_id          uuid;
  v_total           numeric(12,2) := 0;
  v_item            jsonb;
  v_product         public.products%rowtype;
  v_qty             int;
  v_unit_cost       numeric(12,2);
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'super_admin') then
    raise exception 'No autorizado — solo admin puede registrar llegadas';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La llegada debe tener al menos un ítem';
  end if;

  if p_supplier_id is not null then
    if not exists (
      select 1 from public.suppliers
      where id = p_supplier_id and business_id = v_caller_business
    ) then
      raise exception 'El proveedor no pertenece a este negocio';
    end if;
  end if;

  -- Primera pasada: validar ítems y calcular total
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty       := (v_item->>'quantity')::int;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    if coalesce(v_qty, 0) <= 0 then
      raise exception 'La cantidad debe ser mayor a 0';
    end if;
    if coalesce(v_unit_cost, -1) < 0 then
      raise exception 'El costo unitario no puede ser negativo';
    end if;

    select * into v_product from public.products
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

    v_total := v_total + (v_unit_cost * v_qty);
  end loop;

  -- Crear adquisición
  insert into public.acquisitions (business_id, supplier_id, total_cost, notes, acquired_at, created_by)
  values (
    v_caller_business,
    p_supplier_id,
    v_total,
    p_notes,
    coalesce(p_acquired_at, current_date),
    auth.uid()
  )
  returning id into v_acq_id;

  -- Segunda pasada: insertar ítems + actualizar stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty       := (v_item->>'quantity')::int;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid;

    insert into public.acquisition_items (acquisition_id, business_id, product_id, quantity, unit_cost)
    values (v_acq_id, v_caller_business, v_product.id, v_qty, v_unit_cost);

    if v_product.has_stock then
      update public.products
      set stock = stock + v_qty
      where id = v_product.id;
    end if;
  end loop;

  return v_acq_id;
end;
$$;

-- 3.2 create_purchase_order --------------------------------------------------
-- Crea un pedido de compra con sus ítems. NO modifica stock.
-- p_items: [{ product_id, quantity_ordered, unit_cost_estimate? }]
-- =============================================================================
create or replace function public.create_purchase_order(
  p_supplier_id uuid    default null,
  p_expected_date date  default null,
  p_notes       text    default null,
  p_items       jsonb   default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_order_id        uuid;
  v_item            jsonb;
  v_product         public.products%rowtype;
  v_qty             int;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'super_admin') then
    raise exception 'No autorizado — solo admin puede crear pedidos';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos un ítem';
  end if;

  if p_supplier_id is not null then
    if not exists (
      select 1 from public.suppliers
      where id = p_supplier_id and business_id = v_caller_business
    ) then
      raise exception 'El proveedor no pertenece a este negocio';
    end if;
  end if;

  -- Validar ítems
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity_ordered')::int;

    if coalesce(v_qty, 0) <= 0 then
      raise exception 'La cantidad debe ser mayor a 0';
    end if;

    select * into v_product from public.products
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
  end loop;

  -- Crear pedido
  insert into public.purchase_orders (business_id, supplier_id, expected_date, notes, created_by)
  values (v_caller_business, p_supplier_id, p_expected_date, p_notes, auth.uid())
  returning id into v_order_id;

  -- Insertar ítems
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity_ordered')::int;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid;

    insert into public.purchase_order_items (
      purchase_order_id, business_id, product_id,
      quantity_ordered, unit_cost_estimate
    ) values (
      v_order_id,
      v_caller_business,
      v_product.id,
      v_qty,
      nullif((v_item->>'unit_cost_estimate'), '')::numeric
    );
  end loop;

  return v_order_id;
end;
$$;

-- 3.3 receive_purchase_order -------------------------------------------------
-- Marca el pedido como recibido y genera una adquisición con sus ítems.
-- Actualiza stock para productos con has_stock = true.
-- =============================================================================
create or replace function public.receive_purchase_order(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_order           public.purchase_orders%rowtype;
  v_acq_id          uuid;
  v_total           numeric(12,2) := 0;
  v_item            public.purchase_order_items%rowtype;
  v_product         public.products%rowtype;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'super_admin') then
    raise exception 'No autorizado — solo admin puede recibir pedidos';
  end if;

  select * into v_order from public.purchase_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Pedido % no encontrado', p_order_id;
  end if;
  if v_order.business_id is distinct from v_caller_business then
    raise exception 'El pedido pertenece a otro negocio';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Solo se pueden recibir pedidos pendientes (estado actual: %)', v_order.status;
  end if;

  -- Calcular total estimado
  for v_item in
    select * from public.purchase_order_items where purchase_order_id = p_order_id
  loop
    v_total := v_total + coalesce(v_item.unit_cost_estimate, 0) * v_item.quantity_ordered;
  end loop;

  -- Crear adquisición
  insert into public.acquisitions (business_id, supplier_id, total_cost, acquired_at, created_by)
  values (v_caller_business, v_order.supplier_id, v_total, current_date, auth.uid())
  returning id into v_acq_id;

  -- Crear ítems + actualizar stock
  for v_item in
    select * from public.purchase_order_items where purchase_order_id = p_order_id
  loop
    select * into v_product from public.products where id = v_item.product_id;

    insert into public.acquisition_items (
      acquisition_id, business_id, product_id, quantity, unit_cost
    ) values (
      v_acq_id,
      v_caller_business,
      v_item.product_id,
      v_item.quantity_ordered,
      coalesce(v_item.unit_cost_estimate, 0)
    );

    if v_product.has_stock then
      update public.products
      set stock = stock + v_item.quantity_ordered
      where id = v_item.product_id;
    end if;
  end loop;

  -- Marcar pedido como recibido
  update public.purchase_orders set status = 'received' where id = p_order_id;

  return v_acq_id;
end;
$$;

-- 3.4 cancel_purchase_order --------------------------------------------------
create or replace function public.cancel_purchase_order(
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
  v_order           public.purchase_orders%rowtype;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'super_admin') then
    raise exception 'No autorizado — solo admin puede cancelar pedidos';
  end if;

  select * into v_order from public.purchase_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Pedido % no encontrado', p_order_id;
  end if;
  if v_order.business_id is distinct from v_caller_business then
    raise exception 'El pedido pertenece a otro negocio';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Solo se pueden cancelar pedidos pendientes (estado actual: %)', v_order.status;
  end if;

  update public.purchase_orders set status = 'cancelled' where id = p_order_id;
end;
$$;

-- =============================================================================
-- 4. Permisos RPCs
-- =============================================================================

revoke all on function public.register_acquisition(uuid, text, date, jsonb)    from public;
revoke all on function public.create_purchase_order(uuid, date, text, jsonb)   from public;
revoke all on function public.receive_purchase_order(uuid)                     from public;
revoke all on function public.cancel_purchase_order(uuid)                      from public;

grant execute on function public.register_acquisition(uuid, text, date, jsonb)   to authenticated;
grant execute on function public.create_purchase_order(uuid, date, text, jsonb)  to authenticated;
grant execute on function public.receive_purchase_order(uuid)                    to authenticated;
grant execute on function public.cancel_purchase_order(uuid)                     to authenticated;

-- =============================================================================
-- 5. Grants de tabla (lectura)
-- =============================================================================

grant select on public.suppliers            to authenticated;
grant select on public.acquisitions         to authenticated;
grant select on public.acquisition_items    to authenticated;
grant select on public.purchase_orders      to authenticated;
grant select on public.purchase_order_items to authenticated;

-- Suppliers: admin puede escribir directamente (CRUD)
grant insert, update, delete on public.suppliers to authenticated;
