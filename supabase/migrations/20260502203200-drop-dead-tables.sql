-- P01a M1 step 3 — drop 17 dead tables (all 0 rows except anchor_renders=10).
-- Cross-reference: docs/audit/SCHEMA_AUDIT.md §11.1.
-- Decision 5 gating: cron-table dependency audit passed at cova-plan/auto-evidence/P01a/cron-table-audit.md.
-- Frozen Edge Function dependencies handled before this migration applies.

DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS click_events CASCADE;
DROP TABLE IF EXISTS furniture_placements CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS votes CASCADE;            -- depends on listings; drop first
DROP TABLE IF EXISTS listings CASCADE;
DROP TABLE IF EXISTS product_impressions CASCADE;
DROP TABLE IF EXISTS product_interactions CASCADE;
DROP TABLE IF EXISTS style_purchase_signals CASCADE;
DROP TABLE IF EXISTS rate_limit_events CASCADE;
DROP TABLE IF EXISTS render_comparison_pairs CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS token_transactions CASCADE;
DROP TABLE IF EXISTS render_retries CASCADE;
DROP TABLE IF EXISTS render_rate_limits CASCADE;
DROP TABLE IF EXISTS anchor_renders CASCADE;   -- 10 rows; legacy step-2 data
DROP TABLE IF EXISTS user_style_profiles CASCADE;

-- Drop the now-orphan cron job that called the aggregate-style-profiles edge fn.
DELETE FROM cron.job WHERE jobname = 'aggregate-style-profiles';

-- Drop the now-orphan deduct_tokens_atomic function (token system disabled per D-019).
DROP FUNCTION IF EXISTS public.deduct_tokens_atomic(uuid, int, text, uuid);
