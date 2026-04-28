# SaasGym

SaaS multi-tenant para negocios pequeños: cada negocio opera de forma aislada (RLS por `business_id`). Soporta dos verticals:

- **POS** — productos, ventas, clientes opcionales.
- **Gimnasio** — todo lo del POS + planes de membresía + asistencia + servicios.

El tipo se elige al crear el negocio (`businesses.type IN ('pos', 'gym')`) y la UI se ramifica automáticamente.

## Stack

- **Frontend**: Angular 21 (standalone components, signals, lazy loading) + Tailwind v4
- **Backend**: Supabase (PostgreSQL + Auth + RLS + RPC)
- **Estructura**: ver `FOLDER_STRUCTURE_STANDARD.md`

## Roles y audiencias

| Rol | Audiencia | Qué hace |
|---|---|---|
| `super_admin` | `/saas` | Crea negocios (pos o gym) y configura sus servicios. No pertenece a un negocio. |
| `admin` | `/admin` (+ `/caja`) | Gestiona su negocio: clientes, productos, planes (gym), usuarios, reports. |
| `caja` | `/caja` | Registra ventas y, en gyms, asistencia. |

> `admin` también accede a `/caja` (puede operar la caja de su propio negocio). `super_admin` NO entra a `/admin` ni `/caja`.

## Auth

Invite-only. No hay self-signup. El super_admin da de alta al admin de cada negocio (vía RPC `create_business_with_admin`); el admin da de alta a sus cajas (vía RPC `create_user_for_business`). Si una sesión queda sin profile (ej: alguien entra con Google sin invitación), `AuthService` cierra la sesión automáticamente.

Soporta login por email/password y por Google OAuth.

## Funcionalidades por audiencia

**`/saas`** (super_admin)
- Listar y crear negocios (con admin inicial + servicios opcionales para gyms).

**`/admin`** (admin del negocio)
- Clientes (CRUD)
- Productos (CRUD con stock/precio/costo)
- Planes de membresía *(solo gym, con servicios incluidos M:N)*
- Usuarios del negocio (alta de cajas/admins)
- Reports: ingresos mensuales, ingresos diarios, productos con stock bajo, *membresías vigentes (solo gym)*

**`/caja`** (caja, también admin)
- Ventas: producto (con descuento de stock) y *membresía (solo gym)*
- *Asistencia (solo gym)*: registra ingreso del socio y descuenta sesión si el plan es por sesiones

La UI esconde los flujos gym-only para tenants `pos`; las RPCs gym-only validan el tipo del negocio del caller antes de operar.

## Estructura del proyecto

```
src/app/
├── guards/                # auth, noAuth, super_admin, admin, caja
├── models/                # tipos TS en snake_case (matchea Supabase)
├── services/              # uno por dominio: <dominio>/{<dominio>.service.ts, query.service.ts}
└── ui/
    ├── public/            # /login
    ├── saas/              # super_admin
    ├── admin/             # admin del negocio
    └── caja/              # caja (+ admin via cajaGuard)
```

Cada página sigue Forma B: `container/component.ts` (smart) + `components/{list,form,...}` (dumb).

## Backend (Supabase)

Migraciones en `supabase/migrations/`:

- `20260427000000_initial_schema.sql` — 10 tablas + RLS + helpers (incluye `current_user_business_type()`)
- `20260427010000_functions.sql` — 5 RPCs: `create_business_with_admin`, `create_user_for_business`, `register_attendance` (gym-only), `register_sale_product`, `register_sale_membership` (gym-only)
- `20260427020000_views.sql` — `active_memberships`, `low_stock_products`, `monthly_income` (todas con `security_invoker`)

Seed inicial del super_admin: `supabase/seeds/super_admin.sql`.

## Desarrollo local

```bash
npm install
ng serve         # http://localhost:4200
ng build
```

Variables de entorno en `src/environments/environment{,.development}.ts` (URL + anon key de Supabase).

## Bootstrap de usuarios

El esquema asume que el `auth.user` ya existe antes de asignarle un profile. Para crear un nuevo admin/caja:

1. Crear el usuario en Supabase Dashboard → Authentication → Users.
2. Copiar el UUID generado.
3. Pegarlo en el form correspondiente (super_admin → "Nuevo negocio"; admin → "Nuevo usuario").

> Mejorable a futuro con una Edge Function que llame a `auth.admin.createUser()` validando JWT del caller.
