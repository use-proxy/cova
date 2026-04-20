-- Phase 1 Task 1.4 — sam_embeddings cache table.
-- Stores SAM 2 image-encoder embeddings so the Phase 8 refinement screen
-- can do tap-to-SAM mask generation client-side without re-encoding.
--
-- Sizing: embedding blobs must be <= 2 MiB per research §10 acceptance.
-- TTL: 30 days per research §8.2. Cleanup is deferred (cron/edge job
-- out of Phase 1 scope — rows past expires_at are ignored on read).
--
-- RLS: user_id-scoped for SELECT / INSERT / UPDATE / DELETE. No cross-user
-- access. Service role bypasses RLS as usual.
--
-- Safe to apply multiple times (IF NOT EXISTS / CREATE POLICY IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS sam_embeddings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  image_hash  text NOT NULL,
  embedding   bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),

  -- Guardrail: reject writes that would exceed the 2 MiB acceptance cap.
  CONSTRAINT sam_embeddings_size_cap CHECK (octet_length(embedding) <= 2097152),

  -- One embedding per (user, image) — a re-encode simply upserts.
  CONSTRAINT sam_embeddings_user_hash_uniq UNIQUE (user_id, image_hash)
);

-- Query patterns we expect:
--   * lookup by (user_id, image_hash) — covered by the unique constraint.
--   * TTL sweep — (user_id, expires_at) for per-user cleanup.
--   * Global TTL sweep on expires_at alone.
CREATE INDEX IF NOT EXISTS sam_embeddings_user_expires_idx
  ON sam_embeddings (user_id, expires_at);

CREATE INDEX IF NOT EXISTS sam_embeddings_expires_idx
  ON sam_embeddings (expires_at);

ALTER TABLE sam_embeddings ENABLE ROW LEVEL SECURITY;

-- Single ALL policy is sufficient: SELECT / INSERT / UPDATE / DELETE all
-- gate on auth.uid() = user_id. Matches the pattern used on rooms,
-- saved_products, swipe_history, etc.
DROP POLICY IF EXISTS "sam_embeddings_own" ON sam_embeddings;
CREATE POLICY "sam_embeddings_own"
  ON sam_embeddings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE sam_embeddings IS
  'Phase 1 — SAM 2 image-encoder embedding cache. RLS-scoped by user_id. 30-day TTL.';
COMMENT ON COLUMN sam_embeddings.embedding IS
  'SAM 2 hiera-large encoder output, packed/quantized. Hard-capped at 2 MiB.';
COMMENT ON COLUMN sam_embeddings.image_hash IS
  'SHA-256 of the source image bytes; unique per user.';
