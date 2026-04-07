-- Session 3: Add missing columns and tables
-- Idempotent via ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS

-- style_fingerprints: add 10-dim columns
ALTER TABLE public.style_fingerprints
  ADD COLUMN IF NOT EXISTS dimensions  jsonb  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS covariance  jsonb  NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS confidence  float8 NOT NULL DEFAULT 0;

-- rooms: add room_analysis column
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_analysis jsonb;

-- render_sessions: add parallax and preview columns
ALTER TABLE public.render_sessions
  ADD COLUMN IF NOT EXISTS parallax_video_url text,
  ADD COLUMN IF NOT EXISTS preview_url        text;

-- interactions: add check constraint (skip if exists)
DO $$ BEGIN
  ALTER TABLE public.interactions
    ADD CONSTRAINT interactions_action_check CHECK (action IN (
      'hotspot_tap', 'product_view', 'affiliate_click',
      'swap_initiated', 'swap_completed', 'purchase_confirmed',
      'regenerate', 'refine', 'add_item', 'quiz_response'
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- style_references: new table
CREATE TABLE IF NOT EXISTS public.style_references (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url        text        NOT NULL,
  room_type        text        NOT NULL,
  dimension_labels jsonb,
  style_name       text,
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.style_references ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "style_references_select_all" ON public.style_references
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes for new table and new columns
CREATE INDEX IF NOT EXISTS idx_style_references_room_type  ON public.style_references(room_type);
CREATE INDEX IF NOT EXISTS idx_style_references_created_at ON public.style_references(created_at);
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_room_type ON public.style_fingerprints(room_type);
CREATE INDEX IF NOT EXISTS idx_render_sessions_created_at   ON public.render_sessions(created_at);
