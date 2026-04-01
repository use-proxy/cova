-- M7 Session 1: Add Marble pipeline columns to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_world_id TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_pano_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_spz_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_mini_world_id TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS redesign_pano_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS redesign_status TEXT DEFAULT 'pending';
