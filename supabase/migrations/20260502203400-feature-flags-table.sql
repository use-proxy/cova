-- P01a M1 step 5 — feature_flags table. NO rows seeded here. P01b seeds auth flags. Phase 5+ adds more.

CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  percent_rollout int NOT NULL DEFAULT 0 CHECK (percent_rollout BETWEEN 0 AND 100),
  environment text NOT NULL CHECK (environment IN ('development','preview','production','all')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feature_flags_key_idx ON feature_flags(key);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY p1_feature_flags_read_all ON feature_flags FOR SELECT USING (true);
-- Writes: service-role-only (no INSERT/UPDATE/DELETE policy).
