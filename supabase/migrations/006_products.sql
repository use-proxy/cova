-- Products table with clip_embedding VECTOR(768), style_tags TEXT array.
-- search_products_by_embedding RPC using pgvector cosine similarity.
-- IVFFlat index commented out until data is loaded.

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL CHECK (char_length(external_id) <= 500),
  name TEXT NOT NULL CHECK (char_length(name) <= 500),
  retailer TEXT NOT NULL CHECK (retailer IN ('wayfair', 'amazon', 'ikea', 'cb2')),
  price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) <= 10),
  category TEXT NOT NULL CHECK (char_length(category) <= 100),
  subcategory TEXT CHECK (subcategory IS NULL OR char_length(subcategory) <= 100),
  image_url TEXT NOT NULL CHECK (char_length(image_url) <= 2000),
  affiliate_url_base TEXT NOT NULL CHECK (char_length(affiliate_url_base) <= 2000),
  clip_embedding VECTOR(768),
  style_tags TEXT[],
  price_tier TEXT CHECK (price_tier IN ('budget', 'mid', 'premium')),
  in_stock BOOLEAN NOT NULL DEFAULT true,
  price_last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index: create AFTER loading product data (needs rows to build lists).
-- CREATE INDEX ON public.products USING ivfflat (clip_embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.search_products_by_embedding(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INTEGER DEFAULT 20
) RETURNS TABLE (
  id UUID,
  name TEXT,
  retailer TEXT,
  price NUMERIC,
  category TEXT,
  image_url TEXT,
  affiliate_url_base TEXT,
  price_tier TEXT,
  similarity FLOAT
) LANGUAGE sql STABLE AS $$
  SELECT id, name, retailer, price, category, image_url, affiliate_url_base, price_tier,
         1 - (clip_embedding <=> query_embedding) AS similarity
  FROM public.products
  WHERE clip_embedding IS NOT NULL
    AND 1 - (clip_embedding <=> query_embedding) > match_threshold
    AND in_stock = true
  ORDER BY clip_embedding <=> query_embedding
  LIMIT match_count;
$$;
