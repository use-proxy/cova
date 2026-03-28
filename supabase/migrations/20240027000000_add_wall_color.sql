-- Sprint 5: Add wall_color_extracted column to rooms table
-- Stores the dominant wall color extracted from the AI render image
-- Used by BoxRoom.tsx to match 3D viewer wall colors to the actual render

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS wall_color_extracted text DEFAULT '#F5F0EB';

COMMENT ON COLUMN rooms.wall_color_extracted IS
  'Hex color extracted from rendered image back wall region. Used by 3D viewer to match render colors.';
