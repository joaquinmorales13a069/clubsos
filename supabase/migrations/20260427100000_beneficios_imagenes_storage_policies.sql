-- Migration: beneficios_imagenes_storage_policies (Step 7.4)
-- Storage policies for the beneficios-imagenes bucket.
-- Bucket must be created manually in Supabase Dashboard before running this.

-- Public read (bucket is already public; this policy is explicit for clarity)
CREATE POLICY "beneficios_imagenes_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'beneficios-imagenes');

-- Only admin can upload images
CREATE POLICY "beneficios_imagenes_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'beneficios-imagenes' AND public.get_auth_rol() = 'admin');

-- Only admin can update images
CREATE POLICY "beneficios_imagenes_admin_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'beneficios-imagenes' AND public.get_auth_rol() = 'admin');

-- Only admin can delete images
CREATE POLICY "beneficios_imagenes_admin_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'beneficios-imagenes' AND public.get_auth_rol() = 'admin');
