-- P01a M1 step 4 — drop and recreate render_cost_log to match V1 spec (D-022: category is text NOT NULL).
-- Live schema diverges from spec; verified zero rows at execute time.

DROP TABLE IF EXISTS render_cost_log CASCADE;

CREATE TABLE render_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  render_id uuid,
  category text NOT NULL,        -- D-022: text not enum; validated as TS union app-side at apps/web/lib/cost/categories.ts
  stage text,
  cost_usd numeric(8,4) NOT NULL,
  model text,
  duration_ms int,
  failure_category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX render_cost_log_user_idx ON render_cost_log(user_id);
CREATE INDEX render_cost_log_render_idx ON render_cost_log(render_id);
CREATE INDEX render_cost_log_category_idx ON render_cost_log(category);
CREATE INDEX render_cost_log_created_idx ON render_cost_log(created_at DESC);

ALTER TABLE render_cost_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY p1_render_cost_log_self_read ON render_cost_log FOR SELECT USING (auth.uid() = user_id);
-- Service-role-only writes (no INSERT/UPDATE/DELETE policy — RLS denies all by default).
