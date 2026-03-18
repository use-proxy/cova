-- Add missing columns to products table per build guide schema
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS affiliate_url TEXT,
  ADD COLUMN IF NOT EXISTS room_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS width_inches FLOAT,
  ADD COLUMN IF NOT EXISTS depth_inches FLOAT,
  ADD COLUMN IF NOT EXISTS height_inches FLOAT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Backfill affiliate_url from existing affiliate_url_base
UPDATE public.products
SET affiliate_url = affiliate_url_base
WHERE affiliate_url IS NULL;

-- Create full search function now that all columns exist
-- SET search_path includes extensions so the <=> operator resolves
CREATE OR REPLACE FUNCTION public.search_products_by_embedding(
  query_embedding extensions.vector(1024),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INTEGER DEFAULT 15
) RETURNS TABLE (
  id UUID,
  name TEXT,
  retailer TEXT,
  price NUMERIC,
  category TEXT,
  image_url TEXT,
  affiliate_url TEXT,
  style_tags TEXT[],
  room_types TEXT[],
  width_inches FLOAT,
  depth_inches FLOAT,
  height_inches FLOAT,
  similarity FLOAT
) LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT id, name, retailer, price, category, image_url, affiliate_url,
         style_tags, room_types, width_inches, depth_inches, height_inches,
         1 - (clip_embedding <=> query_embedding) AS similarity
  FROM public.products
  WHERE clip_embedding IS NOT NULL
    AND 1 - (clip_embedding <=> query_embedding) > match_threshold
    AND active = true
  ORDER BY clip_embedding <=> query_embedding
  LIMIT match_count;
$$;
