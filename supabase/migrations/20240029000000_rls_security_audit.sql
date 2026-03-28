-- ═══════════════════════════════════════════════════════════════════
-- Migration: RLS Security Audit + Rate Limiting
-- Ensures every table has proper RLS and adds rate_limits table.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Verify RLS enabled on all tables ──

-- Already enabled from prior migrations: users, token_transactions, rooms,
-- renders, chat_sessions, products, listings, votes, jobs, chat_messages,
-- furniture_placements, cart_items, swipe_cards, anchor_renders.
-- Re-running ENABLE is idempotent (no-op if already enabled).

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.furniture_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- ── 2. Tighten products table — public SELECT, service-role-only writes ──

-- DROP existing write policies if they accidentally allow user writes
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;

-- Service-role-only write policies (authenticated users cannot write)
CREATE POLICY "products_service_insert" ON public.products
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "products_service_update" ON public.products
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "products_service_delete" ON public.products
  FOR DELETE USING (auth.role() = 'service_role');

-- ── 3. Tighten swipe_cards — public SELECT, service-role-only writes ──

DROP POLICY IF EXISTS "swipe_cards_insert" ON public.swipe_cards;
DROP POLICY IF EXISTS "swipe_cards_update" ON public.swipe_cards;
DROP POLICY IF EXISTS "swipe_cards_delete" ON public.swipe_cards;

CREATE POLICY "swipe_cards_service_insert" ON public.swipe_cards
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "swipe_cards_service_update" ON public.swipe_cards
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "swipe_cards_service_delete" ON public.swipe_cards
  FOR DELETE USING (auth.role() = 'service_role');

-- ── 4. Rate limits table ──

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,           -- 'render' or 'chat'
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, action, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write rate limits (edge functions use service role)
CREATE POLICY "rate_limits_service_only" ON public.rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON public.rate_limits (user_id, action, window_start);

-- Helper function: check and increment rate limit
-- Returns TRUE if within limit, FALSE if exceeded.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_requests INTEGER,
  p_window_minutes INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := date_trunc('hour', now());

  -- Try to get current count
  SELECT request_count INTO v_count
  FROM public.rate_limits
  WHERE user_id = p_user_id
    AND action = p_action
    AND window_start = v_window_start;

  IF NOT FOUND THEN
    -- First request in this window
    INSERT INTO public.rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, v_window_start, 1)
    ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET request_count = public.rate_limits.request_count + 1
    RETURNING request_count INTO v_count;
  ELSE
    IF v_count >= p_max_requests THEN
      RETURN FALSE;
    END IF;
    UPDATE public.rate_limits
    SET request_count = request_count + 1
    WHERE user_id = p_user_id
      AND action = p_action
      AND window_start = v_window_start;
    v_count := v_count + 1;
  END IF;

  RETURN v_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up old rate limit rows (older than 2 hours)
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
