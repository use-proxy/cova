-- Session B: Quiz V3 schema migration
-- Adds new columns for 10-style system with 12 dimensions.
-- Relaxes NOT NULL constraints on columns that the new generation
-- script doesn't populate (stop steps, style vectors, storage paths).

-- ── quiz_comparison_pairs: new columns ──────────────────────────────────────

ALTER TABLE quiz_comparison_pairs
  ADD COLUMN IF NOT EXISTS room_type TEXT,
  ADD COLUMN IF NOT EXISTS style_a TEXT,
  ADD COLUMN IF NOT EXISTS style_b TEXT,
  ADD COLUMN IF NOT EXISTS a_dimension_value FLOAT,
  ADD COLUMN IF NOT EXISTS b_dimension_value FLOAT,
  ADD COLUMN IF NOT EXISTS is_anchor BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS anchor_style TEXT;

-- ── Relax NOT NULL constraints on old columns ──────────────────────────────

-- image_a_stop / image_b_stop: drop NOT NULL and CHECK constraints
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_a_stop DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_b_stop DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_a_vector DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_b_vector DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_a_storage_path DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_b_storage_path DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN flux_prompt_a DROP NOT NULL;
ALTER TABLE quiz_comparison_pairs ALTER COLUMN flux_prompt_b DROP NOT NULL;

-- Drop CHECK constraints on stop columns (they enforce IN (2,3,4))
ALTER TABLE quiz_comparison_pairs DROP CONSTRAINT IF EXISTS quiz_comparison_pairs_image_a_stop_check;
ALTER TABLE quiz_comparison_pairs DROP CONSTRAINT IF EXISTS quiz_comparison_pairs_image_b_stop_check;

-- For anchor rows, image_b_url can be null
ALTER TABLE quiz_comparison_pairs ALTER COLUMN image_b_url DROP NOT NULL;

-- ── quiz_anchor_images: expand style_index range to 10 ─────────────────────

ALTER TABLE quiz_anchor_images DROP CONSTRAINT IF EXISTS quiz_anchor_images_style_index_check;
ALTER TABLE quiz_anchor_images ADD CONSTRAINT quiz_anchor_images_style_index_check
  CHECK (style_index BETWEEN 1 AND 10);

-- ── Index for new columns ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pairs_room_type ON quiz_comparison_pairs(room_type);
CREATE INDEX IF NOT EXISTS idx_pairs_is_anchor ON quiz_comparison_pairs(is_anchor);
CREATE INDEX IF NOT EXISTS idx_pairs_anchor_style ON quiz_comparison_pairs(anchor_style);
