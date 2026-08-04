-- Vora – Prerrequisitos de reportes
-- ---------------------------------------------------------------------------
-- Dos deudas que hay que saldar antes de agregar reportes nuevos:
--
-- 1. `clients.nit` nunca se creó. El cliente lo escribe desde el día uno
--    (services/client/client.service.ts) y el landing vende "Clientes con NIT",
--    pero la columna no está en el schema inicial. Sin esto, cualquier reporte
--    de clientes se cae.
--
-- 2. El schema inicial no crea NI UN índice. Las FK en Postgres no se indexan
--    solas, así que hoy todo reporte hace seq scan sobre `orders`. Con pocos
--    datos no se nota; con un año de ventas ahoga la instancia compartida del
--    plan gratuito. Se indexan solo los caminos que los reportes recorren de
--    verdad, no todas las columnas: cada índice ocupa espacio y encarece los
--    inserts del POS, que es la ruta caliente del producto.
-- ---------------------------------------------------------------------------

alter table clients add column if not exists nit text;

-- Todo reporte arranca por "las ventas de este negocio en este rango".
create index if not exists idx_orders_business_created
  on orders (business_id, created_at desc);

-- Reportes por cliente. Parcial: la mayoría de las ventas son anónimas y no
-- tiene sentido indexarlas.
create index if not exists idx_orders_client
  on orders (client_id)
  where client_id is not null;

-- El join que arma el detalle de cada venta y el top de productos.
create index if not exists idx_order_items_order   on order_items (order_id);
create index if not exists idx_order_items_product on order_items (product_id);

-- Planilla: se consulta siempre por empleado y periodo.
create index if not exists idx_salary_payments_employee_period
  on salary_payments (employee_id, period_year, period_month);

create index if not exists idx_employees_business on employees (business_id);
create index if not exists idx_clients_business   on clients (business_id);
