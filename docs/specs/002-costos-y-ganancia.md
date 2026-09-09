# 002 — Costo y ganancia en los reportes

## Contexto

Hoy todos los reportes de Vora responden una sola pregunta: cuánto entró. Ingreso del día, ingreso del mes, ingreso por categoría, top de productos por cantidad, detalle de ventas — todos suman lo cobrado y ninguno resta lo que costó producirlo. El dueño ve que vendió Bs 4.000 en el mes, pero no sabe si ganó Bs 1.500 o Bs 200, ni qué producto de los que más vende le deja menos margen.

El dato para calcularlo ya existe a medias: cada producto tiene un campo **Costo** que el admin carga en el formulario, y cada línea de venta guarda el **precio** al que se vendió. Lo que falta es unirlos. El problema es que el costo vive solo en el catálogo y cambia con el tiempo: si en marzo sube el precio del café, calcular la ganancia de enero con el costo de marzo daría un número falso y, peor, un número que cambia solo — el reporte de un mes cerrado dejaría de ser auditable.

Esta funcionalidad hace dos cosas. Primero, **congela el costo dentro de cada venta** en el momento de venderla, igual que ya se congela el precio, de modo que la ganancia de un período pasado nunca vuelva a moverse. Segundo, **agrega costo, ganancia y margen** a los reportes que ya existen: el resumen del día, los ingresos diario y mensual, el top de productos, los ingresos por categoría, el detalle de ventas con sus exportaciones, y el panel de inicio del admin.

La ganancia que se reporta es **bruta** — venta menos costo de lo vendido — con una sola excepción: el resumen mensual, donde además se restan los sueldos pagados de ese mes para mostrar una utilidad después de sueldos. Es el único egreso que se cruza, porque es el único que el sistema ya conoce con período propio y monto cerrado.

## Usuarios

- **`admin`**: es quien ve costo, ganancia y margen. Es también quien mantiene el campo Costo de cada producto, de lo que depende que el número sirva.
- **`caja`**: no ve costos ni ganancia en ninguna pantalla. Sus reportes (ventas del día) siguen mostrando ingreso.
- **`super_admin`**: sin cambios; no es destinatario de esta funcionalidad.

## Historias de usuario

- Como dueño, quiero ver la ganancia y no solo el ingreso del día y del mes, para saber si el negocio realmente está dejando plata.
- Como dueño, quiero ver el margen de cada producto y de cada categoría, para dejar de empujar lo que vende mucho y deja poco.
- Como dueño, quiero que la ganancia de un mes ya cerrado no cambie cuando actualizo el costo de un producto, para poder comparar meses entre sí.
- Como dueño, quiero ver la utilidad del mes después de los sueldos, para saber qué me queda de verdad.
- Como dueño, quiero que el reporte me avise cuando vendí productos que no tienen costo cargado, para no creerme una ganancia inflada.
- Como dueño, quiero exportar el detalle de ventas con su costo y su ganancia, para trabajarlo con mi contador.

## Requisitos funcionales (RF-x)

**Congelar el costo en la venta**

- **RF-1**: EL SISTEMA DEBERÁ registrar, en cada línea de un pedido, el costo unitario que el producto tenía en el catálogo al momento de agregar esa línea.
- **RF-2**: EL SISTEMA DEBERÁ tomar ese costo del catálogo del lado del servidor, ignorando cualquier costo que llegue desde el cliente.
- **RF-3**: MIENTRAS una línea de venta exista, EL SISTEMA DEBERÁ conservar su costo unitario sin alterarlo, aunque después cambie el costo del producto o el producto se elimine.
- **RF-4**: CUANDO se agregan ítems a un pedido pendiente, EL SISTEMA DEBERÁ congelar su costo con el mismo criterio que al crear el pedido.
- **RF-5**: EL SISTEMA DEBERÁ completar el costo de las líneas de venta ya existentes al aplicar la migración, usando el costo actual de cada producto, y cero para los productos eliminados.

**Qué es la ganancia**

- **RF-6**: EL SISTEMA DEBERÁ calcular la ganancia bruta de una venta como su ingreso menos la suma de (costo unitario × cantidad) de sus líneas.
- **RF-7**: EL SISTEMA DEBERÁ imputar el costo y la ganancia al mismo día que el ingreso, que es el del cobro: un pedido abierto el lunes y cobrado el martes aporta ingreso, costo y ganancia enteramente al martes.
- **RF-8**: EL SISTEMA DEBERÁ excluir del cálculo los pedidos cancelados y los pendientes todavía no cobrados, con el mismo criterio que ya aplica al ingreso (spec 001, RF-20).
- **RF-9**: EL SISTEMA DEBERÁ mostrar, junto a toda ganancia, su margen como porcentaje del ingreso del mismo período o ítem.
- **RF-10**: SI el ingreso de un período o de un ítem es cero, ENTONCES EL SISTEMA DEBERÁ omitir el margen en vez de mostrar cero o un error de división.

**Dónde se muestra**

- **RF-11**: EL SISTEMA DEBERÁ mostrar ingreso, costo, ganancia y margen en el resumen de ventas del día (pestaña "Hoy"), para el rango elegido.
- **RF-12**: EL SISTEMA DEBERÁ mostrar el costo y la ganancia de cada día en el reporte de ingreso diario.
- **RF-13**: EL SISTEMA DEBERÁ mostrar el costo y la ganancia bruta de cada mes en el reporte de ingreso mensual.
- **RF-14**: EL SISTEMA DEBERÁ mostrar, en el reporte mensual, los sueldos del mes y la utilidad después de sueldos (ganancia bruta menos sueldos).
- **RF-15**: EL SISTEMA DEBERÁ tomar como sueldos de un mes los pagos de sueldo cuyo **período** es ese mes, sin importar en qué fecha se pagaron.
- **RF-16**: SI el negocio no tiene sueldos registrados para un mes, ENTONCES EL SISTEMA DEBERÁ mostrar solo la ganancia bruta, sin la línea de utilidad después de sueldos.
- **RF-17**: EL SISTEMA DEBERÁ mostrar el costo, la ganancia y el margen de cada producto en el top de productos, y permitir ordenarlo por ganancia además de por cantidad.
- **RF-18**: EL SISTEMA DEBERÁ mostrar el costo y la ganancia de cada categoría en el reporte de ingresos por categoría.
- **RF-19**: EL SISTEMA DEBERÁ mostrar el costo y la ganancia de cada venta en el detalle de ventas, y sus totales en el resumen de ese reporte.
- **RF-20**: EL SISTEMA DEBERÁ incluir las columnas de costo y ganancia, y sus totales, en las exportaciones a Excel y PDF del detalle de ventas.
- **RF-21**: EL SISTEMA DEBERÁ mostrar la ganancia bruta del mes en el panel de inicio del admin, junto al ingreso del mes.

**Productos sin costo cargado**

- **RF-22**: EL SISTEMA DEBERÁ contar, en cada reporte con ganancia, las ventas del período cuyas líneas tienen costo cero.
- **RF-23**: SI el período incluye ventas con costo cero, ENTONCES EL SISTEMA DEBERÁ mostrar un aviso indicando cuántos productos distintos están en esa situación y que la ganancia está sobrestimada, con acceso directo a Productos.
- **RF-24**: EL SISTEMA DEBERÁ calcular y mostrar la ganancia igual aunque haya productos sin costo: el aviso informa, no bloquea.

**Permisos**

- **RF-25**: EL SISTEMA DEBERÁ mostrar costo, ganancia y margen únicamente a los roles `admin` y `super_admin`.
- **RF-26**: EL SISTEMA DEBERÁ incluir la ganancia en los dos planes (Caja y Negocio), dentro de los reportes que cada plan ya tiene: no se agrega ningún corte de plan nuevo, ni se levanta ninguno existente.

## Casos límite

- Producto eliminado después de haberse vendido: su costo sigue congelado en las líneas, así que la ganancia histórica se mantiene.
- Producto cuyo costo es mayor a su precio: la ganancia es negativa y se muestra como tal, en rojo, sin recortarla a cero — es justamente el caso que hay que ver.
- Venta con ingreso cero (producto en promoción a Bs 0) y costo mayor que cero: ganancia negativa legítima, sin margen (RF-10).
- Negocio que nunca cargó ningún costo: toda la ganancia iguala al ingreso y el aviso de RF-23 queda visible de forma permanente hasta que se carguen.
- Ventas anteriores a esta funcionalidad: su costo se completa con el costo actual del producto (RF-5), así que su ganancia es una aproximación y no un dato histórico exacto. Las posteriores sí lo son.
- Un costo cargado hoy no cambia la ganancia de las ventas de ayer: es exactamente lo que busca el congelado, aunque a primera vista parezca que "no se actualizó".
- Pendiente abierto en un mes y cobrado en el siguiente: ingreso, costo y ganancia caen enteros en el mes del cobro (RF-7); el mes en que se consumió no muestra nada de esa cuenta.
- Sueldo pagado por adelantado o con atraso: se imputa al mes de su período, no al de la fecha de pago (RF-15).
- Mes con sueldos cargados y sin ventas: la utilidad después de sueldos es negativa y se muestra.
- Un plan Caja no tiene módulo de personal, así que nunca tendrá sueldos que restar: ve solo la ganancia bruta (RF-16).
- Venta cancelada después de cobrada: sale del ingreso y también del costo y de la ganancia, sin dejar el costo colgado.

## Fuera de alcance

- **Recetas o insumos por producto** (un latte = X leche + Y café, con unidades de medida y mermas). El costo de esta spec es el campo Costo del producto, tal como se carga hoy. Una spec futura puede reemplazar la fuente del costo sin tocar nada de lo especificado acá: las líneas de venta seguirán congelando el costo que el catálogo diga en ese momento.
- **Actualizar el costo del producto automáticamente desde las compras** (último costo o promedio ponderado sobre `acquisition_items`). Es una funcionalidad aparte y compatible: cambia cómo se mantiene `products.cost`, no cómo se reporta.
- **Utilidad neta completa**: restar compras de stock, alquiler, servicios, impuestos u otros gastos operativos. El único egreso que se cruza es el de sueldos (RF-14).
- Costos indirectos, mermas, desperdicio y prorrateos.
- Pestaña o pantalla nueva de "Rentabilidad": la ganancia se agrega a los reportes que ya existen.
- Impuestos (IVA) y multi-moneda.
- **Ocultarle `products.cost` al rol `caja` a nivel de base de datos**: la RLS de `products` lo expone hoy porque el punto de venta necesita esa tabla, y restringirla rompería la venta offline. RF-25 corta en la interfaz, que es donde el dato se muestra. Es el mismo límite conocido que ya documenta la migración de features por plan.

## Criterios de finalización

- [x] Migración con `order_items.unit_cost`, su backfill desde el costo actual del producto, y los RPC de venta (`register_order`, `add_items_to_order`) congelando el costo del lado del servidor. **Escrita, falta aplicar** en Supabase (`20260909000000_order_item_costs.sql` → `…000001_report_profit.sql`, en ese orden, después de las tres de la spec 001).
- [x] Vistas y funciones de reporte extendidas con costo, ganancia y conteo de líneas sin costo: ingreso diario, ingreso mensual, ingresos por categoría, top de productos (+ orden por ganancia), y el resumen del día (`zero_cost_product_count`, `settled_order_profit`).
- [x] Sueldos del mes cruzados desde `payroll_monthly` por período, con la utilidad después de sueldos.
- [x] UI: resumen del día, ingreso diario, ingreso mensual, top de productos, categorías (home), detalle de ventas y panel de inicio del admin.
- [x] Exportaciones a Excel y PDF con costo, ganancia y sus totales.
- [x] Aviso de productos vendidos sin costo cargado (`ZeroCostNoticeComponent`), con acceso a Productos.
- [x] Tests (Vitest) para: cálculo de ganancia y margen (incluyendo margen omitido con ingreso cero y ganancia negativa), `orderCost`/`orderProfit`, y utilidad después de sueldos.
- [ ] Probado a mano en el navegador: cargar costo a un producto → venderlo → verificar ganancia del día y del mes → cambiar el costo del producto → confirmar que la ganancia de esa venta **no** cambió. (Pendiente: requiere las migraciones aplicadas.)

## Diseño del costo congelado

Resuelve RF-1 a RF-5. Tres decisiones:

**1. El costo se guarda en la línea, no se calcula al consultar.** `order_items` gana una columna `unit_cost`, hermana de `unit_price`. Todo reporte de ganancia sale de multiplicar y sumar columnas de esa tabla, sin joins a `products`. Además de hacer el número inmutable, evita que los reportes dependan de un producto que puede haberse eliminado.

**2. Lo escribe el servidor, nunca el cliente.** Los RPC que insertan líneas (`register_order` y `add_items_to_order`, de la spec 001) leen `products.cost` dentro de la misma consulta con la que ya validan el producto y el stock, y lo insertan. El cliente no manda costo y no puede: aceptarlo dejaría a cualquiera con acceso al POS declarar el margen que quiera. Es la misma razón por la que el precio de venta sí viaja desde el cliente pero el stock se descuenta contra la base.

**3. El histórico se rellena con el costo de hoy.** El backfill escribe `products.cost` en las líneas existentes. No es el costo real que tuvieron esas ventas —esa información no existe en ningún lado— pero es la mejor aproximación disponible y deja el sistema en un estado uniforme desde el día uno. De ahí en adelante, el dato es exacto.

**Atribución temporal.** El costo y la ganancia viajan pegados al ingreso: se imputan al día del cobro, no al de creación del pedido (RF-7). Es la misma regla que la spec 001 fijó para el ingreso al mover el dinero a `order_payments`, y mantenerlas juntas es lo que evita que un mes muestre ingreso sin su costo o al revés.

## Dudas abiertas

- El KPI del panel de inicio muestra ganancia **bruta** del mes; la utilidad después de sueldos vive solo en el reporte mensual. Si en el uso real el dueño mira el home y no el reporte, convendría subir la neta al home.
- Si conviene un aviso también en la pantalla de Productos (no solo en los reportes) marcando los que no tienen costo cargado, que es donde se arregla el problema.
- Si a los períodos anteriores a la migración conviene marcarlos visualmente como "ganancia aproximada", o si alcanza con el aviso de costo cero.
