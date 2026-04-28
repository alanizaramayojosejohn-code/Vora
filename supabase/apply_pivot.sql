-- =============================================================================
-- SaasGym · Aplicar pivot multi-business contra la DB live (jwoqcvynwkfdnomwzrhf).
-- =============================================================================
-- Este script wipea el schema gym-only previo y re-aplica las 3 migrations.
-- Pensado para ejecutarse de un solo golpe en el SQL Editor del dashboard,
-- ya que NO había datos productivos en las tablas (super_admin solo tenía
-- profile con role='super_admin' y business_id=null, que se re-crea con el seed).
--
-- IMPORTANTE: este script NO toca auth.users — tu cuenta de super_admin
-- en Authentication → Users sigue intacta. Solo borra y recrea las tablas
-- en el schema public.
--
-- Pasos:
-- 1. Pega TODO este archivo en el SQL Editor de Supabase y ejecútalo.
-- 2. Luego pega supabase/seeds/super_admin.sql para re-crear tu profile.
-- =============================================================================

-- =============================================================================
-- 0. Wipe schema gym-only previo
-- =============================================================================
-- Borra en orden inverso por las FKs. CASCADE limpia views, policies y triggers
-- dependientes. Idempotente: usa IF EXISTS.

drop table if exists public.attendance               cascade;
drop table if exists public.sales                    cascade;
drop table if exists public.client_memberships       cascade;
drop table if exists public.membership_plan_services cascade;
drop table if exists public.membership_plans         cascade;
drop table if exists public.products                 cascade;
drop table if exists public.clients                  cascade;
drop table if exists public.services                 cascade;
drop table if exists public.profiles                 cascade;
drop table if exists public.gyms                     cascade;

-- Por si quedan restos (las funciones helper antes vivían con nombres distintos).
drop function if exists public.create_gym_with_admin(text, uuid, text, text, text[]);
drop function if exists public.create_user_for_gym(uuid, uuid, text, text, text);
drop function if exists public.register_attendance(uuid);
drop function if exists public.register_sale_product(uuid, integer, uuid);
drop function if exists public.register_sale_membership(uuid, uuid, date);
drop function if exists public.current_user_gym_id();
drop function if exists public.current_user_role();
drop function if exists public.is_super_admin();

drop view if exists public.income_daily;
drop view if exists public.active_memberships;
drop view if exists public.low_stock_products;
drop view if exists public.monthly_income;

-- =============================================================================
-- 1. Initial schema (idéntico a supabase/migrations/20260427000000_initial_schema.sql)
-- =============================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- 1.1 Businesses (tenants)
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('pos', 'gym')),
  created_at  timestamptz not null default now()
);

-- 1.2 Profiles (extiende auth.users)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  name        text not null,
  ci          text not null,
  role        text not null check (role in ('super_admin', 'admin', 'caja')),
  created_at  timestamptz not null default now(),
  constraint profile_business_role_consistency check (
    (role = 'super_admin' and business_id is null) or
    (role in ('admin', 'caja') and business_id is not null)
  )
);

create index idx_profiles_business on public.profiles(business_id);

-- 1.3 Services (catálogo por negocio, usado por gyms)
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);

create index idx_services_business on public.services(business_id);

-- 1.4 Clients
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

-- 1.5 Products
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

-- 1.6 Membership plans (gym-only)
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

-- 1.7 Servicios incluidos en cada plan (M:N)
create table public.membership_plan_services (
  plan_id     uuid not null references public.membership_plans(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  primary key (plan_id, service_id)
);

create index idx_mps_service on public.membership_plan_services(service_id);

-- 1.8 Client memberships (gym-only)
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

-- 1.9 Attendance (gym-only)
create table public.attendance (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  client_id             uuid not null references public.clients(id) on delete cascade,
  client_membership_id  uuid references public.client_memberships(id) on delete set null,
  attended_at           timestamptz not null default now()
);

create index idx_att_business_date on public.attendance(business_id, attended_at);
create index idx_att_client on public.attendance(client_id);

-- 1.10 Sales (productos + membresías)
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
  constraint sale_target_consistency check (
    (type = 'product'    and product_id is not null and client_membership_id is null) or
    (type = 'membership' and client_membership_id is not null and product_id is null)
  )
);

create index idx_sales_business_date on public.sales(business_id, created_at);
create index idx_sales_type on public.sales(business_id, type);

-- 2. Helpers de RLS
create or replace function public.current_user_business_id()
returns uuid language sql security definer stable set search_path = public
as $$ select business_id from public.profiles where id = auth.uid(); $$;

create or replace function public.current_user_business_type()
returns text language sql security definer stable set search_path = public
as $$
  select b.type
  from public.profiles p
  join public.businesses b on b.id = p.business_id
  where p.id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text language sql security definer stable set search_path = public
as $$ select role from public.profiles where id = auth.uid(); $$;

create or replace function public.is_super_admin()
returns boolean language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- 3. RLS
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

create policy "businesses_super_admin_all" on public.businesses
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "businesses_tenant_read" on public.businesses
  for select to authenticated
  using (id = public.current_user_business_id());

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

-- 4. Vista income_daily (creada con security_invoker desde el inicio)
create or replace view public.income_daily
with (security_invoker = true) as
select
  business_id,
  date_trunc('day', created_at)::date as day,
  type,
  sum(amount) as total,
  count(*)    as transactions
from public.sales
group by business_id, date_trunc('day', created_at), type;

-- =============================================================================
-- 2. RPCs (idéntico a supabase/migrations/20260427010000_functions.sql)
-- =============================================================================

create or replace function public.create_business_with_admin(
  p_business_name text,
  p_business_type text,
  p_admin_user_id uuid,
  p_admin_name    text,
  p_admin_ci      text,
  p_services      text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_id uuid;
  v_service     text;
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado: solo super_admin puede crear negocios';
  end if;

  if p_business_type not in ('pos', 'gym') then
    raise exception 'Tipo de negocio inválido: % (debe ser pos o gym)', p_business_type;
  end if;

  if not exists (select 1 from auth.users where id = p_admin_user_id) then
    raise exception 'El auth.user % no existe; créalo primero en el dashboard', p_admin_user_id;
  end if;

  if exists (select 1 from public.profiles where id = p_admin_user_id) then
    raise exception 'El usuario % ya tiene un profile asignado', p_admin_user_id;
  end if;

  insert into public.businesses (name, type)
  values (p_business_name, p_business_type)
  returning id into v_business_id;

  insert into public.profiles (id, business_id, name, ci, role)
  values (p_admin_user_id, v_business_id, p_admin_name, p_admin_ci, 'admin');

  if p_services is not null then
    foreach v_service in array p_services loop
      if length(trim(v_service)) > 0 then
        insert into public.services (business_id, name)
        values (v_business_id, trim(v_service))
        on conflict (business_id, name) do nothing;
      end if;
    end loop;
  end if;

  return v_business_id;
end;
$$;

create or replace function public.create_user_for_business(
  p_user_id     uuid,
  p_business_id uuid,
  p_name        text,
  p_ci          text,
  p_role        text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
begin
  if p_role not in ('admin', 'caja') then
    raise exception 'Rol inválido: % (debe ser admin o caja)', p_role;
  end if;

  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role = 'super_admin' then
    null;
  elsif v_caller_role = 'admin' then
    if p_business_id is distinct from v_caller_business then
      raise exception 'admin solo puede crear users en su propio negocio';
    end if;
  else
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negocio % no existe', p_business_id;
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'El auth.user % no existe; créalo primero', p_user_id;
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'El usuario % ya tiene un profile asignado', p_user_id;
  end if;

  insert into public.profiles (id, business_id, name, ci, role)
  values (p_user_id, p_business_id, p_name, p_ci, p_role);

  return p_user_id;
end;
$$;

create or replace function public.register_attendance(
  p_client_id uuid
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
  v_client_business uuid;
  v_membership      public.client_memberships%rowtype;
  v_attendance_id   uuid;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();
  v_caller_type     := public.current_user_business_type();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if v_caller_type is distinct from 'gym' then
    raise exception 'Asistencia solo está disponible en negocios de tipo gym';
  end if;

  select business_id into v_client_business from public.clients where id = p_client_id;
  if v_client_business is null then
    raise exception 'Cliente % no encontrado', p_client_id;
  end if;
  if v_client_business is distinct from v_caller_business then
    raise exception 'El cliente pertenece a otro negocio';
  end if;

  select * into v_membership
  from public.client_memberships
  where client_id = p_client_id
    and current_date between start_date and end_date
  order by end_date desc
  limit 1;

  if v_membership.id is null then
    raise exception 'El cliente no tiene una membresía vigente';
  end if;

  if v_membership.sessions_left is not null then
    if v_membership.sessions_left <= 0 then
      raise exception 'La membresía no tiene sesiones disponibles';
    end if;
    update public.client_memberships
    set sessions_left = sessions_left - 1
    where id = v_membership.id;
  end if;

  insert into public.attendance (business_id, client_id, client_membership_id)
  values (v_caller_business, p_client_id, v_membership.id)
  returning id into v_attendance_id;

  return v_attendance_id;
end;
$$;

create or replace function public.register_sale_product(
  p_product_id uuid,
  p_quantity   integer default 1,
  p_client_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_product         public.products%rowtype;
  v_sale_id         uuid;
  v_amount          numeric(12, 2);
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'Producto % no encontrado', p_product_id;
  end if;
  if v_product.business_id is distinct from v_caller_business then
    raise exception 'El producto pertenece a otro negocio';
  end if;
  if v_product.stock < p_quantity then
    raise exception 'Stock insuficiente (disponible: %, solicitado: %)', v_product.stock, p_quantity;
  end if;

  if p_client_id is not null then
    if not exists (
      select 1 from public.clients
      where id = p_client_id and business_id = v_caller_business
    ) then
      raise exception 'El cliente no pertenece a tu negocio';
    end if;
  end if;

  v_amount := v_product.price * p_quantity;

  update public.products
  set stock = stock - p_quantity
  where id = p_product_id;

  insert into public.sales (business_id, type, amount, quantity, client_id, product_id, created_by)
  values (v_caller_business, 'product', v_amount, p_quantity, p_client_id, p_product_id, auth.uid())
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

create or replace function public.register_sale_membership(
  p_client_id  uuid,
  p_plan_id    uuid,
  p_start_date date default current_date
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
  v_plan            public.membership_plans%rowtype;
  v_cm_id           uuid;
  v_end_date        date;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();
  v_caller_type     := public.current_user_business_type();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if v_caller_type is distinct from 'gym' then
    raise exception 'Las membresías solo están disponibles en negocios de tipo gym';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id and business_id = v_caller_business
  ) then
    raise exception 'El cliente no pertenece a tu negocio';
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan % no encontrado', p_plan_id;
  end if;
  if v_plan.business_id is distinct from v_caller_business then
    raise exception 'El plan pertenece a otro negocio';
  end if;

  v_end_date := p_start_date + (v_plan.duration_days || ' days')::interval;

  insert into public.client_memberships (business_id, client_id, plan_id, start_date, end_date, sessions_left)
  values (v_caller_business, p_client_id, p_plan_id, p_start_date, v_end_date, v_plan.sessions_number)
  returning id into v_cm_id;

  insert into public.sales (business_id, type, amount, quantity, client_id, client_membership_id, created_by)
  values (v_caller_business, 'membership', v_plan.price, 1, p_client_id, v_cm_id, auth.uid());

  return v_cm_id;
end;
$$;

revoke all on function public.create_business_with_admin(text, text, uuid, text, text, text[]) from public;
revoke all on function public.create_user_for_business(uuid, uuid, text, text, text)            from public;
revoke all on function public.register_attendance(uuid)                                         from public;
revoke all on function public.register_sale_product(uuid, integer, uuid)                        from public;
revoke all on function public.register_sale_membership(uuid, uuid, date)                        from public;

grant execute on function public.create_business_with_admin(text, text, uuid, text, text, text[]) to authenticated;
grant execute on function public.create_user_for_business(uuid, uuid, text, text, text)           to authenticated;
grant execute on function public.register_attendance(uuid)                                        to authenticated;
grant execute on function public.register_sale_product(uuid, integer, uuid)                       to authenticated;
grant execute on function public.register_sale_membership(uuid, uuid, date)                       to authenticated;

-- =============================================================================
-- 3. Vistas adicionales (idéntico a supabase/migrations/20260427020000_views.sql,
--    omitiendo el ALTER VIEW de income_daily porque ya la creamos con security_invoker arriba)
-- =============================================================================

create or replace view public.active_memberships
with (security_invoker = true) as
select
  cm.id                              as client_membership_id,
  cm.business_id,
  cm.client_id,
  c.ci                               as client_ci,
  c.name                             as client_name,
  c.phone                            as client_phone,
  cm.plan_id,
  mp.name                            as plan_name,
  mp.type                            as plan_type,
  cm.start_date,
  cm.end_date,
  cm.sessions_left,
  (cm.end_date - current_date)       as days_left
from public.client_memberships cm
join public.clients c          on c.id  = cm.client_id
join public.membership_plans mp on mp.id = cm.plan_id
where current_date between cm.start_date and cm.end_date;

create or replace view public.low_stock_products
with (security_invoker = true) as
select
  p.id,
  p.business_id,
  p.name,
  p.category,
  p.stock,
  p.price,
  p.cost,
  p.provider
from public.products p
where p.stock <= 5;

create or replace view public.monthly_income
with (security_invoker = true) as
select
  business_id,
  date_trunc('month', created_at)::date as month,
  type,
  count(*)    as transactions,
  sum(amount) as total
from public.sales
group by business_id, date_trunc('month', created_at), type;

revoke all on public.active_memberships from public, anon;
revoke all on public.low_stock_products from public, anon;
revoke all on public.monthly_income     from public, anon;

grant select on public.active_memberships to authenticated;
grant select on public.low_stock_products to authenticated;
grant select on public.monthly_income     to authenticated;

-- =============================================================================
-- 4. Seed super_admin
-- =============================================================================
-- Re-crea tu profile con role='super_admin'. Asume que tu auth.user
-- (moralesvegadavid@gmail.com) sigue existiendo. Idempotente.
-- =============================================================================

do $$
declare
  v_email text := 'moralesvegadavid@gmail.com';  -- ⬅ ajusta si cambiaste de email
  v_name  text := 'David Morales';                -- ⬅ ajusta
  v_ci    text := '00000000';                     -- ⬅ ajusta
  v_uid   uuid;
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    raise exception 'No existe auth.users para %. Créalo primero en Authentication → Users.', v_email;
  end if;

  insert into public.profiles (id, business_id, name, ci, role)
  values (v_uid, null, v_name, v_ci, 'super_admin')
  on conflict (id) do update
    set role = 'super_admin',
        business_id = null,
        name = excluded.name,
        ci = excluded.ci;

  raise notice 'Super admin listo: % (%)', v_email, v_uid;
end $$;
