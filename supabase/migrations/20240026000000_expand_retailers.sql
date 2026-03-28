-- Expand retailer CHECK constraint to support new product sources
-- Sprint 4: catalog expansion

-- Drop existing constraint and recreate with expanded values
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_retailer_check;

ALTER TABLE products ADD CONSTRAINT products_retailer_check
  CHECK (retailer IN (
    'wayfair', 'amazon', 'cb2', 'ikea',
    'sketchfab', 'polyhaven', 'poly_pizza',
    'walmart', 'target', 'overstock', 'houzz',
    'article', 'west_elm', 'crate_barrel'
  ));
