-- Vora – Cierre de caja / arqueo por turno
-- ---------------------------------------------------------------------------
-- Un turno abre con un fondo fijo, acumula ventas y cierra contando el
-- efectivo físico. El sistema calcula cuánto DEBERÍA haber y guarda la
-- diferencia. Eso es lo que responde la pregunta del dueño: "¿me cuadra la
-- caja?".
--
-- Un turno abierto por cajero y por negocio: el arqueo es responsabilidad
-- individual, si no, no sirve para nada.
-- ---------------------------------------------------------------------------

create table if not exists cash_sessions (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references businesses(id) on delete cascade,
  status         text        not null default 'open' check (status in ('open', 'closed')),
  opening_float  numeric(12, 2) not null default 0 check (opening_float >= 0),
  opened_by      uuid        references auth.users(id) on delete set null,
  opened_at      timestamptz not null default now(),
  closed_by      uuid        references auth.users(id) on delete set null,
  closed_at      timestamptz,
  counted_cash   numeric(12, 2),
  expected_cash  numeric(12, 2),
  difference     numeric(12, 2),
  notes          text,
  created_at     timestamptz not null default now()
);

-- Un solo turno abierto por cajero.
create unique index if not exists idx_cash_sessions_one_open
  on cash_sessions (business_id, opened_by)
  where status = 'open';

create index if not exists idx_cash_sessions_business
  on cash_sessions (business_id, opened_at desc);

alter table orders
  add column if not exists cash_session_id uuid references cash_sessions(id) on delete set null;

create index if not exists idx_orders_cash_session on orders (cash_session_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table cash_sessions enable row level security;

-- SOLO LECTURA vía PostgREST. A propósito no hay policies de insert/update/
-- delete: toda escritura pasa por los RPC SECURITY DEFINER de abajo.
--
-- Con un `for all using (business_id = ...)` (la convención del resto del
-- proyecto) Postgres reusa el USING como WITH CHECK, y el cajero podría hacer
-- un UPDATE directo sobre counted_cash o difference después de cerrar. Un
-- arqueo que el cajero puede editar no mide nada.
create policy "business members read own cash sessions"
  on cash_sessions for select
  using (business_id = current_user_business_id());

create policy "super_admin reads cash sessions"
  on cash_sessions for select
  using (is_super_admin());

-- ---------------------------------------------------------------------------
-- Abrir turno
-- ---------------------------------------------------------------------------

create or replace function open_cash_session(p_opening_float numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_session_id  uuid;
begin
  v_business_id := current_user_business_id();
  if v_business_id is null then
    raise exception 'unauthenticated';
  end if;

  if subscription_blocked(v_business_id) then
    raise exception 'Suscripción vencida. El sistema está bloqueado hasta regularizar el pago.'
      using errcode = 'VORA1';
  end if;

  if p_opening_float < 0 then
    raise exception 'El fondo de caja no puede ser negativo.';
  end if;

  insert into cash_sessions (business_id, opening_float, opened_by)
  values (v_business_id, coalesce(p_opening_float, 0), auth.uid())
  returning id into v_session_id;

  return v_session_id;
exception when unique_violation then
  raise exception 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumen del turno (ventas acumuladas, sin contar canceladas)
-- ---------------------------------------------------------------------------

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
    coalesce(sum(total_amount) filter (where payment_method = 'cash'), 0),
    coalesce(sum(total_amount) filter (where payment_method = 'card'), 0),
    coalesce(sum(total_amount) filter (where payment_method = 'qr'),   0),
    count(*)
  into v_cash, v_card, v_qr, v_count
  from orders
  where cash_session_id = p_session_id
    and cancelled_at is null;

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

-- ---------------------------------------------------------------------------
-- Cerrar turno
-- ---------------------------------------------------------------------------

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

  select coalesce(sum(total_amount) filter (where payment_method = 'cash'), 0)
  into v_cash
  from orders
  where cash_session_id = p_session_id
    and cancelled_at is null;

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

-- ---------------------------------------------------------------------------
-- register_order: asocia la venta al turno abierto
--
-- Redefine la función conservando idempotencia (20260802000001) y bloqueo por
-- suscripción (20260802000002).
--
-- p_cash_session_id lo manda el cliente para las ventas que estuvieron en cola
-- offline: hay que imputarlas al turno en que se cobraron, no al que esté
-- abierto cuando por fin sincronizan. Si viene null se resuelve el turno
-- abierto del cajero.
-- ---------------------------------------------------------------------------

create or replace function register_order(
  p_client_id       uuid,
  p_payment_method  text,
  p_items           jsonb,       -- [{product_id, quantity, unit_price}]
  p_notes           text default null,
  p_client_uuid     uuid default null,
  p_cash_session_id uuid default null
)
returns uuid language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_order_id    uuid;
  v_session_id  uuid;
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

  if subscription_blocked(v_business_id) then
    raise exception 'Suscripción vencida. El sistema está bloqueado hasta regularizar el pago.'
      using errcode = 'VORA1';
  end if;

  -- Idempotencia: si esta venta ya se registró, devolver la misma orden.
  if p_client_uuid is not null then
    select id into v_order_id
    from orders
    where business_id = v_business_id and client_uuid = p_client_uuid;

    if found then
      return v_order_id;
    end if;
  end if;

  -- Turno: el que mande el cliente (validado contra el negocio) o el abierto.
  if p_cash_session_id is not null then
    select id into v_session_id
    from cash_sessions
    where id = p_cash_session_id and business_id = v_business_id;
  end if;

  if v_session_id is null then
    select id into v_session_id
    from cash_sessions
    where business_id = v_business_id
      and opened_by = auth.uid()
      and status = 'open';
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

  -- Insert order header. El bloque anidado cubre la carrera de dos
  -- sincronizaciones simultáneas de la misma venta.
  begin
    insert into orders (business_id, client_id, payment_method, notes, created_by, client_uuid, cash_session_id)
    values (
      v_business_id,
      p_client_id,
      p_payment_method,
      nullif(trim(coalesce(p_notes, '')), ''),
      auth.uid(),
      p_client_uuid,
      v_session_id
    )
    returning id into v_order_id;
  exception when unique_violation then
    select id into v_order_id
    from orders
    where business_id = v_business_id and client_uuid = p_client_uuid;
    return v_order_id;
  end;

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
