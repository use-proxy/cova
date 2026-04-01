-- Add 'etsy' and other M6 retailers to the products_retailer_check constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_retailer_check;

ALTER TABLE products ADD CONSTRAINT products_retailer_check
  CHECK (retailer IN (
    'wayfair', 'amazon', 'cb2', 'ikea',
    'sketchfab', 'polyhaven', 'poly_pizza',
    'walmart', 'target', 'overstock', 'houzz',
    'article', 'west_elm', 'crate_barrel',
    'etsy', 'pottery_barn', 'ruggable', 'one_kings_lane'
  ));
