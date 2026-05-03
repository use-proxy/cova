# Supabase after-state probe — P01a M1 (partial)

Date: 2026-05-02
Project: xdeacbmkdwqrwxonqaqh
Applied migrations: M1 (drop-dead-indexes), M3 (drop-dead-tables), M5 (feature-flags-table), M6 (rls-consolidation, partial — see notes).
Halted migrations: M2 (drop-dead-room-cols), M4 (render_cost_log-recreate). See `cova-plan/back-bugs/P01a-m2-m4-active-refs.md`.

## SQL probe (live, post-apply)

| Probe | Value | Expected | Status |
|---|---|---|---|
| `rooms` column count | 93 | 65 (after M2) | M2 halted, no change ⚠️ |
| Dead-table candidate count | 0 | 0 | ✓ M3 applied |
| `feature_flags` exists | 1 | 1 | ✓ M5 applied |
| `render_cost_log` exists | 1 | 1 (with new shape) | M4 halted; OLD shape persists ⚠️ |
| `p1_*` policies count | 13 | 13 | ✓ M6 applied (minus empty_room_cache) |
| Dropped indexes still present | 0 | 0 | ✓ M1 applied |
| `aggregate-style-profiles` cron job | 0 | 0 | ✓ unscheduled via cron.unschedule() |
| `deduct_tokens_atomic` function | 0 | 0 | ✓ M3 dropped |

## Schema deltas confirmed via `mcp__supabase__execute_sql`

```sql
-- Dead-table count (must be 0)
SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN
  ('cart_items','click_events','furniture_placements','jobs','listings','votes',
   'product_impressions','product_interactions','style_purchase_signals',
   'rate_limit_events','render_comparison_pairs','chat_sessions',
   'token_transactions','render_retries','render_rate_limits',
   'anchor_renders','user_style_profiles');
-- → 0
```

```sql
-- p1_ policy count
SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'p1\_%' ESCAPE '\';
-- → 13
```

## Notes on partial application

### M6 — empty_room_cache policy SKIPPED
`empty_room_cache` table has no `user_id` column; cache is keyed by
`input_hash` (shared across users). Service-role-only reads via admin
client suffice. RLS enabled (deny by default) is the correct posture.
Migration file patched in repo to reflect actual application.

### M3 — cron.job DELETE replaced with cron.unschedule()
`DELETE FROM cron.job` denied for `postgres` role on Supabase-hosted
projects. Used `cron.unschedule('aggregate-style-profiles')` instead.
Migration file patched in repo for re-run idempotency.

### M2 + M4 — HALTED with active-refs back-bug
See `cova-plan/back-bugs/P01a-m2-m4-active-refs.md`. ~15 production
routes reference the columns M2 would drop; 2 production routes use
the OLD `render_cost_log` shape that M4 would recreate. Code surgery
required before retry.
