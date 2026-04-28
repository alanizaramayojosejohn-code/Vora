-- =============================================================================
-- SaasGym · Views para dashboards y reports
-- Todas las vistas usan `security_invoker = true` para que respeten la RLS
-- de las tablas base (cada usuario solo ve filas de su business_id).
-- =============================================================================

-- 0. Fix de la vista existente (le faltaba security_invoker) -----------------
alter view public.income_daily set (security_invoker = true);

-- =============================================================================
-- 1. active_memberships (gym-only — vacía para tenants 'pos')
-- =============================================================================
-- Clientes con membresía vigente HOY. Pensada para la pantalla de
-- "tomar asistencia": un cliente que no aparece aquí no puede ingresar.
-- Si un cliente tiene varias membresías solapadas, aparecerá varias veces.
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

-- =============================================================================
-- 2. low_stock_products
-- =============================================================================
-- Productos con stock <= 5. Umbral fijo a propósito; si más adelante
-- necesitas umbral por producto, agrega columna `low_stock_threshold`
-- a products y cambia el WHERE.
-- =============================================================================

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

-- =============================================================================
-- 3. monthly_income
-- =============================================================================
-- Ingresos agregados por mes y tipo. Para el panel de Reports.
-- Complementa a income_daily (granularidad diaria). Ambas filtran por business_id
-- automáticamente vía RLS de sales.
-- =============================================================================

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

-- =============================================================================
-- 4. Permisos
-- =============================================================================
-- Solo authenticated. anon nunca debería leer estas vistas.
-- =============================================================================

revoke all on public.active_memberships from public, anon;
revoke all on public.low_stock_products from public, anon;
revoke all on public.monthly_income     from public, anon;

grant select on public.active_memberships to authenticated;
grant select on public.low_stock_products to authenticated;
grant select on public.monthly_income     to authenticated;
