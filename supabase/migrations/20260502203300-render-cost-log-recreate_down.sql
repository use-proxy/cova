-- Reverse step 4. Restore prior shape from snapshot.
DROP TABLE IF EXISTS render_cost_log CASCADE;

CREATE TABLE render_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pipeline_version text NOT NULL,
  is_retry boolean NOT NULL DEFAULT false,
  retry_type text,
  cost_usd numeric NOT NULL,
  tokens_charged integer NOT NULL DEFAULT 0,
  cache_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_render_cost_log_pipeline_date ON render_cost_log(pipeline_version, created_at);
CREATE INDEX idx_render_cost_log_user_date ON render_cost_log(user_id, created_at);
ALTER TABLE render_cost_log ENABLE ROW LEVEL SECURITY;
