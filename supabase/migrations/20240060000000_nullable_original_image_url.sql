-- Make original_image_url nullable for multi-image capture mode
-- Multi-image pipeline uses capture_photo_urls (JSONB array) instead
ALTER TABLE rooms ALTER COLUMN original_image_url DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
