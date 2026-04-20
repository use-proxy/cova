# Phase 0 Migration Deploy — Summary

**Date:** 2026-04-19
**Target:** Production Supabase (xdeacbmkdwqrwxonqaqh)
**Method:** `psql` direct apply with per-migration gating + manual
`supabase_migrations.schema_migrations` tracking.

## Outcome

| # | Migration | Version | Status | Notes |
|---|---|---|---|---|
| 1 | ref_table_policies | 20260419000001 | ✅ APPLIED | 4 policies created (style_loras, style_vectors, app_config). 27/27 negative tests pass. |
| 2 | fix_hnsw_targeting | 20260419000003 | ✅ APPLIED | 3 old indexes dropped, 2 HNSW indexes created on products_v1. 27/27 negative tests pass. |
| 3 | lora_default_scales | 20260419000004 | ⏭️ DEFERRED | File moved to `_deferred/`. Column/value mismatch with prod schema. See follow-ups-deferred.md. |
| 4 | room_photos_storage_rls | 20260419000002 | ✅ APPLIED | `room_photos_own` ALL policy created. 27/27 negative tests pass. |
| 5 | enable_swipe_history_rls | 20260419000000 | ✅ APPLIED | RLS was already enabled + equivalent policy existed; applied anyway per plan (added redundant permissive policy, no behavior change). 27/27 negative tests pass. |

## Negative RLS tests

**27/27 pass after each of the 4 applied migrations.** Full test: `apps/web/tests/security/rls-negative.test.ts`.

## Smoke tests (after each migration)

- `SELECT COUNT(*) FROM rooms;` → **308** (stable)
- `SELECT COUNT(*) FROM swipe_history;` → **0**
- `SELECT COUNT(*) FROM style_loras;` → **1** (only `Warm & Grounded` / `cvwmn` trained so far)

## Migration-specific verification

- **Migration 1:** 4 policies present on style_loras (2) / style_vectors (1) / app_config (1). ✅
- **Migration 2:** `products_v1_clip_embedding_hnsw_idx` + `products_v1_fusion_embedding_hnsw_idx` indexes present. Old `products_clip_hnsw_idx`, `products_clip_embedding_idx`, `products_fusion_embedding_idx` dropped. ✅
- **Migration 4:** `storage.objects` policy `room_photos_own` (ALL, own-folder) present. ✅
- **Migration 5:** `swipe_history.relrowsecurity = true`. 2 permissive ALL policies exist (pre-existing `Users can manage own swipe history` + new `swipe_history_own`). ✅

## Orphan migration audit

A full audit of `supabase_migrations.schema_migrations` against local files surfaced four migrations applied to production but missing or mis-tracked locally:

| Production version | Name | Resolution |
|---|---|---|
| `20260413` | generation_seed | Already pulled in prior session at `supabase/migrations/20260413_generation_seed.sql` (filename matches version). No action. |
| `20260413000000` | anchor_round_images | Already pulled in prior session at `supabase/migrations/20260413000000_anchor_round_images.sql`. No action. |
| `20260413100000` | v3_schema | Originally applied via Supabase dashboard, never tracked. Local file existed at `20260413_v3_schema.sql` (wrong version string). **This session:** inserted tracking row into `schema_migrations` with version `20260413100000`, renamed local file to `20260413100000_v3_schema.sql`. Production state verified: `rooms.preprocessed_image_url`, `rooms.design_brief`, `rooms.flux_prompt` exist; `rooms.marble_*` columns dropped — confirming migration was applied. |
| `20260415000000` | phase1_foundation | Already pulled in prior session at `supabase/migrations/20260415000000_phase1_foundation.sql`. No action. |

A duplicate-pull artifact from the prior session (`20260413000000_generation_seed.sql` — wrong filename, redundant with the correctly-named `20260413_generation_seed.sql`) was deleted. Diff confirmed the two files differed only in comment headers; SQL was identical.

After this audit, every row in production `schema_migrations` has a corresponding local file with matching version string.

## Pause events

- **Migration 3 (lora_default_scales) — PAUSED then DEFERRED.**
  - Trigger: pre-deploy snapshot showed `style_loras` had 1 row (`Warm & Grounded` / `cvwmn` / 0.75); the migration's 10 `WHERE style_name = 'COVA<X>'` clauses would match 0 rows.
  - Investigation (read-only): confirmed production uses display names in `style_name` and keys lookups on `trigger_word`. Migration targets wrong column semantics.
  - Resolution: Option A chosen — migration file moved to `supabase/migrations/_deferred/` with header comment explaining rationale; follow-up tracked in [docs/phase-0/follow-ups-deferred.md](follow-ups-deferred.md).
  - No production writes made for this migration.

- **Migration 5 (enable_swipe_history_rls) — FLAGGED (not paused).**
  - Trigger: pre-deploy snapshot showed RLS already enabled and an equivalent policy (`Users can manage own swipe history`) already existed.
  - Decision: applied as written per plan; creates a redundant second permissive policy alongside the existing one. No security regression, no behavior change.

## Full TS test suite

- Pre-deploy baseline: 14 failures.
- Post-deploy (clean shell): **14 failed | 738 passed (752 total)**. Matches baseline exactly.
- No new failures, no migrations-caused improvements. An initial post-deploy run
  showed 13 failures, but that was an artifact of the shell having
  `apps/web/.env.local` sourced (needed for RLS negative tests) — which makes
  `tests/lib/env.test.ts > validateEnvironment` pass. Re-running in a clean
  shell reproduces the 14 baseline failures.

## Final `schema_migrations` head

After this deploy, `supabase_migrations.schema_migrations` contains (top 5):
- 20260419000003 | fix_hnsw_targeting
- 20260419000002 | room_photos_storage_rls
- 20260419000001 | ref_table_policies
- 20260419000000 | enable_swipe_history_rls
- 20260415000000 | phase1_foundation
- (20260419000004 lora_default_scales is intentionally absent — deferred)
