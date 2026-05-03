# P01a pre-verifier check

Generated: 2026-05-02 (read-only audit; no code changes, no migrations applied)
Source: `supabase/migrations/20260502203200-drop-dead-tables.sql` + handoff `07-P01a-…-applied.md` + back-bug files.

The 17 dropped tables (M3, applied 2026-05-02 per handoff §40 step 3):

```
cart_items, click_events, furniture_placements, jobs, votes, listings,
product_impressions, product_interactions, style_purchase_signals,
rate_limit_events, render_comparison_pairs, chat_sessions,
token_transactions, render_retries, render_rate_limits,
anchor_renders, user_style_profiles
```

Search scope per task brief: `apps/web/`, `supabase/functions/`, `scripts/`,
excluding `_archive/**`, `docs/**`, `cova-plan/**`. Hits in `node_modules/`
and `.next/` (build artifacts) are excluded as obvious noise. Hits in
`apps/web/coverage/` (Vitest coverage HTML) are excluded as build artifacts.

## 1. Dropped table runtime check

| Table | Match count | Classification | Files |
|---|---|---|---|
| cart_items | 3 | cosmetic | `apps/web/lib/types/supabase.ts` (auto-gen type defs only) |
| click_events | 4 | cosmetic | `apps/web/lib/types/supabase.ts` only |
| furniture_placements | 4 | cosmetic | `apps/web/lib/types/supabase.ts` (3) + `supabase/functions/delete-account/index.ts:46-49` (commented-out delete; redeploy already shipped) |
| jobs | 1 | cosmetic | `apps/web/lib/types/supabase.ts:413` only (no `.from('jobs')` in any active path; word `jobs` otherwise occurs only in node_modules excluded above) |
| votes | 1 | cosmetic | `apps/web/lib/types/supabase.ts:2183` only |
| listings | 3 | cosmetic | `apps/web/lib/types/supabase.ts` (2 type/FK refs) + `apps/web/lib/ai/matchUtils.ts:196` (English-word comment "near-duplicate listings"; not a table reference) |
| product_impressions | 9 | cosmetic + test | `apps/web/lib/types/supabase.ts` (3) + `apps/web/lib/db/migrations/001_style_data_moat.sql` (legacy CREATE TABLE; not executed at runtime) + `apps/web/tests/security/rls-negative.test.ts` (2 — RLS test, will fail post-drop with "relation does not exist") |
| product_interactions | 12 | **RUNTIME REF** (deployed Edge Function, cron-unscheduled) | `supabase/functions/aggregate-style-profiles/index.ts` — 6 live `.from('product_interactions')` calls (lines 130, 137, 151, 169, 190, 236) in a deployed-but-cron-unscheduled function + types (3) + migrations/001 (5) + tests (2) |
| style_purchase_signals | 9 | **RUNTIME REF** (deployed Edge Function, cron-unscheduled) | `supabase/functions/aggregate-style-profiles/index.ts:261, 271` — 2 live `.from('style_purchase_signals')` calls (SELECT + INSERT) + types (3) + migrations/001 (4) + tests (2) |
| rate_limit_events | 2 | cosmetic | `apps/web/lib/types/supabase.ts` only |
| render_comparison_pairs | 2 | cosmetic | `apps/web/lib/types/supabase.ts` only |
| chat_sessions | 4 | cosmetic | `apps/web/lib/types/supabase.ts` only |
| token_transactions | 7 | **RUNTIME REF** (deployed Edge Function, marked DEPRECATED) | `supabase/functions/render-room/index.ts:623` — 1 live `.from('token_transactions')` call in deployed function (header line 1: "DEPRECATED 2026-05-02 — V1 demolition") + `supabase/functions/delete-account/index.ts:55-57` (commented) + types (2) + tests (3) |
| render_retries | 1 | cosmetic | `apps/web/lib/types/supabase.ts:1106` only |
| render_rate_limits | 1 | cosmetic | `apps/web/lib/types/supabase.ts:1085` only |
| anchor_renders | 3 | **RUNTIME REF** (deployed Edge Function, marked DEPRECATED) | `supabase/functions/render-room/index.ts:469` — 1 live `.from('anchor_renders')` call + `apps/web/lib/types/supabase.ts:17` (type def) |
| user_style_profiles | 6 | **RUNTIME REF** (deployed Edge Function, cron-unscheduled) | `supabase/functions/aggregate-style-profiles/index.ts:213` — 1 live `.from('user_style_profiles')` upsert + types (1) + migrations/001 (4) |

**RUNTIME BUGS found: 5 tables, in 2 deployed Edge Functions**

- `supabase/functions/aggregate-style-profiles/index.ts` references 3 of the dropped tables (`product_interactions`, `style_purchase_signals`, `user_style_profiles`). Per handoff §40 step 3 the cron job that invoked this was unscheduled via `cron.unschedule('aggregate-style-profiles')`, so the function will not auto-fire — but the Edge Function itself remains deployed and any direct invocation would fail at the PG layer with `relation "<table>" does not exist`.
- `supabase/functions/render-room/index.ts` references 2 of the dropped tables (`anchor_renders`, `token_transactions`) at lines 469 + 623 in a function whose own header (line 1) declares `DEPRECATED 2026-05-02 — V1 demolition`. Per Rule 12 it is a frozen Edge Function. No active `apps/web/` route invokes it (grep returns only `scripts/test-render-e2e.ts` + `scripts/deploy-all.sh`); but it remains deployed and any invocation would fail.

The remaining 12 tables have **zero** runtime references — only auto-generated type defs (`apps/web/lib/types/supabase.ts`, queued for regeneration per handoff §85), legacy migration files (`apps/web/lib/db/migrations/001_style_data_moat.sql`), comments, and RLS test cases. None of these execute at production request time.

Latent test debt (out of scope for runtime classification but worth flagging): `apps/web/tests/security/rls-negative.test.ts` queries 4 dropped tables (`product_impressions`, `product_interactions`, `style_purchase_signals`, `token_transactions`); these test cases will return `relation does not exist` post-drop and need to be updated or skipped.

## 2. Back-bug deferral analysis

### P01a-m2-m4-active-refs.md

- **Deferral target:** explicit. Header line 4: *"Owner of fix: P01a session 3 (or the next executor cycle that owns code surgery)"*. Body recommendation §1 names two named alternatives — *(a)* tighten M2 to the truly-dead subset and defer load-bearing column drops "to the phase that owns their replacement (likely P02 quiz/capture refactor or P3 pipeline reliability)" or *(b)* surge code-surgery in P01a remediation. Recommendation is *(a)*.
- **Closes P01a with outstanding:** **ambiguous (lean: yes).** The back-bug never explicitly states "P01a may close with M2 + M4 unresolved", but every indicator points that way: (i) named owner is "P01a session 3 OR the next executor cycle", (ii) §Status of safe siblings table marks M1/M3/M5/M6 as APPLIED while M2/M4 are HALTED — i.e., the back-bug accepts the safe-subset as a legitimate landing point, (iii) the recommended fix sequence pushes load-bearing drops to P02/P3. Verifier note: handoff §3 (cursor for next session) explicitly says "fire verifier session 1 now [on the SAFE SUBSET] … then a remediation executor closes the M2/M4/paidCall/redactor work as round 2", which is the operational reading of this back-bug.

### P01a-eslint-rule-severity-pending-cleanup.md

- **Deferral target:** explicit. Header line 4: *"Owner of fix: progressive cleanup over P02–P04 sessions"*. §Suggested upgrade path names two ordered tasks — finish 15 paidCall site migrations first, then sweep 267 `no-unsafe-console` violations — and only flips the rule severity back to "error" once each count hits 0.
- **Closes P01a with outstanding:** **yes (explicit).** §Current state line 20 says the rules are *"temporarily downgraded to 'warn' in `apps/web/.eslintrc.json` so the production build does not fail before the cleanup lands. Lint exits 0; warnings still surface so cleanup is visible in CI."* The downgrade is the deliverable; the cleanup belongs to P02–P04. The "Verifier evidence" footer points at `eslint.log` and `build.log` showing 282 warnings + 0 errors — i.e., this is the intended end-state for P01a closure.

## 3. empty_room_cache classification

- **User-scoped or global:** **GLOBAL CACHE — shared across users.** Evidence:
  - Schema (`supabase/migrations/20260421000000_empty_room_v3_retry_cache.sql:47-58`): columns are `id, input_hash UNIQUE, empty_room_url, quality_warning, residual_items, pipeline_path, pipeline_version, cost_usd, created_at, expires_at`. **No `user_id` column.** The unique key is `input_hash`, computed from `(image_url, preprocessing_params, pipeline_version)`.
  - Schema comment (line 67-68): *"Cache is read/written via service-role only. No user-facing policy; the render routes call through admin client and return the cached URL."*
  - Caller (`apps/web/app/api/render/empty-room/route.ts:91`): uses `createAdminSupabaseClient()` (service role) for both the cache `select` (line 95-102) and `upsert` (line 198-209). Lookup keys on `input_hash` only — no user filter possible because the column doesn't exist.
  - M6 RLS-consolidation deviation (handoff §44 step 5): planner's `p1_empty_room_cache_self_read` policy was SKIPPED specifically because *"the table is keyed by `input_hash` not `user_id` (cache is shared across users; service-role-only reads, deny-by-default RLS = correct posture)"*. RLS test for this case was patched to `it.skip(...)` at `apps/web/tests/rls/two-user-isolation.test.ts:159`.

- **Currently returning empty due to RLS: no.** RLS is enabled on the table (`migrations/20260421000000_…sql:65` + `migrations/20260502203500-rls-consolidation.sql:63`) with **no SELECT/INSERT/UPDATE policies defined**, so deny-by-default applies for any non-service-role client. However, the only caller is `app/api/render/empty-room/route.ts` and it uses the admin (service-role) client, which **bypasses RLS entirely**. Cache lookups therefore work as designed — they return cached rows when `input_hash` matches and `expires_at > now()`, or `null` on cache miss. Empty results are cache misses, not RLS denials.
