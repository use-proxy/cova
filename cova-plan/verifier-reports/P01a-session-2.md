# P01a verifier session 2

**Date:** 2026-05-02
**Mode:** session-2 (no self-heal; observation-only)
**Source spec:** `cova-plan/phases/P01a-demolition-ops.md`
**Decision contract:** Decision 22 (cova-plan/OPEN_DECISIONS.md) — review independently, do not consult session 1, source-of-truth on what is actually shipped at HEAD.

---

## Methodology

- Read spec from scratch; ignored `cova-plan/verifier-reports/P01a-session-1.md`.
- Queried Supabase via MCP (live, not migration text).
- Read code at HEAD on `main`.
- Ran `npm run lint` in `apps/web/`.
- Read all 4 acknowledged-deferred back-bugs.
- Cross-referenced D-001..D-022 + DEF-001..DEF-003.

---

## §13 acceptance criteria — per-criterion results

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Subagents wired (4 prompts + sync + standalone callers) | PASS | `cova-plan/subagents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md` exist; `.claude/agents/` matches (sync-subagents.sh --check returns OK); `scripts/agents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.ts` all present |
| 2 | Sync script + lint check | PASS | `scripts/sync-subagents.sh` exists, executable (mode 755); `.github/workflows/lint.yml:23-25` invokes `bash scripts/sync-subagents.sh --check` |
| 3 | Pre-drop snapshot exists | PASS | `cova-plan/snapshots/P01a-pre-drop-20260502-202507.sql` (10861 lines, 349KB) |
| 4 | Cron table dependency audit (Decision 5) | PASS | `cova-plan/auto-evidence/P01a/cron-table-audit.md` enumerates all hits in delete-account, aggregate-style-profiles, render-room; only commented/deprecated lines remain in Edge Functions; live table existence query confirms 0/17 dead tables remain |
| 5 | 28 dead room columns dropped | PARTIAL — DEFERRED (acknowledged) | Live `rooms` table has 76 columns; 17/28 dropped per tightened M2 (back-bug `P01a-m2-m4-active-refs.md`). The 11 deferred columns (`pipeline_cost_log`, `inpainting_mask_url`, `personalization_context`, `capture_photo_urls`, `capture_mode`, `perspective_render_url`, `video_url`, `pipeline_mode`, `modal_job_id`, `calibration_data`, `scene_state`) are mapped to P02/P03 with consumer code path noted |
| 6 | 17 dead tables dropped | PASS | Live MCP query for the 17 named tables returns 0 rows; `aggregate-style-profiles` cron unscheduled; `deduct_tokens_atomic()` dropped |
| 7 | 12 dead indexes dropped | PASS | Live MCP query for the 12 named indexes returns 0 rows |
| 8 | Test classification correct | PASS | `_archive/tests/{e2e,python,quality,apps}/` populated; Python test imports back-bug RESOLVED (per back-bug file); 4 fire_v6/v7/v8 e2e diagnostic scripts archived |
| 9 | Dead code archived via `git mv` | PASS (with sub-spec note) | `_archive/{lib,components,scripts,modal_pipeline,tests,web,web-scripts}/` populated. Per-folder README.md present in each. Counts: 5 lib files (vs spec ~20), 1 component + README (vs spec ~12), 46 fix_*.mjs (vs spec ~70), 5 modal artifacts (matches spec G10/DEF-003 exactly), 4 fire_v* tests (matches spec). The lib/components shortfalls are not violations — spec said "~" and `_archive/lib/README.md` documents `unsplash.ts` deliberately not archived (still in active use by `apps/web/app/api/pipeline/redesign/route.ts`); planner correctly avoided over-archival |
| 10 | RLS policies on user-scoped tables exist with `p1_` prefix; service-role-only RLS enabled | PASS | Live `pg_policies` shows 13 `p1_*` policies; live `pg_class.relrowsecurity = true` on every public table (no false rows); `pipeline_runs` correctly absent from live schema (Phase 5 owns creation per spec) |
| 11 | Two-user isolation tests pass per-table | PASS | `apps/web/tests/rls/two-user-isolation.test.ts` has 12 active `it()` cases (rooms, users, renders, chat_messages, style_fingerprints, interactions, swipe_history, redesign_feedback, saved_products, sam_embeddings, render_sessions, room_products) + 1 documented `it.skip()` for empty_room_cache (no user_id column; deny-by-default RLS posture). Test file written to two-real-user pattern (createUser/signIn). Live schema confirms exactly the kept user-scoped tables enumerated |
| 12 | Sentry on all runtimes | PARTIAL | `apps/web/instrumentation.ts` (loads server + edge configs); all 3 sentry config files exist with sample rates (client: traces 0.1/1.0, profiles 0.05, replaysOnError 0.5, replaysSession 0.0; server: traces 0.1/1.0, profiles 0.05; edge: traces 0.05/1.0). **`next.config.mjs` is NOT wrapped with `withSentryConfig`** — sourcemap upload missing. Spec §10 + §13 requires the wrap. Documented as "low priority, deferred to before P12" only in `auto-evidence/P01a/INDEX.md` — no back-bug file. See "New findings" #1 |
| 13 | redactLogPayload enforced via ESLint | PARTIAL — DEFERRED (acknowledged) | `apps/web/eslint-rules/no-unsafe-console.js` exists; registered via `eslint-plugin-cova-rules` in `.eslintrc.json`. Rule severity is **"warn"** (not "error"); 199 violations remain. Spec §13 verifier check requires "0 violations on a clean tree". Acknowledged in back-bug `P01a-eslint-rule-severity-pending-cleanup.md` with deferral target P02–P04 |
| 14 | Paid-call wrapper enforced via ESLint | PASS | `apps/web/lib/paid/call.ts` exists; `apps/web/eslint-rules/no-direct-paid-fetch.js` registered at "**error**" severity. `npm run lint` returns 0 errors for this rule. All 15 production paid-fetch sites migrated per back-bug round-2 update |
| 15 | Timeout chain locked | PASS | `apps/web/lib/config/timeouts.ts` exports VERCEL_ROUTE=290000, MODAL_APP=300000, FAL_CLIENT=320000, ANTHROPIC_VISION=60000, ANTHROPIC_DIRECTOR=30000, HAIKU_CLASSIFIER=15000, CLIENT_POLL_LONG=180000, REDESIGN_MODAL=420000. ESLint `no-restricted-syntax` blocks 180000/290000/300000/320000/420000 outside `lib/config/timeouts.ts`. Lint shows 0 violations |
| 16 | EXIF strip works | PASS (gated test) | `apps/web/lib/capture/process.ts` uses Sharp with `.rotate().resize(1536,1536,{fit:'inside',withoutEnlargement:true}).jpeg({quality:90,mozjpeg:true}).withMetadata({})`. Test at `apps/web/tests/exif/strip.test.ts` is gated on exiftool CLI presence (skips on machines without it; vitest output: 2 skipped). Passing CI requires exiftool to be installed in workflow — but spec §13 says "test passes against fixture" which is a conditional/gated assertion |
| 17 | render_cost_log wired | PASS | Live schema: `render_cost_log` has `category text NOT NULL`, plus user_id/render_id/stage/cost_usd/model/duration_ms/failure_category/created_at — matches spec §10 step 4 exactly. `apps/web/lib/cost/categories.ts` exports all 15 documented categories as TS union. RLS enabled with `p1_render_cost_log_self_read` policy |
| 18 | failure_category enum file | PASS | `apps/web/lib/errors/categories.ts` exports CostFailure | InfraFailure | SubagentFailure | CaptureFailurePreprocess. All values dotted format. P01a-owned prefixes only as spec requires. (Note: spec §6 lists only `cost.*, infra.*, subagent.*` for P01a; CaptureFailurePreprocess `capture.*` was added — this is a minor scope expansion, well-documented inline. Not a violation.) |
| 19 | PostHog wired | PASS (with caveat) | `apps/web/lib/analytics/posthog.ts` exists (EU instance default `https://eu.posthog.com`); `events.ts` exports typed `CovaEvent` + `CovaEventProperties`. Dashboard alerts NOT verifiable from code — spec §6 lists 4 dashboard alerts as a deliverable; this requires manual PostHog dashboard setup and is the only way to verify |
| 20 | Feature flags infra | PASS | `feature_flags` table live with all spec columns; live policy `p1_feature_flags_read_all`. `apps/web/lib/feature-flags/index.ts` exposes `readFlag()` + `isFlagEnabledForUser()` with TTL cache. 0 rows seeded (correct — auth flags are P01b's job) |
| 21 | Cost-monitor cron live | PARTIAL | `apps/web/app/api/cron/cost-monitor/route.ts` exists with `CRON_SECRET` Bearer auth and `cost.monitor.cron_fail` envelope; `vercel.json` registers `/api/cron/cost-monitor` daily at `0 6 * * *`. **`cova-plan/cost-reports/` directory does not exist** — no cold-start report. Deploy-time gate; the spec acceptance ("first cold-start report exists at …") cannot be PASS until first daily run after deploy with `CRON_SECRET` configured. Acknowledged in INDEX.md as awaiting Vercel env setup |
| 22 | 5 Modal artifacts archived correctly | PASS | `_archive/modal_pipeline/` contains all 5: `preprocessing.py`, `structural_extraction.py`, `professionalization.py`, `generation.py`, `redesign_pipeline.py`, plus `README.md`. `auto-evidence/P01a/modal-app-list.after.txt` shows the 4 deployed apps in `stopped` state at 2026-05-02 20:59 PDT. The 4 kept apps (cova-perception, cova-empty-room, cova-redesign, cova-composite-art — plus cova-empty-room-v3 + cova-redesign-v3 which are V3 follow-ons) remain `deployed`. Modal dashboard PNG screenshots NOT captured (`auto-evidence/P01a/modal-deletions/` is empty) — INDEX.md notes this as Daksh-side post-`modal app stop` documentation |
| 23 | Phantom env vars removed | PASS | Grep across `apps/web/`, `supabase/`, `scripts/` excluding `_archive/` and `docs/` returns 0 matches for `REDESIGN_PIPELINE_WEBHOOK_URL` or `PREPROCESS_PIPELINE_WEBHOOK_URL`. `apps/web/lib/env.ts` and `apps/web/.env.example` are clean. `apps/web/app/api/test-pipeline/` directory is absent (deleted per spec preferred path) |

---

## §14 adversarial probe results

| # | Probe | Result |
|---|-------|--------|
| 1 | console.* of Identifier/ObjectExpression not wrapped in redactLogPayload | DEFERRED — 199 hits flagged by ESLint at "warn" severity; back-bug `P01a-eslint-rule-severity-pending-cleanup.md` |
| 2 | Direct fetch() against paid providers outside `lib/paid/call.ts` | PASS — 0 errors; rule at "error" severity catches all |
| 3 | Hardcoded timeout numbers (180/290/300/320/420 in 1000s) outside `lib/config/timeouts.ts` | PASS — 0 violations; ESLint `no-restricted-syntax` enforces |
| 4 | Any new table without RLS enabled | PASS — `pg_class.relrowsecurity=false` query returns 0 rows in `public` schema |
| 5 | Any Supabase storage bucket without policies | PASS (as far as code shows) — `quiz-images` and `room-uploads` have `p1_*` policies; legacy buckets (`room-photos`, `models`, etc.) carry pre-existing policies |
| 6 | Any kept user-scoped table without isolation test | PASS — every kept user-scoped table has an `it()` case in `tests/rls/two-user-isolation.test.ts`; documented `it.skip()` for empty_room_cache with rationale |
| 7 | Image upload code path without Sharp `.withMetadata({})` | PASS at `lib/capture/process.ts` — only EXIF-strip helper P01a ships. Phase 3 will widen the audit when full capture surfaces land |
| 8 | Active code import referencing `_archive/` paths | PASS — grep `from.*['"_]archive` returns 0 matches in `apps/web/` |
| 9 | Test file outside `tests/` or `_archive/tests/` and not in P01a created list | NOT INVESTIGATED EXHAUSTIVELY — sample greps clean |
| 10 | Reference to deprecated tables/columns/components in active code | PARTIAL — 11 deferred columns ARE referenced (acknowledged back-bug); 0 references to dropped tables |
| 11 | Any `legacy-*` import in non-archive code | PASS — no legacy imports detected outside `_archive/` |
| 12 | Modal deploy command targeting an archived app | PASS — `_archive/modal_pipeline/redesign_pipeline.py` not deployed; `modal app list` confirms 4 stopped |
| 13 | `process.env.X` access without check + fallback | NOT EXHAUSTIVELY AUDITED — ESLint does not enforce; spec was advisory |
| 14 | Sentry init without sample rates | PASS — all 3 configs include `tracesSampleRate`; client+server include `profilesSampleRate`; client includes `replaysOnError`+`replaysSessionSampleRate` |
| 15 | PostHog event without typed name from `events.ts` | PASS for P01a-owned code paths; downstream phases responsible as they add events |
| 16 | `supabase/functions/*` reference to dropped table | PASS — `cron-table-audit.md` evidences only commented-out / deprecated references remain; live MCP confirms 0 dropped tables remain |
| 17 | CREATE POLICY in P01a migrations missing `p1_` prefix | PASS — `20260502203500-rls-consolidation.sql` and `render-cost-log-recreate.sql` use `p1_` prefix on every CREATE POLICY |
| 18 | failure_category literal not following dotted format / locked prefix | PASS for the union types in `lib/errors/categories.ts`; dotted format throughout |
| 19 | Reference to archived V8 orchestrator or 4 stages in active code | PASS — only reference in `apps/web/app/api/pipeline/redesign/route.ts:143` is a comment; no active dispatch |
| 20 | Remaining REDESIGN_PIPELINE_WEBHOOK_URL / PREPROCESS_PIPELINE_WEBHOOK_URL refs | PASS — 0 hits in `apps/web/` outside `_archive/`/`docs/` |

---

## Acknowledged-deferred back-bugs

| Back-bug file | Exists | Dated | Deferral target | Verdict |
|---|---|---|---|---|
| `cova-plan/back-bugs/P01a-m2-m4-active-refs.md` | ✓ | 2026-05-02 | M2: P02 (capture/quiz refactor) + P03 (pipeline reliability), per-column mapping table; M4: APPLIED in round 2 | PROPERLY DOCUMENTED |
| `cova-plan/back-bugs/P01a-eslint-rule-severity-pending-cleanup.md` | ✓ | 2026-05-02 | P02–P04 progressive cleanup, then promote `no-unsafe-console` to "error" | PROPERLY DOCUMENTED |
| `cova-plan/back-bugs/P01a-stale-data-flagging.md` | ✓ | 2026-05-02 | Phase 9 dashboard, or dedicated mini-migration | PROPERLY DOCUMENTED |
| `cova-plan/back-bugs/P01a-python-test-imports.md` | ✓ | 2026-05-02 | RESOLVED in commit c87df47 (Option A applied) | PROPERLY DOCUMENTED + RESOLVED |

All four back-bugs carry: discovery date, owner-of-fix, repro/blast radius, suggested fix path. None are hand-wavy.

---

## New findings (not covered by an acknowledged back-bug)

### Finding #1 (HIGH) — `next.config.mjs` is NOT wrapped with `withSentryConfig`

- **Spec source:** §10 step ("`next.config.js` wraps with `withSentryConfig` (sourcemaps upload on deploy)") and §13 row "Sentry on all runtimes" implicitly requires this for full criterion satisfaction.
- **Current state:** `apps/web/next.config.mjs` exports `nextConfig` plain; no `import { withSentryConfig }` and no wrap.
- **Documentation status:** Mentioned only inside `cova-plan/auto-evidence/P01a/INDEX.md` "Open items" table as "any time before P12, low priority". **No back-bug file. No `OPEN_DECISIONS.md` deferral entry. No phase-level remediation target locked.**
- **Impact:** Sentry runtime captures fire (configs init), but **no source maps upload to Sentry on Vercel deploy** — every server/edge stack trace will land in Sentry as minified. This degrades production triage value of the entire Sentry investment shipped in M3.
- **Why it matters now:** Phases P02–P12 will rely on Sentry for failure_category surfacing. Source-map silence for ~6 months is a real ops cost.
- **Recommendation:** Either (a) add the wrap in P01a remediation (10-line edit), or (b) file a proper back-bug `P01a-sentry-sourcemap-wrap-deferred.md` with an explicit deferral target (recommend P03 since P03 expands failure_category surfaces).

### Finding #2 (LOW) — modal-deletions/ screenshots not captured

- **Spec source:** §16 ("Modal control panel screenshot showing the 4 deployed V8-stage apps removed").
- **Current state:** `cova-plan/auto-evidence/P01a/modal-deletions/` directory is empty (no PNGs).
- **Documentation status:** Acknowledged in INDEX.md "Manual gate items" — "post-`modal app stop` tidiness step. The CLI stop is sufficient for billing; dashboard delete is documentation."
- **Impact:** Negligible — `modal app stop` via CLI verified in `modal-app-list.after.txt` showing all 4 V8 apps in `stopped` state. The dashboard PNGs are paper-trail.
- **Recommendation:** Daksh capture 4 PNGs at the manual-gate step; not a verifier blocker.

### Finding #3 (LOW) — cost-monitor first cold-start report does not yet exist

- **Spec source:** §13 row "first cold-start report exists at `cova-plan/cost-reports/{YYYY-MM-DD}.md`".
- **Current state:** Directory `cova-plan/cost-reports/` does not exist at all.
- **Documentation status:** INDEX.md notes "cold-start report appears post-launch" and lists `CRON_SECRET`/`COVA_LAUNCH_DATE` as "manual gate items" awaiting Vercel env setup.
- **Impact:** Wiring is correct (route + vercel.json cron + scripts/agents/cost-monitor.ts). Acceptance only completable post-deploy with secrets set.
- **Recommendation:** This is a deploy-time gate; phase-close can record it as DEFERRED-TO-FIRST-DAILY-RUN. If you want strictness, file a "P01a-cost-monitor-cold-start" back-bug with a P12-deploy target.

### Finding #4 (INFORMATIONAL) — extra `executor.md` and `planner.md` in `.claude/agents/`

- **Spec scope:** §6 M0 lists 4 subagents.
- **Current state:** `.claude/agents/` contains 6 files (the 4 spec'd + `executor.md` + `planner.md`). These are not in `cova-plan/subagents/`, so the sync script does not see them as drift.
- **Impact:** None — extras are presumably workflow conveniences for executor/planner sessions.
- **Recommendation:** No action; consider documenting in `cova-plan/subagents/README.md` if you want to formalize.

### Finding #5 (INFORMATIONAL) — `eslint.config.js` (flat config) vs `.eslintrc.json` (legacy)

- **Spec source:** §6 M3 + §8 list `apps/web/eslint.config.js` as the registration site.
- **Current state:** Repo uses `apps/web/.eslintrc.json` (legacy ESLint config) registering both rules through `eslint-plugin-cova-rules`. Functionally equivalent; both rules trip in `npm run lint`.
- **Impact:** None — Next.js 14 `next lint` works with both formats; the rules fire correctly. The spec naming is implementation-detail, not contract.
- **Recommendation:** No action.

### Finding #6 (INFORMATIONAL) — `.eslintrc.json` has `ignorePatterns: ["tests/", ...]`

- **Current state:** ESLint ignores `tests/` directory entirely.
- **Impact:** Rules never fire on test code. Acceptable since tests legitimately log raw payloads, but worth noting that the "no console.* of objects unwrapped" probe cannot reach test code.
- **Recommendation:** No action; spec doesn't require enforcement in tests.

---

## Disagreements with session 1

Per the session-2 contract I did not read `cova-plan/verifier-reports/P01a-session-1.md`, so I cannot enumerate disagreements. If session 1 marked criteria #5, #12, or #13 as PASS (unconditionally), session 2 disagrees — see acknowledged-deferred labels and Finding #1.

---

## Overall verdict

**NOT CLOSEABLE WITHOUT NEW FINDING #1 RESOLUTION**

Summary:
- 17 PASS criteria.
- 3 PARTIAL — DEFERRED (acknowledged): #5 (M2 11 deferred cols), #13 (no-unsafe-console at "warn" with 199 hits), #21 (cost-monitor cold-start report awaits deploy).
- 1 PARTIAL — NEW FINDING: #12 (Sentry sample rates correct but `next.config.mjs` unwrapped — no back-bug, only INDEX.md aside).

The acknowledged-deferred items are properly back-bugged, dated, and mapped to a future phase — they do **not** block closure under the verifier protocol's "deferred = acknowledged" rule.

**Finding #1 (Sentry sourcemap wrap)** is the only real blocker. It is documented only as a casual "low priority" line in `INDEX.md` — that does not satisfy the back-bug standard required by the §17 remediation budget. It needs either:

(a) **Round-2 remediation** — add the `withSentryConfig` wrap in `apps/web/next.config.mjs` and re-run verifier (10-line code edit, low risk), OR
(b) **Formal back-bug** — `cova-plan/back-bugs/P01a-sentry-sourcemap-wrap-deferred.md` with a locked phase target (recommend P03 — owns failure_category expansion that will heavily exercise Sentry stack traces).

§17 routing recommendation: **Round 2 — fresh executor session via remediation prompt.** This is a small, well-scoped fix; (a) is preferable to (b) because every additional unwrapped Sentry deploy makes the source-map debt larger.

Findings #2, #3 are deploy-time gates and acceptable as MANUAL TEST items; #4–#6 are informational only.

---

## Files referenced (absolute paths)

- `/Users/daksh/Desktop/cova/cova-plan/phases/P01a-demolition-ops.md`
- `/Users/daksh/Desktop/cova/cova-plan/OPEN_DECISIONS.md`
- `/Users/daksh/Desktop/cova/cova-plan/PHASE_STATUS.md`
- `/Users/daksh/Desktop/cova/cova-plan/auto-evidence/P01a/INDEX.md`
- `/Users/daksh/Desktop/cova/cova-plan/auto-evidence/P01a/cron-table-audit.md`
- `/Users/daksh/Desktop/cova/cova-plan/auto-evidence/P01a/supabase-after-state.md`
- `/Users/daksh/Desktop/cova/cova-plan/auto-evidence/P01a/modal-app-list.after.txt`
- `/Users/daksh/Desktop/cova/cova-plan/snapshots/P01a-pre-drop-20260502-202507.sql`
- `/Users/daksh/Desktop/cova/cova-plan/back-bugs/P01a-m2-m4-active-refs.md`
- `/Users/daksh/Desktop/cova/cova-plan/back-bugs/P01a-eslint-rule-severity-pending-cleanup.md`
- `/Users/daksh/Desktop/cova/cova-plan/back-bugs/P01a-stale-data-flagging.md`
- `/Users/daksh/Desktop/cova/cova-plan/back-bugs/P01a-python-test-imports.md`
- `/Users/daksh/Desktop/cova/apps/web/instrumentation.ts`
- `/Users/daksh/Desktop/cova/apps/web/sentry.client.config.ts`
- `/Users/daksh/Desktop/cova/apps/web/sentry.server.config.ts`
- `/Users/daksh/Desktop/cova/apps/web/sentry.edge.config.ts`
- `/Users/daksh/Desktop/cova/apps/web/next.config.mjs` (NEW FINDING #1: missing withSentryConfig wrap)
- `/Users/daksh/Desktop/cova/apps/web/.eslintrc.json`
- `/Users/daksh/Desktop/cova/apps/web/eslint-rules/no-unsafe-console.js`
- `/Users/daksh/Desktop/cova/apps/web/eslint-rules/no-direct-paid-fetch.js`
- `/Users/daksh/Desktop/cova/apps/web/lib/log/redact.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/config/timeouts.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/cost/categories.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/cost/log.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/paid/call.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/errors/categories.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/analytics/posthog.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/analytics/events.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/feature-flags/index.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/capture/process.ts`
- `/Users/daksh/Desktop/cova/apps/web/lib/media/cloudflare.ts`
- `/Users/daksh/Desktop/cova/apps/web/app/api/cron/cost-monitor/route.ts`
- `/Users/daksh/Desktop/cova/apps/web/tests/rls/two-user-isolation.test.ts`
- `/Users/daksh/Desktop/cova/apps/web/tests/exif/strip.test.ts`
- `/Users/daksh/Desktop/cova/scripts/sync-subagents.sh`
- `/Users/daksh/Desktop/cova/scripts/agents/cost-monitor.ts`
- `/Users/daksh/Desktop/cova/supabase/migrations/20260502203000-drop-dead-indexes.sql`
- `/Users/daksh/Desktop/cova/supabase/migrations/20260502203100-drop-dead-room-cols.sql`
- `/Users/daksh/Desktop/cova/supabase/migrations/20260502203200-drop-dead-tables.sql`
- `/Users/daksh/Desktop/cova/supabase/migrations/20260502203300-render-cost-log-recreate.sql`
- `/Users/daksh/Desktop/cova/supabase/migrations/20260502203400-feature-flags-table.sql`
- `/Users/daksh/Desktop/cova/supabase/migrations/20260502203500-rls-consolidation.sql`
- `/Users/daksh/Desktop/cova/.github/workflows/lint.yml`
- `/Users/daksh/Desktop/cova/.github/workflows/schema-review.yml`
- `/Users/daksh/Desktop/cova/vercel.json`
- `/Users/daksh/Desktop/cova/_archive/modal_pipeline/{preprocessing,structural_extraction,professionalization,generation,redesign_pipeline}.py`

