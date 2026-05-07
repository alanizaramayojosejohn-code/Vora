-- =============================================================================
-- SaasGym · Categories
-- Nueva tabla `categories` para agrupar productos por categoría.
-- `products.category` (text libre) reemplazada por FK `category_id`.
-- RLS: mismo patrón que products (Step 2) — SELECT admin+caja, WRITE solo admin.
-- =============================================================================

-- =============================================================================
-- 1. Tabla categories
-- =============================================================================

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create index idx_categories_business on public.categories(business_id);

-- =============================================================================
-- 2. RLS
-- =============================================================================

alter table public.categories enable row level security;

-- SELECT: admin + caja del tenant (super_admin siempre pasa).
create policy "categories_select" on public.categories
  for select to authenticated
  using (
    public.is_super_admin()
    or business_id = public.current_user_business_id()
  );

-- WRITE: solo admin del tenant (super_admin siempre pasa).
-- Usa el helper is_admin_in_business creado en Step 2.
create policy "categories_admin_write" on public.categories
  for all to authenticated
  using  (public.is_admin_in_business(business_id))
  with check (public.is_admin_in_business(business_id));

-- =============================================================================
-- 3. Migrar products
-- =============================================================================

-- 3a. FK nullable. ON DELETE SET NULL: borrar una categoría deja los
--     productos asociados sin categoría en lugar de bloquear el borrado.
alter table public.products
  add column category_id uuid references public.categories(id) on delete set null;

create index idx_products_category on public.products(category_id);

-- 3b. Eliminar columna de texto libre.
--     La vista low_stock_products depende de esta columna; se elimina primero
--     y se recrea a continuación con el JOIN a categories.
drop view if exists public.low_stock_products;

alter table public.products drop column category;

-- =============================================================================
-- 4. Recrear vista low_stock_products
-- =============================================================================
-- Sustituye p.category (texto) por JOIN a categories.
-- Aprovecha para añadir filtro deleted_at is null (los soft-deleted no deben
-- aparecer en el reporte de bajo stock).
-- =============================================================================

create or replace view public.low_stock_products
with (security_invoker = true) as
select
  p.id,
  p.business_id,
  p.name,
  c.name  as category,
  p.stock,
  p.price,
  p.cost,
  p.provider
from public.products p
left join public.categories c on c.id = p.category_id
where p.stock <= 5
  and p.deleted_at is null;

revoke all on public.low_stock_products from public, anon;
grant select on public.low_stock_products to authenticated;
