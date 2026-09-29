-- KARVATECH · 0003 · Storage
--
-- Bucket público para las imágenes de los proyectos. Reemplaza el directorio
-- backend/static/uploads/ que servía FastAPI.
--
-- El bucket es de lectura pública a propósito: las tarjetas del portafolio y las
-- miniaturas del panel necesitan cargar la imagen sin sesión. Lo que no se
-- permite es escribir sin ser admin.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'project-images',
    'project-images',
    true,
    4194304,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Políticas sobre storage.objects
--
-- Además de las políticas de storage, el bucket ya restringe por MIME y por
-- tamaño (4 MB, los mismos límites que tenía el endpoint /api/admin/upload).
-- La validación por número mágico que hacía el backend no se puede replicar en
-- una política SQL, así que el bucket confía en el MIME declarado: por eso el
-- bucket es solo de imágenes y no admite SVG ni HTML.
-- ---------------------------------------------------------------------------

drop policy if exists "project-images: lectura pública" on storage.objects;
create policy "project-images: lectura pública"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'project-images');

drop policy if exists "project-images: subida solo admin" on storage.objects;
create policy "project-images: subida solo admin"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'project-images' and public.is_admin());

drop policy if exists "project-images: edición solo admin" on storage.objects;
create policy "project-images: edición solo admin"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'project-images' and public.is_admin())
    with check (bucket_id = 'project-images' and public.is_admin());

drop policy if exists "project-images: borrado solo admin" on storage.objects;
create policy "project-images: borrado solo admin"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'project-images' and public.is_admin());

commit;
