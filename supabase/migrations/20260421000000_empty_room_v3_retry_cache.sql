-- Empty-room V3 pipeline support: retry tracking, cache, rate limiting, cost log.
--
-- Rationale (from spec):
--   - 1 free retry per original render, then 2 tokens per paid retry, max 5 paid,
--     max 5 total retries per user per hour
--   - Empty-room cache (Base Variation pattern) keyed on input_hash, 30-day TTL
--   - Internal cost visibility for V2 vs V3 comparison + retry revenue
--
-- Additive only — does not alter frozen tables. Idempotent via IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Per-render retry tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.render_retries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  original_render_id    uuid NOT NULL,
  free_retries_used     int  NOT NULL DEFAULT 0,
  paid_retries_used     int  NOT NULL DEFAULT 0,
  last_retry_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT render_retries_counts_nonneg
    CHECK (free_retries_used >= 0 AND paid_retries_used >= 0),
  CONSTRAINT render_retries_user_original_unique
    UNIQUE (user_id, original_render_id)
);

CREATE INDEX IF NOT EXISTS idx_render_retries_user_original
  ON public.render_retries(user_id, original_render_id);

ALTER TABLE public.render_retries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS render_retries_select_own ON public.render_retries;
CREATE POLICY render_retries_select_own
  ON public.render_retries FOR SELECT
  USING (auth.uid() = user_id);

-- Writes are service-role only (retry route uses admin client to bypass RLS for counters).
-- No INSERT/UPDATE policy for regular users.


-- ---------------------------------------------------------------------------
-- 2. Empty-room cache (Base Variation pattern)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.empty_room_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_hash        text NOT NULL UNIQUE,
  empty_room_url    text NOT NULL,
  quality_warning   boolean NOT NULL DEFAULT false,
  residual_items    jsonb NOT NULL DEFAULT '[]'::jsonb,
  pipeline_path     text,
  pipeline_version  text NOT NULL DEFAULT 'v3.0',
  cost_usd          numeric(10,4),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_empty_room_cache_input_hash
  ON public.empty_room_cache(input_hash);
CREATE INDEX IF NOT EXISTS idx_empty_room_cache_expires
  ON public.empty_room_cache(expires_at);

ALTER TABLE public.empty_room_cache ENABLE ROW LEVEL SECURITY;

-- Cache is read/written via service-role only. No user-facing policy;
-- the render routes call through admin client and return the cached URL.


-- ---------------------------------------------------------------------------
-- 3. Per-user retry rate limit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.render_rate_limits (
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  retries_last_hour   int NOT NULL DEFAULT 0,
  hour_start          timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.render_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS render_rate_limits_select_own ON public.render_rate_limits;
CREATE POLICY render_rate_limits_select_own
  ON public.render_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

-- Writes service-role only (retry route increments counters with admin client).


-- ---------------------------------------------------------------------------
-- 4. Internal cost log (service-role only, no user-facing read)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.render_cost_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id         uuid NOT NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pipeline_version  text NOT NULL,
  is_retry          boolean NOT NULL DEFAULT false,
  retry_type        text CHECK (retry_type IN ('free', 'paid') OR retry_type IS NULL),
  cost_usd          numeric(10,4) NOT NULL,
  tokens_charged    int NOT NULL DEFAULT 0,
  cache_hit         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_render_cost_log_user_date
  ON public.render_cost_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_render_cost_log_pipeline_date
  ON public.render_cost_log(pipeline_version, created_at);

ALTER TABLE public.render_cost_log ENABLE ROW LEVEL SECURITY;

-- No policies → all access is service-role only (bypasses RLS).
-- This is intentional: users should not see cost attribution.


-- ---------------------------------------------------------------------------
-- 5. Nightly cache-expiry helper (invoke from Supabase Edge Function cron)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_expired_empty_room_cache()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted int;
BEGIN
  DELETE FROM public.empty_room_cache WHERE expires_at < now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_expired_empty_room_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_expired_empty_room_cache() TO service_role;
