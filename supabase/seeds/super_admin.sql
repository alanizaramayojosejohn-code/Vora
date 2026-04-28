-- =============================================================================
-- Seed · Crear el primer super_admin del SaaS
-- =============================================================================
-- Pasos:
-- 1) En el dashboard de Supabase: Authentication → Users → "Add user"
--    · Email:    moralesvegadavid@gmail.com  (cambia si quieres)
--    · Password: <la que elijas>
--    · "Auto Confirm User" → ON
-- 2) Edita las dos variables del bloque DO de abajo (email + datos del profile).
-- 3) Ejecútalo en el SQL Editor de Supabase.
--
-- Idempotente: si ya existe el profile lo deja como está.
-- =============================================================================

do $$
declare
  v_email text := 'alanizaramayojosejohn@gmail.com';  -- ⬅ ajusta
  v_name  text := 'Jose John Alaniz Aramayo';          -- ⬅ ajusta
  v_ci    text := '00000000';                          -- ⬅ ajusta
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
