-- =============================================================================
-- SaasGym · Initial schema
-- Multi-tenant: cada negocio (POS o gym) ve solo sus datos vía RLS por business_id.
-- Roles: super_admin (SaaS), admin (negocio), caja (negocio).
-- Cada business tiene `type IN ('pos','gym')`. Las tablas gym-only
-- (membership_plans, client_memberships, attendance, services) quedan vacías
-- para tenants 'pos'; las RPCs gym-only validan el tipo antes de operar.
-- =============================================================================

-- Extensiones ----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. Tablas
-- =============================================================================

-- 1.1 Businesses (tenants) ---------------------------------------------------
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('pos', 'gym')),
  created_at  timestamptz not null default now()
);

-- 1.2 Profiles (extiende auth.users) -----------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  name        text not null,
  ci          text not null,
  role        text not null check (role in ('super_admin', 'admin', 'caja')),
  created_at  timestamptz not null default now(),
  -- super_admin no pertenece a un negocio; admin/caja sí
  constraint profile_business_role_consistency check (
    (role = 'super_admin' and business_id is null) or
    (role in ('admin', 'caja') and business_id is not null)
  )
);

create index idx_profiles_business on public.profiles(business_id);

-- 1.3 Services (catálogo por negocio, usado por gyms) ------------------------
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);

create index idx_services_business on public.services(business_id);

-- 1.4 Clients ----------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ci          text not null,
  name        text not null,
  phone       text,
  created_at  timestamptz not null default now(),
  unique (business_id, ci)
);

create index idx_clients_business on public.clients(business_id);
create index idx_clients_ci on public.clients(business_id, ci);

-- 1.5 Products ---------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  category    text,
  price       numeric(12, 2) not null check (price >= 0),
  cost        numeric(12, 2) not null check (cost >= 0),
  stock       integer not null default 0 check (stock >= 0),
  provider    text,
  created_at  timestamptz not null default now()
);

create index idx_products_business on public.products(business_id);

-- 1.6 Membership plans (catálogo, gym-only) ----------------------------------
create table public.membership_plans (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  name            text not null,
  duration_days   integer not null check (duration_days > 0),
  sessions_number integer check (sessions_number is null or sessions_number > 0),
  price           numeric(12, 2) not null check (price >= 0),
  type            text not null check (type in ('normal', 'promo')),
  created_at      timestamptz not null default now()
);

create index idx_membership_plans_business on public.membership_plans(business_id);

-- 1.7 Servicios incluidos en cada plan (M:N) ---------------------------------
create table public.membership_plan_services (
  plan_id     uuid not null references public.membership_plans(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  primary key (plan_id, service_id)
);

create index idx_mps_service on public.membership_plan_services(service_id);

-- 1.8 Client memberships (instancias asignadas, gym-only) --------------------
create table public.client_memberships (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete restrict,
  plan_id        uuid not null references public.membership_plans(id) on delete restrict,
  start_date     date not null,
  end_date       date not null,
  sessions_left  integer,
  created_at     timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_cm_business on public.client_memberships(business_id);
create index idx_cm_client on public.client_memberships(client_id);
create index idx_cm_active on public.client_memberships(business_id, end_date);

-- 1.9 Attendance (gym-only) --------------------------------------------------
create table public.attendance (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  client_id             uuid not null references public.clients(id) on delete cascade,
  client_membership_id  uuid references public.client_memberships(id) on delete set null,
  attended_at           timestamptz not null default now()
);

create index idx_att_business_date on public.attendance(business_id, attended_at);
create index idx_att_client on public.attendance(client_id);

-- 1.10 Sales (ingresos: productos + membresías) ------------------------------
create table public.sales (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  type                  text not null check (type in ('product', 'membership')),
  amount                numeric(12, 2) not null check (amount >= 0),
  quantity              integer not null default 1 check (quantity > 0),
  client_id             uuid references public.clients(id) on delete set null,
  product_id            uuid references public.products(id) on delete set null,
  client_membership_id  uuid references public.client_memberships(id) on delete set null,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  -- coherencia: cada tipo apunta al recurso correcto
  constraint sale_target_consistency check (
    (type = 'product'    and product_id is not null and client_membership_id is null) or
    (type = 'membership' and client_membership_id is not null and product_id is null)
  )
);

create index idx_sales_business_date on public.sales(business_id, created_at);
create index idx_sales_type on public.sales(business_id, type);

-- =============================================================================
-- 2. Helpers de RLS
-- =============================================================================

create or replace function public.current_user_business_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select business_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_business_type()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select b.type
  from public.profiles p
  join public.businesses b on b.id = p.business_id
  where p.id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- 3. RLS — habilitar y definir policies
-- =============================================================================

alter table public.businesses               enable row level security;
alter table public.profiles                 enable row level security;
alter table public.services                 enable row level security;
alter table public.clients                  enable row level security;
alter table public.products                 enable row level security;
alter table public.membership_plans         enable row level security;
alter table public.membership_plan_services enable row level security;
alter table public.client_memberships       enable row level security;
alter table public.attendance               enable row level security;
alter table public.sales                    enable row level security;

-- 3.1 businesses: super_admin todo; admin/caja solo el suyo (read-only) -----
create policy "businesses_super_admin_all" on public.businesses
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "businesses_tenant_read" on public.businesses
  for select to authenticated
  using (id = public.current_user_business_id());

-- 3.2 profiles: cada uno lee el suyo; super_admin todo; admin del negocio ve los suyos
create policy "profiles_self_read" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_super_admin_all" on public.profiles
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "profiles_admin_same_business" on public.profiles
  for all to authenticated
  using (
    public.current_user_role() = 'admin'
    and business_id = public.current_user_business_id()
  )
  with check (
    public.current_user_role() = 'admin'
    and business_id = public.current_user_business_id()
  );

-- 3.3 Tenant isolation genérica para el resto -------------------------------
-- Patrón: super_admin pasa siempre; el resto solo en su business_id.

create policy "services_tenant" on public.services
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "clients_tenant" on public.clients
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "products_tenant" on public.products
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "membership_plans_tenant" on public.membership_plans
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "client_memberships_tenant" on public.client_memberships
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "attendance_tenant" on public.attendance
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

create policy "sales_tenant" on public.sales
  for all to authenticated
  using (public.is_super_admin() or business_id = public.current_user_business_id())
  with check (public.is_super_admin() or business_id = public.current_user_business_id());

-- 3.4 membership_plan_services: aislamiento vía el plan asociado ------------
create policy "mps_tenant" on public.membership_plan_services
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.membership_plans p
      where p.id = plan_id and p.business_id = public.current_user_business_id()
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.membership_plans p
      where p.id = plan_id and p.business_id = public.current_user_business_id()
    )
  );

-- =============================================================================
-- 4. Vista de ingresos (para Reports)
-- =============================================================================

create or replace view public.income_daily as
select
  business_id,
  date_trunc('day', created_at)::date as day,
  type,
  sum(amount) as total,
  count(*)    as transactions
from public.sales
group by business_id, date_trunc('day', created_at), type;
