-- =============================================================================
-- SaasGym · RPC functions
-- Cubre el flujo completo de operación: crear negocio, users, asistencia, ventas.
-- Todas SECURITY DEFINER + validación manual de rol del caller.
-- Las RPCs gym-only (register_attendance, register_sale_membership) validan
-- que el negocio del caller sea de type='gym' antes de operar.
-- =============================================================================

-- =============================================================================
-- 1. create_business_with_admin
-- =============================================================================
-- Lo invoca un super_admin. Crea negocio + profile del admin + servicios en una
-- sola transacción. Requiere que el auth.user del admin ya exista.
-- p_type define el vertical: 'pos' (POS+inventario) o 'gym' (todo lo anterior
-- + membresías + asistencia). Para 'pos' se recomienda p_services vacío.
-- =============================================================================

create or replace function public.create_business_with_admin(
  p_business_name text,
  p_business_type text,
  p_admin_user_id uuid,
  p_admin_name    text,
  p_admin_ci      text,
  p_services      text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_id uuid;
  v_service     text;
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado: solo super_admin puede crear negocios';
  end if;

  if p_business_type not in ('pos', 'gym') then
    raise exception 'Tipo de negocio inválido: % (debe ser pos o gym)', p_business_type;
  end if;

  if not exists (select 1 from auth.users where id = p_admin_user_id) then
    raise exception 'El auth.user % no existe; créalo primero en el dashboard', p_admin_user_id;
  end if;

  if exists (select 1 from public.profiles where id = p_admin_user_id) then
    raise exception 'El usuario % ya tiene un profile asignado', p_admin_user_id;
  end if;

  insert into public.businesses (name, type)
  values (p_business_name, p_business_type)
  returning id into v_business_id;

  insert into public.profiles (id, business_id, name, ci, role)
  values (p_admin_user_id, v_business_id, p_admin_name, p_admin_ci, 'admin');

  if p_services is not null then
    foreach v_service in array p_services loop
      if length(trim(v_service)) > 0 then
        insert into public.services (business_id, name)
        values (v_business_id, trim(v_service))
        on conflict (business_id, name) do nothing;
      end if;
    end loop;
  end if;

  return v_business_id;
end;
$$;

-- =============================================================================
-- 2. create_user_for_business
-- =============================================================================
-- super_admin puede crear admin/caja en cualquier negocio.
-- admin solo puede crear admin/caja en su propio negocio.
-- caja no puede crear usuarios.
-- =============================================================================

create or replace function public.create_user_for_business(
  p_user_id     uuid,
  p_business_id uuid,
  p_name        text,
  p_ci          text,
  p_role        text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
begin
  if p_role not in ('admin', 'caja') then
    raise exception 'Rol inválido: % (debe ser admin o caja)', p_role;
  end if;

  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role = 'super_admin' then
    null;  -- puede crear en cualquier negocio
  elsif v_caller_role = 'admin' then
    if p_business_id is distinct from v_caller_business then
      raise exception 'admin solo puede crear users en su propio negocio';
    end if;
  else
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negocio % no existe', p_business_id;
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'El auth.user % no existe; créalo primero', p_user_id;
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'El usuario % ya tiene un profile asignado', p_user_id;
  end if;

  insert into public.profiles (id, business_id, name, ci, role)
  values (p_user_id, p_business_id, p_name, p_ci, p_role);

  return p_user_id;
end;
$$;

-- =============================================================================
-- 3. register_attendance (gym-only)
-- =============================================================================
-- Toma asistencia: busca la membresía vigente del cliente, descuenta una
-- sesión si el plan es por sesiones, y registra la asistencia.
-- Requiere que el negocio del caller sea type='gym'.
-- =============================================================================

create or replace function public.register_attendance(
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_caller_type     text;
  v_client_business uuid;
  v_membership      public.client_memberships%rowtype;
  v_attendance_id   uuid;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();
  v_caller_type     := public.current_user_business_type();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if v_caller_type is distinct from 'gym' then
    raise exception 'Asistencia solo está disponible en negocios de tipo gym';
  end if;

  select business_id into v_client_business from public.clients where id = p_client_id;
  if v_client_business is null then
    raise exception 'Cliente % no encontrado', p_client_id;
  end if;
  if v_client_business is distinct from v_caller_business then
    raise exception 'El cliente pertenece a otro negocio';
  end if;

  select * into v_membership
  from public.client_memberships
  where client_id = p_client_id
    and current_date between start_date and end_date
  order by end_date desc
  limit 1;

  if v_membership.id is null then
    raise exception 'El cliente no tiene una membresía vigente';
  end if;

  if v_membership.sessions_left is not null then
    if v_membership.sessions_left <= 0 then
      raise exception 'La membresía no tiene sesiones disponibles';
    end if;
    update public.client_memberships
    set sessions_left = sessions_left - 1
    where id = v_membership.id;
  end if;

  insert into public.attendance (business_id, client_id, client_membership_id)
  values (v_caller_business, p_client_id, v_membership.id)
  returning id into v_attendance_id;

  return v_attendance_id;
end;
$$;

-- =============================================================================
-- 4. register_sale_product
-- =============================================================================
-- Registra venta de producto: valida stock, decrementa stock, crea sale.
-- p_client_id es opcional (venta a cliente conocido o no).
-- Disponible para ambos tipos de negocio (pos y gym).
-- =============================================================================

create or replace function public.register_sale_product(
  p_product_id uuid,
  p_quantity   integer default 1,
  p_client_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_product         public.products%rowtype;
  v_sale_id         uuid;
  v_amount          numeric(12, 2);
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    raise exception 'Producto % no encontrado', p_product_id;
  end if;
  if v_product.business_id is distinct from v_caller_business then
    raise exception 'El producto pertenece a otro negocio';
  end if;
  if v_product.stock < p_quantity then
    raise exception 'Stock insuficiente (disponible: %, solicitado: %)', v_product.stock, p_quantity;
  end if;

  if p_client_id is not null then
    if not exists (
      select 1 from public.clients
      where id = p_client_id and business_id = v_caller_business
    ) then
      raise exception 'El cliente no pertenece a tu negocio';
    end if;
  end if;

  v_amount := v_product.price * p_quantity;

  update public.products
  set stock = stock - p_quantity
  where id = p_product_id;

  insert into public.sales (business_id, type, amount, quantity, client_id, product_id, created_by)
  values (v_caller_business, 'product', v_amount, p_quantity, p_client_id, p_product_id, auth.uid())
  returning id into v_sale_id;

  return v_sale_id;
end;
$$;

-- =============================================================================
-- 5. register_sale_membership (gym-only)
-- =============================================================================
-- Asigna una membresía a un cliente y registra la venta. Calcula end_date
-- desde plan.duration_days y copia sessions_number como sessions_left.
-- Devuelve client_membership_id (más útil que sale_id en este flujo).
-- Requiere que el negocio del caller sea type='gym'.
-- =============================================================================

create or replace function public.register_sale_membership(
  p_client_id  uuid,
  p_plan_id    uuid,
  p_start_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_business uuid;
  v_caller_type     text;
  v_plan            public.membership_plans%rowtype;
  v_cm_id           uuid;
  v_end_date        date;
begin
  v_caller_role     := public.current_user_role();
  v_caller_business := public.current_user_business_id();
  v_caller_type     := public.current_user_business_type();

  if v_caller_role not in ('admin', 'caja') then
    raise exception 'No autorizado';
  end if;

  if v_caller_type is distinct from 'gym' then
    raise exception 'Las membresías solo están disponibles en negocios de tipo gym';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id and business_id = v_caller_business
  ) then
    raise exception 'El cliente no pertenece a tu negocio';
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan % no encontrado', p_plan_id;
  end if;
  if v_plan.business_id is distinct from v_caller_business then
    raise exception 'El plan pertenece a otro negocio';
  end if;

  v_end_date := p_start_date + (v_plan.duration_days || ' days')::interval;

  insert into public.client_memberships (business_id, client_id, plan_id, start_date, end_date, sessions_left)
  values (v_caller_business, p_client_id, p_plan_id, p_start_date, v_end_date, v_plan.sessions_number)
  returning id into v_cm_id;

  insert into public.sales (business_id, type, amount, quantity, client_id, client_membership_id, created_by)
  values (v_caller_business, 'membership', v_plan.price, 1, p_client_id, v_cm_id, auth.uid());

  return v_cm_id;
end;
$$;

-- =============================================================================
-- 6. Permisos
-- =============================================================================
-- Por defecto las funciones son ejecutables por PUBLIC. Lo restringimos a
-- usuarios autenticados. La autorización fina (rol/negocio/tipo) la hace
-- cada función.
-- =============================================================================

revoke all on function public.create_business_with_admin(text, text, uuid, text, text, text[]) from public;
revoke all on function public.create_user_for_business(uuid, uuid, text, text, text)            from public;
revoke all on function public.register_attendance(uuid)                                         from public;
revoke all on function public.register_sale_product(uuid, integer, uuid)                        from public;
revoke all on function public.register_sale_membership(uuid, uuid, date)                        from public;

grant execute on function public.create_business_with_admin(text, text, uuid, text, text, text[]) to authenticated;
grant execute on function public.create_user_for_business(uuid, uuid, text, text, text)           to authenticated;
grant execute on function public.register_attendance(uuid)                                        to authenticated;
grant execute on function public.register_sale_product(uuid, integer, uuid)                       to authenticated;
grant execute on function public.register_sale_membership(uuid, uuid, date)                       to authenticated;
