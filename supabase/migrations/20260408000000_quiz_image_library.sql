-- Session B (12-dim quiz library) — schema for the new quiz image library.
-- These tables replace the legacy 10-dim swipe_cards / style_references
-- system. The 9 anchor images and 60 comparison pairs are populated by
-- apps/web/scripts/generate-quiz-library.ts.

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_anchor_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_name text NOT NULL,
  style_index integer NOT NULL CHECK (style_index BETWEEN 1 AND 9),
  image_url text NOT NULL,
  storage_path text NOT NULL,
  style_vector jsonb NOT NULL,
  dominant_colors text[] NOT NULL,
  flux_prompt text NOT NULL,
  livability_score numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_comparison_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  dimension_index integer NOT NULL CHECK (dimension_index BETWEEN 0 AND 11),
  pair_index integer NOT NULL,
  image_a_url text NOT NULL,
  image_a_storage_path text NOT NULL,
  image_a_stop integer NOT NULL CHECK (image_a_stop IN (2, 3, 4)),
  image_b_url text NOT NULL,
  image_b_storage_path text NOT NULL,
  image_b_stop integer NOT NULL CHECK (image_b_stop IN (2, 3, 4)),
  image_a_vector jsonb NOT NULL,
  image_b_vector jsonb NOT NULL,
  base_room_url text,
  flux_prompt_a text NOT NULL,
  flux_prompt_b text NOT NULL,
  livability_score_a numeric,
  livability_score_b numeric,
  is_validated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pairs_dimension  ON quiz_comparison_pairs(dimension);
CREATE INDEX IF NOT EXISTS idx_pairs_validated  ON quiz_comparison_pairs(is_validated);
CREATE INDEX IF NOT EXISTS idx_anchors_style    ON quiz_anchor_images(style_index);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Both tables are public-readable. The library is the source of truth for the
-- quiz UX which runs unauthenticated on the landing flow.

ALTER TABLE quiz_anchor_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_comparison_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read anchor images"   ON quiz_anchor_images;
DROP POLICY IF EXISTS "Anyone can read comparison pairs" ON quiz_comparison_pairs;

CREATE POLICY "Anyone can read anchor images"
  ON quiz_anchor_images FOR SELECT USING (true);

CREATE POLICY "Anyone can read comparison pairs"
  ON quiz_comparison_pairs FOR SELECT USING (true);

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Public bucket, 10MB file size limit, jpeg / png / webp only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quiz-images',
  'quiz-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for the bucket: public read, service-role write.
DROP POLICY IF EXISTS "Public read quiz-images"   ON storage.objects;
DROP POLICY IF EXISTS "Service role write quiz-images" ON storage.objects;

CREATE POLICY "Public read quiz-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quiz-images');
