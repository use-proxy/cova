-- Add fusion embedding column (0.6 * image_embed + 0.4 * text_embed, normalized)
ALTER TABLE products ADD COLUMN IF NOT EXISTS clip_fusion_embedding extensions.vector(768);

-- IVFFlat index for fusion embedding search
CREATE INDEX IF NOT EXISTS products_fusion_embedding_idx
  ON products USING ivfflat (clip_fusion_embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- RPC for fusion embedding search (mirrors search_products_by_embedding)
CREATE OR REPLACE FUNCTION public.search_products_by_fusion_embedding(
  query_embedding extensions.vector(768),
  match_threshold FLOAT DEFAULT 0.0,
  match_count INTEGER DEFAULT 15
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  retailer TEXT,
  price NUMERIC,
  image_url TEXT,
  affiliate_url TEXT,
  category TEXT,
  style_tags TEXT[],
  room_types TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.retailer, p.price, p.image_url,
         p.affiliate_url, p.category, p.style_tags, p.room_types,
         1 - (p.clip_fusion_embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE p.clip_fusion_embedding IS NOT NULL
    AND 1 - (p.clip_fusion_embedding <=> query_embedding) > match_threshold
  ORDER BY p.clip_fusion_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
