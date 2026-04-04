-- Add perspective render URL to rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS perspective_render_url TEXT;

-- Add 2D hotspot coordinates to room_products
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS hotspot_x FLOAT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS hotspot_y FLOAT;

-- Add render_ready status tracking
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS render_ready BOOLEAN DEFAULT FALSE;
