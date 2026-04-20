-- Cova v3 Schema Migration
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/xdeacbmkdwqrwxonqaqh/sql/new
-- All statements are idempotent — safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD NEW COLUMNS TO rooms TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Store the preprocessed (DarkIR + OpenCV cleaned) version of the user's photo
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS preprocessed_image_url TEXT;

-- Store the professionalized (FLUX cleanup pass) version of the photo
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS professionalized_image_url TEXT;

-- Design Director Call 1 output: staging JSON with room analysis + object layout
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS design_brief JSONB;

-- Design Director Call 2 output: the final FLUX staging script (80-120 words)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS flux_prompt TEXT;

-- Design Director Call 2 output: negative prompt (removal targets + quality guards)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS negative_prompt TEXT;

-- LAION Aesthetic Predictor V2 score (0-10). Threshold for passing quality gate: 5.0
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS aesthetic_score FLOAT;

-- Unsplash reference image URLs fetched at step-3 (JSON array of 3-5 URLs)
-- Column may already exist — ADD COLUMN IF NOT EXISTS handles this safely.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS unsplash_references JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DROP marble_* COLUMNS FROM rooms TABLE
-- These were for the Marble API (disabled). Columns were never written.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE rooms DROP COLUMN IF EXISTS marble_pano_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS marble_spz_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS marble_world_id;
ALTER TABLE rooms DROP COLUMN IF EXISTS marble_plus_pano_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS marble_plus_splat_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS marble_plus_world_id;
ALTER TABLE rooms DROP COLUMN IF EXISTS redesign_splat_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS splat_url;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE style_loras TABLE
-- Stores trained fal.ai LoRA URLs for each style anchor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS style_loras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    style_name TEXT NOT NULL,           -- e.g. "Warm & Grounded"
    trigger_word TEXT NOT NULL,         -- e.g. "cvwmn"
    lora_url TEXT NOT NULL,             -- fal.ai LoRA artifact URL
    recommended_scale FLOAT DEFAULT 0.8,
    quality_score FLOAT,                -- manual quality rating (1-5)
    trained_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by style_name (used by lora-registry.ts)
CREATE INDEX IF NOT EXISTS style_loras_style_name_idx ON style_loras (style_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERY — run after migration to confirm changes
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'rooms'
-- AND column_name IN (
--   'professionalized_image_url','design_brief','flux_prompt',
--   'aesthetic_score','unsplash_references'
-- )
-- ORDER BY column_name;

-- SELECT COUNT(*) FROM style_loras;
