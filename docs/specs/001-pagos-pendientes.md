# 001 — Pagos pendientes por mesa

## Contexto

Hoy toda venta en Vora se cobra al 100% en el momento de crear el pedido (`register_order`), con un único método de pago (efectivo, tarjeta o QR), y sin ningún concepto de mesa. Eso no representa cómo funciona un restaurante: una mesa suele seguir pidiendo antes de pagar, y cuando llega el momento de cobrar, el cliente a veces reparte el pago entre varios métodos (por ejemplo, una parte en efectivo y otra por QR).

Esta funcionalidad introduce tres piezas nuevas que trabajan juntas: un catálogo de **mesas** (o la alternativa "para llevar" cuando no hay mesa física), la posibilidad de dejar un pedido como **pago pendiente** al crearlo y seguir sumándole productos antes de cobrar, y **pago dividido** (varias líneas de método + monto) tanto para cobrar de inmediato como para saldar un pendiente — todo con el mismo soporte offline que ya tiene el resto del punto de venta.

El resultado esperado: un cajero puede tomar el primer pedido de la mesa 3 sin cobrar, seguir agregando lo que esa mesa va pidiendo, y recién al final cobrar repartiendo el pago como el cliente lo pida — sin que nada de esto rompa el arqueo de caja ni los reportes existentes.

## Usuarios

- **`caja`**: crea pedidos, los marca como pendientes (con mesa o "para llevar"), les agrega ítems mientras siguen pendientes, y salda los pendientes que él mismo creó.
- **`admin`**: además de lo anterior, administra el catálogo de mesas del negocio y puede saldar cualquier pedido pendiente del negocio (no solo los propios). También es quien ve el impacto de esta funcionalidad en reportes y arqueo.

## Historias de usuario

- Como cajero, quiero marcar un pedido como pendiente y asociarlo a una mesa, para seguir sumando lo que esa mesa pide antes de cobrar.
- Como cajero, quiero marcar un pedido como "para llevar" cuando no hay una mesa física involucrada, para diferenciarlo de una mesa real.
- Como cajero, quiero ver arriba de la pantalla de venta una tarjeta por cada pedido pendiente, con su monto, un resumen de lo pedido y su mesa (o "para llevar"), para no perder de vista lo que falta cobrar.
- Como cajero, quiero agregar más productos a un pedido pendiente ya creado, para reflejar lo que la mesa sigue pidiendo sin tener que abrir un pedido nuevo.
- Como cajero, quiero saldar un pedido pendiente repartiendo el monto entre varios métodos de pago, para reflejar cómo paga realmente el cliente.
- Como cajero, quiero que crear, ampliar y saldar pedidos pendientes funcione sin conexión, para no depender de la señal al tomar pedidos o cobrar.

## Requisitos funcionales (RF-x)

**Catálogo de mesas**

- **RF-1**: EL SISTEMA DEBERÁ mantener un catálogo de mesas por negocio, cada una con nombre/número y estado activa/inactiva, con RLS por `business_id` igual que el resto de catálogos (categorías, clientes).
- **RF-2**: EL SISTEMA DEBERÁ permitir a un usuario `admin` crear, editar y desactivar mesas del catálogo de su negocio.
- **RF-3**: SI un usuario `admin` intenta desactivar una mesa que tiene un pedido pendiente asociado, ENTONCES EL SISTEMA DEBERÁ rechazar la operación e indicar que debe saldarse o cancelarse el pendiente primero.

**Crear y ampliar un pedido pendiente**

- **RF-4**: EL SISTEMA DEBERÁ permitir que un usuario `caja` elija, al crear un pedido, como máximo una de las siguientes opciones: una mesa activa del catálogo, o "Para llevar"; ambas opcionales y mutuamente excluyentes.
- **RF-5**: CUANDO un usuario `caja` marca un pedido como pendiente al crearlo, EL SISTEMA DEBERÁ registrarlo sin exigir método de pago y sin que cuente en el arqueo de ningún turno de caja hasta que se salde.
- **RF-6**: SI la mesa elegida para un nuevo pedido pendiente ya tiene otro pedido pendiente abierto, ENTONCES EL SISTEMA DEBERÁ rechazar la creación y ofrecer agregar los ítems al pedido pendiente existente de esa mesa.
- **RF-7**: EL SISTEMA DEBERÁ mostrar, en una franja horizontal arriba de la pantalla de venta (`caja/pages/sales/new`), una tarjeta por cada pedido pendiente visible para el usuario actual — tenga mesa asociada o sea "Para llevar" —, con el monto total, un resumen breve de los ítems pedidos y la mesa o "Para llevar" asociada. Esta franja es el único punto de entrada a los pedidos pendientes.
- **RF-8**: CUANDO un usuario `caja` selecciona la tarjeta de un pedido pendiente, EL SISTEMA DEBERÁ permitirle agregar más productos a ese pedido, recalculando el total y descontando stock de los nuevos ítems de la misma forma que al crear un pedido nuevo.
- **RF-9**: MIENTRAS un pedido esté saldado o cancelado, EL SISTEMA DEBERÁ impedir agregarle nuevos ítems.

**Cobro (inmediato o al saldar un pendiente) y pago dividido**

- **RF-10**: EL SISTEMA DEBERÁ permitir cobrar un pedido, sea inmediato o al saldar uno pendiente, en modo "pago simple" (un único método: efectivo, tarjeta o QR, como hoy) o en modo "dividir pago" (varias líneas de método + monto).
- **RF-11**: SI la suma de las líneas de un pago dividido no es exactamente igual al total del pedido, ENTONCES EL SISTEMA DEBERÁ rechazar el cobro y señalar la diferencia.
- **RF-12**: CUANDO se registra una línea de pago (de un cobro simple, dividido, o al saldar un pendiente), EL SISTEMA DEBERÁ atribuirla al turno de caja abierto en ese momento, sin importar cuándo se creó el pedido.
- **RF-13**: EL SISTEMA DEBERÁ incluir en el efectivo esperado del cierre de turno (arqueo) la suma de todas las líneas de pago con método efectivo del turno, incluidas las que forman parte de un pago dividido.
- **RF-14**: EL SISTEMA DEBERÁ mostrar en el listado de pedidos, en la columna de método de pago, los métodos realmente usados separados por "/" (por ejemplo "Efectivo/QR"), derivados de las líneas de pago del pedido, en vez de una etiqueta genérica.

**Permisos para saldar**

- **RF-15**: SI un usuario `caja` que no creó un pedido pendiente, y no tiene rol `admin`, intenta saldarlo, ENTONCES EL SISTEMA DEBERÁ rechazar la operación con un error de permiso.
- **RF-16**: EL SISTEMA DEBERÁ permitir a un usuario `admin` saldar cualquier pedido pendiente del negocio, sin la restricción de RF-15.

**Suscripción, cancelación y offline**

- **RF-17**: MIENTRAS la suscripción del negocio esté en modo solo lectura, EL SISTEMA DEBERÁ impedir crear pedidos, agregar ítems a un pendiente, y saldar pendientes (reutilizando `SubscriptionStateService`, igual que el resto de operaciones de escritura).
- **RF-18**: CUANDO un usuario cancela un pedido pendiente, EL SISTEMA DEBERÁ restaurar el stock de sus ítems y liberar la mesa asociada, con el mismo criterio que hoy aplica `cancel_order`.
- **RF-19**: EL SISTEMA DEBERÁ permitir crear un pedido pendiente, agregarle ítems, y saldarlo sin conexión a internet, encolando la operación para sincronizarla al reconectar, igual que hoy ocurre con el registro de una venta vía `offline-queue.service.ts`.

**Reportes**

- **RF-20**: EL SISTEMA DEBERÁ excluir el monto de un pedido pendiente no saldado de los reportes de ingresos realizados (venta del día, ingreso mensual, resumen por cliente, top productos en $), hasta que sus líneas de pago se registren.

**Sincronización offline y conflictos**

- **RF-21**: EL SISTEMA DEBERÁ encolar cada operación offline (crear pedido, agregar ítems, saldar) como una entrada propia con su tipo, su identificador único y el `client_uuid` del pedido al que afecta, de modo que una operación pueda referenciar un pedido que todavía no existe en el servidor.
- **RF-22**: CUANDO se sincroniza la cola, EL SISTEMA DEBERÁ aplicar en orden estricto de creación las operaciones que afectan a un mismo pedido; SI una de ellas falla, ENTONCES DEBERÁ omitir las siguientes de ese mismo pedido, sin afectar la sincronización de operaciones de otros pedidos.
- **RF-23**: EL SISTEMA DEBERÁ aplicar cada operación de la cola una sola vez aunque se reintente, usando su identificador único como clave de idempotencia.
- **RF-24**: EL SISTEMA DEBERÁ tratar los agregados de ítems como acumulativos: si dos dispositivos agregan ítems al mismo pedido pendiente, el pedido resultante DEBERÁ contener los ítems de ambos, sin descartar ninguno, con el total recalculado como suma de sus ítems.
- **RF-25**: SI al saldar un pedido el total registrado en el servidor no coincide con el total que el dispositivo tenía al momento de cobrar, ENTONCES EL SISTEMA DEBERÁ rechazar el cobro, conservar la operación en la cola e informar al cajero de la diferencia para que la revise y cobre de nuevo.
- **RF-26**: SI llega una operación de agregar ítems a un pedido ya saldado, ENTONCES EL SISTEMA DEBERÁ rechazarla e informar al cajero que esos ítems deben cobrarse en un pedido aparte.
- **RF-27**: CUANDO una operación de cobro se registra sin conexión, EL SISTEMA DEBERÁ guardar junto a ella el turno de caja abierto en el dispositivo en ese momento, y atribuirle las líneas de pago a ese turno al sincronizar, no al que esté abierto al momento de la sincronización.
- **RF-28**: SI un pedido pendiente no está disponible en el dispositivo (por haberse creado en otro y no haberse sincronizado todavía), ENTONCES EL SISTEMA DEBERÁ no ofrecer las acciones de agregar ítems ni saldar sobre ese pedido, en vez de encolarlas a ciegas.
- **RF-29**: EL SISTEMA DEBERÁ mantener el catálogo de mesas en caché local, de modo que el selector de mesa siga siendo utilizable sin conexión con la información sincronizada por última vez.

## Casos límite

- Cerrar un turno con pedidos pendientes abiertos: no bloquea el cierre; el pendiente simplemente no aporta al arqueo de ese turno (RF-5, RF-12).
- Suma de líneas de un pago dividido que no cuadra con el total, por redondeo u otro motivo (RF-11).
- Intentar desactivar una mesa con un pendiente abierto (RF-3).
- Agregar un ítem sin stock disponible a un pedido pendiente.
- Suscripción vencida al intentar agregar ítems o saldar un pendiente (RF-17).
- Cancelar un pendiente cuyos ítems ya están "en preparación" en cocina (a definir junto con la spec 002 de cocina).
- Dos dispositivos agregando ítems al mismo pedido pendiente casi al mismo tiempo: no es un conflicto, los ítems se acumulan (RF-24).
- Un dispositivo salda un pedido mientras otro le agrega ítems que el primero nunca vio: el cobro se rechaza por total desactualizado y se rehace (RF-25).
- Un agregado de ítems que llega a sincronizar después de que el pedido ya fue saldado (RF-26).
- Una operación offline que falla al sincronizar y deja operaciones posteriores del mismo pedido en espera (RF-22).
- Cobro registrado offline bajo un turno de caja que ya está cerrado al momento de sincronizar: la línea de pago se imputa igual a ese turno (RF-27), con la consecuencia conocida de que no apareció en el arqueo que ya se cerró — es el mismo comportamiento que hoy tienen las ventas offline, no algo que introduzca esta funcionalidad.
- Saldar o agregar ítems a un pendiente que el dispositivo no conoce, por haberse creado en otro y no haber sincronizado: la acción directamente no se ofrece (RF-28).
- Mesas del catálogo que se agregan o desactivan mientras un dispositivo está offline: el selector muestra el catálogo cacheado hasta la próxima sincronización (RF-29).
- Un pedido pendiente cuya mesa fue desactivada entre medio: debe seguir siendo saldable aunque su mesa ya no figure en el selector.
- Un pedido marcado "Para llevar" y pendiente a la vez, sin mesa asociada: debe comportarse igual que uno con mesa, salvo por la etiqueta mostrada (RF-4, RF-7).
- Un pedido pendiente creado por un cajero cuya cuenta luego se desactiva: sigue pudiendo saldarlo un `admin` (RF-16).

## Fuera de alcance

- Reporte dedicado de cuentas por cobrar o antigüedad de pendientes.
- Abonos parciales escalonados en el tiempo — el saldado es todo-o-nada en una sola operación (que sí puede dividirse entre métodos de pago, ver RF-10).
- Dividir la cuenta de una misma mesa entre distintos clientes.
- Rol de cocina y órdenes a cocina — es la próxima spec (**002**), no este documento.
- Notificaciones por correo o WhatsApp (descartado en decisiones previas del proyecto).
- **Cualquier representación gráfica de las mesas**: ni grilla de ocupación ni plano espacial del salón (posiciones x/y, formas y tamaños, editor de arrastre, zonas o ambientes múltiples). La mesa es un dato del pedido que se elige en un selector, y el acceso a los pendientes es la franja de tarjetas (RF-7). Si más adelante se quiere una vista de ocupación, se construye sobre lo mismo — la mesa y su pendiente abierto ya están modelados — sin romper nada de lo especificado acá.
- Estados de mesa más allá de "libre / con pendiente abierto" (reservada, en limpieza, unida a otra mesa).

## Criterios de finalización

- [x] Migraciones **escritas** (`20260908000000_tables_and_order_payments.sql`, `…0001_pending_order_rpcs.sql`, `…0002_reports_from_payments.sql`): tabla de mesas, líneas de pago, `applied_operations` y campos nuevos en `orders`, con backfill de las ventas históricas a `order_payments`.
- [ ] Migraciones **aplicadas** a mano en el SQL Editor de Supabase, en orden (flujo actual del proyecto).
- [x] Vistas de reportes y de arqueo (`cash_session_summary`, `close_cash_session`, `income_daily`, `monthly_income`, `sales_by_payment_daily`, `revenue_by_category`, `client_sales_summary`, `top_products`, `open_sessions_sales`) migradas para sumar desde las líneas de pago en vez de `orders.total_amount`/`payment_method`.
- [x] RPCs nuevos (`add_items_to_order`, `settle_order`) y `register_order` extendido con mesa/"para llevar"/pendiente/pago dividido.
- [x] Cola offline extendida para encolar "agregar ítems" y "saldar", no solo el alta de un pedido, según el diseño de más abajo (unión discriminada, referencia por `client_uuid`, cadenas FIFO por pedido, tabla `applied_operations`).
- [x] UI: franja de tarjetas de pendientes como entrada a las cuentas abiertas, modal de saldar con líneas de pago, selector de mesa/"para llevar", CRUD de mesas en admin.
- [x] Caché local del catálogo de mesas, siguiendo el patrón de `product-cache.service.ts`.
- [x] Tests (Vitest) para: validación de suma de un pago dividido, regla "una mesa, un pendiente a la vez", restricción de quién puede saldar (creador o admin).
- [ ] Probado a mano en el navegador el flujo completo: crear pendiente con mesa → agregar ítems desde su tarjeta → saldar con pago dividido → cerrar turno → verificar reporte y arqueo, incluyendo un ciclo offline → online.

## Diseño de la cola offline

Resuelve RF-21 a RF-27. Cuatro decisiones, apoyadas en lo que ya existe:

**1. Unión discriminada en la cola.** `PendingOrder` (en `src/app/services/offline/offline-queue.service.ts`) pasa a `PendingOperation` con un campo `kind: 'create' | 'add_items' | 'settle'` y su payload correspondiente. `STORAGE_KEY` sube a `saas_offline_queue_v3`, descartando la cola anterior en la migración — mismo criterio que ya se usó al pasar de v1 a v2.

**2. El pedido se referencia por `client_uuid`, no por el `id` del servidor.** Hoy el `id` del ítem de la cola ya viaja como `client_uuid` del pedido (`sync.service.ts:60`), y existe el índice único `(business_id, client_uuid)` creado en `20260802000001_register_order_idempotency.sql`. Eso le da a un pedido creado offline una identidad estable *antes* de existir en el servidor, así que "agregar ítems" y "saldar" pueden referenciarlo sin esperar a que se sincronice su creación. Los RPCs nuevos resuelven `client_uuid → orders.id` con ese índice, ya acotado por negocio.

**3. Cadenas FIFO por pedido con bloqueo de cabecera.** Hoy `syncNow()` recorre la cola linealmente y continúa ante un error, lo cual es correcto mientras las ventas son independientes entre sí. Con operaciones dependientes, se agrupan las entradas por `client_uuid`: dentro de cada grupo se respeta el orden de creación y, ante la primera falla, se saltean las restantes **de ese grupo**; los demás pedidos siguen sincronizando con normalidad.

**4. Idempotencia generalizada.** Tabla nueva `applied_operations (business_id, operation_uuid primary key, order_id, kind, applied_at)`. Cada RPC nuevo intenta insertar su `operation_uuid` como primer paso y, ante `unique_violation`, devuelve sin re-aplicar. `register_order` no se toca: su idempotencia vía `orders.client_uuid` ya está desplegada y funciona.

**Conflictos.** No hay resolución automática de conflictos de dinero. Agregar ítems es acumulativo, no una escritura que sobrescribe: dos dispositivos sumando a la misma mesa no están en conflicto y ambos agregados entran (RF-24) — una estrategia tipo "el último gana" perdería ítems ya consumidos. El único conflicto real es saldar contra un pedido que creció sin que el dispositivo lo viera, y se maneja con bloqueo optimista: la operación de saldado viaja con el total que el dispositivo tenía al cobrar, y si el servidor tiene otro, rechaza y avisa (RF-25) en vez de aceptar un cobro incompleto en silencio.

## Dudas abiertas

- Qué hacer si, al sincronizar, el stock ya no alcanza para los ítems agregados offline: hoy `register_order` levanta una excepción y la venta queda trabada en la cola. Es comportamiento preexistente, pero con pedidos que se amplían a lo largo de una noche la ventana de exposición es mayor.
- Si conviene avisar al `admin` cuando una línea de pago se imputa a un turno ya cerrado (ver casos límite), o si alcanza con que quede registrada.
