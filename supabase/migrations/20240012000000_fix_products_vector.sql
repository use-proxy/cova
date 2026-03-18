-- Fix: change clip_embedding from vector(768) to vector(1024)
-- Required for OpenCLIP ViT-H-14 which produces 1024-dim embeddings

ALTER TABLE public.products DROP COLUMN IF EXISTS clip_embedding;
ALTER TABLE public.products ADD COLUMN clip_embedding extensions.vector(1024);

-- Drop old search function
DROP FUNCTION IF EXISTS public.search_products_by_embedding(extensions.vector(768), float, integer);

-- HNSW index for fast cosine similarity
CREATE INDEX IF NOT EXISTS products_clip_embedding_hnsw
ON public.products
USING hnsw (clip_embedding extensions.vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
