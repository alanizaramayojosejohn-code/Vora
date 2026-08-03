-- Vora – Escala de planes de dos niveles: caja / negocio
-- ---------------------------------------------------------------------------
-- basico            → caja      (149 Bs)
-- pro | enterprise  → negocio   (349 Bs)
--
-- IMPORTANTE: no se toca `monthly_fee`. Los negocios ya registrados conservan
-- la tarifa que se les cobró (150/180/210). El precio nuevo solo aplica a
-- suscripciones creadas de aquí en adelante.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'business_subscriptions'
  ) then
    raise notice 'business_subscriptions no existe — aplica primero 20260523000000_subscriptions.sql';
    return;
  end if;

  -- 1. Soltar el CHECK viejo para poder reescribir los valores
  alter table business_subscriptions
    drop constraint if exists business_subscriptions_plan_type_check;

  -- 2. Migrar las filas existentes
  update business_subscriptions set plan_type = 'caja'    where plan_type = 'basico';
  update business_subscriptions set plan_type = 'negocio' where plan_type in ('pro', 'enterprise');

  -- 3. Reinstalar el CHECK con los valores nuevos
  alter table business_subscriptions
    add constraint business_subscriptions_plan_type_check
    check (plan_type in ('caja', 'negocio', 'custom'));
end $$;
