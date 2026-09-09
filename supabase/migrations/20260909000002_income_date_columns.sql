-- Vora – income_daily / monthly_income: day/month como date, no timestamptz
-- ---------------------------------------------------------------------------
-- Bug: "Ventas del día" mostraba costo y ganancia en blanco. Causa exacta:
--
-- `income_daily.day` es un timestamptz que vale "medianoche de Bolivia,
-- expresada en UTC" — para el 9 de septiembre eso es 2026-09-09T04:00:00Z, no
-- 2026-09-09T00:00:00Z. `DailySalesQueryService.profitSummary()` filtra con
-- `.lte('day', '2026-09-09')`: PostgREST compara la columna contra
-- '2026-09-09'::timestamptz, que Postgres interpreta como medianoche UTC — es
-- decir, CUATRO HORAS ANTES que el valor real de la fila de hoy. La fila
-- queda afuera del `<=` sin ningún error visible: profitSummary() es la
-- primera consulta que le puso un límite superior a income_daily, así que es
-- la primera en toparse con esto. `sales_by_payment_daily.day` nunca lo sufre
-- porque esa vista ya lo definió como `date` desde la spec 001 (sin zona
-- horaria no hay nada que confundir).
--
-- La corrección real es el TIPO de columna, no el filtro: `date` es lo mismo
-- que ya usa sales_by_payment_daily, y deja sin efecto esta clase entera de
-- bug para cualquier filtro futuro con límite superior. `create or replace
-- view` no admite cambiar el tipo de una columna existente, así que hace
-- falta drop + create — ninguna otra vista depende de estas dos.
-- ---------------------------------------------------------------------------

drop view if exists income_daily;

create view income_daily
  with (security_invoker = true)
as
select
  business_id,
  (paid_at at time zone 'America/La_Paz')::date as day,
  sum(revenue)                      as total,
  count(*)::integer                 as transactions,
  sum(cost)                         as cost,
  sum(profit)                       as profit
from settled_order_profit
group by business_id, (paid_at at time zone 'America/La_Paz')::date;

drop view if exists monthly_income;

create view monthly_income
  with (security_invoker = true)
as
select
  business_id,
  date_trunc('month', paid_at at time zone 'America/La_Paz')::date as month,
  sum(revenue)                      as total,
  count(*)::integer                 as transactions,
  sum(cost)                         as cost,
  sum(profit)                       as profit
from settled_order_profit
group by business_id, date_trunc('month', paid_at at time zone 'America/La_Paz')::date;
