-- Session 7: DB Schema Gaps Fix
-- Run in Supabase SQL Editor. All statements are idempotent.

-- ============================================================
-- 1. rooms table — add missing columns (IF NOT EXISTS for safety)
-- ============================================================

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS keep_remove_decisions JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS change_map_url TEXT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS wall_change_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor_change_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS design_brief JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS style_blend JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS required_objects JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS personalization_context JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS depth_map_url TEXT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS canny_map_url TEXT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v3';

-- ============================================================
-- 2. renders table — add missing columns + indexes + RLS
-- ============================================================

ALTER TABLE renders ADD COLUMN IF NOT EXISTS laion_score FLOAT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS hps_score FLOAT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS composite_score FLOAT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS was_selected BOOLEAN DEFAULT FALSE;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS loras_used JSONB;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS empty_room_url TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v3';

-- B-tree indexes (CREATE INDEX IF NOT EXISTS is idempotent)
CREATE INDEX IF NOT EXISTS idx_renders_laion_score ON renders (laion_score);
CREATE INDEX IF NOT EXISTS idx_renders_composite_score ON renders (composite_score);
CREATE INDEX IF NOT EXISTS idx_renders_created_at ON renders (created_at);

-- Partial index for high-quality renders
CREATE INDEX IF NOT EXISTS idx_renders_laion_high ON renders (laion_score) WHERE laion_score > 6.0;

-- Enable Row Level Security (idempotent — no error if already enabled)
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. quiz_comparison_pairs — add missing columns
-- ============================================================

ALTER TABLE quiz_comparison_pairs ADD COLUMN IF NOT EXISTS is_anchor BOOLEAN DEFAULT FALSE;
ALTER TABLE quiz_comparison_pairs ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE quiz_comparison_pairs ADD COLUMN IF NOT EXISTS dimension_tested TEXT;
ALTER TABLE quiz_comparison_pairs ADD COLUMN IF NOT EXISTS a_dimension_value FLOAT;
ALTER TABLE quiz_comparison_pairs ADD COLUMN IF NOT EXISTS b_dimension_value FLOAT;
ALTER TABLE quiz_comparison_pairs ADD COLUMN IF NOT EXISTS anchor_style TEXT;

-- ============================================================
-- 4. app_config table (create if not exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO app_config (key, value)
VALUES
  ('pipeline_version', '"v3"'::jsonb),
  ('rollout_pct', '100'::jsonb)
ON CONFLICT (key) DO NOTHING;
