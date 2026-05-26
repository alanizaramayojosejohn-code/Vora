-- =============================================================================
-- SaasCafes – Initial Schema (consolidated)
-- Multi-tenant SaaS for cafes, restaurants, and food businesses
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Businesses (tenants)
create table businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  theme      jsonb not null default '{"preset":"monochrome","mode":"system"}',
  created_at timestamptz not null default now()
);

-- User profiles (one per auth.user per business)
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  name        text not null,
  ci          text,
  role        text not null default 'caja',
  created_at  timestamptz not null default now(),
  constraint profiles_role_check check (role in ('super_admin', 'admin', 'caja'))
);

-- Product categories
create table categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- Clients
create table clients (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  ci          text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Products (with soft-delete and optional stock tracking)
create table products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name        text not null,
  description text,
  price       numeric(12, 2) not null default 0,
  cost        numeric(12, 2) not null default 0,
  stock       integer not null default 0,
  has_stock   boolean not null default false,
  provider    text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Suppliers
create table suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  contact     text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Orders (sale headers)
create table orders (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  client_id      uuid references clients(id) on delete set null,
  payment_method text not null default 'cash',
  total_amount   numeric(12, 2) not null default 0,
  notes          text,
  cancelled_at   timestamptz,
  cancelled_by   uuid references auth.users(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint orders_payment_method_check check (payment_method in ('cash', 'card', 'qr'))
);

-- Order items (sale lines – products only)
create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  quantity    integer not null,
  unit_price  numeric(12, 2) not null,
  created_at  timestamptz not null default now()
);

-- Acquisitions (stock-in records)
create table acquisitions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  total_cost  numeric(12, 2) not null default 0,
  notes       text,
  acquired_at timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table acquisition_items (
  id             uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null references acquisitions(id) on delete cascade,
  business_id    uuid not null references businesses(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,
  quantity       integer not null,
  unit_cost      numeric(12, 2) not null default 0,
  created_at     timestamptz not null default now()
);

-- Purchase orders (pending orders to suppliers)
create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete set null,
  expected_date date,
  status        text not null default 'pending',
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint purchase_orders_status_check check (status in ('pending', 'received', 'cancelled'))
);

create table purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  product_id        uuid references products(id) on delete set null,
  quantity_ordered  integer not null,
  unit_cost_estimate numeric(12, 2) not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table businesses       enable row level security;
alter table profiles         enable row level security;
alter table categories       enable row level security;
alter table clients          enable row level security;
alter table products         enable row level security;
alter table suppliers        enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table acquisitions     enable row level security;
alter table acquisition_items enable row level security;
alter table purchase_orders  enable row level security;
alter table purchase_order_items enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER – bypass RLS for internal use)
-- ---------------------------------------------------------------------------

create or replace function current_user_business_id()
returns uuid language sql stable security definer as $$
  select business_id from profiles where id = auth.uid() limit 1;
$$;

create or replace function current_user_role()
returns text language sql stable security definer as $$
  select role from profiles where id = auth.uid() limit 1;
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function is_admin_in_business(p_business_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and business_id = p_business_id
      and role in ('admin', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- businesses
create policy "super_admin full access to businesses"
  on businesses for all
  using (is_super_admin());

create policy "users read own business"
  on businesses for select
  using (id = current_user_business_id());

-- profiles
create policy "super_admin full access to profiles"
  on profiles for all
  using (is_super_admin());

create policy "admins manage profiles in own business"
  on profiles for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

create policy "users read own profile"
  on profiles for select
  using (id = auth.uid());

-- categories
create policy "users read own business categories"
  on categories for select
  using (business_id = current_user_business_id());

create policy "admins manage categories"
  on categories for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- clients
create policy "users read own business clients"
  on clients for select
  using (business_id = current_user_business_id());

create policy "admins manage clients"
  on clients for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

create policy "caja insert clients"
  on clients for insert
  with check (business_id = current_user_business_id());

-- products
create policy "users read own business products"
  on products for select
  using (business_id = current_user_business_id());

create policy "admins manage products"
  on products for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- suppliers
create policy "users read own business suppliers"
  on suppliers for select
  using (business_id = current_user_business_id());

create policy "admins manage suppliers"
  on suppliers for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- orders
create policy "users read own business orders"
  on orders for select
  using (business_id = current_user_business_id());

create policy "admins manage orders"
  on orders for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

create policy "caja insert orders"
  on orders for insert
  with check (business_id = current_user_business_id());

-- order_items
create policy "users read own business order_items"
  on order_items for select
  using (business_id = current_user_business_id());

create policy "admins manage order_items"
  on order_items for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

create policy "caja insert order_items"
  on order_items for insert
  with check (business_id = current_user_business_id());

-- acquisitions
create policy "users read own business acquisitions"
  on acquisitions for select
  using (business_id = current_user_business_id());

create policy "admins manage acquisitions"
  on acquisitions for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- acquisition_items
create policy "users read own business acquisition_items"
  on acquisition_items for select
  using (business_id = current_user_business_id());

create policy "admins manage acquisition_items"
  on acquisition_items for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- purchase_orders
create policy "users read own business purchase_orders"
  on purchase_orders for select
  using (business_id = current_user_business_id());

create policy "admins manage purchase_orders"
  on purchase_orders for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- purchase_order_items
create policy "users read own business purchase_order_items"
  on purchase_order_items for select
  using (business_id = current_user_business_id());

create policy "admins manage purchase_order_items"
  on purchase_order_items for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- RPC: create_business_with_admin
-- Creates a new tenant and its first admin profile atomically
-- ---------------------------------------------------------------------------
create or replace function create_business_with_admin(
  p_business_name text,
  p_admin_user_id uuid,
  p_admin_name    text,
  p_admin_ci      text default null
)
returns uuid language plpgsql security definer as $$
declare
  v_business_id uuid;
begin
  -- Only super_admins may call this
  if not is_super_admin() then
    raise exception 'permission denied';
  end if;

  insert into businesses (name)
  values (p_business_name)
  returning id into v_business_id;

  insert into profiles (id, business_id, name, ci, role)
  values (p_admin_user_id, v_business_id, p_admin_name, p_admin_ci, 'admin');

  return v_business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create_user_for_business
-- Adds a profile for an existing auth.user inside a tenant
-- ---------------------------------------------------------------------------
create or replace function create_user_for_business(
  p_user_id     uuid,
  p_business_id uuid,
  p_name        text,
  p_ci          text default null,
  p_role        text default 'caja'
)
returns void language plpgsql security definer as $$
begin
  if not is_admin_in_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  insert into profiles (id, business_id, name, ci, role)
  values (p_user_id, p_business_id, p_name, p_ci, p_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: register_order
-- Registers a sale, decrements product stock (when has_stock = true),
-- and returns the new order id
-- ---------------------------------------------------------------------------
create or replace function register_order(
  p_client_id      uuid,
  p_payment_method text,
  p_items          jsonb   -- [{product_id, quantity, unit_price}]
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

  -- Insert order header
  insert into orders (business_id, client_id, payment_method, created_by)
  values (v_business_id, p_client_id, p_payment_method, auth.uid())
  returning id into v_order_id;

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

-- ---------------------------------------------------------------------------
-- RPC: cancel_order
-- Marks an order as cancelled and restores product stock
-- ---------------------------------------------------------------------------
create or replace function cancel_order(p_order_id uuid)
returns void language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_rec         record;
begin
  v_business_id := current_user_business_id();

  -- Verify order belongs to the caller's business and is not already cancelled
  select id into v_rec
  from orders
  where id = p_order_id
    and business_id = v_business_id
    and cancelled_at is null;

  if not found then
    raise exception 'order not found or already cancelled';
  end if;

  -- Restore stock for each product item
  update products p
  set stock = p.stock + oi.quantity
  from order_items oi
  where oi.order_id = p_order_id
    and oi.product_id = p.id
    and p.has_stock = true;

  -- Mark cancelled
  update orders
  set cancelled_at = now(),
      cancelled_by = auth.uid()
  where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: register_acquisition
-- Records a stock-in from a supplier and increments product stock
-- ---------------------------------------------------------------------------
create or replace function register_acquisition(
  p_supplier_id uuid,
  p_notes       text,
  p_acquired_at timestamptz,
  p_items       jsonb  -- [{product_id, quantity, unit_cost}]
)
returns uuid language plpgsql security definer as $$
declare
  v_business_id    uuid;
  v_acquisition_id uuid;
  v_item           jsonb;
  v_total_cost     numeric(12,2) := 0;
  v_product_id     uuid;
  v_quantity       integer;
  v_unit_cost      numeric(12,2);
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;

  insert into acquisitions (business_id, supplier_id, total_cost, notes, acquired_at, created_by)
  values (v_business_id, p_supplier_id, 0, p_notes, coalesce(p_acquired_at, now()), auth.uid())
  returning id into v_acquisition_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_cost  := (v_item->>'unit_cost')::numeric(12,2);

    insert into acquisition_items (acquisition_id, business_id, product_id, quantity, unit_cost)
    values (v_acquisition_id, v_business_id, v_product_id, v_quantity, v_unit_cost);

    v_total_cost := v_total_cost + (v_unit_cost * v_quantity);

    update products
    set stock = stock + v_quantity
    where id = v_product_id and business_id = v_business_id;
  end loop;

  update acquisitions set total_cost = v_total_cost where id = v_acquisition_id;

  return v_acquisition_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create_purchase_order
-- Creates a pending order to a supplier
-- ---------------------------------------------------------------------------
create or replace function create_purchase_order(
  p_supplier_id   uuid,
  p_expected_date date,
  p_notes         text,
  p_items         jsonb  -- [{product_id, quantity_ordered, unit_cost_estimate}]
)
returns uuid language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_po_id       uuid;
  v_item        jsonb;
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;

  insert into purchase_orders (business_id, supplier_id, expected_date, notes, created_by)
  values (v_business_id, p_supplier_id, p_expected_date, p_notes, auth.uid())
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into purchase_order_items (
      purchase_order_id, business_id, product_id,
      quantity_ordered, unit_cost_estimate
    ) values (
      v_po_id, v_business_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity_ordered')::integer,
      coalesce((v_item->>'unit_cost_estimate')::numeric(12,2), 0)
    );
  end loop;

  return v_po_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: receive_purchase_order
-- Marks a PO as received and converts it into an acquisition (stock-in)
-- ---------------------------------------------------------------------------
create or replace function receive_purchase_order(p_order_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_business_id    uuid;
  v_po             record;
  v_acquisition_id uuid;
  v_total_cost     numeric(12,2) := 0;
  v_item           record;
begin
  v_business_id := current_user_business_id();

  select * into v_po
  from purchase_orders
  where id = p_order_id and business_id = v_business_id and status = 'pending';

  if not found then
    raise exception 'purchase order not found or not pending';
  end if;

  -- Create acquisition
  insert into acquisitions (business_id, supplier_id, total_cost, notes, acquired_at, created_by)
  values (v_business_id, v_po.supplier_id, 0,
          'Received from PO ' || p_order_id::text, now(), auth.uid())
  returning id into v_acquisition_id;

  for v_item in
    select * from purchase_order_items
    where purchase_order_id = p_order_id
  loop
    insert into acquisition_items (acquisition_id, business_id, product_id, quantity, unit_cost)
    values (v_acquisition_id, v_business_id,
            v_item.product_id, v_item.quantity_ordered, v_item.unit_cost_estimate);

    v_total_cost := v_total_cost + (v_item.unit_cost_estimate * v_item.quantity_ordered);

    update products
    set stock = stock + v_item.quantity_ordered
    where id = v_item.product_id and business_id = v_business_id;
  end loop;

  update acquisitions set total_cost = v_total_cost where id = v_acquisition_id;

  update purchase_orders set status = 'received' where id = p_order_id;

  return v_acquisition_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_purchase_order
-- Marks a pending PO as cancelled
-- ---------------------------------------------------------------------------
create or replace function cancel_purchase_order(p_order_id uuid)
returns void language plpgsql security definer as $$
declare
  v_business_id uuid;
begin
  v_business_id := current_user_business_id();

  update purchase_orders
  set status = 'cancelled'
  where id = p_order_id
    and business_id = v_business_id
    and status = 'pending';

  if not found then
    raise exception 'purchase order not found or not pending';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Daily income from completed (non-cancelled) orders
create or replace view income_daily
  with (security_invoker = true)
as
select
  o.business_id,
  date_trunc('day', o.created_at) as day,
  sum(oi.unit_price * oi.quantity) as total,
  count(distinct o.id)::integer      as transactions
from orders o
join order_items oi on oi.order_id = o.id
where o.cancelled_at is null
group by o.business_id, date_trunc('day', o.created_at);

-- Monthly income from completed (non-cancelled) orders
create or replace view monthly_income
  with (security_invoker = true)
as
select
  o.business_id,
  date_trunc('month', o.created_at) as month,
  sum(oi.unit_price * oi.quantity) as total,
  count(distinct o.id)::integer      as transactions
from orders o
join order_items oi on oi.order_id = o.id
where o.cancelled_at is null
group by o.business_id, date_trunc('month', o.created_at);

-- Products below or at zero stock (only tracked products)
create or replace view low_stock_products
  with (security_invoker = true)
as
select
  p.id,
  p.business_id,
  p.name,
  p.stock,
  p.has_stock,
  c.name as category_name
from products p
left join categories c on c.id = p.category_id
where p.has_stock = true
  and p.stock <= 0
  and p.deleted_at is null;
