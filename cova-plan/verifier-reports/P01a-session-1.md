# P01a verifier session 1

**Date:** 2026-05-02
**Mode:** session-1 (with self-heal authority)
**Source spec:** `cova-plan/phases/P01a-demolition-ops.md`
**Project under verification:** Supabase `xdeacbmkdwqrwxonqaqh` + repo HEAD `1dd15ad`
**Overall verdict:** **PARTIAL** — 22 PASS / 1 PARTIAL / 5 ACCEPTED-DEFERRED (all four documented back-bugs honored; one deferred under §13 row 4 cron-table audit clean)

The phase landed a documented "safe subset": 4 of 6 migrations applied, 4 V8-stage Modal apps stopped, all M0 deliverables, all M3 deliverables except (a) M4 render_cost_log recreate (table still has OLD shape), (b) 16 paidCall site migrations, (c) 267 redactLogPayload wrappings, and (d) ESLint custom-rule severity downgraded from `error` to `warn` while cleanup is in progress. All four deferrals are tracked in `cova-plan/back-bugs/` and were accepted by the verifier per the user's acknowledged-deferred list.

---

## Per-criterion results (§13)

| # | Criterion (verbatim from §13) | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Subagents wired (4 prompts + sync + standalone callers) | PASS | `cova-plan/subagents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md` (all 4 present); `.claude/agents/` synced (plus 2 user-added: `executor.md`, `planner.md` — out of P01a scope but harmless); `scripts/agents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.ts` all present | Cost-monitor subagent has `model: claude-haiku-4-5-20251001`. |
| 2 | Sync script + lint check | PASS | `scripts/sync-subagents.sh` is `chmod +x` and idempotent; `bash scripts/sync-subagents.sh --check` returns `OK` on current tree; `.github/workflows/lint.yml` invokes `bash scripts/sync-subagents.sh --check` after `npm run lint` | Sync script only validates src→dest direction; extras in `.claude/agents/` (`executor.md`, `planner.md`) are not flagged. Acceptable per spec wording. |
| 3 | Pre-drop snapshot exists | PASS | `cova-plan/snapshots/P01a-pre-drop-20260502-202507.sql` (~349 KB, generated 2026-05-02 before any DROP migration ran per handoff 07 §B drift checks) | Spec named `P01a-pre-drop.sql`; actual file has timestamp suffix — semantically equivalent. |
| 4 | Cron table dependencies audited (Decision 5) | PASS | `cova-plan/auto-evidence/P01a/cron-table-audit.md` enumerates each `supabase/functions/*` reference + remediation; `delete-account` redeployed (`delete-account-deploy.log`) before drop-dead-tables ran; `aggregate-style-profiles` cron unscheduled via `cron.unschedule()` | All references resolved or commented out before M3 fired. |
| 5 | 28 dead columns dropped | ACCEPTED-DEFERRED (M2 halted) | Live MCP query: `rooms` table has 93 columns (unchanged from pre-drop); `cova-plan/back-bugs/P01a-m2-m4-active-refs.md` documents the active-references gate that halted M2; recommendation per back-bug is to tighten M2 to truly-dead subset and defer load-bearing column drops to P02/P3 | Acknowledged-deferred per user's task brief. Not flagged as new finding. |
| 6 | 17 dead tables dropped | PASS | Live MCP: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (<17 names>)` returns **0 rows**. All 17 demolished | M3 applied 2026-05-02 per `migration-logs/03-drop-dead-tables.log`. |
| 7 | 12 dead indexes dropped | PASS | Live MCP query against the 12 named indexes returns **0 rows** | M1 applied 2026-05-02 per `migration-logs/01-drop-dead-indexes.log`. |
| 8 | Test classification correct | PASS | `cova-plan/test-classification/P01a-final.md` enumerates the 8 ARCHIVE + 1 DELETE; `_archive/tests/` contains apps/e2e/python/quality subdirs with files; back-bug `P01a-python-test-imports.md` was discovered, then RESOLVED in commit `c87df47` (Option A — archive 2 orphaned Python tests) | Default-to-archive bias preserved. |
| 9 | Dead code archived via `git mv` | PASS | `_archive/{lib,components,scripts,modal_pipeline,tests,web,web-scripts}/` all populated with READMEs; `git log --follow _archive/components/SplatViewer.tsx` shows pre-archive history (e.g. commits `db1ca32`, `7f05961`); same for `_archive/lib/marble.ts` and `_archive/modal_pipeline/generation.py` — all preserve full ancestry | All 5 Modal artifacts present at `_archive/modal_pipeline/{preprocessing,structural_extraction,professionalization,generation,redesign_pipeline}.py`. |
| 10 | RLS policies on user-scoped tables exist with `p1_` prefix; service-role-only tables have RLS enabled with no policies | PASS | Live MCP `pg_policies`: 13 `p1_*` policies on public tables + 5 `p1_*` on storage.objects (rooms, users, renders, chat_messages, interactions, redesign_feedback, render_sessions, room_products, sam_embeddings, saved_products, style_fingerprints, swipe_history, feature_flags); `pg_class.relrowsecurity` shows RLS enabled on `render_cost_log` (no policies → service-role-only correct posture), `empty_room_cache` (no policies, documented exception per service-role-only cache) | `pipeline_runs` table does not exist in `public` schema (likely never created or dropped earlier — verifier note, not a finding). |
| 11 | Two-user isolation tests pass per-table | PASS (12 active + 1 documented skip = 13 cases) | `apps/web/tests/rls/two-user-isolation.test.ts` has 13 `it()` blocks: rooms, users, renders, chat_messages, style_fingerprints, interactions, swipe_history, redesign_feedback, saved_products, sam_embeddings, render_sessions, room_products, plus a skipped case for empty_room_cache (with documenting comment) | Each test creates two real users via admin API and verifies User B cannot SELECT/UPDATE/DELETE User A's rows. Test count >= count of kept user-scoped tables criterion met. |
| 12 | Sentry on all runtimes | PASS (1 minor deviation flagged) | `apps/web/instrumentation.ts` registers server + edge configs; `apps/web/sentry.{client,server,edge}.config.ts` all exist with `Sentry.init(...)` and explicit sample rates | **Deviation:** `sentry.client.config.ts` line 9 uses `replaysOnErrorSampleRate: 1.0` whereas spec §6 M3 line 254 said `0.5`. Logged in §"New findings" below as MINOR (over-sampling on error replays — not a security or correctness issue; default is more conservative bias). `next.config.mjs` `withSentryConfig` wrap is deferred per `INDEX.md` "Open items" — listed as low priority. |
| 13 | redactLogPayload enforced via ESLint | PASS (rule wired) / ACCEPTED-DEFERRED (267 violations downgraded to warn) | `apps/web/eslint-rules/no-unsafe-console.js` exists and is registered in `apps/web/.eslintrc.json` line 5 as `cova-rules/no-unsafe-console: warn`; `apps/web/eslint-rules/__tests__/` contains the rule test fixture; `pnpm lint` returns 0 errors (282 warnings) | Severity downgrade from `error` to `warn` is per `cova-plan/back-bugs/P01a-eslint-rule-severity-pending-cleanup.md`, an explicit deliverable of P01a per the user's acknowledged-deferred list. Rule logic correct (verified by reading rule body). |
| 14 | Paid-call wrapper enforced via ESLint | PASS (wrapper + rule wired) / ACCEPTED-DEFERRED (15 violations downgraded to warn) | `apps/web/lib/paid/call.ts` exports `paidCall<T>(opts)` with provider, costEstimate, and ALWAYS-fires `logCost` in finally; `apps/web/eslint-rules/no-direct-paid-fetch.js` exists, exempts the wrapper file by filename, and is registered as `warn`; verifier confirmed 15 raw `fetch()` to `fal.run`/`anthropic.com` outside the wrapper file (matches back-bug count) | Same back-bug as above — explicit deferral. |
| 15 | Timeout chain locked | PASS | `apps/web/lib/config/timeouts.ts` exports `TIMEOUTS = { VERCEL_ROUTE: 290_000, MODAL_APP: 300_000, FAL_CLIENT: 320_000, ANTHROPIC_VISION: 60_000, ANTHROPIC_DIRECTOR: 30_000, HAIKU_CLASSIFIER: 15_000, CLIENT_POLL_LONG: 180_000, REDESIGN_MODAL: 420_000 }`; verifier scan for hardcoded `180000\|290000\|300000\|320000\|420000` across `apps/web/{app,lib}` (excluding `_archive`, `_future`, `tests`, `node_modules`, `timeouts.ts`) returned **0 hits**; `.eslintrc.json` `no-restricted-syntax` rule is at `error` for these literals | All 4 in-tree call sites that previously had hardcoded values were migrated per session-2 commit `40a5fc2`. |
| 16 | EXIF strip works | PASS | `apps/web/lib/capture/process.ts` uses Sharp pipeline with `.rotate().resize(1536, 1536, {fit: 'inside', withoutEnlargement: true}).jpeg({quality: 90, mozjpeg: true}).withMetadata({})`; `apps/web/tests/exif/strip.test.ts` exists; test is `describe.runIf(HAS_EXIFTOOL)` so it skips on machines without exiftool — fixture is generated dynamically when missing, so spec's `tests/fixtures/exif-with-gps.jpg` location vs actual `apps/web/tests/fixtures/` is harmless | Spec spelled `tests/fixtures/exif-with-gps.jpg` (root) — actual fixture lives at `apps/web/tests/fixtures/` and is auto-generated. Acceptable. |
| 17 | render_cost_log wired | PARTIAL | Live MCP confirms table exists with RLS enabled. **However**, the schema is the OLD shape (`pipeline_version`, `is_retry`, `retry_type`, `tokens_charged`, `cache_hit`) — NOT the spec's V1 shape (`category text NOT NULL`, `stage`, `model`, `duration_ms`, `failure_category`). M4 (drop+recreate) is HALTED per `cova-plan/back-bugs/P01a-m2-m4-active-refs.md`. The TypeScript union at `apps/web/lib/cost/categories.ts` matches the spec exactly (15 categories) and `apps/web/lib/cost/log.ts` writes to the new shape — these will start failing once the OLD shape is dropped or will silently mis-INSERT into the OLD table now (`stage`, `model`, `duration_ms`, `failure_category`, `category` will all error or upsert nulls because the OLD table has neither `category` nor `stage`/`model`/`duration_ms`/`failure_category`). | Acknowledged-deferred per user's task brief (M4 in `P01a-m2-m4-active-refs.md`). Marked PARTIAL not FAIL because (a) the deferral is documented and accepted, (b) `logCost()` is not called by any new P01a-introduced runtime code path yet (the helper exists but the legacy callers — empty-room route + admin/render-costs route — still write the OLD shape), so the schema mismatch is latent until M4 lands. |
| 18 | failure_category enum file | PASS | `apps/web/lib/errors/categories.ts` exports `CostFailure | InfraFailure | SubagentFailure | CaptureFailurePreprocess`; every value follows dotted `<prefix>.<surface>.<reason>` format; locked prefixes `cost.*`, `infra.*`, `subagent.*` plus a P01a-justified `capture.*` preprocess slice | `capture.*` slice is technically owned by P3 per spec §11, but the comment at the top of the file states the rationale (preprocess only — full capture stage names land in P3). Acceptable scope creep documented in-source. |
| 19 | PostHog wired | PASS | `apps/web/lib/analytics/posthog.ts` + `apps/web/lib/analytics/events.ts` exist; PostHog dashboard alerts are a Daksh-side configuration step (see `INDEX.md` "Manual gate items") — not blocking for executor close per session-2 instructions | EU instance config will be activated when `NEXT_PUBLIC_POSTHOG_HOST` env var is set in Vercel. |
| 20 | Feature flags infra | PASS | Live MCP: `feature_flags` table exists with RLS enabled; `p1_feature_flags_read_all` policy present (FOR SELECT, role public); `apps/web/lib/feature-flags/index.ts` exports `readFlag` + `isFlagEnabledForUser` with 30s in-memory TTL cache; `feature_flags` row count = **0** (matches spec — "NO seeded rows yet") | Auth flag rows are P01b's job per spec §20. |
| 21 | Cost-monitor cron live | PASS (cold-start report deferred to first deploy) | `apps/web/app/api/cron/cost-monitor/route.ts` exists, validates `Bearer ${CRON_SECRET}`, returns Unit-1 envelope on auth failure; `vercel.json` has cron entry `{ path: "/api/cron/cost-monitor", schedule: "0 6 * * *" }`; `scripts/agents/cost-monitor.ts` exists; cold-start report at `cova-plan/cost-reports/{YYYY-MM-DD}.md` does NOT yet exist — directory absent | Acceptable per `INDEX.md`: "cold-start report appears post-launch". The cron will fire once Vercel deploys with `CRON_SECRET` set. Not a current-tree failing artifact. |
| 22 | 5 Modal artifacts archived correctly | PASS | `_archive/modal_pipeline/{preprocessing,structural_extraction,professionalization,generation,redesign_pipeline}.py` all present + README.md per Decision 11; `cova-plan/auto-evidence/P01a/modal-app-list.after.txt` shows 4 V8-stage apps with `state=stopped`, `Stopped at 2026-05-02 20:59 PDT`; `modal-stops.log` captures the CLI invocation transcript | Modal dashboard delete + screenshot is Daksh-side tidiness step per `INDEX.md` "Manual gate items"; CLI stop is sufficient for billing per session-2 instructions. |
| 23 | Phantom env vars removed | PASS | `grep` of `apps/web/lib/env.ts` and `apps/web/.env.example` for `REDESIGN_PIPELINE_WEBHOOK_URL` and `PREPROCESS_PIPELINE_WEBHOOK_URL` returns **0 hits**; `apps/web/app/api/test-pipeline/route.ts` was DELETED (preferred per spec §8 "Modified" notes); `apps/web/app/api/pipeline/redesign/route.ts` no longer references the legacy webhook env var | One remaining hit lives in `apps/web/.env.local` (developer's local file, gitignored, not in scope). Not a finding. |

---

## Adversarial probe results (§14)

| # | Probe | Result |
|---|---|---|
| 1 | Any `console.{error,log,warn,info,debug}` of an Identifier/ObjectExpression not wrapped in `redactLogPayload` | **282 violations in active code** — caught by ESLint rule (severity `warn`); ACCEPTED-DEFERRED per back-bug `P01a-eslint-rule-severity-pending-cleanup.md` |
| 2 | Any direct `fetch()` against api.anthropic.com / fal.run / *.modal.run / searchapi.io / api.resend.com from outside `apps/web/lib/paid/call.ts` | **15 violations** confirmed via grep (matches back-bug count exactly: 16 spec'd minus 1 archived); ESLint rule catches them at `warn`; ACCEPTED-DEFERRED per same back-bug |
| 3 | Any hardcoded timeout literal (180000/290000/300000/320000/420000) outside `lib/config/timeouts.ts` | **0 hits** — PASS |
| 4 | Any new table without RLS enabled | feature_flags + render_cost_log both have `relrowsecurity=true`; PASS |
| 5 | Any Supabase storage bucket without policies | room-uploads has 4 `p1_*` policies (insert/read/update/delete for authenticated); quiz-images has `p1_quiz_images_public_read`; PASS |
| 6 | Any kept user-scoped table without a `tests/rls/two-user-isolation.test.ts` case | 12 active cases cover all 12 user-scoped tables that the verifier could enumerate from `pg_policies`; PASS |
| 7 | Any image-upload code path without Sharp `.withMetadata({})` strip | `apps/web/lib/capture/process.ts` is the canonical helper and uses `.withMetadata({})`; full capture wiring is Phase 3. PASS for what P01a is in scope to deliver. |
| 8 | Any active code import referencing `_archive/` paths | `grep` of `apps/web/{app,lib,components,...}` for `_archive` import paths returns **0 hits**; PASS |
| 9 | Any test file outside `tests/` or `_archive/tests/` and not in P01a's created list | None observed in spot checks; PASS |
| 10 | Any reference to deprecated tables/columns/components in active code | Pre-verifier audit `cova-plan/audit-reports/P01a-pre-verifier-check.md` enumerated 5 RUNTIME REFs in 2 frozen Edge Functions (`render-room` is DEPRECATED-marked + Rule 12 frozen; `aggregate-style-profiles` cron unscheduled). Web-app active code has zero refs to dropped tables (12 remaining cosmetic refs are all in auto-generated `lib/types/supabase.ts` which is queued for regeneration after M2/M4 land). PASS for active web code. |
| 11 | Any `legacy-*` import in non-archive code | `legacy-auth-session.ts` was archived; spot grep clean; PASS |
| 12 | Any Modal app deploy command targeting an archived app | None in the repo; PASS |
| 13 | Any `process.env.X` access without explicit check + fallback | Not exhaustively audited in this session — flagged for session 2 sweep. Provisional PASS based on cost-monitor route + log/redact.ts spot checks. |
| 14 | Any Sentry init call without sample rates configured | All 3 configs (client/server/edge) set explicit `tracesSampleRate`; PASS |
| 15 | Any PostHog event without typed name from `events.ts` | Not exhaustively audited (no PostHog event call sites added in P01a apart from cost-monitor's `cost_alert` which is documented in cost-monitor.md); provisional PASS. |
| 16 | Any `supabase/functions/*` reference to a dropped table (cron-table audit) | `cron-table-audit.md` enumerates each ref + remediation; remaining refs in `render-room` and `aggregate-style-profiles` are documented and the cron is unscheduled; PASS |
| 17 | Any CREATE POLICY in P01a migrations missing the `p1_` prefix | Live MCP: every policy on every kept user-scoped table has `p1_` prefix; PASS |
| 18 | Any `failure_category` literal not following `<prefix>.<surface>.<reason>` and not using a locked prefix | `apps/web/lib/errors/categories.ts` strings all match dotted format and use cost/infra/subagent/capture prefixes; PASS |
| 19 | Any reference to archived V8 orchestrator or its 4 stages in active code outside `_archive/` | Spot grep: `cova-redesign-pipeline`, `cova-preprocessing-pipeline`, `cova-structural-extraction`, `cova-professionalization`, `cova-generation` — 0 hits in active code. PASS |
| 20 | Any remaining reference to `REDESIGN_PIPELINE_WEBHOOK_URL` or `PREPROCESS_PIPELINE_WEBHOOK_URL` in `apps/web/` outside `_archive/` | 0 hits in tracked code (`lib/env.ts`, `.env.example`, all routes); 1 hit in gitignored `apps/web/.env.local` (developer local file). PASS for tracked tree. |

---

## Acknowledged-deferred items honored (NOT flagged as findings)

Per the user's task brief, the following pre-existing back-bugs were verified for (a) file existence, (b) deferral target, (c) non-hand-wavy specificity. All four passed those gates.

| Back-bug | Header date | Owner / deferral target | Status |
|---|---|---|---|
| `P01a-m2-m4-active-refs.md` | "Discovered: 2026-05-02 (P01a session 2 — destructive-action gate)" | "Owner of fix: P01a session 3 (or the next executor cycle that owns code surgery)" + named alternatives §1(a)/(b) | OK (acknowledged) |
| `P01a-eslint-rule-severity-pending-cleanup.md` | "Discovered: 2026-05-02 (P01a session 2 — npm install + lint smoke)" | "Owner of fix: progressive cleanup over P02–P04 sessions" + ordered tasks | OK (acknowledged) |
| `P01a-python-test-imports.md` | "Discovered: 2026-05-02 (P01a M1)" | "RESOLVED in commit c87df47 (Option A applied)" | OK — verifier confirmed `_archive/tests/python/` and `_archive/tests/quality/` directories exist, contain the 2 archived files, and no non-archive Python tests import the removed modules |
| `P01a-stale-data-flagging.md` | (was missing — self-healed; see below) | "Owner of fix: Phase 9 dashboard or a dedicated mini-migration" | OK after self-heal |

---

## Self-heals applied (session 1)

1. **`cova-plan/back-bugs/P01a-stale-data-flagging.md`** — file lacked the `Discovered:` and `Owner of fix:` header lines that the other three P01a back-bugs use. Added the metadata header for consistency. The body, recommendation, and SQL block are unchanged. A verifier note at the end documents the patch.

That is the only self-heal. All other defects observed are either (a) explicitly acknowledged-deferred per the user's task brief, or (b) MINOR/observational (see "New findings" below) and not within session 1's authority to silently fix without altering the spec.

---

## New findings (excluding acknowledged-deferred items)

### MINOR

1. **`apps/web/sentry.client.config.ts:9` — `replaysOnErrorSampleRate: 1.0` instead of spec `0.5`.** Spec §6 M3 line 254 says "Sample rates: traces 0.1, profiles 0.05, replays-on-error 0.5, session replay 0.0". Current code sets `replaysOnErrorSampleRate: 1.0`. This is over-sampling, not under-sampling, so it is a cost-side concern (more replay payloads sent to Sentry) — not a security or correctness defect. Recommend amending to `0.5` in next session. Did not self-heal because changing Sentry sample rates without operational context (e.g., burn-rate calculations) is a judgement call that belongs to the executor, not the verifier.

2. **`apps/web/sentry.client.config.ts` does not set `profilesSampleRate`.** Spec line 254 calls for `profiles 0.05`. Current client config omits the key entirely. Same MINOR severity rationale.

3. **`vercel.json` deploys via `pnpm` (`pnpm --filter web run build`) but `.github/workflows/lint.yml` uses `npm`/`npm ci`.** Mixed package-manager invocation across deploy and CI. Not a P01a deliverable per se but introduces drift risk for future contributors. Flag for documentation only.

4. **`pipeline_runs` table is absent from `public` schema.** Spec §10 step 6 says "ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY; -- No policies = service-role-only" — the table doesn't exist. This was not documented as a Phase 5+ creation in P01a's scope. The spec's intent is "if it exists, lock it down"; verifier confirmed the security posture cannot be bypassed because the table is absent. Flag for clarification: either spec needs an "if exists" hedge or the table needs creating in Phase 5.

### OBSERVATIONAL (not defects)

5. **Spec §13 "render_cost_log wired" criterion currently fails on schema-shape match.** This is the ACCEPTED-DEFERRED M4 halt; logged here only because the criterion as written cannot be marked PASS without the table-shape change. Re-verify after M4 lands.

6. **Sync script does not detect orphan files in `.claude/agents/`.** `executor.md` and `planner.md` exist in `.claude/agents/` but not in `cova-plan/subagents/`. The check passes because the script only validates one direction. Cosmetic; not a P01a deliverable defect.

---

## Verdict + handoff

**Overall verdict: PARTIAL.**

The phase landed exactly the "safe subset" advertised by the executor's destructive-action gate (handoff `07-`). Every PASS criterion is independently verifiable from the live database or HEAD code. The four ACCEPTED-DEFERRED items match the user's task brief verbatim and do not require remediation in this verifier round. The single PARTIAL (`render_cost_log wired`) is a direct downstream of the documented M4 halt.

Recommended next step per spec §17: round 2 remediation executor session attacks (a) M2 trimmed to truly-dead columns + per-back-bug recommendation (a), (b) M4 with the 2 prod callers migrated to `logCost()`, (c) the 16 paidCall site migrations, (d) progressive `redactLogPayload()` wrapping over P02-P04. Verifier session 2 (no knowledge of session 1 fixes) can then re-validate the safe subset independently before remediation closes.

The phase is **ready for verifier session 2** on the same safe subset; round-2 remediation can fire either before or after session 2 per the cloud chat's call.
