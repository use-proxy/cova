# Phase 1A — Demolition + Ops Hardening

**Cova V1 implementation · Phase 1A of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 1A of 12 |
| **Goal** | Demolish all dead code, dead schema, and stale tests. Stand up subagents. Ship operational hardening (Sentry, redactor, timeouts, EXIF strip, `render_cost_log`, `failure_category` namespace, PostHog, Cloudflare wiring, feature flag infra). NO user-facing UI, NO auth, NO legal pages. |
| **Executor session estimate** | 3–4 sessions across M0/M1/M3, handoffs at 93–94% context |
| **Calendar estimate** | ~1.5 weeks focused work |
| **Predicted Claude credits** | ~$30–45 |
| **Predicted infra spend** | ~$1 (fixture renders / smoke probes) + $5–10/mo ongoing for subagent operating costs (verifier + schema-reviewer + cost-monitor API spend) |
| **Depends on** | Phase 0 partial: MCPs connected, audits read; Modal CLI authenticated on executor's machine |
| **Blocks** | P01b (Auth + Legal + Account Deletion). P01b cannot start until P01a is CLOSED. |

---

## 1. The session loop for this phase

How Phase 1A actually executes, end-to-end.

1. **You open a new claude.ai chat.** Paste this entire phase doc as the first message.
2. **Chat summarizes back.** Reads the doc, summarizes what it understands, lists gaps it sees, lists what it will research. You confirm or correct.
3. **Planner fires.** Chat invokes a fresh Claude Code planner session in `/Users/daksh/Desktop/cova/`. Planner uses Supabase MCP, EXA MCP, Context7 MCP, and web search to: verify drift against `PHASE_STATUS.md`, read all 21 audit files, enumerate exact dead column/table names from live Supabase schema, look up current docs for Sentry `instrumentation.ts`, Sharp EXIF stripping, Cloudflare Images / R2, Vercel Cron. Then it writes the executor prompt to `cova-plan/planner-output/P1a-executor-prompt.md` and stops.
4. **Executor prompt returns.** You paste the executor prompt back into the cloud chat. Chat verifies it covers every acceptance criterion, includes failure handling, references all hard rules. Approve or send back for revision.
5. **Executor fires.** Verified prompt goes into a fresh Claude Code session. Session executes M0 → M1 → M3 across 3–4 sessions with handoffs at 93–94% context written to `cova-plan/SESSION_HANDOFFS/`.
6. **Verifier session 1 fires.** Fresh Claude Code session, no executor context. Reads acceptance criteria + live state via Supabase MCP + actual code. Reviews by criterion, not by file. Self-heals detected issues in-session.
7. **Verifier session 2 fires.** Fresh again. No knowledge of session 1 fixes. Reads now-current code, runs same review independently. Session 2 reviews spec from scratch against current code. Session 1 completion claims are ignored. Session 2 is the source of truth.
8. **Document updates.** `PHASE_STATUS.md` (P01a → CLOSED, P01b → READY TO START), `OPEN_DECISIONS.md` (already created during the P01 split — see Section 5).

> **No manual click-script in P01a.** P01a has no user-facing UI. Verification is fully automated via verifier sessions + schema/migration checks + automated evidence (Supabase dashboards, Modal control panel screenshots, ESLint config, cost-monitor first cold-start report). No manual gate.

---

## 2. Prereq verification (chat runs before anything else)

If reality diverges from `PHASE_STATUS.md`, halt and write `cova-plan/drift/P1a-detected.md`.

### Filesystem checks
- Repo at `/Users/daksh/Desktop/cova/` accessible
- `apps/web/` exists with Next.js 14.x app router structure
- `docs/audit/` contains 21 audit files
- `cova-plan/PHASE_STATUS.md` shows Phase 1A as NOT STARTED
- `cova-plan/SESSION_HANDOFFS/` exists
- `cova-plan/back-bugs/`, `drift/`, `escalations/`, `manual-evidence/`, `subagents/` directories exist
- `apps/web/.env.local` contains `SEARCHAPI_KEY` (already set per Phase 0)

### External dependency checks
- Supabase project `xdeacbmkdwqrwxonqaqh` reachable via Supabase MCP
- Vercel project deployed at covainterior.com
- Supabase tier: Pro · Vercel tier: Pro
- EXA MCP, Context7 MCP, Supabase MCP all connected in Claude Code
- **Modal CLI authenticated on executor's machine** (`modal token list` returns valid token). If not, halt and instruct setup before M1 archive runs.

### Halt conditions
- Any audit file missing → drift report
- Repo not at expected path → halt
- Any required MCP not connected → halt, install MCP first
- Modal CLI not authenticated → halt

---

## 3. Pre-decisions (resolve before planner fires)

Seven gaps owned by P01a. Cloud chat resolves them in conversation with Daksh before invoking the planner. Numbering preserved from the pre-split doc for traceability.

**G1. Exact dead column names.** Audits give counts (28 columns on `rooms`); names not enumerated. *Resolution:* planner reads schema directly via Supabase MCP, produces enumerated drop list. Cross-references each name against codebase grep before drop.

**G2. Exact dead table names (17).** Same resolution as G1 — planner enumerates from live schema, cross-references with code.

**G3. State of `apps/web/lib/auth/legacy.ts`.** AUTH_AUDIT references it as iOS-era AuthSession code. *Resolution:* planner greps imports across repo, recommends archive vs delete. Most likely: move to `_archive/lib/legacy-auth.ts`, remove all imports. Archive (not delete) so the iOS recoded redeploy can grab it if needed.

**G6. Stale test inventory.** Codebase has many ad-hoc tests from V0 era (random integration tests, manual fix scripts disguised as tests). *Resolution:* planner classifies every existing test file into (a) tests of kept V1 surfaces → KEEP, audit, refactor; (b) tests of archived components/lib → ARCHIVE alongside the component at `_archive/tests/`; (c) genuinely orphaned (test imports nothing kept, tests no V1 surface) → DELETE. Default to archive when uncertain.

**G7. Pre-existing `render_cost_log` table state.** Audits say table exists with 0 rows. *Resolution:* planner verifies schema matches Phase 1A spec; if existing schema is wrong shape, drop and recreate. DDL uses `category text NOT NULL` per D-022; app-layer TypeScript union is the source of truth.

**G9. Existing Supabase Edge Functions.** Audit mentions one nightly cron at 2am UTC (style data aggregation). *Resolution:* planner audits `supabase/functions/`, identifies which to keep/delete. Account-deletion cascade Edge Function lives in P01b, not here.

**G10. Modal app cleanup scope.** Verified per `cova-plan/audit-reports/modal-deadness-2026-05.md` (2026-05-03): the original phase doc listed 6 Modal app names (anysplat, marble-mini, marble-plus, colmap-fastgs, flythrough, glb-render) that **do not exist** in the live workspace. The actual archive scope is **5 artifacts**:

- 4 deployed V8-stage apps (Tasks=0, no containers, last deploys 2026-04-13/14/14/17): `cova-preprocessing-pipeline`, `cova-structural-extraction`, `cova-professionalization`, `cova-generation`
- 1 undeployed orchestrator source file: `modal_pipeline/redesign_pipeline.py` deploys to `cova-redesign-pipeline` which is NOT deployed (`modal app history` returns "Could not find a deployed app"). No `modal app stop` needed; archive the .py only.

The 4 deployed apps were stages of the (now-undeployed) `cova-redesign-pipeline` orchestrator; with the orchestrator gone, no production path reaches them. *Resolution:* planner reads the audit report; executor archives 5 .py files via `git mv`, runs `modal app stop` on the 4 deployed apps, captures Modal dashboard deletion screenshot.

---

## 4. Background context (self-contained)

### 4.1 What Cova is

AI interior design product for end consumers. User signs up → takes a 12-pick forced-choice style quiz → sees their style fingerprint with personalized italic descriptor → uploads one photo of a real room → goes through three personalization slots (art, smart tech, lighting mood) → sees an editorial-grade redesigned photo via 8-stage pipeline → can refine with free-form text → can shop the items via Google Lens-powered hotspots with affiliate links. V1 ships when this works end-to-end with ≥80% verifier first-pass and ≤$0.32 cost per render.

### 4.2 What Phase 1A is

The demolition + operational hardening half of the original P01. Two things happen:

1. **Demolition.** Drop 28 dead columns, 17 dead tables, ~12 dead indexes. Archive ~70 `fix_*.mjs` scripts. Archive 5 Modal artifacts (4 deployed V8-stage apps + 1 undeployed orchestrator source file — see G10). Archive ~20 dead lib files. Archive ~12 dead components. Selectively classify existing tests (keep / archive / delete per G6 — including 4 V6/V7/V8 e2e diagnostic scripts that referenced archived apps). Strip all V0 references from active code. Drop-dead-tables migration is gated by a cron-table dependency audit (Decision 5).

2. **Operational hardening.** Sentry across all runtimes. `redactLogPayload()` enforced via ESLint custom rule (not CI grep). Timeout chain locked. EXIF strip pipeline + CI fixture test. `render_cost_log` wired with `paidCall<T>()` wrapper at `apps/web/lib/paid/call.ts` and a corresponding ESLint rule that forbids direct paid `fetch()` calls. `failure_category` dotted-namespace TypeScript union (auth.*, capture.*, render.*, refine.*, shop.*, quiz.*, cost.*, infra.*, subagent.*). PostHog client. Cloudflare Images + R2 wired. Feature flag infrastructure (table only — auth flag rows seeded in P01b).

> **Auth, legal pages, account deletion are out of scope here.** They live in P01b.

### 4.3 Audit findings driving this phase

| Audit | Gap | Phase 1A fix |
|---|---|---|
| STAGE5_AUDIT | ~30% of renders fail silently with empty `redesign_error` | failure_category enums + Sentry capture in M3 |
| SCHEMA_AUDIT | 28 dead columns, 17 dead tables, 12 dead indexes | M1 drops everything (reversible migration) |
| SUPABASE_AUDIT | RLS gaps on mood_feed_remixes; room-uploads bucket; quiz-images bucket missing policy (`pipeline_runs` lockdown deferred to Phase 5 — table not yet created) | M1 RLS consolidation migration with `p1_` policy prefix |
| TIMEOUT_AUDIT | 180/300/420 chain inverted | M3 locks 290/300/320 in `lib/config/timeouts.ts` |
| TELEMETRY_AUDIT | Sentry only on client; `instrumentation.ts` missing; `redactLogPayload` missing; `render_cost_log` unwired | M3 wires all four |
| LIB_AUDIT | ~20 dead lib files (orbit-controls, splat-loader, marble-client, etc.) | M1 archives all |
| COMPONENT_AUDIT | ~12 dead React components (SplatViewer, MarbleEmbed, FlythroughPlayer, LegacyQuizCard, etc.) | M1 archives all |
| MODAL_AUDIT | 6 dead Modal apps still deployed | M1 archives + deletes from Modal control panel |
| INFRA_AUDIT (Cloudflare) | Cloudflare Images not wired | M3 wires Cloudflare |

### 4.4 Existing infrastructure to preserve

- Supabase project `xdeacbmkdwqrwxonqaqh` — DO NOT recreate. Project uses publishable/secret key format (`sb_publishable_*` / `sb_secret_*`). Legacy JWT keys are disabled. Executor uses publishable key in client code, secret key in server code via env.
- Cova landing page already deployed at covainterior.com — Phase 10 redesigns it; Phase 1A leaves it alone
- **iOS app source code is never modified during V1. iOS app runtime behavior against the live backend is NOT protected — destructive backend changes (table drops, column drops, RLS changes) may break the iOS app for current users; iOS gets recoded at redeploy time, not before.**
- 4 Modal apps to keep: `cova-perception`, `cova-empty-room`, `cova-redesign`, `cova-composite-art`. Verifier confirms they're deployed and reachable.
- Test user UUID `62126d57-42df-405c-a38d-3a621f1fe3a8` — preserve for testing
- Vercel project + Pro tier + auto-deploy on push to main
- Supabase Auth: keep, do not recreate; new publishable/secret key format active

---

## 5. Tech stack for this phase

| Layer | Tool | Version / config |
|---|---|---|
| Frontend | Next.js | 14.x (Phase 12 may upgrade to 15) |
| Frontend | React | 18 |
| Language | TypeScript | strict mode |
| Validation | Zod | latest stable |
| Hosting (web) | Vercel | Pro tier |
| Hosting (media) | Cloudflare R2 + Cloudflare Images | Pro |
| Backend | Supabase | Pro tier; publishable/secret keys |
| Errors | Sentry | client + server + edge runtimes |
| Analytics | PostHog | EU instance |
| Image processing | Sharp (libvips) | EXIF strip via `.withMetadata({})` |
| State | Zustand (UI) + TanStack Query (server) | |
| MCP (planning + verifier) | Supabase, EXA, Context7 | |

> Resend, Termly, Cloudflare Turnstile, zxcvbn, React Email, React Hook Form move to P01b (auth + legal surface).

### Hard locked rules (D-001..D-022 — apply globally)

- **D-001:** One photo per room. Not video, not multiple photos, not 360.
- **D-002:** No catalog scraping. Ever. Product matching via Google Lens (SearchApi.io) only.
- **D-003:** No LoRAs.
- **D-004:** No multi-reference style images.
- **D-005:** No depth-conditioning ControlNet on Stage 5.
- **D-006:** No multi-pass FLUX.1 → FLUX.2 averaging.
- **D-007:** 12-pick quiz count locked.
- **D-008:** Display names only — never expose internal style codenames.
- **D-009:** EXIF strip mandatory on every uploaded image. Server-side via Sharp.
- **D-010:** `redactLogPayload` before every log statement. ESLint custom rule enforces (not CI grep).
- **D-011:** Cost telemetry on every paid call. `paidCall<T>()` wrapper + ESLint rule enforce structurally (not CI grep).
- **D-012:** `failure_category` populated on every failure path. Dotted namespace format: `auth.signup.email_taken`, `render.stage5.fal_timeout`, etc.
- **D-013:** 8 render stages locked. Don't add, merge, or reorder.
- **D-014:** THREE.js stays at 0.155.0.
- **D-015:** `fetch()` only for fal.ai and Anthropic. No SDK adoption.
- **D-016:** Forced-choice A vs B quiz. Not swipe-or-skip.
- **D-017:** 10 styles taxonomy locked.
- **D-018:** Refine UI is free-form text only.
- **D-019:** Build token infrastructure but DO NOT enforce in V1. `ENFORCE_TOKEN_LIMITS=false`.
- **D-020:** Mood feed dropped from V1 entirely.
- **D-021:** Termly free tier for legal pages. Sarah M Brooklyn placeholder testimonial (Phase 10).
- **D-022:** `render_cost_log.category` is `text` at DB layer; validated as TypeScript union at app layer (`apps/web/lib/cost/categories.ts`). Phases extend the union without `ALTER TYPE` migrations.

---

## 6. Scope

Two milestone tracks: **1A backend / infrastructure** and **1B integration**. No 1B-UI subsection (P01a ships no UI).

### 1A — Backend / Infrastructure

**M0 — Subagent setup**

Subagent prompt source-of-truth: `cova-plan/subagents/{name}.md` (version controlled).
Sync script: `scripts/sync-subagents.sh` — copies `cova-plan/subagents/*.md` to `.claude/agents/`. Runs on every subagent edit. Lint check verifies `.claude/agents/` matches source.

| Subagent | Type | Invocation | Output |
|---|---|---|---|
| verifier | Claude Code subagent at `.claude/agents/verifier.md` | `/agents` in fresh Claude Code session | `cova-plan/verifier-reports/P{N}-session-{1,2}.md` |
| schema-reviewer | Standalone script at `scripts/agents/schema-reviewer.ts` | GitHub Action `schema-review.yml` on PR with migration files | PR comment via GitHub API |
| frontend-visionary | Claude Code subagent at `.claude/agents/frontend-visionary.md` | `/agents` in dev sessions (P01b primary use; created in P01a but unused here) | In-session output |
| cost-monitor | Standalone script at `scripts/agents/cost-monitor.ts` invoked by Vercel Cron via `/api/cron/cost-monitor` | Daily 06:00 UTC | `cova-plan/cost-reports/{YYYY-MM-DD}.md` + PostHog event `cost_alert` if thresholds tripped + (optional) Slack webhook if `SLACK_WEBHOOK_URL` env set |

Standalone scripts call Anthropic API directly using the .md as system prompt. Read `ANTHROPIC_API_KEY` from env (must be set in Vercel env for cost-monitor; local `.env` for schema-reviewer dev runs). Models: Sonnet for verifier + schema-reviewer, Haiku for cost-monitor.

**Cost-monitor cold start:** first 7 days post-launch use hardcoded daily ceiling **$30/day**. Day 8+: rolling **2× 7-day-avg** threshold. Lock both thresholds in `cova-plan/subagents/cost-monitor.md`.

Deliverables in M0:
- `cova-plan/subagents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md` written
- `.claude/agents/{verifier,schema-reviewer,frontend-visionary,cost-monitor}.md` synced
- `scripts/sync-subagents.sh` written + executable + wired into a lint check
- `scripts/agents/{schema-reviewer,cost-monitor,verifier,frontend-visionary}.ts` runnable (the standalone callers, where applicable)
- Cost-monitor cron registered (Vercel Cron, daily 06:00 UTC, calls `/api/cron/cost-monitor`)
- CI hook for schema-reviewer in `.github/workflows/schema-review.yml`

**M1 — Demolition**

This is the most aggressive milestone of V1. Everything that doesn't directly serve V1 gets nuked or archived.

**Migration ordering (locked, Decision 12):**

1. **Snapshot pre-drop schema** — `pg_dump --schema-only --no-owner > cova-plan/snapshots/P01a-pre-drop.sql` (manual or scripted; first step of M1). Each migration's `_down.sql` is informed by this snapshot.
2. `drop-dead-indexes`
3. `drop-dead-room-cols`
4. `drop-dead-tables` — **gated by cron table dependency audit** (see below).
5. `render-cost-log-verify` (recreate if shape wrong; `category text NOT NULL` per D-022)
6. `feature-flags`
7. `rls-consolidation` (last; writes policies on the now-clean schema, all CREATE POLICY with `p1_` prefix per Decision 10)

**Cron table dependency audit (Decision 5).** BEFORE `drop-dead-tables` migration runs, planner greps every `supabase/functions/*/index.ts` file against the 17-table drop list. Any reference to a dropped table fails the migration; the cron is updated to remove the query OR the cron itself is archived. This audit is a verifier prereq for M1.

- **Schema cleanup** — single migration drops all 28 dead `rooms` columns. Another drops 17 dead tables. Another drops 12 dead indexes. Each migration paired with `_down.sql` rollback informed by the pre-drop snapshot. Schema-reviewer subagent reviews every migration.
- **Test classification (selective, not bulk).** Planner classifies every existing test file into:
  - **(a) KEEP** — tests of kept V1 surfaces. Audit, refactor as needed.
  - **(b) ARCHIVE** — tests of archived components/lib. Move to `_archive/tests/` alongside the component, via `git mv`.
  - **(c) DELETE** — genuinely orphaned (test imports nothing kept, tests no V1 surface).

  Default to archive when uncertain. New Phase 1A tests added fresh.
- **Script archive** — `~70 fix_*.mjs` scripts moved (via `git mv`) to `_archive/scripts/`. Single PR.
- **Modal app archive** — 5 artifacts per `cova-plan/audit-reports/modal-deadness-2026-05.md`:
  - 4 deployed V8-stage apps moved (via `git mv`) to `_archive/modal_pipeline/`: `preprocessing.py` (cova-preprocessing-pipeline), `structural_extraction.py` (cova-structural-extraction), `professionalization.py` (cova-professionalization), `generation.py` (cova-generation). For each: also run `modal app stop <app-id>` and delete from Modal control panel (screenshot evidence).
  - 1 undeployed orchestrator source file: `modal_pipeline/redesign_pipeline.py` → `_archive/modal_pipeline/redesign_pipeline.py`. The corresponding Modal app `cova-redesign-pipeline` is NOT deployed; no `modal app stop` needed.
  - Also `git mv` the 4 V6/V7/V8 e2e diagnostic scripts (next bullet) to keep test-archive aligned with code archive.
- **V6/V7/V8 e2e test archival** — per Decision 4 ARCHIVE bucket, `git mv` the following test files (each invokes `modal.Function.from_name("cova-generation", ...)` and is no longer relevant):
  - `tests/e2e/fire_v6_diagnostic.py` → `_archive/tests/e2e/fire_v6_diagnostic.py`
  - `tests/e2e/fire_v6_tests.py` → `_archive/tests/e2e/fire_v6_tests.py`
  - `tests/e2e/fire_v7_tests.py` → `_archive/tests/e2e/fire_v7_tests.py`
  - `tests/e2e/fire_v8_tests.py` → `_archive/tests/e2e/fire_v8_tests.py`
- **Lib file archive** — ~20 dead files moved (via `git mv`) to `_archive/lib/`: `orbit-controls.js`, `camera-anchor*.ts`, `splat-loader.ts`, `splat-renderer.ts`, `marble-client.ts`, `marble-poller.ts`, `flythrough-builder.ts`, `colmap-client.ts`, `fastgs-client.ts`, `glb-loader.ts`, `glb-furniture-manifest.ts`, `legacy-auth-session.ts`, plus others enumerated by planner.
- **Component archive** — ~12 dead components moved (via `git mv`) to `_archive/components/`: `<SplatViewer />`, `<SplatThumbnail />`, `<MarbleEmbed />`, `<MarblePlusViewer />`, `<FlythroughPlayer />`, `<GLBFurnitureRenderer />`, `<LegacyQuizCard />`, `<LegacyQuizSwiper />`, plus others enumerated by planner.
- **Archive READMEs.** Each archived chunk gets a `README.md` at `_archive/{category}/README.md` explaining what was archived and why (e.g., `_archive/lib/README.md`: "dead 3D rendering libs from V0 splat pipeline; replaced by FLUX 2D pipeline in V1"). All archives use `git mv` to preserve file history. `_archive/` is committed to the repo (NOT gitignored).
- **Stale data flagging** — 138 stale "failed" rooms tagged `internal_test_data_pre_v1` in `tags` jsonb for analytics filter.
- **RLS consolidation** — single migration codifies explicit policies on every table, every CREATE POLICY prefixed `p1_` (e.g., `p1_rooms_self_all`, `p1_users_self_read`). `pipeline_runs` lockdown deferred to Phase 5 (the table is not yet created in this phase; Phase 5 will add it with RLS enabled and no policies). `swipe_history` self-read + self-insert. `room-uploads` bucket users-own-folder, server full. `quiz-images` bucket read-anyone, server-only write. **Two-user isolation tests at `tests/rls/two-user-isolation.test.ts` contain ONE test case per kept user-scoped table.** Planner enumerates kept user-scoped tables after demolition and writes one test per table verifying User A cannot SELECT/UPDATE/DELETE User B's rows.
- **Verifier confirms** no live code references any `_archive/` path (greps imports).

**M3 — Operational hardening**
- `instrumentation.ts` at apps/web root for Sentry server runtime
- `next.config.js` wraps with `withSentryConfig` (sourcemaps upload on deploy)
- 3 Sentry config files: client, server, edge
- Sample rates: traces 0.1, profiles 0.05, replays-on-error 0.5, session replay 0.0
- `redactLogPayload()` at `apps/web/lib/log/redact.ts` strips: emails, phones, addresses, payment data, forbidden field names (`password`, `apiKey`, `accessToken`, `refreshToken`, `secretKey`, `creditCard`, `cvv`, `ssn`, `dob`), AND: `userId` (hash to 8-char SHA256 prefix, never raw), `sessionId`, `ipAddress`, `userAgent` (truncate to first 64 chars), `authToken`, `magicLinkToken`.
- **ESLint custom rule** at `apps/web/eslint-rules/no-unsafe-console.ts` (Decision 7): walks AST; flags any `console.error|log|warn|info|debug` call where any argument is an `Identifier` or `ObjectExpression` that isn't wrapped in `redactLogPayload(...)`. Registered via `apps/web/eslint.config.js` plugin registration. **Replaces** the prior `redactLogPayload` CI grep check in `.github/workflows/lint.yml`.
- **Paid-call wrapper** at `apps/web/lib/paid/call.ts` (Decision 7): exports `paidCall<T>(opts: { provider: 'anthropic' | 'fal' | 'modal' | 'searchapi' | 'resend', url: string, init: RequestInit, costEstimate: { category: string, costUsd: number, model?: string, stage?: string } }): Promise<T>`. Internally fires fetch + invokes `logCost` in same transaction. `logCost` runs even on fetch failure (with `failure_category` populated).
- **ESLint custom rule** at `apps/web/eslint-rules/no-direct-paid-fetch.ts` (Decision 7): forbids `fetch()` calls with URL arguments matching any of `api.anthropic.com`, `fal.run`, `*.modal.run`, `searchapi.io`, `api.resend.com` — except inside `apps/web/lib/paid/call.ts`. **Replaces** the prior "logCost nearby" CI grep check.
- Both ESLint rules registered in `apps/web/eslint.config.js`. CI workflow runs lint via `pnpm lint` (or yarn equivalent). Build fails on rule violations.
- Timeout chain in `apps/web/lib/config/timeouts.ts`: Vercel route 290s, Modal app 300s, fal client 320s, Anthropic Sonnet vision 60s, Sonnet director 30s, Haiku classifier 15s
- CI grep fails build on hardcoded numbers (180/290/300/320/420) outside `lib/config/timeouts.ts`
- EXIF strip pipeline at `apps/web/lib/capture/process.ts`. Sharp pipeline: `.rotate().resize(1536, 1536, {fit: 'inside', withoutEnlargement: true}).jpeg({quality: 90, mozjpeg: true}).withMetadata({}).toBuffer()`
- CI fixture test at `tests/exif/strip.test.ts` — fixture image with known GPS tags. Confirms re-encoded version has zero EXIF via `exiftool` parsing raw bytes.
- `render_cost_log` schema verified/recreated. `category` is `text NOT NULL` (Decision 3, D-022). Allowed values live as a TypeScript union at `apps/web/lib/cost/categories.ts`: `render`, `refine`, `quiz_descriptor`, `hard_room_classify`, `art_composite`, `art_generate`, `smart_tech_recommend`, `lighting_recommend`, `lens_query`, `clip_rerank`, `verifier`, `verifier_light`, `moderation_nsfw`, `moderation_borderline`, `moderation_csam`. Phases extend the union without `ALTER TYPE` migrations.
- `logCost()` wrapper at `apps/web/lib/cost/log.ts` (called internally by `paidCall<T>()`).
- `failure_category` enum file at `apps/web/lib/errors/categories.ts` (Decision 8). Wire format is dotted: `auth.signup.email_taken`, `render.stage5.fal_timeout`, `shop.lens.api_error`, etc. Locked namespace prefixes: `auth.*`, `capture.*`, `render.*`, `refine.*`, `shop.*`, `quiz.*`, `cost.*`, `infra.*`, `subagent.*`. Each phase owns its prefix. P01a ships per-stage union types for the prefixes it owns: `cost.*`, `infra.*`, `subagent.*`. Auth-specific failure category strings (`auth.signup.email_taken` etc.) live in P01b §11.
- PostHog client at `apps/web/lib/analytics/posthog.ts`. EU instance. Event taxonomy at `apps/web/lib/analytics/events.ts` — type-checked event names.
- PostHog dashboard alerts: verifier 7-day rolling mean drop, failure rate > 5%/24h, p95 render latency > 90s/1h, daily cost > 2× 7-day rolling avg.
- Cloudflare Images zone configured + R2 bucket `cova-renders` ready
- Feature flag infrastructure: `feature_flags` table (id, key, enabled bool, percent_rollout int, environment) + typed reader at `apps/web/lib/feature-flags/index.ts`. **NO flag rows seeded yet** (auth flags are P01b's domain). Phase 5+ consumes.
- **Env hygiene — phantom env vars left by archived V8 orchestrator** (per `cova-plan/audit-reports/modal-deadness-2026-05.md` §What I couldn't determine):
  - `apps/web/lib/env.ts` line 24: REMOVE the `REDESIGN_PIPELINE_WEBHOOK_URL` entry entirely (currently `required: true, serverOnly: true`). The V9 path uses `COVA_REDESIGN_URL`; the legacy fallback in `apps/web/app/api/pipeline/redesign/route.ts` would dead-end at the missing orchestrator anyway. Remove the fallback branch in that route file as well so boot doesn't require a phantom var.
  - `apps/web/.env.example` line 25: REMOVE the `PREPROCESS_PIPELINE_WEBHOOK_URL` entry (no consuming code anywhere — confirmed via grep).
  - `apps/web/.env.example`: REMOVE the `REDESIGN_PIPELINE_WEBHOOK_URL` entry (now archived alongside the orchestrator).
  - `apps/web/app/api/test-pipeline/route.ts`: this route reads `REDESIGN_PIPELINE_WEBHOOK_URL` directly. Either delete the route (preferred — it tested the V8 orchestrator that no longer exists) or update it to point at `COVA_REDESIGN_URL`. Prefer deletion; document choice in handoff.
  - Verifier check: `rg 'REDESIGN_PIPELINE_WEBHOOK_URL|PREPROCESS_PIPELINE_WEBHOOK_URL' apps/web/ --not-archive` returns 0 matches.

### 1B — Integration + review

- Run sync-subagents lint check; confirm `.claude/agents/` matches `cova-plan/subagents/`
- Verifier 7-phase pass on M0, M1, M3 separately
- Schema-reviewer pass on every migration
- Two-user isolation tests pass: User A cannot SELECT/UPDATE/DELETE User B's data via any kept user-scoped table (one test per table)
- All `console.error|log|warn|info|debug` instances of objects either wrapped in `redactLogPayload` or flagged by the ESLint rule
- Cron-table dependency audit clean (no `supabase/functions/*` reference any dropped table)
- Adversarial probes pass (see §14)

---

## 7. Out of scope (executor MUST NOT touch)

- **Auth, legal pages, account deletion** (in P01b — runs after P01a closes)
- Quiz UI / Bayesian engine / quiz schema (Phase 2)
- Capture flow (Phase 3)
- Personalization slots (Phase 4)
- Render pipeline (Phase 5)
- Refine flow (Phase 6)
- Product matching / shop screen (Phase 7)
- Token enforcement (Phase 8 builds infra; enforce stays false)
- Dashboard (Phase 9)
- Landing page redesign (Phase 10 — current landing stays as-is)
- iOS app (source code never touched in V1; runtime not protected — see §4.4)
- 4 live Modal apps (`cova-perception`, `cova-empty-room`, `cova-redesign`, `cova-composite-art`) — verifier confirms reachable, executor doesn't modify
- Stripe / billing UI (V1.5)
- 2FA / TOTP (V1.5)
- Social sign-in beyond Google + Apple (V1.5)

---

## 8. Files touched (expected paths)

### Created
- `apps/web/instrumentation.ts`
- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `apps/web/lib/log/redact.ts`
- `apps/web/lib/config/timeouts.ts`
- `apps/web/lib/cost/log.ts`
- `apps/web/lib/cost/categories.ts` (Decision 3 — TypeScript union for `render_cost_log.category`)
- `apps/web/lib/paid/call.ts` (Decision 7 — `paidCall<T>()` wrapper)
- `apps/web/lib/errors/categories.ts` (Decision 8 — dotted-namespace `failure_category` union, P01a-owned prefixes only: `cost.*`, `infra.*`, `subagent.*`)
- `apps/web/lib/analytics/posthog.ts`
- `apps/web/lib/analytics/events.ts`
- `apps/web/lib/feature-flags/index.ts`
- `apps/web/lib/capture/process.ts` (EXIF pipeline; full capture wired in Phase 3)
- `apps/web/eslint-rules/no-unsafe-console.ts` (Decision 7)
- `apps/web/eslint-rules/no-direct-paid-fetch.ts` (Decision 7)
- `apps/web/eslint.config.js` (registers both custom ESLint rules)
- `apps/web/app/api/cron/cost-monitor/route.ts` (Vercel Cron entrypoint, secret-protected via `CRON_SECRET`)
- `cova-plan/subagents/verifier.md`
- `cova-plan/subagents/schema-reviewer.md`
- `cova-plan/subagents/frontend-visionary.md`
- `cova-plan/subagents/cost-monitor.md`
- `.claude/agents/verifier.md` (synced from cova-plan/subagents/)
- `.claude/agents/schema-reviewer.md` (synced)
- `.claude/agents/frontend-visionary.md` (synced — created here, unused until P01b)
- `.claude/agents/cost-monitor.md` (synced)
- `scripts/sync-subagents.sh` (Decision 9 — copies cova-plan/subagents/*.md to .claude/agents/)
- `scripts/agents/verifier.ts`
- `scripts/agents/schema-reviewer.ts`
- `scripts/agents/frontend-visionary.ts`
- `scripts/agents/cost-monitor.ts`
- `cova-plan/snapshots/P01a-pre-drop.sql` (Decision 12 — pre-drop schema snapshot)
- `_archive/lib/README.md` (Decision 11 — explains archive)
- `_archive/components/README.md`
- `_archive/scripts/README.md`
- `_archive/modal_pipeline/README.md`
- `_archive/tests/README.md` (for category-(b) archived tests per Decision 4)
- `.github/workflows/schema-review.yml`
- `.github/workflows/lint.yml` (CI runs `pnpm lint` which fires both ESLint custom rules; retains hardcoded-timeout grep)
- `tests/rls/two-user-isolation.test.ts` (one test case per kept user-scoped table per Decision 6)
- `tests/exif/strip.test.ts`
- `tests/fixtures/exif-with-gps.jpg`

### Migrations (all reversible with paired _down.sql, ordered per Decision 12)
- `supabase/migrations/{ts}-drop-dead-indexes.sql` (12 indexes)
- `supabase/migrations/{ts}-drop-dead-room-cols.sql` (28 columns)
- `supabase/migrations/{ts}-drop-dead-tables.sql` (17 tables; gated by cron-table dependency audit per Decision 5)
- `supabase/migrations/{ts}-render-cost-log-verify.sql` (recreate if shape wrong; `category text NOT NULL`)
- `supabase/migrations/{ts}-feature-flags-table.sql`
- `supabase/migrations/{ts}-rls-consolidation.sql` (CREATE POLICY entries all use `p1_` prefix)

### Archived (moved via `git mv`, not deleted — recoverable; `_archive/` is committed)
- `_archive/scripts/` — ~70 `fix_*.mjs` files
- `_archive/modal_pipeline/preprocessing.py` (cova-preprocessing-pipeline; deployed app)
- `_archive/modal_pipeline/structural_extraction.py` (cova-structural-extraction; deployed app)
- `_archive/modal_pipeline/professionalization.py` (cova-professionalization; deployed app, code header marks DORMANT/DISABLED 2026-04-13)
- `_archive/modal_pipeline/generation.py` (cova-generation; deployed app, ~1,826 LOC)
- `_archive/modal_pipeline/redesign_pipeline.py` (cova-redesign-pipeline orchestrator source; app NOT deployed, archive .py only)
- `_archive/modal_pipeline/README.md` per Decision 11 — explains the 5-artifact archive and references `cova-plan/audit-reports/modal-deadness-2026-05.md`
- `_archive/lib/` — ~20 dead files
- `_archive/components/` — ~12 dead components
- `_archive/lib/legacy-auth.ts` (former `apps/web/lib/auth/legacy.ts`)
- `_archive/tests/` — category-(b) tests (tests of archived components/lib), including:
  - `_archive/tests/e2e/fire_v6_diagnostic.py`
  - `_archive/tests/e2e/fire_v6_tests.py`
  - `_archive/tests/e2e/fire_v7_tests.py`
  - `_archive/tests/e2e/fire_v8_tests.py`

### Deleted (not recoverable; intentional, narrow)
- Only category-(c) tests per G6 / Decision 4: genuinely orphaned tests that import nothing kept and test no V1 surface. Default-to-archive when uncertain.

### Modified (~120 files)
- Every file currently using `console.error|console.log|console.warn` of objects — wrapped in `redactLogPayload`
- Every file currently using direct `fetch()` against fal.ai / Anthropic / Modal / SearchApi / Resend — refactored to call `paidCall<T>()`
- `next.config.js` — `withSentryConfig` wrap
- `apps/web/lib/env.ts` — remove `REDESIGN_PIPELINE_WEBHOOK_URL` entry
- `apps/web/.env.example` — remove `PREPROCESS_PIPELINE_WEBHOOK_URL` and `REDESIGN_PIPELINE_WEBHOOK_URL` entries
- `apps/web/app/api/pipeline/redesign/route.ts` — remove the legacy `REDESIGN_PIPELINE_WEBHOOK_URL` fallback branch (dead code; orchestrator gone)
- `apps/web/app/api/test-pipeline/route.ts` — preferred: DELETE (V8 test harness; no longer relevant). Alternate: rewire to `COVA_REDESIGN_URL`. Executor decides; documents in handoff.

---

## 9. API contracts

No public API contracts in P01a (no user-facing endpoints).

**Internal:**

### GET /api/cron/cost-monitor
```
Headers: Authorization: Bearer <CRON_SECRET>  (Vercel Cron only)
Returns: { ok: true, report_path: 'cova-plan/cost-reports/{YYYY-MM-DD}.md' } or error envelope
Side effects: Anthropic Haiku call to summarize previous-day cost; writes report; emits PostHog `cost_alert` event if thresholds tripped; (optional) Slack webhook if SLACK_WEBHOOK_URL set
```

All internal routes use Unit-1 error envelope: `{ ok: false, failure_category: '<dotted.category>', user_message: '<safe>', detail: '<dev-only>' }`

---

## 10. Schema migrations (full DDL)

Applied in the order defined by Decision 12 (snapshot first, then indexes → cols → tables → render_cost_log → feature_flags → rls).

### Step 0 — pre-drop schema snapshot
```bash
pg_dump --schema-only --no-owner > cova-plan/snapshots/P01a-pre-drop.sql
```
Each `_down.sql` for the migrations below is informed by this snapshot (so a column-restore down migration knows the original type/default/constraints).

### Step 1 — drop dead indexes (planner enumerates 12 names)
```sql
DROP INDEX IF EXISTS rooms_splat_url_idx;
-- ... 11 more
```
Down: `CREATE INDEX rooms_splat_url_idx ON ...;` per snapshot.

### Step 2 — drop dead room columns (planner enumerates exact names)
```sql
-- Pattern; exact names from planner Supabase MCP query
ALTER TABLE rooms DROP COLUMN IF EXISTS splat_url;
ALTER TABLE rooms DROP COLUMN IF EXISTS splat_thumbnail_url;
-- ... 26 more
```
Down: `ALTER TABLE rooms ADD COLUMN splat_url text;` etc., per snapshot. Data loss documented in migration comment.

### Step 3 — drop dead tables (planner enumerates 17 names)
```sql
-- GATED: cron-table dependency audit must pass before this migration runs.
-- Audit greps every supabase/functions/*/index.ts for references to any of the 17.
-- Any reference fails the migration; the cron is updated or archived first.
DROP TABLE IF EXISTS splat_renders CASCADE;
DROP TABLE IF EXISTS marble_jobs CASCADE;
-- ... 15 more
```

### Step 4 — render_cost_log (verify or recreate; `category text NOT NULL` per D-022)
```sql
CREATE TABLE IF NOT EXISTS render_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  render_id uuid,
  category text NOT NULL,        -- D-022: text not enum; validated as TS union app-side
  stage text,
  cost_usd numeric(8,4) NOT NULL,
  model text,
  duration_ms int,
  failure_category text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS render_cost_log_user_idx ON render_cost_log(user_id);
CREATE INDEX IF NOT EXISTS render_cost_log_render_idx ON render_cost_log(render_id);
CREATE INDEX IF NOT EXISTS render_cost_log_category_idx ON render_cost_log(category);
CREATE INDEX IF NOT EXISTS render_cost_log_created_idx ON render_cost_log(created_at DESC);
ALTER TABLE render_cost_log ENABLE ROW LEVEL SECURITY;
-- Service-role-only writes; user reads own rows
CREATE POLICY p1_render_cost_log_self_read ON render_cost_log FOR SELECT USING (auth.uid() = user_id);
```

### Step 5 — feature_flags (table only; no auth-related rows seeded here — those are P01b's job)
```sql
CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  percent_rollout int NOT NULL DEFAULT 0 CHECK (percent_rollout BETWEEN 0 AND 100),
  environment text NOT NULL CHECK (environment IN ('development','preview','production','all')),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY p1_feature_flags_read_all ON feature_flags FOR SELECT USING (true);
-- Writes service-role-only
```
Down: `DROP TABLE feature_flags;`

### Step 6 — RLS consolidation (last; all CREATE POLICY entries use `p1_` prefix per Decision 10)
```sql
-- Enable RLS on every table (idempotent)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- ... etc

-- Self-read/write policies on user-owned data, all p1_-prefixed
CREATE POLICY p1_users_self_read ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY p1_rooms_self_all ON rooms FOR ALL USING (auth.uid() = user_id);

-- Service-role-only on infrastructure tables
-- (pipeline_runs lockdown moved to Phase 5: that phase creates the table.
--  Round 2 verifier finding #4: table is absent from public schema today.)

-- Storage bucket policies (also p1_-prefixed)
INSERT INTO storage.buckets (id, name, public) VALUES ('quiz-images', 'quiz-images', true) ON CONFLICT DO NOTHING;
CREATE POLICY p1_quiz_images_public_read ON storage.objects FOR SELECT TO public USING (bucket_id = 'quiz-images');

-- room-uploads bucket: users own folder
INSERT INTO storage.buckets (id, name, public) VALUES ('room-uploads', 'room-uploads', false) ON CONFLICT DO NOTHING;
CREATE POLICY p1_room_uploads_user_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY p1_room_uploads_user_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
```

> **Note (Decision 10):** Phases 5+ add their own policies prefixed `p5_`, `p7_`, etc. Postgres OR-combines policies on the same role/command — additive by design. P01a does NOT lock service-role write policies on tables Phase 5 owns (`renders`, `pipeline_runs`); those land when Phase 5 ships. Phase 5 phase doc is responsible for adding `p5_renders_service_write` etc.

---

## 11. Failure handling

### Dotted-namespace `failure_category` (Decision 8)

Wire format is dotted: `<prefix>.<surface>.<reason>`. Locked prefixes (each phase owns its prefix):

- `auth.*` (owned by P01b)
- `capture.*` (P3)
- `render.*` (P5)
- `refine.*` (P6)
- `shop.*` (P7)
- `quiz.*` (P2)
- `cost.*` (P01a)
- `infra.*` (P01a)
- `subagent.*` (P01a)

P01a ships per-stage union types for `cost.*`, `infra.*`, `subagent.*` only. Other prefixes are added by their owning phase.

```typescript
// apps/web/lib/errors/categories.ts (P01a-owned slice)
export type CostFailure =
  | 'cost.log.write_fail'
  | 'cost.monitor.cron_fail'
  | 'cost.monitor.threshold_breach'
  | 'cost.paidcall.fetch_fail'
  | 'cost.paidcall.parse_fail';

export type InfraFailure =
  | 'infra.cloudflare.images_unreachable'
  | 'infra.cloudflare.r2_write_fail'
  | 'infra.sentry.init_fail'
  | 'infra.posthog.capture_fail'
  | 'infra.feature_flag.read_fail';

export type SubagentFailure =
  | 'subagent.verifier.run_fail'
  | 'subagent.schema_reviewer.api_fail'
  | 'subagent.cost_monitor.api_fail'
  | 'subagent.sync.diff_detected';

export type FailureCategory = CostFailure | InfraFailure | SubagentFailure;
//   ↑ AuthFailure, CaptureFailure, etc. are added by their owning phases via union extension
```

### Recovery actions
| Category prefix | Recovery |
|---|---|
| `cost.log.write_fail` | Retry once with backoff; on second failure log via Sentry direct, do not block the paid call's user-facing response |
| `cost.monitor.cron_fail` | PostHog `cron_failed` event; Sentry capture; no user impact (background only) |
| `cost.monitor.threshold_breach` | Emit PostHog `cost_alert`; (optional) Slack webhook; no automated mitigation in V1 |
| `cost.paidcall.*` | Surface as the underlying provider error to the caller; ensure logCost still ran with failure_category |
| `infra.cloudflare.*` | Retry once; on second failure fall back to direct Supabase Storage URL where applicable |
| `infra.sentry.init_fail` | Continue boot; emit boot warning to stdout; do not crash the runtime |
| `subagent.*` | PostHog event; Sentry capture; subagent run output marked failed; Daksh notified via cost-report markdown |
| Network / DB transient | Standard retry-with-backoff at the call site; final failure surfaces as the appropriate `cost.*`/`infra.*` category |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits (planner + executor + verifier × 2) | $30–45 (less than the original P01 because no auth surface in P01a) |
| Resend test sends | $0 (no auth in P01a) |
| Cloudflare Images / R2 setup | within Pro tier |
| Supabase reads/writes during dev | within Pro tier |
| Vercel deploys + Vercel Cron | within Pro tier |
| Sentry events | within free tier (<50k/mo) |
| PostHog events | within free tier |
| **P01a setup total** | **~$35–55** |
| **Subagent operating costs (ongoing)** | **~$5–10 / month** (verifier + schema-reviewer + cost-monitor API spend, post-deploy) — see Decision 14 |

---

## 13. Verifier focus areas (Layer 1 source-of-truth checklist)

Verifier session 1 reviews by criterion. Each acceptance criterion mapped to a verifiable artifact. **Verifier session 2 reviews spec from scratch against current code. Session 1 completion claims are ignored. Session 2 is the source of truth.**

| Criterion | Verifier check |
|---|---|
| Subagents wired | `cova-plan/subagents/{name}.md` exists for all 4; `.claude/agents/{name}.md` matches source; `scripts/agents/{name}.ts` runnable |
| Sync script + lint check | `scripts/sync-subagents.sh` exists, executable; lint check fails on diff between `cova-plan/subagents/` and `.claude/agents/` |
| Pre-drop snapshot exists | `cova-plan/snapshots/P01a-pre-drop.sql` non-empty, generated before any DROP migration ran |
| **Cron table dependencies audited** | No `supabase/functions/*` file references any of the 17 dropped table names (Decision 5) |
| 28 dead columns dropped | Supabase MCP: `SELECT column_name FROM information_schema.columns WHERE table_name='rooms'` — none of the 28 match |
| 17 dead tables dropped | Supabase MCP: `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` — none of the 17 match |
| 12 dead indexes dropped | Supabase MCP confirms each named index gone |
| Test classification correct | Every test file is one of: kept-and-passing (category a), in `_archive/tests/` (category b), or absent (category c). Default-to-archive bias verifiable in planner output. |
| Dead code archived via `git mv` | `find _archive/` shows lib/, components/, scripts/, modal_pipeline/, tests/ subdirs populated; `git log --follow` on a sample archived file shows full history preserved; `_archive/{cat}/README.md` exists for each |
| RLS policies on user-scoped tables exist with `p1_` prefix; service-role-only tables (account_deletions [P01b], render_cost_log writes) have RLS enabled with no policies. (`pipeline_runs` lockdown deferred to Phase 5: it owns table creation.) | Supabase MCP query enumerates policies on each table |
| Two-user isolation tests pass per-table | **Test case count >= count of kept user-scoped tables; each table has at least one isolation test** (Decision 6) |
| Sentry on all runtimes | `instrumentation.ts` exists; all 3 sentry.*.config.ts exist; `next.config.js` wraps |
| `redactLogPayload` enforced via ESLint | `apps/web/eslint-rules/no-unsafe-console.ts` exists, registered in `eslint.config.js`; `pnpm lint` returns 0 violations on a clean tree; intentionally bad fixture trips the rule |
| Paid-call wrapper enforced via ESLint | `apps/web/lib/paid/call.ts` exists; `apps/web/eslint-rules/no-direct-paid-fetch.ts` exists, registered; `pnpm lint` returns 0; a fixture with raw `fetch('https://api.anthropic.com/...')` outside `lib/paid/call.ts` trips the rule |
| Timeout chain locked | `lib/config/timeouts.ts` exports correct values; CI grep confirms no hardcoded 180/290/300/320/420 elsewhere |
| EXIF strip works | `tests/exif/strip.test.ts` passes against fixture with known GPS |
| `render_cost_log` wired | Schema matches spec; `category` is `text NOT NULL`; `apps/web/lib/cost/categories.ts` TypeScript union matches the documented allowed values |
| `failure_category` enum file | `lib/errors/categories.ts` exports `CostFailure | InfraFailure | SubagentFailure`; all values follow dotted format `<prefix>.<surface>.<reason>` |
| PostHog wired | `lib/analytics/posthog.ts` exists; events typed; dashboard alerts configured |
| Feature flags infra | `feature_flags` table exists with `p1_feature_flags_read_all` policy; reader at `lib/feature-flags/index.ts`; **NO seeded rows yet** |
| Cost-monitor cron live | Vercel Cron registered to `/api/cron/cost-monitor` daily 06:00 UTC; first cold-start report exists at `cova-plan/cost-reports/{YYYY-MM-DD}.md` |
| 5 Modal artifacts archived correctly | 4 deployed apps (cova-preprocessing-pipeline, cova-structural-extraction, cova-professionalization, cova-generation) confirmed stopped via `modal app list` (state ≠ deployed) + Modal dashboard screenshot; `_archive/modal_pipeline/` contains the 5 .py files (4 stages + redesign_pipeline.py) plus README.md per Decision 11 |
| Phantom env vars removed | `REDESIGN_PIPELINE_WEBHOOK_URL` absent from `apps/web/lib/env.ts` and `apps/web/.env.example`; `PREPROCESS_PIPELINE_WEBHOOK_URL` absent from `apps/web/.env.example`; `rg 'REDESIGN_PIPELINE_WEBHOOK_URL\|PREPROCESS_PIPELINE_WEBHOOK_URL' apps/web/ -- --not-archive` returns 0 matches |

### Verifier session 2 cross-check

Session 2 reads now-current code with no knowledge of session 1 fixes. Specifically hunts for:
- New issues introduced by session 1's fixes
- Issues session 1 might have rationalized past
- Disagreements with session 1's fix decisions (flag, don't re-edit)
- Test coverage of edge cases session 1 might have skipped

Session 2's report is binding when it disagrees with session 1.

---

## 14. Adversarial code review checklist

Verifier specifically hunts for these patterns in Phase 1A surface:

- [ ] Any `console.error|console.log|console.warn|console.info|console.debug` of an `Identifier` or `ObjectExpression` not wrapped in `redactLogPayload` (the ESLint rule should catch every instance)
- [ ] Any direct `fetch()` against api.anthropic.com / fal.run / *.modal.run / searchapi.io / api.resend.com from outside `apps/web/lib/paid/call.ts` (the ESLint rule should catch every instance)
- [ ] Any hardcoded timeout number (180/290/300/320/420) outside `lib/config/timeouts.ts`
- [ ] Any new table without RLS enabled
- [ ] Any Supabase storage bucket without policies
- [ ] Any kept user-scoped table without a corresponding `tests/rls/two-user-isolation.test.ts` case
- [ ] Any image upload code path without Sharp `.withMetadata({})` strip
- [ ] Any active code import referencing `_archive/` paths
- [ ] Any test file remaining outside the `tests/` directory or `_archive/tests/` and NOT in the Phase 1A created list
- [ ] Any reference to deprecated tables/columns/components in active code
- [ ] Any `legacy-*` import in non-archive code
- [ ] Any Modal app deploy command targeting an archived app
- [ ] Any `process.env.X` access without explicit check + fallback
- [ ] Any Sentry init call without sample rates configured
- [ ] Any PostHog event without typed name from `events.ts`
- [ ] Any `supabase/functions/*` reference to a dropped table (cron-table dependency audit)
- [ ] Any CREATE POLICY in P01a migrations missing the `p1_` prefix
- [ ] Any `failure_category` literal in code that does not follow `<prefix>.<surface>.<reason>` and does not use one of the locked prefixes
- [ ] Any reference to archived V8 orchestrator (`cova-redesign-pipeline`) or its 4 stages (`cova-preprocessing-pipeline`, `cova-structural-extraction`, `cova-professionalization`, `cova-generation`) in active code outside `_archive/`
- [ ] Any remaining reference to `REDESIGN_PIPELINE_WEBHOOK_URL` or `PREPROCESS_PIPELINE_WEBHOOK_URL` in `apps/web/` outside `_archive/` (phantom env vars; should be 0)

---

## 15. Manual click-script

P01a has no user-facing UI. Verification is fully automated via verifier sessions + schema/migration checks. **No manual gate.** All evidence is captured per §16.

---

## 16. Automated evidence bundle

Save to `cova-plan/auto-evidence/P01a/`:

- Supabase dashboard screenshots of dropped tables / dropped columns / dropped indexes
- Supabase dashboard screenshot showing `p1_*` policies on each kept user-scoped table
- Modal control panel screenshot showing the 4 deployed V8-stage apps removed (cova-preprocessing-pipeline, cova-structural-extraction, cova-professionalization, cova-generation). The 5th archive artifact (cova-redesign-pipeline orchestrator) is source-only — never deployed; archived via `git mv` of `modal_pipeline/redesign_pipeline.py`. Cross-reference: `cova-plan/audit-reports/modal-deadness-2026-05.md`.
- Verifier reports archived at `cova-plan/verifier-reports/P1a-session-1.md` and `P1a-session-2.md`
- Schema-reviewer reports for every migration (`cova-plan/verifier-reports/P1a-schema-{filename}.md`)
- ESLint config (`apps/web/eslint.config.js`) snapshot showing both custom rules registered + `pnpm lint` clean log
- Cost-monitor first cold-start report (`cova-plan/cost-reports/{YYYY-MM-DD}.md`)
- `cova-plan/snapshots/P01a-pre-drop.sql` retained as durable proof of pre-state
- Cron-table dependency audit log
- `INDEX.md` linking each artifact to the §13 criterion it evidences

---

## 17. Remediation budget

(Cross-references §14 adversarial checklist.)

- **Round 1:** Verifier session 1 self-heals issues found.
- **Round 2:** Verifier session 2 finds new issues OR introduced regressions → fresh executor session fixes via remediation prompt.
- **Round 3 (escalation):** If verifier still fails → write `cova-plan/escalations/P1a.md` describing what's blocked. Stop. Open planning conversation in cloud chat to revise Phase 1A scope.

---

## 18. Closing checklist (run at phase close)

- [ ] All automated-evidence artifacts captured in `cova-plan/auto-evidence/P01a/`
- [ ] `PHASE_STATUS.md` Phase 1A → CLOSED with date; Phase 1B → READY TO START
- [ ] `OPEN_DECISIONS.md` exists with D-001..D-022 + DEF-001 + DEF-002 (created during the P01 split)
- [ ] Sentry dashboard shows Phase 1A deploy events captured cleanly
- [ ] PostHog dashboard shows Phase 1A events firing
- [ ] Verifier reports archived at `cova-plan/verifier-reports/P1a-session-1.md` and `P1a-session-2.md`
- [ ] Session handoffs at `cova-plan/SESSION_HANDOFFS/` for every executor session
- [ ] `git log` shows clean commits per milestone (no fixup commits squashed)

---

## 19. Rollback plan

If Phase 1A merge breaks production:

1. Revert merge commit on main → Vercel auto-deploys previous state → production restored
2. Run paired `_down.sql` migrations in reverse order via Supabase Studio:
   - `rls-consolidation` down
   - `feature-flags` down
   - `render-cost-log-verify` down (if recreated)
   - `drop-dead-tables` down (data loss documented; restore from snapshot/backup if critical)
   - `drop-dead-room-cols` down (informed by `cova-plan/snapshots/P01a-pre-drop.sql`)
   - `drop-dead-indexes` down
3. Restore archived files from `_archive/` if needed (`git mv` history preserved)
4. Update `PHASE_STATUS.md` Phase 1A → REMEDIATING
5. Open cloud chat, diagnose, prepare remediation prompt

Modal app archives can be redeployed via `modal deploy <app>.py` if needed for legacy iOS app dependency (verify before redeploy — and remember §4.4: iOS runtime is not protected).

---

## 20. Feature flags introduced

P01a creates the **`feature_flags` table** (DDL in §10 step 5) and the **typed reader** at `apps/web/lib/feature-flags/index.ts`.

**No flag rows seeded yet.** Auth-related flags (`auth_apple_oauth`, `auth_magic_link`, `email_verification_required`) are seeded in P01b. Phase 5+ adds more.

---

## 21. Document updates at phase close

These docs get updated/created when Phase 1A closes:

1. **`PHASE_STATUS.md`** — Phase 1A → CLOSED with date; Phase 1B → READY TO START
2. **`OPEN_DECISIONS.md`** — already exists from the P01 split; no new decisions to log here unless P01a execution surfaces one
3. **`cova-plan/phases/P01b-auth-legal-deletion.md`** — review §2 prereq section for any assumptions changed during Phase 1A execution
4. **Phase 1A handoff at `cova-plan/SESSION_HANDOFFS/NN-P1a-close.md`** — final handoff capturing everything done

---

## End of Phase 1A doc.

Next: Phase 1B — Auth + Legal + Account Deletion. Phase 1B doc lives at `cova-plan/phases/P01b-auth-legal-deletion.md`.
