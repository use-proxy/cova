-- New Pipeline Architecture: multi-image capture, flythrough video, async Plus
-- Adds columns to rooms and room_products for the new pipeline flow.
-- All additions are idempotent (IF NOT EXISTS).
--
-- New redesign_status flow:
-- pending → uploading_photos → generating_mini_world → mini_world_ready
-- → awaiting_furniture_selection → kontext_processing → kontext_complete
-- → depth_processing → video_processing → video_ready
-- → matching_products → plus_processing → complete

BEGIN;

-- ============================================================
-- ROOMS TABLE — New columns
-- ============================================================

-- Capture
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS capture_photo_urls JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS capture_mode TEXT DEFAULT 'multi_image';

-- Pre-detection (Claude Vision on first photo)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pre_detection_result JSONB DEFAULT NULL;

-- Fixed furniture selection
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS fixed_furniture JSONB DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS inpainting_mask_url TEXT DEFAULT NULL;

-- Flythrough video
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS flythrough_video_url TEXT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS flythrough_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS flythrough_duration_seconds FLOAT DEFAULT NULL;

-- Depth estimation
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS depth_map_url_v2 TEXT DEFAULT NULL;

-- Marble Mini intermediate (for furniture selection UI)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS marble_mini_spz_url TEXT DEFAULT NULL;

-- Background Plus upgrade tracking
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plus_upgrade_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plus_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plus_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Hotspot video timing
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hotspot_timing JSONB DEFAULT NULL;

-- ============================================================
-- ROOM_PRODUCTS TABLE — New columns
-- ============================================================

-- Video timing (when this product is visible in flythrough)
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS visible_from_second FLOAT DEFAULT NULL;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS visible_to_second FLOAT DEFAULT NULL;

-- ============================================================
-- Verify IVFFlat index still exists
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'products_fusion_embedding_idx'
  ) THEN
    RAISE NOTICE 'WARNING: products_fusion_embedding_idx does not exist — rebuild needed';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
