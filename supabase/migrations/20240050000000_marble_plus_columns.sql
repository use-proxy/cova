-- M7 Session 3: Add Marble Plus columns to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_plus_world_id TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_spz_url_500k TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_spz_url_100k TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_plus_pano_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_plus_thumbnail_url TEXT;
