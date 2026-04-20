-- Fix the broken HNSW migration from 20260410 and clean up legacy IVFFlat state.
-- PRESERVED: all product catalog tables, RPCs, Edge Functions (tagged DORMANT).
-- This migration ensures indexes are correct if/when the catalog flow is revived.
--
-- STATUS: FILE-ONLY. Not applied to production as of 2026-04-19.
--
-- NOTE ON TABLE TARGET:
-- Historical migrations (20240020, 20240054) ALTER/index the `products` table,
-- but the auto-generated Supabase types in apps/web/lib/types/supabase.ts reflect
-- a `products_v1` table with the vector columns. This suggests an in-DB rename or
-- view that is not captured in the migration history. This migration targets
-- `products_v1` per docs/audit/pgvector.md (Section 1), which documents the live
-- schema. If the operational table is still `products`, update the table name
-- before applying. Verify with:
--   SELECT table_name FROM information_schema.columns
--    WHERE column_name = 'clip_embedding' AND data_type = 'USER-DEFINED';

-- Drop the misnamed/invalid HNSW index from migration 20260410.
-- That migration targeted column `clip_embedding_data` (JSONB) which cannot hold a
-- pgvector index; the correct column is `clip_embedding` (vector(768)).
DROP INDEX IF EXISTS products_clip_hnsw_idx;

-- Drop IVFFlat indexes that were missed by 20260410 drop statements (wrong names)
DROP INDEX IF EXISTS products_clip_embedding_idx;
DROP INDEX IF EXISTS products_fusion_embedding_idx;

-- Create correct HNSW indexes on the actual vector columns in products_v1.
-- These enable fast cosine-distance search if the catalog flow is revived.
CREATE INDEX IF NOT EXISTS products_v1_clip_embedding_hnsw_idx
  ON products_v1
  USING hnsw (clip_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS products_v1_fusion_embedding_hnsw_idx
  ON products_v1
  USING hnsw (clip_fusion_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
