-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002: V2 columns — rooms + products
-- Created: Pre-Session-6 audit, 2026-04-07
-- Status: PENDING — run manually in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── rooms table: v2.0 columns ────────────────────────────────────────────────
-- These columns are referenced in types/supabase.ts but not yet in the DB.
-- preview_url and parallax_video_url currently exist only in render_sessions.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS parallax_video_url TEXT;

-- ── products table: v2 embedding columns ────────────────────────────────────
-- The existing column is clip_embedding_data (768-dim vector).
-- Future multi-modal search will use DINOv3 (1536-dim) and SigLIP2 (1152-dim).
-- Add as nullable — only populated after re-embedding run in M8.

ALTER TABLE products ADD COLUMN IF NOT EXISTS dinov3_embedding VECTOR(1536);
ALTER TABLE products ADD COLUMN IF NOT EXISTS siglip2_embedding VECTOR(1152);

-- ── After adding embedding columns, rebuild IVFFlat indexes ─────────────────
-- Only run after columns are populated with data:
--
-- CREATE INDEX IF NOT EXISTS idx_products_dinov3_embedding
--   ON products USING ivfflat (dinov3_embedding vector_cosine_ops)
--   WITH (lists = 100);
--
-- CREATE INDEX IF NOT EXISTS idx_products_siglip2_embedding
--   ON products USING ivfflat (siglip2_embedding vector_cosine_ops)
--   WITH (lists = 100);

-- ── Existing permitted columns (from CLAUDE.md — already applied) ─────────
-- ALTER TABLE renders ADD COLUMN IF NOT EXISTS splat_url TEXT;
-- ALTER TABLE renders ADD COLUMN IF NOT EXISTS redesign_splat_url TEXT;
-- ALTER TABLE renders ADD COLUMN IF NOT EXISTS style_vector FLOAT[];
-- ALTER TABLE renders ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
-- ALTER TABLE renders ADD COLUMN IF NOT EXISTS modal_job_id TEXT;
-- ALTER TABLE renders ADD COLUMN IF NOT EXISTS marble_operation_id TEXT;
