-- Rebuild IVFFlat index for fusion embeddings with correct list count
-- Original was created with lists=100 but only worked after bulk embed
DROP INDEX IF EXISTS products_fusion_embedding_idx;

CREATE INDEX products_fusion_embedding_idx
  ON products USING ivfflat (clip_fusion_embedding extensions.vector_cosine_ops)
  WITH (lists = 20);

NOTIFY pgrst, 'reload schema';
