-- Phase 1.1: Add columns the redesign route already references.
-- These were defined in TypeScript but never created in DB.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS empty_room_url TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS unsplash_references JSONB;

COMMENT ON COLUMN rooms.empty_room_url IS
  'URL of the empty-room render produced by cova-empty-room-v3 Modal app. Populated lazily by the redesign route if null.';
COMMENT ON COLUMN rooms.unsplash_references IS
  'Quality-scored Unsplash style reference URLs (top 3) used for IP-Adapter conditioning. Populated by the redesign route at Director-result time.';
