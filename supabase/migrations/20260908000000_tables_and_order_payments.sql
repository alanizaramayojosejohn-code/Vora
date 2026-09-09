-- Vora – Mesas, pedidos pendientes y líneas de pago (spec 001)
-- ---------------------------------------------------------------------------
-- Tres piezas que trabajan juntas:
--
--   1. `tables`          catálogo de mesas por negocio (o "para llevar" cuando
--                        no hay mesa física).
--   2. `orders.status`   un pedido puede quedar 'pending': se cobra después y
--                        mientras tanto se le siguen agregando ítems.
--   3. `order_payments`  el dinero deja de vivir en orders.payment_method /
--                        total_amount y pasa a ser N líneas (método + monto),
--                        que es lo único que permite pago dividido.
--
-- La consecuencia importante de (3): a partir de acá el ingreso REALIZADO se
-- suma desde order_payments, no desde orders. Un pedido pendiente tiene total
-- pero no tiene líneas, y por eso queda fuera del arqueo y de los reportes
-- hasta que se salde (RF-5, RF-20). Las vistas se migran en
-- 20260908000002_reports_from_payments.sql.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Catálogo de mesas (RF-1)
-- ---------------------------------------------------------------------------

create table if not exists tables (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  name        text        not null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Sin dos "Mesa 3" en el mismo negocio: el nombre es lo único que el cajero ve
-- para elegirla, así que repetirlo hace la lista inutilizable. Incluye a las
-- inactivas a propósito — reactivar la vieja es mejor que duplicarla.
create unique index if not exists idx_tables_business_name
  on tables (business_id, lower(name));

create index if not exists idx_tables_business_active
  on tables (business_id, is_active);

alter table tables enable row level security;

drop policy if exists "users read own business tables" on tables;
create policy "users read own business tables"
  on tables for select
  using (business_id = current_user_business_id());

drop policy if exists "admins manage tables" on tables;
create policy "admins manage tables"
  on tables for all
  using (
    business_id = current_user_business_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- Una mesa ocupada no se desactiva ni se borra (RF-3)
-- ---------------------------------------------------------------------------
-- El FK de orders.table_id es ON DELETE SET NULL: sin este trigger, borrar la
-- mesa dejaría el pendiente huérfano y en silencio — la cuenta seguiría abierta
-- pero ya sin saber de qué mesa era.

create or replace function assert_table_has_no_pending_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
begin
  if tg_op = 'DELETE' then
    v_table_id := old.id;
  elsif new.is_active = false and old.is_active = true then
    v_table_id := new.id;
  else
    return new;
  end if;

  if exists (
    select 1 from orders
    where table_id = v_table_id
      and status = 'pending'
      and cancelled_at is null
  ) then
    raise exception 'Esta mesa tiene un pedido pendiente. Sáldalo o cancélalo antes de desactivarla.'
      using errcode = 'VORA4';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_table_has_no_pending_order on tables;
create trigger trg_table_has_no_pending_order
  before update or delete on tables
  for each row execute function assert_table_has_no_pending_order();

-- ---------------------------------------------------------------------------
-- Pedidos: mesa, para llevar, estado pendiente
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists table_id    uuid references tables(id) on delete set null,
  add column if not exists is_takeaway boolean not null default false,
  add column if not exists status      text not null default 'settled',
  add column if not exists settled_at  timestamptz,
  add column if not exists settled_by  uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_status_check' and conrelid = 'public.orders'::regclass
  ) then
    alter table orders add constraint orders_status_check
      check (status in ('pending', 'settled'));
  end if;

  -- Mesa y "para llevar" son excluyentes, y ambas opcionales (RF-4).
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_table_or_takeaway_check' and conrelid = 'public.orders'::regclass
  ) then
    alter table orders add constraint orders_table_or_takeaway_check
      check (not (is_takeaway and table_id is not null));
  end if;
end $$;

-- payment_method deja de ser obligatorio y deja de ser la verdad sobre el
-- cobro. Queda como dato heredado (una sola línea de pago lo sigue llenando,
-- para las pantallas que aún lo leen), pero un pendiente no tiene ninguno y un
-- pago dividido no tiene UNO. El check original sigue aplicando para los no
-- nulos: `null in ('cash',...)` da null, y un check solo falla con false.
alter table orders alter column payment_method drop not null;
alter table orders alter column payment_method drop default;

-- Los pedidos que ya existían se cobraron al crearse.
update orders set settled_at = created_at
where status = 'settled' and settled_at is null;

-- Una mesa, un pendiente a la vez (RF-6). Índice parcial: las mesas libres y
-- los pedidos ya saldados o cancelados no ocupan lugar en el índice, así que
-- la misma mesa puede tener mil pedidos a lo largo del día.
create unique index if not exists idx_orders_one_pending_per_table
  on orders (business_id, table_id)
  where status = 'pending' and cancelled_at is null and table_id is not null;

-- La franja de pendientes consulta esto en cada carga de la pantalla de venta.
create index if not exists idx_orders_pending
  on orders (business_id, created_at)
  where status = 'pending' and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- Líneas de pago (RF-10)
-- ---------------------------------------------------------------------------
-- Un cobro simple es una línea; un pago dividido, varias. `cash_session_id` va
-- en la LÍNEA y no en el pedido porque es la línea la que entra al arqueo: un
-- pendiente abierto en el turno de la mañana y cobrado en el de la tarde suma
-- en el segundo (RF-12).

create table if not exists order_payments (
  id              uuid        primary key default gen_random_uuid(),
  business_id     uuid        not null references businesses(id) on delete cascade,
  order_id        uuid        not null references orders(id) on delete cascade,
  method          text        not null check (method in ('cash', 'card', 'qr')),
  amount          numeric(12, 2) not null check (amount > 0),
  cash_session_id uuid        references cash_sessions(id) on delete set null,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_order_payments_order
  on order_payments (order_id);

create index if not exists idx_order_payments_session
  on order_payments (cash_session_id);

create index if not exists idx_order_payments_business_created
  on order_payments (business_id, created_at);

alter table order_payments enable row level security;

-- Igual que cash_sessions: SOLO LECTURA vía PostgREST. Toda escritura pasa por
-- los RPC SECURITY DEFINER. Una policy `for all` dejaría al cajero editar el
-- monto de una línea ya registrada, que es editar el arqueo.
drop policy if exists "business members read own order payments" on order_payments;
create policy "business members read own order payments"
  on order_payments for select
  using (business_id = current_user_business_id());

drop policy if exists "super_admin reads order payments" on order_payments;
create policy "super_admin reads order payments"
  on order_payments for select
  using (is_super_admin());

-- ---------------------------------------------------------------------------
-- Backfill: el histórico pasa a tener sus líneas de pago
-- ---------------------------------------------------------------------------
-- Sin esto, migrar los reportes a order_payments borraría de un plumazo todo
-- lo vendido hasta hoy. Se incluyen las canceladas: las vistas las filtran por
-- orders.cancelled_at, igual que antes, y así el criterio queda en un solo
-- lugar. `not exists` hace la migración reejecutable sin duplicar.

insert into order_payments (business_id, order_id, method, amount, cash_session_id, created_by, created_at)
select
  o.business_id,
  o.id,
  coalesce(o.payment_method, 'cash'),
  o.total_amount,
  o.cash_session_id,
  o.created_by,
  o.created_at
from orders o
where o.total_amount > 0
  and not exists (select 1 from order_payments p where p.order_id = o.id);

-- ---------------------------------------------------------------------------
-- Idempotencia de las operaciones offline (RF-23)
-- ---------------------------------------------------------------------------
-- register_order no la necesita: ya es idempotente por orders.client_uuid.
-- Las operaciones nuevas (agregar ítems, saldar) no tienen una fila propia
-- contra la cual chocar, así que la clave vive acá.
--
-- Sin policies: es tabla interna de los RPC SECURITY DEFINER. Ningún cliente
-- tiene por qué leerla ni escribirla.

create table if not exists applied_operations (
  operation_uuid uuid        primary key,
  business_id    uuid        not null references businesses(id) on delete cascade,
  order_id       uuid        references orders(id) on delete cascade,
  kind           text        not null,
  applied_at     timestamptz not null default now()
);

alter table applied_operations enable row level security;

-- ---------------------------------------------------------------------------
-- Suscripción vencida = solo lectura, también acá (RF-17)
-- ---------------------------------------------------------------------------
-- Mismo trigger de sentencia que usa el resto de las tablas operativas
-- (20260802000004). Cubre crear mesas, y cobrar o saldar (que escribe
-- order_payments). Agregar ítems ya queda cubierto por el trigger de
-- order_items.

do $$
declare
  t text;
begin
  foreach t in array array['tables', 'order_payments'] loop
    execute format('drop trigger if exists trg_subscription_writable on %I', t);
    execute format(
      'create trigger trg_subscription_writable
         before insert or update or delete on %I
         for each statement execute function assert_subscription_writable()',
      t
    );
  end loop;
end $$;
