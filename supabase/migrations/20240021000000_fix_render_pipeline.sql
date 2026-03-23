-- Fix render pipeline blocking issues
--
-- 1. renders.status CHECK was missing 'completed' — get-render-status could never
--    mark a render done, so polling timed out at 120s for every render.
-- 2. users.tokens_enabled column was missing — render-room returned 'user_not_found'
--    for every authenticated user, blocking render creation entirely.
-- 3. rooms.original_image_url was NOT NULL with no default — room creation in the
--    client failed FK constraint if called without a photo URL.
-- 4. Missing rooms columns referenced by get-render-status (latest_render_url,
--    render_count) and by the client store (name, style_blend, budget, status).

-- ── 1. Fix renders.status CHECK ───────────────────────────────────────────────
ALTER TABLE public.renders
  DROP CONSTRAINT IF EXISTS renders_status_check;

ALTER TABLE public.renders
  ADD CONSTRAINT renders_status_check
  CHECK (status IN ('processing', 'complete', 'completed', 'failed', 'quality_rejected'));

-- ── 2. Add tokens_enabled to users ───────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tokens_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Make rooms.original_image_url nullable ─────────────────────────────────
ALTER TABLE public.rooms
  ALTER COLUMN original_image_url DROP NOT NULL;

-- Set a sensible default for existing rows that have NULL after the DROP NOT NULL
UPDATE public.rooms
  SET original_image_url = ''
  WHERE original_image_url IS NULL;

-- ── 4. Add missing rooms columns ──────────────────────────────────────────────
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS style_blend JSONB,
  ADD COLUMN IF NOT EXISTS budget INTEGER DEFAULT 250000,
  ADD COLUMN IF NOT EXISTS latest_render_url TEXT,
  ADD COLUMN IF NOT EXISTS render_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- ── 5. Add rooms.status CHECK constraint ──────────────────────────────────────
-- Only add if it doesn't already exist (idempotent).
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

-- ── 6. Create increment_rooms_render_count RPC ────────────────────────────────
-- Atomically increments render_count to avoid TOCTOU race conditions.
CREATE OR REPLACE FUNCTION public.increment_rooms_render_count(room_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.rooms SET render_count = render_count + 1 WHERE id = room_id;
$$;
