-- P01b — account_deletions audit table.
-- Service-role-only access (RLS enabled, no policies).
-- 30-day audit-row retention; nightly cron at /api/cron/purge-deletion-audit.

CREATE TABLE IF NOT EXISTS account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_user_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deletion_reason text CHECK (deletion_reason IN ('user_initiated','admin_initiated','gdpr_request','ccpa_request')),
  audit_retention_days int NOT NULL DEFAULT 30
);

CREATE INDEX IF NOT EXISTS account_deletions_deleted_at_idx ON account_deletions(deleted_at DESC);

ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access (consistent with P01a pattern for pipeline_runs).
