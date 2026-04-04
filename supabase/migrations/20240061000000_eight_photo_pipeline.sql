-- Migration: 8-photo pipeline support
-- capture_photo_urls now accepts up to 8 photos (was 6)
-- Plus runs for all users, engagement tracking added

COMMENT ON COLUMN rooms.capture_photo_urls IS 'JSON array of up to 8 signed photo URLs for multi-image reconstruction';

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plus_eligible BOOLEAN DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS engagement_seconds FLOAT DEFAULT 0;
