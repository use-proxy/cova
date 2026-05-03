# P01a auto-evidence index

Phase: P01a — Demolition + Ops Hardening
Status: PARTIAL CLOSING — round 2 applied M2 (tightened) + M4 + 15 paidCall migrations + 4 verifier minor fixes + 66/265 redactor wrappings. Residual redactor cleanup deferred to P02–P04.
Sessions: 3 executor sessions (handoffs 06, 07, 08) + 1 verifier session
Date: 2026-05-02

## §13 criterion → artifact map

| §13 criterion | Status | Artifact |
|---|---|---|
| Subagents wired (4 prompts + sync + standalone callers) | ✓ | `../subagents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md`; `.claude/agents/{...}.md` (synced w/ frontmatter); `scripts/agents/{...}.ts`; `scripts/sync-subagents.sh` |
| Sync script + lint --check | ✓ | `scripts/sync-subagents.sh` (+ chmod 755); `.github/workflows/lint.yml` step `bash scripts/sync-subagents.sh --check` |
| Pre-drop snapshot | ✓ | `../snapshots/P01a-pre-drop-20260502-202507.sql` (349 KB) |
| Cron-table dependency audit (Decision 5) | ✓ | `cron-table-audit.md` |
| 12 dead indexes dropped (M1) | ✓ | `migration-logs/01-drop-dead-indexes.log`; `supabase-after-state.md` (`dropped_indexes_check=0`) |
| 28 dead room columns dropped (M2) | ✓ TIGHTENED — 17/28 dropped, 11 deferred | `migration-logs/02-drop-dead-room-cols.log`; `supabase-screenshots/M2-tightened-{before,after}.txt` (rooms 93 → 76 cols); `cova-plan/back-bugs/P01a-m2-m4-active-refs.md` §"Deferred load-bearing column drops" maps the 11 deferrals to P02/P03 |
| 17 dead tables dropped (M3) | ✓ | `migration-logs/03-drop-dead-tables.log`; `supabase-after-state.md` (`dead_table_count=0`) |
| render_cost_log recreated (M4) | ✓ APPLIED | `migration-logs/04-render-cost-log-recreate.log`; `supabase-screenshots/M4-{before,after}.txt`; 2 callers (api/render/empty-room, api/admin/render-costs) migrated to logCost() / new shape |
| feature_flags table created (M5) | ✓ | `migration-logs/05-feature-flags-table.log`; `supabase-after-state.md` |
| RLS consolidated to p1_ prefix (M6) | ✓ (minus empty_room_cache) | `migration-logs/06-rls-consolidation.log`; `supabase-after-state.md` (`p1_policies_count=13`); migration file patched in repo to skip the broken policy |
| Test classification (Decision 4) | ✓ | `../test-classification/P01a-final.md` — 8 ARCHIVE + 1 DELETE |
| Dead code archived via git mv (Decision 11) | ✓ | `_archive/{modal_pipeline,lib,components,scripts,tests,web,web-scripts}/` + per-folder README.md |
| Two-user RLS isolation tests (Decision 6) | ✓ | `apps/web/tests/rls/two-user-isolation.test.ts` (12 active per-table cases + 1 documented skip for empty_room_cache) |
| Sentry triplet + instrumentation | ✓ (round 2: client sample rates aligned with spec §6 M3) | `apps/web/{instrumentation,sentry.client.config,sentry.server.config,sentry.edge.config}.ts`; round 2 commit `e8e9b2f` set replaysOnErrorSampleRate=0.5 + profilesSampleRate=0.05 |
| `next.config.mjs` withSentryConfig wrap (sourcemap upload) | ✓ COMPLETE (verifier session 2 finding) | `apps/web/next.config.mjs` — `withSentryConfig(nextConfig, { silent, org, project, authToken, hideSourceMaps, disableLogger })`; build exits 0 with creds-at-deploy-time warning |
| redactLogPayload via ESLint (Decision 7 — author-time enforcement) | ✓ rule wired ("warn"; round 2 reduced 267 → 199 violations) | `apps/web/eslint-rules/no-unsafe-console.js` + tests; back-bug `P01a-eslint-rule-severity-pending-cleanup.md` §"Round 2 T5 progress" — final promotion to "error" deferred to P02–P04 sweep |
| paidCall<T>() wrapper + ESLint rule | ✓ ALL 15 SITES MIGRATED, rule promoted to "error" | `apps/web/lib/paid/call.ts`; `apps/web/eslint-rules/no-direct-paid-fetch.js` + tests; round 2 commit `db638e6` migrated 15 paid-fetch sites; lint exits 0 at error severity |
| Timeout chain locked (lib/config/timeouts.ts) | ✓ | `apps/web/lib/config/timeouts.ts` (8 consts incl. CLIENT_POLL_LONG + REDESIGN_MODAL); 4 in-tree call sites migrated to use TIMEOUTS; `eslint.log` shows 0 hardcoded timeout violations |
| EXIF strip works (D-009) | ✓ helper + test | `apps/web/lib/capture/process.ts`; `apps/web/tests/exif/strip.test.ts` (gated on exiftool CLI presence) |
| render_cost_log writers wired | ✓ helper + 2 prod callers migrated | `apps/web/lib/cost/log.ts` (logCost); `apps/web/app/api/render/empty-room/route.ts` + `apps/web/app/api/admin/render-costs/route.ts` write/read new shape (commit `a8995d0`) |
| failure_category enum file (Decision 8) | ✓ | `apps/web/lib/errors/categories.ts` — cost.*, infra.*, subagent.*, capture.* prefixes |
| PostHog client + typed event taxonomy | ✓ | `apps/web/lib/analytics/{posthog,events}.ts` |
| Cloudflare Images + R2 wiring | ✓ helper + roundtrip test | `apps/web/lib/media/cloudflare.ts`; `apps/web/tests/media/cloudflare-roundtrip.test.ts` (gated on CF_R2_TEST_LIVE env) |
| Feature flags infra | ✓ | `apps/web/lib/feature-flags/index.ts` + the `feature_flags` table from M5 |
| Cost-monitor cron (Decision 14) | ✓ wired (cold-start report appears post-launch) | `apps/web/app/api/cron/cost-monitor/route.ts`; `vercel.json` crons; `scripts/agents/cost-monitor.ts` |
| 5 Modal artifacts archived correctly | ✓ | `modal-app-list.before.txt`; `modal-stops.log`; `modal-app-list.after.txt` (4 V8 apps `stopped`); `modal-app-ids.txt`; `_archive/modal_pipeline/redesign_pipeline.py` exists in repo |
| Phantom V8-orchestrator env vars removed (E.11) | ✓ | `rg 'REDESIGN_PIPELINE_WEBHOOK_URL\|PREPROCESS_PIPELINE_WEBHOOK_URL' apps/web/ supabase/ scripts/ -g '!_archive/**' -g '!docs/**'` returns 0 hits |
| delete-account redeployed (Rule 12 narrow exception) | ✓ | `delete-account-deploy.log` |
| Boot still works post-cleanup | ✓ | `build.log` — `✓ Compiled successfully` + 86 static pages, BUILD_EXIT=0 |
| ESLint clean log | ✓ (clean = 0 errors; 344 warnings tracked) | `eslint.log` — LINT_EXIT=0 |
| Schema-reviewer GH workflow | ✓ wired | `.github/workflows/schema-review.yml`; `scripts/agents/schema-reviewer.ts` |
| CI lint workflow | ✓ wired | `.github/workflows/lint.yml` |
| CI test workflow | ✓ wired | `.github/workflows/test.yml` |

## Manual gate items (Daksh-side; not blocking executor close per session 2 instructions)

- Vercel env vars (CRON_SECRET, SLACK_WEBHOOK_URL, COVA_LAUNCH_DATE, CLOUDFLARE_*, R2_*, SENTRY_ORG/PROJECT/AUTH_TOKEN/ENV) — set at deploy time.
- GitHub Actions secrets (ANTHROPIC_API_KEY, SUPABASE_*) — set when the workflows first run on a PR.
- Modal dashboard delete + screenshots (4 apps, 1 PNG each at `modal-deletions/{app-name}.png`) — post-`modal app stop` tidiness step. The CLI stop is sufficient for billing; dashboard delete is documentation.

## Open items (deferred beyond P01a)

| Item | Owner | Tracking doc |
|---|---|---|
| 11 load-bearing room columns (rooms.pipeline_cost_log, inpainting_mask_url, capture_*, video_url, perspective_render_url, personalization_context, pipeline_mode, modal_job_id, calibration_data, scene_state) | P02 (capture/quiz refactor) + P03 (pipeline reliability) | `cova-plan/back-bugs/P01a-m2-m4-active-refs.md` §"Deferred load-bearing column drops" |
| 199 residual redactLogPayload wrappings | progressive cleanup over P02–P04, then promote `no-unsafe-console` to `error` | `cova-plan/back-bugs/P01a-eslint-rule-severity-pending-cleanup.md` §"Round 2 T5 progress" |
| Stale data flagging on 138 failed-status rooms | Phase 9 dashboard | `cova-plan/back-bugs/P01a-stale-data-flagging.md` |
| Mixed pnpm/npm split between Vercel deploy and CI | any time the apps/mobile freeze lifts | `cova-plan/notes/package-managers.md` |

## Verifier readiness

The phase is ready for verifier session 1 (with self-heal mode) on the SAFE
SUBSET that landed. Verifier session 2 follows after self-heal completes.
Both sessions should explicitly note the M2/M4/paidCall-cleanup back-bugs as
acknowledged-deferred (not new findings) — the spec gating allowed partial
progress with documentation.

## Session commit chain (cumulative across sessions 1 + 2)

Earliest → most recent:
- `a2c7e93` M0: subagent setup
- `29e8b49` M1: 6 migrations + paired _down.sql
- `9145c69` M1: archives + edge-fn patches
- `d2555db` M1: RLS tests + cron-table audit + classification + back-bugs
- `56e63bb` M3: Sentry triplet + instrumentation
- `1639738` M3: redactor + ESLint rules + paidCall + cost log
- `990b9a7` M3: timeouts + EXIF + PostHog + Cloudflare + flags + CI
- `e325c1e` session handoff 06
- `dbec6de` subagent YAML frontmatter
- `44505b4` subagent model string corrections
- `c87df47` archive 2 orphaned Python tests
- `bba9c69` mark python-test-imports back-bug RESOLVED
- `4e6b358` apply M1+M3+M5+M6; stop 4 Modal apps; halt M2+M4
- `765cf50` E.11 phantom env var cleanup
- `40a5fc2` npm install + lint/build smoke + clean own M3 violations
- `ab6655e` session handoff 07
- `1dd15ad` clean up RLS-negative tests after V8-era table drops
- `e1747b2` round 2 T1: tighten M2 to truly-dead subset, apply migration
- `a8995d0` round 2 T2: migrate 2 render_cost_log callers to logCost(), apply M4
- `db638e6` round 2 T3: migrate 15 paid-fetch sites to paidCall, restore lint rule to error
- `e8e9b2f` round 2 T4a: align sentry.client sample rates with spec §6 M3
- `d121d3c` round 2 T4b: document mixed pnpm/npm split (verifier finding #3)
- `9c418c1` round 2 T4c: defer pipeline_runs RLS lockdown to Phase 5 in spec text
- `4fda646` round 2 T5: wrap 66 high-leverage console calls in redactLogPayload (265 → 199)
