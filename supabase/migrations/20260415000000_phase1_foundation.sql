-- Phase 1 Foundation Migration
-- Idempotent — safe to run multiple times.

-- New columns on rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS keep_remove_decisions JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS wall_change_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor_change_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS required_objects JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS personalization_context JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS depth_map_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS canny_map_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v3';

-- style_vectors table (stores 6-dimensional V2 style vectors for quiz matching)
CREATE TABLE IF NOT EXISTS style_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_code TEXT NOT NULL UNIQUE,
  style_name TEXT NOT NULL,
  style_vector FLOAT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS style_vectors_style_code_idx ON style_vectors (style_code);

-- render_comparison_pairs table (for future A/B testing)
CREATE TABLE IF NOT EXISTS render_comparison_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  render_a_url TEXT,
  render_b_url TEXT,
  winner TEXT CHECK (winner IN ('a', 'b', 'none')),
  pipeline_version_a TEXT,
  pipeline_version_b TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS render_comparison_pairs_room_idx
  ON render_comparison_pairs (room_id);

-- Insert style vectors for all 9 styles (V2 6-dimension system)
-- V2 order: [warmth, visual_complexity, organicness, density, traditionalism, character]
INSERT INTO style_vectors (style_code, style_name, style_vector) VALUES
  ('cvwmn', 'Warm & Grounded',    ARRAY[0.80, 0.35, 0.75, 0.35, 0.45, 0.50]),
  ('cvmax', 'Bold & Eclectic',    ARRAY[0.55, 0.90, 0.50, 0.95, 0.25, 0.90]),
  ('cvind', 'Industrial',         ARRAY[0.30, 0.45, 0.20, 0.45, 0.40, 0.70]),
  ('cvlux', 'Luxury',             ARRAY[0.55, 0.60, 0.35, 0.60, 0.90, 0.80]),
  ('cvcst', 'Coastal',            ARRAY[0.60, 0.25, 0.70, 0.25, 0.35, 0.55]),
  ('cvscn', 'Scandinavian',       ARRAY[0.35, 0.15, 0.60, 0.15, 0.55, 0.85]),
  ('cvmcm', 'Mid-Century Modern', ARRAY[0.55, 0.45, 0.45, 0.45, 0.60, 0.90]),
  ('cvboh', 'Bohemian',           ARRAY[0.70, 0.85, 0.65, 0.85, 0.15, 0.25]),
  ('cvdco', 'Contemporary',       ARRAY[0.40, 0.30, 0.30, 0.30, 0.65, 0.90])
ON CONFLICT (style_code) DO UPDATE SET
  style_vector = EXCLUDED.style_vector,
  style_name = EXCLUDED.style_name,
  updated_at = NOW();

-- Verification query (commented out — run manually in Supabase dashboard to confirm)
-- SELECT style_code, style_name, array_length(style_vector, 1) as dims
-- FROM style_vectors ORDER BY style_code;
