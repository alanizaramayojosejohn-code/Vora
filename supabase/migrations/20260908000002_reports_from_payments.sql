-- Vora – Reportes y arqueo desde las líneas de pago (spec 001)
-- ---------------------------------------------------------------------------
-- Hasta acá el dinero se leía de `orders`: un pedido, un método, un monto. Con
-- pago dividido eso ya no alcanza (una venta puede ser mitad efectivo y mitad
-- QR) y con pedidos pendientes es directamente incorrecto (un pedido abierto
-- tiene total pero todavía no es plata cobrada).
--
-- Regla nueva y única: **el ingreso realizado es la suma de order_payments**.
-- De ahí salen tres consecuencias que se ven en todo el archivo:
--
--   * Un pendiente sin líneas no aparece en ningún reporte de ingresos ni en
--     el arqueo hasta que se salda (RF-5, RF-20).
--   * El día/turno de un cobro es el de la LÍNEA, no el del pedido: un
--     pendiente abierto el lunes y cobrado el martes es ingreso del martes, y
--     entra al arqueo del turno que estaba abierto al cobrar (RF-12).
--   * Los reportes de MIX de productos (categorías, top de productos) siguen
--     leyendo order_items —ahí la pregunta es qué se vendió, no cuánto se
--     cobró— pero excluyen los pendientes.
--
-- Las canceladas se filtran donde siempre: `orders.cancelled_at is null`, vía
-- el join. El criterio no se duplica.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Ventas por día y método de pago
-- ---------------------------------------------------------------------------
-- Una venta dividida en efectivo + QR aporta a las dos filas del día, cada una
-- por su monto. `transactions` cuenta pedidos distintos, así que esa venta
-- suma 1 en efectivo y 1 en QR: son dos cobros que el cajero hizo.

create or replace view sales_by_payment_daily
  with (security_invoker = true)
as
select
  op.business_id,
  (op.created_at at time zone 'America/La_Paz')::date as day,
  op.method                                           as payment_method,
  sum(op.amount)                                      as total,
  count(distinct op.order_id)::integer                as transactions
from order_payments op
join orders o on o.id = op.order_id
where o.cancelled_at is null
group by op.business_id, (op.created_at at time zone 'America/La_Paz')::date, op.method;

-- ---------------------------------------------------------------------------
-- Ingresos por día y por mes
-- ---------------------------------------------------------------------------
-- El doble `at time zone` no es adorno: el primero lleva el timestamptz a hora
-- local para truncar donde corresponde, el segundo devuelve el resultado a
-- timestamptz — si cambiara el tipo de la columna, `create or replace view`
-- no lo admitiría.

create or replace view income_daily
  with (security_invoker = true)
as
select
  op.business_id,
  date_trunc('day', op.created_at at time zone 'America/La_Paz')
    at time zone 'America/La_Paz'      as day,
  sum(op.amount)                       as total,
  count(distinct op.order_id)::integer as transactions
from order_payments op
join orders o on o.id = op.order_id
where o.cancelled_at is null
group by
  op.business_id,
  date_trunc('day', op.created_at at time zone 'America/La_Paz');

create or replace view monthly_income
  with (security_invoker = true)
as
select
  op.business_id,
  date_trunc('month', op.created_at at time zone 'America/La_Paz')
    at time zone 'America/La_Paz'      as month,
  sum(op.amount)                       as total,
  count(distinct op.order_id)::integer as transactions
from order_payments op
join orders o on o.id = op.order_id
where o.cancelled_at is null
group by
  op.business_id,
  date_trunc('month', op.created_at at time zone 'America/La_Paz');

-- ---------------------------------------------------------------------------
-- Ingresos por categoría
-- ---------------------------------------------------------------------------
-- Sigue leyendo order_items: la pregunta es qué se vendió y de qué categoría,
-- y una línea de pago no sabe a qué producto corresponde. Se agrega el filtro
-- de pendientes para no contar como ingreso lo que aún no se cobró.

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
  and o.status = 'settled'
group by
  o.business_id,
  date_trunc('month', o.created_at at time zone 'America/La_Paz')::date,
  coalesce(c.name, 'Sin categoría');

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
-- Un pendiente abierto no cuenta todavía como compra del cliente: ni suma a
-- lo gastado ni corre la fecha de última compra.

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
 and o.status = 'settled'
group by c.business_id, c.id, c.name, c.ci, c.nit, c.phone;

-- ---------------------------------------------------------------------------
-- Top de productos vendidos
-- ---------------------------------------------------------------------------

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
    sum(oi.quantity)::numeric              as quantity,
    sum(oi.unit_price * oi.quantity)       as total
  from orders o
  join order_items oi on oi.order_id = o.id
  left join products p on p.id = oi.product_id
  where o.business_id = current_user_business_id()
    and o.cancelled_at is null
    and o.status = 'settled'
    and (o.created_at at time zone 'America/La_Paz')::date between p_from and p_to
  group by oi.product_id, coalesce(p.name, 'Producto eliminado')
  order by sum(oi.quantity) desc
  limit greatest(1, least(p_limit, 50));
$$;

-- ---------------------------------------------------------------------------
-- Turnos abiertos ahora mismo
-- ---------------------------------------------------------------------------
-- `sales_count` cuenta pedidos con al menos un cobro imputado a este turno.
-- Un pendiente abierto durante el turno no aparece: todavía no es una venta.

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
    count(distinct op.order_id)::integer,
    coalesce(sum(op.amount) filter (where op.method = 'cash'), 0),
    coalesce(sum(op.amount) filter (where op.method = 'card'), 0),
    coalesce(sum(op.amount) filter (where op.method = 'qr'),   0),
    coalesce(sum(op.amount), 0)
  from cash_sessions cs
  left join profiles p on p.id = cs.opened_by
  -- El filtro de canceladas va DENTRO de la subconsulta. Puesto como
  -- condición del left join, las líneas de un pedido cancelado seguirían
  -- entrando en las sumas: el join las conserva con `o` en null.
  left join (
    select op.cash_session_id, op.order_id, op.method, op.amount
    from order_payments op
    join orders o on o.id = op.order_id
    where o.cancelled_at is null
  ) op on op.cash_session_id = cs.id
  where cs.business_id = current_user_business_id()
    and cs.status = 'open'
  group by cs.id, p.name, cs.opened_at, cs.opening_float
  order by cs.opened_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Arqueo: resumen y cierre del turno
-- ---------------------------------------------------------------------------
-- RF-13: el efectivo esperado incluye la porción en efectivo de los pagos
-- divididos, no solo las ventas "de efectivo". Sumar por línea lo resuelve sin
-- ningún caso especial.

create or replace function cash_session_summary(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_session     cash_sessions%rowtype;
  v_cash        numeric(12,2);
  v_card        numeric(12,2);
  v_qr          numeric(12,2);
  v_count       integer;
begin
  v_business_id := current_user_business_id();

  select * into v_session
  from cash_sessions
  where id = p_session_id and business_id = v_business_id;

  if not found then
    raise exception 'turno no encontrado';
  end if;

  select
    coalesce(sum(op.amount) filter (where op.method = 'cash'), 0),
    coalesce(sum(op.amount) filter (where op.method = 'card'), 0),
    coalesce(sum(op.amount) filter (where op.method = 'qr'),   0),
    count(distinct op.order_id)
  into v_cash, v_card, v_qr, v_count
  from order_payments op
  join orders o on o.id = op.order_id
  where op.cash_session_id = p_session_id
    and o.cancelled_at is null;

  return jsonb_build_object(
    'session_id',     v_session.id,
    'status',         v_session.status,
    'opening_float',  v_session.opening_float,
    'sales_count',    v_count,
    'cash_sales',     v_cash,
    'card_sales',     v_card,
    'qr_sales',       v_qr,
    -- Efectivo que debería haber en el cajón AHORA.
    'expected_cash',  v_session.opening_float + v_cash,
    'counted_cash',   v_session.counted_cash,
    'difference',     v_session.difference
  );
end;
$$;

create or replace function close_cash_session(
  p_session_id   uuid,
  p_counted_cash numeric,
  p_notes        text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_role        text;
  v_session     cash_sessions%rowtype;
  v_cash        numeric(12,2);
  v_expected    numeric(12,2);
  v_difference  numeric(12,2);
begin
  v_business_id := current_user_business_id();
  v_role        := current_user_role();

  select * into v_session
  from cash_sessions
  where id = p_session_id and business_id = v_business_id
  for update;

  if not found then
    raise exception 'turno no encontrado';
  end if;

  if v_session.status = 'closed' then
    raise exception 'Este turno ya fue cerrado.';
  end if;

  -- El cajero solo cierra lo suyo; el admin puede cerrar el turno de cualquiera
  -- (se olvidó de cerrar, se fue, se quedó abierto de ayer).
  if v_session.opened_by is distinct from auth.uid() and v_role <> 'admin' then
    raise exception 'Solo puedes cerrar tu propio turno.';
  end if;

  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Ingresa el efectivo contado.';
  end if;

  -- Los pedidos que queden pendientes no bloquean el cierre ni aportan al
  -- arqueo: no tienen líneas de pago, así que simplemente no están en esta
  -- suma. Se cobrarán en el turno que corresponda.
  select coalesce(sum(op.amount) filter (where op.method = 'cash'), 0)
  into v_cash
  from order_payments op
  join orders o on o.id = op.order_id
  where op.cash_session_id = p_session_id
    and o.cancelled_at is null;

  v_expected   := v_session.opening_float + v_cash;
  v_difference := p_counted_cash - v_expected;

  update cash_sessions
  set status        = 'closed',
      closed_by     = auth.uid(),
      closed_at     = now(),
      counted_cash  = p_counted_cash,
      expected_cash = v_expected,
      difference    = v_difference,
      notes         = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_session_id;

  return jsonb_build_object(
    'session_id',    p_session_id,
    'opening_float', v_session.opening_float,
    'cash_sales',    v_cash,
    'expected_cash', v_expected,
    'counted_cash',  p_counted_cash,
    'difference',    v_difference
  );
end;
$$;
