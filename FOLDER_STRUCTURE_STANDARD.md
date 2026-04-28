# Estándar de Estructura de Carpetas

Estándar para apps Angular (standalone components + lazy loading) extraído del proyecto Helluz. Pensado para ser portable a cualquier proyecto similar.

> **Filosofía**: separar por **audiencia** (quién entra) en `ui/`, por **dominio** en `services/` y `models/`, y por **rol del componente** dentro de cada página (`container` orquesta, `components` presentan).

---

## 1. Raíz del proyecto

```
proyecto/
├── public/                  # assets servidos tal cual (icons, manifest, robots.txt)
├── scripts/                 # scripts node ad-hoc (generadores, migraciones locales)
├── src/                     # ver §2
├── angular.json
├── firebase.json            # si aplica
├── ngsw-config.json         # si aplica (PWA)
├── tailwind.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.spec.json
├── eslint.config.js
├── vitest.config.ts
└── package.json
```

Reglas:
- Los `.png`/`.pen`/screenshots de trabajo viven en la raíz solo si son **artefactos de diseño temporales**; los assets de producto van en `public/`.
- Nunca poner código de la app fuera de `src/`.

---

## 2. `src/`

```
src/
├── app/                     # ver §3
├── shared/                  # transversal a toda la app, sin dependencia de feature
│   ├── components/
│   │   ├── card/card.component.ts
│   │   ├── page-header/page-header.component.ts
│   │   ├── confirm-dialog/
│   │   └── index.ts         # barrel export público
│   └── services/
│       └── confirm-dialog.service.ts
├── styles/
│   └── _tokens.scss         # CSS vars / design tokens (fuente de verdad)
├── environments/
├── index.html
├── main.ts
├── polyfills.ts
├── styles.scss              # entry global
├── material-theme.scss      # overrides de Material (--mat-sys-*)
└── test-setup.ts
```

Reglas:
- `src/shared/` = piezas reutilizables sin lógica de negocio (Card, PageHeader, ConfirmDialog).
- `src/styles/_tokens.scss` es la **única fuente de tokens**; tailwind y Material consumen desde ahí.

---

## 3. `src/app/`

```
src/app/
├── app.ts                   # root component
├── app.html
├── app.config.ts            # providers raíz
├── app.routes.ts            # router raíz: monta cada audiencia (ver §4)
├── guards/
│   └── auth-guard.ts        # exporta authGuard, adminGuard, instructorGuard, noAuthGuard
├── routes/
│   └── shared.routes.ts     # rutas comunes (404, etc.) inyectadas en cada audiencia
├── models/
│   ├── user.model.ts
│   ├── branch.model.ts
│   └── ...                  # un archivo por entidad: <entity>.model.ts
├── services/                # uno por dominio (ver §5)
├── utilities/               # helpers puros + sus .spec.ts
├── validators/              # validators de Reactive Forms + sus .spec.ts
└── ui/                      # ver §4
```

Reglas:
- **No** poner componentes sueltos en `src/app/`. Todo componente vive bajo `ui/<audiencia>/`.
- Cada modelo, una interfaz/tipo por archivo, nombrado `<entity>.model.ts`.

---

## 4. `src/app/ui/` — separación por audiencia

Cada **audiencia** (rol que entra a la app) es un módulo lazy con su propio layout:

```
ui/
├── public/                  # rutas sin auth (login, signup, landing)
├── admin/                   # backoffice
├── instructor/              # rol intermedio
├── dev/                     # herramientas internas (seeds, debug)
└── shared/                  # widgets compartidos entre audiencias (no entre páginas de la misma)
    ├── install-prompt/
    └── offline/
```

Anatomía de **cada audiencia**:

```
ui/<audiencia>/
├── routes.ts                # exporta <Audiencia>Routes: Routes
├── container/               # layout (sidebar + header + <router-outlet/>)
│   ├── component.ts
│   └── component.html
├── components/              # widgets propios del layout (header, sidebar)
│   ├── header/container/{component.ts,component.html,component.css}
│   └── sidebar/container/{component.ts,component.html,component.css}
└── pages/                   # ver §5
```

`app.routes.ts` solo monta los contenedores y delega:

```ts
{ path: '',          loadComponent: () => import('./ui/public/container/component'),     children: PublicRoutes },
{ path: 'admin',     canActivate: [adminGuard],      loadComponent: ..., children: AdminRoutes },
{ path: 'instructor',canActivate: [instructorGuard], loadComponent: ..., children: InstructorRoutes },
{ path: 'dev',                                        loadComponent: ..., children: DevRoutes },
```

---

## 5. Anatomía de una **página** (container + components)

Toda página dentro de `ui/<audiencia>/pages/<feature>/` sigue una de dos formas:

### Forma A — página simple (sin subcomponentes)

```
pages/home/
├── home.component.ts
└── home.component.html
```

### Forma B — página con CRUD/listado (la regla, no la excepción)

```
pages/<feature>/
├── container/               # smart component: inyecta servicios, maneja estado
│   ├── component.ts
│   └── component.html
└── components/              # dumb components: reciben @Input/emiten @Output
    ├── list/
    │   ├── list.ts
    │   ├── list.html
    │   └── list.css
    ├── detail/
    │   ├── detail.ts
    │   ├── detail.html
    │   └── detail.css
    └── form/
        ├── form.ts
        ├── form.html
        └── form.css
```

Reglas:
- **Container** = un único `component.ts` + `component.html`. Es el que importa servicios, abre dialogs y compone los dumb components.
- **Components** dumb = nombre = rol (`list`, `form`, `detail`, `card`, `row`…). Cada uno con su trío `.ts` / `.html` / `.css`.
- El container **no** tiene `.css`; si necesita estilos, usa Tailwind o un dumb component.
- Los dumb components **no** importan servicios de dominio; reciben datos por `input()` y emiten por `output()`.

---

## 6. `src/app/services/` — separación por dominio

```
services/
├── <dominio>/
│   ├── <dominio>.service.ts        # mutaciones y lógica
│   └── query.service.ts            # solo lecturas/observables (CQRS-light)
├── auth/auth.service.ts
├── common/query.service.ts         # helpers genéricos de querying
├── storage/storage.service.ts
└── sidebar/sidebar.service.ts
```

Reglas:
- Un dominio = una carpeta. Si crece, se parte en `<dominio>.service.ts` (escritura) + `query.service.ts` (lectura).
- Servicios transversales (`storage`, `sidebar`, `common`, `auth`) son carpetas hermanas, no se anidan.
- Servicios **de UI** (ConfirmDialog, InstallPrompt) viven junto al componente que los acompaña, no en `services/`.

---

## 7. Convenciones de nombres

| Tipo                         | Patrón                                           | Ejemplo                          |
| ---------------------------- | ------------------------------------------------ | -------------------------------- |
| Carpeta                      | `kebab-case`                                     | `mark-student-attendance/`       |
| Modelo                       | `<entity>.model.ts`                              | `student.model.ts`               |
| Servicio de dominio          | `<dominio>.service.ts`                           | `branch.service.ts`              |
| Servicio de queries          | `query.service.ts` dentro de la carpeta dominio  | `services/branch/query.service.ts` |
| Guard                        | `<nombre>-guard.ts` con exports nombrados        | `auth-guard.ts` → `authGuard`    |
| Validator                    | `<nombre>.validator.ts` + `.spec.ts`             | `time-range.validator.ts`        |
| Container de página          | `container/component.ts` + `component.html`      |                                  |
| Dumb component               | `<rol>.ts` + `<rol>.html` + `<rol>.css`          | `list.ts` / `form.html`          |
| Componente shared raíz       | `<nombre>.component.ts` (con sufijo)             | `card.component.ts`              |
| Rutas de audiencia           | `routes.ts` exportando `<Audiencia>Routes`       | `AdminRoutes`                    |

---

## 8. Estilos

- `src/styles/_tokens.scss` — variables CSS (`--color-*`, `--space-*`, etc.). **Fuente de verdad.**
- `src/material-theme.scss` — overrides de `--mat-sys-*` apuntando a los tokens.
- `src/styles.scss` — importa lo anterior + utilidades globales.
- `tailwind.config.js` — extiende los tokens vía `theme.extend` leyendo las CSS vars.
- Reglas globales de tipografía, links sin underline por defecto, etc., viven en `styles.scss`.

---

## 9. Reglas de oro

1. **Audiencia → Página → Container/Components.** Nunca saltarse el nivel.
2. **Container es el único smart.** Si un dumb necesita un servicio, eleva el estado al container.
3. **Un archivo, una responsabilidad.** Modelo, servicio, validator, guard: un archivo por concepto.
4. **Lazy por defecto.** Cada `pages/<feature>/container/component` se monta con `loadComponent`.
5. **`shared/` solo para lo verdaderamente reutilizable.** Si algo lo usan dos páginas de la misma audiencia, vive en `ui/<audiencia>/components/`. Si lo usan dos audiencias, sube a `ui/shared/`. Si es agnóstico de feature, sube a `src/shared/`.
6. **Tokens en SCSS, no en componentes.** Ningún color/espaciado hardcodeado.
7. **No barrel exports excepto en `src/shared/components/index.ts`.** Mantiene tree-shaking simple.

---

## 10. Plantilla rápida para nuevas features

Para agregar una feature `students` en `admin`:

```
ui/admin/pages/students/
├── container/
│   ├── component.ts         # inyecta StudentService + StudentQueryService
│   └── component.html       # <app-students-list/> <app-students-form/>
└── components/
    ├── list/{list.ts,list.html,list.css}
    ├── form/{form.ts,form.html,form.css}
    └── detail/{detail.ts,detail.html,detail.css}

models/student.model.ts
services/student/
├── student.service.ts
└── query.service.ts

ui/admin/routes.ts           # añadir { path: 'alumnos', loadComponent: () => import('./pages/students/container/component') }
```

Eso es todo. Si encaja en este molde, va donde toca; si no encaja, probablemente la feature está mal partida.
