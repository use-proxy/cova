# Back-bug: P01a migrations M2 + M4 halted on active production references

Discovered: 2026-05-02 (P01a session 2 — destructive-action gate)
Owner of fix: P01a session 3 (or the next executor cycle that owns code surgery)

## What was halted

| Migration | What it does | Why halted |
|---|---|---|
| `20260502203100-drop-dead-room-cols.sql` (M2) | Drops 28 columns from `rooms` | ~15 production routes actively read/write the dropping columns. |
| `20260502203300-render-cost-log-recreate.sql` (M4) | Drops + recreates `render_cost_log` with V1-spec shape | 2 production routes use the OLD shape (`pipeline_version`, `is_retry`, `retry_type`, `tokens_charged`, `cache_hit`). |

## Active references — M2 (dropping rooms columns)

Pre-flight grep filter excluded `_archive/`, `_future/`, `tests/`, `docs/`,
`.claude/`, `lib/supabase/migrations/`, and verification scripts. Remaining
active production paths that read/write the 28 columns:

| File | Columns referenced | Risk |
|---|---|---|
| `apps/web/app/api/render/status/route.ts` | `pipeline_cost_log`, `inpainting_mask_url` (SELECT + UPDATE on multiple lines) | HIGH — V3 status polling |
| `apps/web/app/api/rooms/[roomId]/route.ts` | `personalization_context`, `capture_photo_urls`, `capture_mode`, `room_constraints`, etc. (in column list) | HIGH — room CRUD |
| `apps/web/app/api/pipeline/redesign/route.ts` | `personalization_context`, `perspective_render_url` (SELECT + UPDATE) | CRITICAL — V3 redesign pipeline |
| `apps/web/lib/ai/design-director.ts` | dropping cols (multiple) | HIGH — V3 director |
| `apps/web/app/design/step-8a/page.tsx` | dropping cols | MEDIUM — render-reveal UI |
| `apps/web/app/design/step-9/page.tsx` | dropping cols | MEDIUM — products UI |
| `apps/web/app/api/render/route.ts` | dropping cols | HIGH — render entry |
| `apps/web/app/api/parallax/route.ts` | dropping cols | MEDIUM |
| `apps/web/app/api/test-pipeline/route.ts` | dropping cols | LOW — being deleted in E.11 |
| `apps/web/app/api/detect/render/route.ts` | dropping cols | MEDIUM — detection |
| `apps/web/lib/ai/depth.ts` | dropping cols | MEDIUM |
| `apps/web/app/capture/[roomId]/page.tsx` | `video_url` and friends | HIGH — capture flow |
| `apps/web/app/api/rooms/status/route.ts` | dropping cols | HIGH — rooms status |
| `apps/web/app/api/render/from-context/route.ts` | dropping cols | HIGH — render entry |
| `apps/web/app/api/detect/status/route.ts` | dropping cols | MEDIUM — detection status |
| `apps/web/lib/types/supabase.ts` | dropping cols (auto-generated) | LOW — regenerate after migration |

## Active references — M4 (render_cost_log recreate)

Both write the legacy schema (`pipeline_version`, `is_retry`, `retry_type`,
`tokens_charged`, `cache_hit`). Migration would drop+recreate without these
columns; INSERTs would fail with `column "pipeline_version" of relation
"render_cost_log" does not exist`.

| File | Operation | Lines |
|---|---|---|
| `apps/web/app/api/render/empty-room/route.ts` | INSERT (2 sites) | 112, 212 |
| `apps/web/app/api/admin/render-costs/route.ts` | SELECT (1 site) | 57 |

## Suggested fix sequence

1. **Decide column scope.** Of the 28 cols M2 drops, some are clearly dead
   (e.g. `flythrough_*`, `plus_*`, `marble_*`, `splat_path`, `depth_*`).
   Others are still load-bearing in V3 (`pipeline_cost_log`,
   `inpainting_mask_url`, `personalization_context`, `capture_photo_urls`,
   `capture_mode`, `perspective_render_url`). Either:
   - **(a) Tighten M2** to only drop the truly dead subset; defer the load-bearing
     ones to a later phase that owns their replacement (likely P02 quiz/capture
     refactor or P3 pipeline reliability).
   - **(b) Surge code-surgery** in P01a remediation — replace each active
     reference with the new V9 shape, then apply the original 28-column M2.

   Recommendation: **(a) tighten M2**. The load-bearing columns are part of
   the active V3 pipeline; refactoring them belongs in their owning phase.

2. **For M4**, migrate the two callers:
   - `apps/web/app/api/render/empty-room/route.ts` lines 112 + 212: replace
     the INSERT with `paidCall<T>()` integration via the new `lib/cost/log.ts`
     `logCost()` helper using the new `category` field.
   - `apps/web/app/api/admin/render-costs/route.ts` line 57: replace the
     SELECT with the new shape (`category, cost_usd, model, stage,
     duration_ms, failure_category`).

   Then apply M4 (drop + recreate).

3. **Regenerate types** after M2 + M4 land:
   ```bash
   npx supabase gen types typescript --project-id xdeacbmkdwqrwxonqaqh > apps/web/lib/types/supabase.ts
   ```

## Blast radius if applied as-is

- M2: every V3 render request, every room CRUD, every redesign call would
  start failing at the PG layer with `ERROR: column "X" does not exist`.
  Production outage.
- M4: empty-room renders silently fail to log cost (cost telemetry blind
  spot); admin/render-costs route returns 500 on next call.

## Status of safe siblings

| Migration | Status |
|---|---|
| M1 (drop-dead-indexes) | ✓ APPLIED 2026-05-02 |
| M2 (drop-dead-room-cols) | ⏸ HALTED — this back-bug |
| M3 (drop-dead-tables) | ✓ APPLIED 2026-05-02 (post delete-account redeploy) |
| M4 (render_cost_log-recreate) | ⏸ HALTED — this back-bug |
| M5 (feature-flags-table) | ✓ APPLIED 2026-05-02 |
| M6 (rls-consolidation) | ✓ APPLIED 2026-05-02 (minus empty_room_cache policy — see schema mismatch note in `supabase-after-state.md`) |
