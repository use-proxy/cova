-- Fixes follow-on from 20240021 migration:
-- 1. Add CHECK constraint to rooms.status
-- 2. Create increment_rooms_render_count RPC (atomic, no TOCTOU race)

-- ── 1. rooms.status CHECK ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'rooms_status_check'
  ) THEN
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_status_check
      CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

-- ── 2. Atomic render_count increment RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_rooms_render_count(room_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.rooms SET render_count = render_count + 1 WHERE id = room_id;
$$;
