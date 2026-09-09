-- Vora – Costo y ganancia en los reportes (spec 002)
-- ---------------------------------------------------------------------------
-- Con `order_items.unit_cost` ya congelado (migración anterior), acá se
-- construye la ganancia: ingreso menos costo, imputada al mismo día que el
-- ingreso — el del COBRO, no el de creación del pedido (RF-7). Es la misma
-- regla que la spec 001 fijó para `income_daily` al moverlo a
-- `order_payments`; separarla dejaría un mes con ingreso de un día y costo de
-- otro.
--
-- El punto delicado es que un pedido puede tener VARIAS líneas de pago (pago
-- dividido). Sumar `unit_cost * quantity` con un join directo a
-- `order_payments` multiplicaría el costo tantas veces como líneas de pago
-- tenga el pedido. `settled_order_profit` evita eso: agrega el costo del
-- pedido en un LATERAL por separado del día de cobro, así cada pedido aporta
-- su costo una sola vez sin importar en cuántas líneas se cobró.
-- ---------------------------------------------------------------------------

create or replace view settled_order_profit
  with (security_invoker = true)
as
select
  o.id          as order_id,
  o.business_id,
  paid.paid_at,
  o.total_amount as revenue,
  coalesce(items.cost, 0)                        as cost,
  o.total_amount - coalesce(items.cost, 0)       as profit
from orders o
join lateral (
  -- Todas las líneas de un mismo cobro comparten el mismo `now()` de
  -- transacción (se insertan en un solo INSERT dentro de apply_order_payments),
  -- así que min() es exacto y no un promedio ni una aproximación.
  select min(op.created_at) as paid_at
  from order_payments op
  where op.order_id = o.id
) paid on true
join lateral (
  select sum(oi.unit_cost * oi.quantity) as cost
  from order_items oi
  where oi.order_id = o.id
) items on true
where o.cancelled_at is null
  and o.status = 'settled';

-- ---------------------------------------------------------------------------
-- Cuántos productos distintos se vendieron sin costo cargado, en un rango.
-- ---------------------------------------------------------------------------
-- Función y no columna embebida: el aviso de RF-23 es un dato de RANGO
-- ("en este período hay N productos sin costo"), no una fila más por día o
-- por mes, así que cada pantalla la pide una vez para el rango que esté
-- mostrando — el mismo patrón que ya usa `top_products(p_from, p_to, ...)`.
--
-- DISTINCT hace inofensiva la multiplicación por líneas de pago: un mismo
-- producto contado dos veces por culpa del join a order_payments sigue
-- siendo una sola fila distinta.

create or replace function zero_cost_product_count(
  p_from date,
  p_to   date
)
returns integer
language sql
stable
set search_path = public
as $$
  select count(distinct oi.product_id)::integer
  from orders o
  join order_items oi     on oi.order_id = o.id
  join order_payments op  on op.order_id = o.id
  where o.business_id = current_user_business_id()
    and o.cancelled_at is null
    and o.status = 'settled'
    and oi.unit_cost = 0
    and (op.created_at at time zone 'America/La_Paz')::date between p_from and p_to;
$$;

-- ---------------------------------------------------------------------------
-- Ingresos por día y por mes: se agregan cost y profit.
-- ---------------------------------------------------------------------------

create or replace view income_daily
  with (security_invoker = true)
as
select
  business_id,
  date_trunc('day', paid_at at time zone 'America/La_Paz')
    at time zone 'America/La_Paz'   as day,
  sum(revenue)                      as total,
  count(*)::integer                 as transactions,
  sum(cost)                         as cost,
  sum(profit)                       as profit
from settled_order_profit
group by business_id, date_trunc('day', paid_at at time zone 'America/La_Paz');

create or replace view monthly_income
  with (security_invoker = true)
as
select
  business_id,
  date_trunc('month', paid_at at time zone 'America/La_Paz')
    at time zone 'America/La_Paz'   as month,
  sum(revenue)                      as total,
  count(*)::integer                 as transactions,
  sum(cost)                         as cost,
  sum(profit)                       as profit
from settled_order_profit
group by business_id, date_trunc('month', paid_at at time zone 'America/La_Paz');

-- ---------------------------------------------------------------------------
-- Ingresos por categoría: se agregan cost y profit.
-- ---------------------------------------------------------------------------
-- Aprovecha el cambio para corregir el mismo desfase de fecha que tenían
-- `income_daily`/`monthly_income` antes de la spec 001: agrupaba por
-- `orders.created_at` (cuándo se abrió el pedido), no por cuándo se cobró.
-- Con costo agregado acá, mantener esa fecha distinta a la del resto de
-- reportes de ganancia haría que la misma venta "pese" en meses distintos
-- según qué tabla se mire — exactamente lo que RF-7 pide evitar.

create or replace view revenue_by_category
  with (security_invoker = true)
as
select
  o.business_id,
  date_trunc('month', paid.paid_at at time zone 'America/La_Paz')::date as month,
  coalesce(c.name, 'Sin categoría')                                     as category_name,
  sum(oi.unit_price * oi.quantity)                                      as total,
  sum(oi.unit_cost  * oi.quantity)                                      as cost,
  sum((oi.unit_price - oi.unit_cost) * oi.quantity)                     as profit
from orders o
join order_items oi on oi.order_id = o.id
join lateral (
  select min(op.created_at) as paid_at
  from order_payments op
  where op.order_id = o.id
) paid on true
left join products p   on p.id = oi.product_id
left join categories c on c.id = p.category_id
where o.cancelled_at is null
  and o.status = 'settled'
group by
  o.business_id,
  date_trunc('month', paid.paid_at at time zone 'America/La_Paz')::date,
  coalesce(c.name, 'Sin categoría');

-- ---------------------------------------------------------------------------
-- Top de productos: se agregan cost, profit, margin y la opción de ordenar
-- por ganancia (RF-17). Mismo ajuste de fecha que revenue_by_category, por la
-- misma razón: el rango que el cajero elige ("hoy", "últimos 7 días") tiene
-- que traer las mismas ventas que cuentan en income_daily para ese rango.
-- ---------------------------------------------------------------------------

drop function if exists top_products(date, date, integer);

create or replace function top_products(
  p_from     date,
  p_to       date,
  p_limit    integer default 5,
  p_order_by text    default 'quantity'  -- 'quantity' | 'profit'
)
returns table (
  product_id   uuid,
  product_name text,
  quantity     numeric,
  total        numeric,
  cost         numeric,
  profit       numeric,
  -- null cuando total = 0: un margen de "0%" insinuaría que no hubo ni
  -- ganancia ni pérdida, cuando en realidad no hay ingreso sobre el que
  -- calcular ningún porcentaje (RF-10).
  margin       numeric
)
language sql
stable
set search_path = public
as $$
  select
    oi.product_id,
    coalesce(p.name, 'Producto eliminado')  as product_name,
    sum(oi.quantity)::numeric               as quantity,
    sum(oi.unit_price * oi.quantity)        as total,
    sum(oi.unit_cost  * oi.quantity)        as cost,
    sum((oi.unit_price - oi.unit_cost) * oi.quantity) as profit,
    case when sum(oi.unit_price * oi.quantity) = 0 then null
      else round(
        sum((oi.unit_price - oi.unit_cost) * oi.quantity)
          / sum(oi.unit_price * oi.quantity) * 100,
        2
      )
    end as margin
  from orders o
  join order_items oi on oi.order_id = o.id
  join lateral (
    select min(op.created_at) as paid_at
    from order_payments op
    where op.order_id = o.id
  ) paid on true
  left join products p on p.id = oi.product_id
  where o.business_id = current_user_business_id()
    and o.cancelled_at is null
    and o.status = 'settled'
    and (paid.paid_at at time zone 'America/La_Paz')::date between p_from and p_to
  group by oi.product_id, coalesce(p.name, 'Producto eliminado')
  order by
    case when p_order_by = 'profit' then sum((oi.unit_price - oi.unit_cost) * oi.quantity) end desc nulls last,
    case when p_order_by <> 'profit' then sum(oi.quantity) end desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;
