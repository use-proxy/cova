-- Area 2 — Detection pipeline + structured design context
-- Adds screens A/B/C/D output columns and the assembled render context.
-- Idempotent: safe to re-run.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_context       JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_constraints   JSONB;
-- keep_mask already exists on rooms (Json) — we continue using it; the new
-- shape is KeepMask from lib/types/area2.ts. No column add needed.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS personalization    JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS detection_metadata JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS render_context     JSONB;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS detection_status TEXT
  DEFAULT 'pending';

-- Add the CHECK constraint separately so IF NOT EXISTS semantics stay simple.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rooms_detection_status_check'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_detection_status_check
      CHECK (detection_status IN ('pending','running','complete','failed'));
  END IF;
END $$;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS design_step INTEGER DEFAULT 0;
