-- Add elevation_degrees to room_products for vertical hotspot positioning
-- Range: -90 (floor) to +90 (ceiling), 0 = eye level
-- Default -25 = mid-floor height (typical for sofas, tables, rugs)
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS elevation_degrees FLOAT DEFAULT -25;
