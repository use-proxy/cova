-- M6: Rebuild IVFFlat index after embedding 14,000 products
-- lists = 50 (fits within Supabase free-tier 32MB maintenance_work_mem)
-- For 14k products with 768-dim vectors, 50 lists still gives good recall
DROP INDEX IF EXISTS products_clip_embedding_idx;
CREATE INDEX products_clip_embedding_idx ON products
USING ivfflat (clip_embedding extensions.vector_cosine_ops) WITH (lists = 50);
ANALYZE products;
