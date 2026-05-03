-- Reverse step 2 (TIGHTENED — only restores the 17 truly-dead columns dropped above).
-- Original types/defaults from snapshot. Data NOT recoverable beyond the snapshot.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS splat_path text,
  ADD COLUMN IF NOT EXISTS marble_mini_world_id text,
  ADD COLUMN IF NOT EXISTS marble_mini_spz_url text,
  ADD COLUMN IF NOT EXISTS marble_spz_url_500k text,
  ADD COLUMN IF NOT EXISTS marble_spz_url_100k text,
  ADD COLUMN IF NOT EXISTS marble_plus_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS plus_eligible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS plus_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS plus_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS plus_upgrade_ready boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flythrough_video_url text,
  ADD COLUMN IF NOT EXISTS flythrough_ready boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flythrough_duration_seconds double precision,
  ADD COLUMN IF NOT EXISTS depth_map_url text,
  ADD COLUMN IF NOT EXISTS depth_map_url_v2 text,
  ADD COLUMN IF NOT EXISTS depth_map_quality_score double precision,
  ADD COLUMN IF NOT EXISTS depth_conditioning_method text;
