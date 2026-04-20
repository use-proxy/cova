-- Phase 0 RLS hardening: room-photos bucket
-- Audit: docs/audit/supabase.md — No migration found for room-photos bucket policy.
-- Used by app/api/rooms/capture/route.ts via admin client. Pattern matches room-uploads.

CREATE POLICY "room_photos_own" ON storage.objects FOR ALL
USING (bucket_id = 'room-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
