-- Vora – Vistas y funciones de reportes
-- ---------------------------------------------------------------------------
-- Todo lo de acá agrega EN LA BASE lo que antes se agregaba en el navegador (o
-- directamente no existía). El criterio es el del plan gratuito de Supabase:
--
--   * Vistas normales, no materializadas: no ocupan storage y no necesitan un
--     cron que las refresque (que el plan gratuito no da administrado).
--   * `security_invoker = true`: la RLS que ya existe sigue mandando. Ninguna
--     vista de acá abre datos de otro negocio.
--   * Devolver filas agregadas, no filas crudas: el egress es el recurso que
--     primero se agota, y bajar 2.000 ventas para sumarlas en JS lo quema.
--
-- TIMEZONE: el negocio opera en Bolivia (UTC-4). `date_trunc('day', ts)` sobre
-- un timestamptz agrupa en UTC, así que una venta de las 21:00 del lunes cae
-- en el martes. Para un reporte diario eso es directamente un dato falso, por
-- eso todo lo nuevo convierte a hora local antes de truncar. Las vistas viejas
-- (income_daily, monthly_income) arrastran el problema; se corrigen abajo.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Ventas por día y método de pago
-- ---------------------------------------------------------------------------
-- Base del reporte diario del plan Caja. Se usa `orders.total_amount` en vez
-- de rearmar la suma desde order_items: register_order() lo deja calculado, y
-- así el reporte no paga un join por cada consulta.

create or replace view sales_by_payment_daily
  with (security_invoker = true)
as
select
  o.business_id,
  (o.created_at at time zone 'America/La_Paz')::date as day,
  o.payment_method,
  sum(o.total_amount)                                as total,
  count(*)::integer                                  as transactions
from orders o
where o.cancelled_at is null
group by o.business_id, (o.created_at at time zone 'America/La_Paz')::date, o.payment_method;

-- ---------------------------------------------------------------------------
-- Ingresos por categoría
-- ---------------------------------------------------------------------------
-- Reemplaza a listRevenueByCategoryThisMonth(), que se bajaba
-- orders → order_items → products → categories entero para sumarlo en JS.
-- Acá vuelve una fila por categoría y mes.

create or replace view revenue_by_category
  with (security_invoker = true)
as
select
  o.business_id,
  date_trunc('month', o.created_at at time zone 'America/La_Paz')::date as month,
  coalesce(c.name, 'Sin categoría')                                     as category_name,
  sum(oi.unit_price * oi.quantity)                                      as total
from orders o
join order_items oi on oi.order_id = o.id
left join products p   on p.id = oi.product_id
left join categories c on c.id = p.category_id
where o.cancelled_at is null
group by
  o.business_id,
  date_trunc('month', o.created_at at time zone 'America/La_Paz')::date,
  coalesce(c.name, 'Sin categoría');

-- ---------------------------------------------------------------------------
-- Planilla
-- ---------------------------------------------------------------------------
-- `salary_payments` no tiene business_id: cuelga de employees. Sin esta vista
-- el cliente tendría que traerse los empleados primero y filtrar por ids, que
-- es una consulta más y un `in (...)` que crece con la plantilla.
-- La RLS de salary_payments ya exige admin del negocio; security_invoker la
-- respeta, así que la vista no amplía el acceso.

create or replace view payroll_payments
  with (security_invoker = true)
as
select
  sp.id,
  e.business_id,
  sp.employee_id,
  e.name     as employee_name,
  e.position as employee_position,
  sp.amount,
  sp.period_month,
  sp.period_year,
  sp.paid_at,
  sp.notes,
  sp.created_at
from salary_payments sp
join employees e on e.id = sp.employee_id;

-- Totales por mes. Responde "cuánto se fue en sueldos" sin bajar pago por pago.
create or replace view payroll_monthly
  with (security_invoker = true)
as
select
  e.business_id,
  sp.period_year,
  sp.period_month,
  sum(sp.amount)                        as total_paid,
  count(distinct sp.employee_id)::integer as employees_paid
from salary_payments sp
join employees e on e.id = sp.employee_id
group by e.business_id, sp.period_year, sp.period_month;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
-- Un renglón por cliente, no por venta: el payload crece con la cartera, no
-- con el historial. De acá salen top clientes, ticket promedio e inactivos sin
-- consultas adicionales.
--
-- LEFT JOIN a propósito: un cliente cargado que nunca compró es justamente uno
-- de los casos que el reporte tiene que mostrar.

create or replace view client_sales_summary
  with (security_invoker = true)
as
select
  c.business_id,
  c.id   as client_id,
  c.name,
  c.ci,
  c.nit,
  c.phone,
  count(o.id)::integer                as orders_count,
  coalesce(sum(o.total_amount), 0)    as total_spent,
  case
    when count(o.id) = 0 then 0
    else coalesce(sum(o.total_amount), 0) / count(o.id)
  end                                 as avg_ticket,
  max(o.created_at)                   as last_purchase_at,
  min(o.created_at)                   as first_purchase_at
from clients c
left join orders o
  on o.client_id = c.id
 and o.cancelled_at is null
group by c.business_id, c.id, c.name, c.ci, c.nit, c.phone;

-- ---------------------------------------------------------------------------
-- Top de productos vendidos
-- ---------------------------------------------------------------------------
-- Función y no vista: el rango lo decide quien consulta, y agrupar todo el
-- histórico por producto para después filtrar sería tirar trabajo a la basura.
--
-- `security invoker` (el default) hace que la RLS de orders/order_items siga
-- aplicando. El filtro explícito por business_id no es seguridad — es para que
-- el planner use idx_orders_business_created en vez de escanear la tabla.

create or replace function top_products(
  p_from  date,
  p_to    date,
  p_limit integer default 5
)
returns table (
  product_id   uuid,
  product_name text,
  quantity     numeric,
  total        numeric
)
language sql
stable
set search_path = public
as $$
  select
    oi.product_id,
    coalesce(p.name, 'Producto eliminado') as product_name,
    -- quantity es integer, así que sum() devuelve bigint: el cast explícito
    -- evita depender de la coerción implícita al numeric que declara la firma.
    sum(oi.quantity)::numeric              as quantity,
    sum(oi.unit_price * oi.quantity)       as total
  from orders o
  join order_items oi on oi.order_id = o.id
  left join products p on p.id = oi.product_id
  where o.business_id = current_user_business_id()
    and o.cancelled_at is null
    and (o.created_at at time zone 'America/La_Paz')::date between p_from and p_to
  group by oi.product_id, coalesce(p.name, 'Producto eliminado')
  order by sum(oi.quantity) desc
  limit greatest(1, least(p_limit, 50));
$$;

-- ---------------------------------------------------------------------------
-- Turnos abiertos ahora mismo, con lo vendido hasta el momento
-- ---------------------------------------------------------------------------
-- Función y no vista, y `security definer` con chequeo de rol explícito, por
-- una razón de producto: cash_session_summary() esconde a propósito el
-- efectivo vendido mientras el turno sigue abierto — si el cajero ve cuánto
-- "debería" haber en el cajón antes de contarlo, el arqueo deja de medir nada.
-- Una vista normal sobre orders devolvería justo ese número a cualquier cajero
-- que la consultara, así que el dato queda detrás de una comprobación de rol.

create or replace function open_sessions_sales()
returns table (
  session_id   uuid,
  cashier_name text,
  opened_at    timestamptz,
  opening_float numeric,
  sales_count  integer,
  cash_sales   numeric,
  card_sales   numeric,
  qr_sales     numeric,
  total_sales  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Solo un administrador puede ver los turnos en curso.'
      using errcode = 'VORA3';
  end if;

  return query
  select
    cs.id,
    p.name,
    cs.opened_at,
    cs.opening_float,
    count(o.id)::integer,
    coalesce(sum(o.total_amount) filter (where o.payment_method = 'cash'), 0),
    coalesce(sum(o.total_amount) filter (where o.payment_method = 'card'), 0),
    coalesce(sum(o.total_amount) filter (where o.payment_method = 'qr'),   0),
    coalesce(sum(o.total_amount), 0)
  from cash_sessions cs
  left join profiles p on p.id = cs.opened_by
  left join orders o
    on o.cash_session_id = cs.id
   and o.cancelled_at is null
  where cs.business_id = current_user_business_id()
    and cs.status = 'open'
  group by cs.id, p.name, cs.opened_at, cs.opening_float
  order by cs.opened_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrección de las vistas viejas
-- ---------------------------------------------------------------------------
-- Mismo bug de timezone descrito arriba: agrupaban en UTC, corriendo las
-- ventas de la tarde-noche al día siguiente.
--
-- El doble `at time zone` no es adorno: el primero lleva el timestamptz a hora
-- local para truncar donde corresponde, el segundo devuelve el resultado a
-- timestamptz. Sin ese regreso la columna cambiaría de tipo y `create or
-- replace view` no lo admite — habría que dropear la vista y con ella todo lo
-- que cuelgue. (La forma de 3 argumentos de date_trunc haría lo mismo, pero
-- recién existe desde PG 16 y no vale atar la migración a esa versión.)

create or replace view income_daily
  with (security_invoker = true)
as
select
  o.business_id,
  date_trunc('day', o.created_at at time zone 'America/La_Paz')
    at time zone 'America/La_Paz'  as day,
  sum(oi.unit_price * oi.quantity) as total,
  count(distinct o.id)::integer    as transactions
from orders o
join order_items oi on oi.order_id = o.id
where o.cancelled_at is null
group by
  o.business_id,
  date_trunc('day', o.created_at at time zone 'America/La_Paz');

create or replace view monthly_income
  with (security_invoker = true)
as
select
  o.business_id,
  date_trunc('month', o.created_at at time zone 'America/La_Paz')
    at time zone 'America/La_Paz'  as month,
  sum(oi.unit_price * oi.quantity) as total,
  count(distinct o.id)::integer    as transactions
from orders o
join order_items oi on oi.order_id = o.id
where o.cancelled_at is null
group by
  o.business_id,
  date_trunc('month', o.created_at at time zone 'America/La_Paz');
