-- Add depth conditioning tracking to rooms table
-- Tracks which depth conditioning method was used for the render
-- and stores the URL of the extracted depth map.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS depth_conditioning_method text,
  ADD COLUMN IF NOT EXISTS depth_map_url text;

COMMENT ON COLUMN rooms.depth_conditioning_method IS
  'Which depth conditioning method was used for the render: flux_depth_pro | kontext_fallback | none';

COMMENT ON COLUMN rooms.depth_map_url IS
  'URL of the Depth-Anything-V2 extracted depth map in Supabase storage';
