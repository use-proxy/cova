-- M7 Session 4: room_products table + CLIP search RPC

-- room_products table for furniture matches
CREATE TABLE IF NOT EXISTS room_products (
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

CREATE INDEX IF NOT EXISTS room_products_room_id_idx ON room_products(room_id);
CREATE INDEX IF NOT EXISTS room_products_product_id_idx ON room_products(product_id);

ALTER TABLE room_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own room products"
    ON room_products FOR SELECT
    USING (room_id IN (SELECT id FROM rooms WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can manage room products"
    ON room_products FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add furniture_matches_count to rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS furniture_matches_count INTEGER DEFAULT 0;
