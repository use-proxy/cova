-- Rebuild IVFFlat index after M6 catalog expansion (Etsy + Overstock)
-- Total catalog ~15,900 products, lists=150

DROP INDEX IF EXISTS products_clip_embedding_idx;

CREATE INDEX products_clip_embedding_idx
ON products
USING ivfflat (clip_embedding extensions.vector_cosine_ops)
WITH (lists = 50);

ANALYZE products;
