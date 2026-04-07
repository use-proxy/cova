-- ═══════════════════════════════════════════════════════════════
-- COVA V1 — Authoritative Schema
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Last updated: 2026-04-07
-- ═══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ── USERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  auth_provider text        NOT NULL DEFAULT 'email',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_active   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_select_own" ON public.users
    FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── STYLE_FINGERPRINTS ──────────────────────────────────────────
-- 10-dimensional style fingerprint (dimensions, covariance, confidence).
-- vector_data (old 6-dim field) is kept for backwards compat but not used.
CREATE TABLE IF NOT EXISTS public.style_fingerprints (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dimensions     jsonb       NOT NULL DEFAULT '{}',
  covariance     jsonb       NOT NULL DEFAULT '[]',
  confidence     float8      NOT NULL DEFAULT 0,
  style_name     text,
  room_type      text,
  budget_tier    text,
  entry_path     text,
  quiz_responses jsonb       NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.style_fingerprints ENABLE ROW LEVEL SECURITY;

-- Add new 10-dim columns to existing tables (idempotent)
ALTER TABLE public.style_fingerprints
  ADD COLUMN IF NOT EXISTS dimensions  jsonb  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS covariance  jsonb  NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS confidence  float8 NOT NULL DEFAULT 0;

DO $$ BEGIN
  CREATE POLICY "fingerprints_select_own" ON public.style_fingerprints
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "fingerprints_insert_own" ON public.style_fingerprints
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "fingerprints_update_own" ON public.style_fingerprints
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── ROOMS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fingerprint_id    uuid        REFERENCES public.style_fingerprints(id) ON DELETE SET NULL,
  original_photo_url text,
  depth_map_url     text,
  render_url        text,
  keep_mask         jsonb,
  room_analysis     jsonb,
  room_type         text,
  dimensions        text,
  constraints       text[],
  inclusions        text[],
  pipeline_cost_log jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Add columns that may not exist yet
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_analysis     jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_cost_log jsonb,
  ADD COLUMN IF NOT EXISTS fingerprint_id    uuid REFERENCES public.style_fingerprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS keep_mask         jsonb,
  ADD COLUMN IF NOT EXISTS depth_map_url     text,
  ADD COLUMN IF NOT EXISTS render_url        text,
  ADD COLUMN IF NOT EXISTS dimensions        text,
  ADD COLUMN IF NOT EXISTS constraints       text[],
  ADD COLUMN IF NOT EXISTS inclusions        text[],
  ADD COLUMN IF NOT EXISTS original_photo_url text;

DO $$ BEGIN
  CREATE POLICY "rooms_select_own" ON public.rooms
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_insert_own" ON public.rooms
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_update_own" ON public.rooms
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_delete_own" ON public.rooms
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── RENDER_SESSIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  render_url          text,
  parallax_video_url  text,
  preview_url         text,
  prompt              text,
  style_strength      float8,
  iteration           integer     NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.render_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.render_sessions
  ADD COLUMN IF NOT EXISTS parallax_video_url text,
  ADD COLUMN IF NOT EXISTS preview_url        text;

DO $$ BEGIN
  CREATE POLICY "render_sessions_select_own" ON public.render_sessions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = render_sessions.room_id
          AND rooms.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "render_sessions_insert_own" ON public.render_sessions
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = render_sessions.room_id
          AND rooms.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── PRODUCTS ────────────────────────────────────────────────────
-- FROZEN TABLE — 5,581+ rows with CLIP embeddings. Never alter existing columns.
-- CREATE TABLE IF NOT EXISTS is a no-op if it already exists.
CREATE TABLE IF NOT EXISTS public.products (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  retailer            text,
  price               numeric,
  affiliate_url       text,
  image_url           text,
  clip_embedding_data jsonb,
  style_tags          text[],
  room_types          text[],
  in_stock            boolean     NOT NULL DEFAULT true,
  commission_rate     numeric,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "products_select_all" ON public.products
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── INTERACTIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interactions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  room_id        uuid        REFERENCES public.rooms(id) ON DELETE SET NULL,
  product_id     uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  action         text        NOT NULL,
  fingerprint_id uuid        REFERENCES public.style_fingerprints(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interactions_action_check CHECK (action IN (
    'hotspot_tap', 'product_view', 'affiliate_click',
    'swap_initiated', 'swap_completed', 'purchase_confirmed',
    'regenerate', 'refine', 'add_item', 'quiz_response'
  ))
);
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

-- Add check constraint to existing table (idempotent via DO block)
DO $$ BEGIN
  ALTER TABLE public.interactions
    ADD CONSTRAINT interactions_action_check CHECK (action IN (
      'hotspot_tap', 'product_view', 'affiliate_click',
      'swap_initiated', 'swap_completed', 'purchase_confirmed',
      'regenerate', 'refine', 'add_item', 'quiz_response'
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "interactions_insert_own" ON public.interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "interactions_select_own" ON public.interactions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── STYLE_REFERENCES ────────────────────────────────────────────
-- Curated reference images for style calibration and training.
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

-- ── INDEXES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_user_id
  ON public.style_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_created_at
  ON public.style_fingerprints(created_at);
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_room_type
  ON public.style_fingerprints(room_type);

CREATE INDEX IF NOT EXISTS idx_rooms_user_id
  ON public.rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type
  ON public.rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at
  ON public.rooms(created_at);

CREATE INDEX IF NOT EXISTS idx_render_sessions_room_id
  ON public.render_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_render_sessions_created_at
  ON public.render_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_interactions_user_id
  ON public.interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_room_id
  ON public.interactions(room_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at
  ON public.interactions(created_at);

CREATE INDEX IF NOT EXISTS idx_products_in_stock
  ON public.products(in_stock);

CREATE INDEX IF NOT EXISTS idx_style_references_room_type
  ON public.style_references(room_type);
CREATE INDEX IF NOT EXISTS idx_style_references_created_at
  ON public.style_references(created_at);
