-- Migrate from IVFFlat to HNSW for better performance at Cova's scale.
-- HNSW: better recall, no rebuild needed for data changes, sub-5ms queries.
-- Safe to run: only drops indexes that exist and creates IF NOT EXISTS.

-- Drop existing IVFFlat indexes on clip_embedding_data (the active embedding column)
DROP INDEX IF EXISTS products_clip_embedding_ivfflat_idx;
DROP INDEX IF EXISTS products_embedding_idx;
DROP INDEX IF EXISTS products_embedding_ivfflat_idx;
DROP INDEX IF EXISTS idx_products_clip_ivfflat;
DROP INDEX IF EXISTS idx_products_fusion_ivfflat;

-- Create HNSW index on clip_embedding_data (768-dim ViT-L/14 embeddings)
-- m=16: connections per layer (higher = better recall, more memory)
-- ef_construction=64: search depth during build (higher = better quality)
CREATE INDEX IF NOT EXISTS products_clip_hnsw_idx
  ON products
  USING hnsw (clip_embedding_data vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON INDEX products_clip_hnsw_idx IS
  'HNSW index for product similarity search. 768-dim ViT-L/14 embeddings. '
  'Migrated from IVFFlat for: better recall, no periodic rebuild, sub-5ms queries. '
  'Use SET hnsw.ef_search = 100-200 for higher recall in quality-critical searches.';
