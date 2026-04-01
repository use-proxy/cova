-- M7 Session 5: Recreate room_products with schema cache refresh
DROP TABLE IF EXISTS room_products CASCADE;

CREATE TABLE room_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  furniture_label TEXT NOT NULL,
  furniture_description TEXT,
  similarity_score FLOAT,
  rank INTEGER NOT NULL DEFAULT 1,
  azimuth_degrees FLOAT DEFAULT 0,
  is_unlocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX room_products_room_id_idx ON room_products(room_id);
CREATE INDEX room_products_product_id_idx ON room_products(product_id);

ALTER TABLE room_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own room products"
  ON room_products FOR SELECT
  USING (room_id IN (SELECT id FROM rooms WHERE user_id = auth.uid()));

CREATE POLICY "Service role manages room products"
  ON room_products FOR ALL
  USING (auth.role() = 'service_role');

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
