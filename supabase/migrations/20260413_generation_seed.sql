-- Session 5: generation_seed column for deterministic/reproducible renders
-- Safe to run multiple times (idempotent).

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS generation_seed INTEGER;

-- Index for fast lookup (useful if we ever query by seed for debugging)
CREATE INDEX IF NOT EXISTS rooms_generation_seed_idx ON rooms (generation_seed)
  WHERE generation_seed IS NOT NULL;

-- Verification query (uncomment to check after migration):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'rooms'
-- AND column_name = 'generation_seed';
