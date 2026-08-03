-- Vora – Features por plan
-- ---------------------------------------------------------------------------
-- Hasta ahora `plan_type` solo determinaba cuánto se cobra: los dos planes
-- daban acceso a todo. Acá se implementa el reparto que vendemos.
--
-- Restringido a Negocio: proveedores/compras, personal y sueldos, marca
-- propia, y reportes avanzados.
-- En ambos planes: POS, offline, productos, categorías, clientes, stock y
-- alertas, historial de ventas y arqueos de caja.
--
-- LÍMITE CONOCIDO: acá se cortan ESCRITURAS. Los reportes avanzados son solo
-- lectura sobre `orders` y `products`, tablas que el negocio legítimamente
-- posee y necesita para vender; restringirlas por RLS rompería el POS. Ese
-- corte queda en el cliente (planGuard + pestañas ocultas). Alguien técnico
-- podría consultar sus propios datos por fuera — aceptable, no son datos
-- ajenos, solo una vista que no pagó.
-- ---------------------------------------------------------------------------

create or replace function plan_allows(p_business_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    coalesce(
      (select plan_type from business_subscriptions where business_id = p_business_id),
      -- Sin suscripción cargada se asume acceso completo, igual que con el
      -- bloqueo por vencimiento: no dejar a nadie afuera por un dato faltante.
      'negocio'
    )
    when 'caja' then p_feature not in ('purchases', 'staff', 'branding', 'advanced_reports')
    else true  -- negocio y custom: todo
  end;
$$;

create or replace function assert_plan_allows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin()
     and not plan_allows(current_user_business_id(), tg_argv[0]) then
    raise exception 'Esta función no está incluida en tu plan. Cambia al plan Negocio para habilitarla.'
      using errcode = 'VORA2';
  end if;
  return null;
end;
$$;

do $$
declare
  spec text[];
  pair text[];
begin
  -- {tabla, feature}
  foreach spec slice 1 in array array[
    ['suppliers',            'purchases'],
    ['acquisitions',         'purchases'],
    ['acquisition_items',    'purchases'],
    ['purchase_orders',      'purchases'],
    ['purchase_order_items', 'purchases'],
    ['employees',            'staff'],
    ['salary_payments',      'staff']
  ] loop
    pair := spec;

    if to_regclass('public.' || pair[1]) is null then
      raise notice 'tabla % no existe, se omite', pair[1];
      continue;
    end if;

    execute format('drop trigger if exists trg_plan_allows on %I', pair[1]);
    execute format(
      'create trigger trg_plan_allows
         before insert or update or delete on %I
         for each statement execute function assert_plan_allows(%L)',
      pair[1], pair[2]
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Marca propia: el admin del negocio solo puede cambiar tema/logo si su plan
-- lo incluye. El super_admin queda exento (configura la marca de cualquier
-- negocio desde /saas), y por eso el trigger es a nivel de fila: hay que mirar
-- QUÉ columnas cambian, no solo que haya un update.
-- ---------------------------------------------------------------------------

create or replace function assert_branding_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_super_admin() then
    return new;
  end if;

  -- Solo se controla el cambio de marca; el resto del update pasa.
  if (new.theme is distinct from old.theme
      or new.logo_url is distinct from old.logo_url)
     and not plan_allows(new.id, 'branding') then
    raise exception 'La personalización de marca está incluida en el plan Negocio.'
      using errcode = 'VORA2';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_branding_allowed on businesses;
create trigger trg_branding_allowed
  before update on businesses
  for each row execute function assert_branding_allowed();
