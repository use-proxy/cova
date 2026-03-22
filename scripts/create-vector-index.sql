-- IVFFlat vector index for cosine similarity search
-- Run AFTER backfill-embeddings.ts completes — needs rows to set `lists` parameter
-- The HNSW index from migration 012 is generally superior; use this only if search is slow (>200ms)

CREATE INDEX IF NOT EXISTS products_clip_ivfflat
ON public.products
USING ivfflat (clip_embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- Verify the index is being used:
EXPLAIN SELECT * FROM search_products_by_embedding(
  (SELECT clip_embedding FROM products LIMIT 1), 0.3, 15
);
