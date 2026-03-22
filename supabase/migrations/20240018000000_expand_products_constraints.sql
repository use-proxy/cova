-- Expand retailer CHECK to include Target, West Elm, Article
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_retailer_check;
ALTER TABLE public.products ADD CONSTRAINT products_retailer_check
  CHECK (retailer IN ('wayfair', 'amazon', 'ikea', 'cb2', 'target', 'west_elm', 'article'));

-- Expand price_tier CHECK to include luxury tier ($1,500+)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_tier_check;
ALTER TABLE public.products ADD CONSTRAINT products_price_tier_check
  CHECK (price_tier IN ('budget', 'mid', 'premium', 'luxury'));
