-- Rebuild IVFFlat index for fusion embeddings at full catalog scale
-- Run AFTER embed_fusion_gpu.py completes for all ~15,902 products
-- lists=100 is optimal for ~16k products (sqrt(16000) ≈ 126)
DROP INDEX IF EXISTS products_fusion_embedding_idx;

CREATE INDEX products_fusion_embedding_idx
  ON products USING ivfflat (clip_fusion_embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

NOTIFY pgrst, 'reload schema';
