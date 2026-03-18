-- Storage RLS for all 6 buckets.
-- Buckets must be created in Supabase Dashboard (Storage) before these policies apply.

-- room-uploads: authenticated users read and write their own files only (path: {user_id}/...)
CREATE POLICY "uploads_own" ON storage.objects FOR ALL
USING (bucket_id = 'room-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- renders: authenticated users read their own renders only; write via service_role only
CREATE POLICY "renders_read_own" ON storage.objects FOR SELECT
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

-- product-images: public read, service role write only (no policy for INSERT/UPDATE/DELETE)
CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- swipe-cards: public read, service role write only
CREATE POLICY "swipe_cards_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'swipe-cards');

-- 3d-models: public read, service role write only
CREATE POLICY "models_public_read" ON storage.objects FOR SELECT
USING (bucket_id = '3d-models');

-- scene-snapshots: authenticated users read and write their own snapshots only
CREATE POLICY "snapshots_own" ON storage.objects FOR ALL
USING (bucket_id = 'scene-snapshots' AND auth.uid()::text = (storage.foldername(name))[1]);
