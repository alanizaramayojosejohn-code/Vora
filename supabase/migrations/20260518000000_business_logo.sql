-- Add logo_url to businesses table
alter table businesses add column if not exists logo_url text;

-- Create storage bucket for business logos (public read, super_admin write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  true,
  2097152,  -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Only super_admin can upload/replace/delete logos
create policy "super_admin manage business logos"
  on storage.objects for all
  using (
    bucket_id = 'business-logos'
    and exists (
      select 1 from profiles where id = auth.uid() and role = 'super_admin'
    )
  )
  with check (
    bucket_id = 'business-logos'
    and exists (
      select 1 from profiles where id = auth.uid() and role = 'super_admin'
    )
  );
