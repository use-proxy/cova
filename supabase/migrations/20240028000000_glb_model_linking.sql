-- Migration: Add linked_product_id to products table
-- Links 3D model products (retailer=polyhaven/sketchfab/poly_pizza) to purchasable products
-- Also adds dimensions_m (JSONB) for 3D model dimensions in metres

ALTER TABLE products ADD COLUMN IF NOT EXISTS linked_product_id UUID REFERENCES products(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions_m JSONB;

-- Index for finding 3D models quickly
CREATE INDEX IF NOT EXISTS idx_products_retailer_3d ON products (retailer)
  WHERE retailer IN ('polyhaven', 'sketchfab', 'poly_pizza');

-- Index for linked product lookups
CREATE INDEX IF NOT EXISTS idx_products_linked ON products (linked_product_id)
  WHERE linked_product_id IS NOT NULL;
