-- Vora – Imágenes de producto
-- ---------------------------------------------------------------------------
-- Una imagen por producto, para que el cajero reconozca el ítem de un vistazo
-- en la grilla del POS. No es galería: una segunda imagen multiplica el egress
-- sin agregar nada al caso de uso.
--
-- Defensa en profundidad contra subidas maliciosas. El cliente ya valida y
-- re-codifica (ver image-guard.ts / image-compressor.ts), pero el cliente es
-- código que el atacante controla: cualquiera puede llamar al endpoint de
-- storage con el token de su sesión y saltarse el formulario entero. Por eso
-- las mismas reglas se repiten acá, donde sí son inevitables:
--
--   1. allowed_mime_types = image/webp únicamente. Cierra la puerta a
--      image/svg+xml — un SVG es un documento XML que ejecuta <script> cuando
--      el navegador lo abre en su propio origen — y a text/html, que sería
--      XSS directo servido desde el dominio del bucket.
--   2. file_size_limit de 512 KB. Una miniatura de 600px comprimida pesa
--      ~40 KB; 512 KB deja margen de sobra y frena el llenado del bucket.
--   3. La ruta tiene que empezar con el business_id de quien sube, así que
--      nadie puede pisar la imagen de otro negocio.
--   4. La extensión tiene que ser .webp, para que el nombre del objeto no
--      pueda terminar en .html y ser servido como tal.
-- ---------------------------------------------------------------------------

alter table products add column if not exists image_url text;

-- El bucket es público de lectura: el POS pinta las imágenes con <img src>,
-- sin token. Idempotente y corrector: si el bucket ya existía con otros
-- límites, esta migración los deja en el estado esperado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 524288, array['image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escritura: solo el admin del negocio dueño de la carpeta.
--
-- El USING gobierna update y delete; el WITH CHECK gobierna insert y el estado
-- final del update. La condición de suscripción va SOLO en el WITH CHECK: un
-- negocio vencido no sube imágenes nuevas, pero sigue viendo las que tiene.
-- Es la misma regla que assert_subscription_writable() aplica a las tablas.
drop policy if exists "admins manage own product images" on storage.objects;
create policy "admins manage own product images"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = current_user_business_id()::text
    and current_user_role() in ('admin', 'super_admin')
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = current_user_business_id()::text
    and current_user_role() in ('admin', 'super_admin')
    and lower(name) like '%.webp'
    and not subscription_blocked(current_user_business_id())
  );

-- El super_admin no tiene business_id, así que la policy de arriba nunca le
-- aplica (null = texto da null, no true). Se le da acceso propio para poder
-- limpiar imágenes desde soporte, igual que en business-logos.
drop policy if exists "super_admin manage product images" on storage.objects;
create policy "super_admin manage product images"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'product-images' and is_super_admin())
  with check (bucket_id = 'product-images' and is_super_admin());
