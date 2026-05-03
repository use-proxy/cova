# Session handoff: P01a executor — M0 complete, M1 local-write complete, M3 ~70%, destructive remote gate pending

Date: 2026-05-02
Type: executor session 1 of P01a (multi-session, ~3-4 expected)
Status: clean handoff at session boundary; next session resumes at "destructive-action gate" + remaining M3 surgical work
Source-of-truth: `cova-plan/planner-output/P01a-executor-prompt.md`
Predecessor handoff: `05-P01a-executor-prompt-patch.md`

## What landed in this session (7 commits)

| SHA | Scope |
|-----|-------|
| `a2c7e93` | M0: 4 subagent prompts → cova-plan/subagents/*.md, synced to .claude/agents/*.md; scripts/sync-subagents.sh; 4 scripts/agents/*.ts; apps/web/app/api/cron/cost-monitor/route.ts; vercel.json crons; .github/workflows/{schema-review,lint}.yml |
| `29e8b49` | M1: 6 demolition migrations + paired *_down.sql (drop-dead-indexes, drop-dead-room-cols, drop-dead-tables, render-cost-log-recreate, feature-flags-table, rls-consolidation); pre-drop snapshot at cova-plan/snapshots/P01a-pre-drop-20260502-202507.sql (349 KB) |
| `9145c69` | M1: 19 modal_pipeline files git-mv'd to _archive/; redesign_phase5.py.bak deleted; 5 lib + 1 component + 46 fix_*.mjs scripts archived; retry route archived; delete-account / aggregate-style-profiles / render-room edge-fn patches in source (deploy DEFERRED) |
| `d2555db` | M1: RLS two-user isolation test (13 tables); test classification table; cron-table audit log; modal-app-ids.txt + before snapshot; back-bugs for python-test-imports + stale-data-flagging |
| `56e63bb` | M3: Sentry triplet (client/server/edge) + instrumentation.ts (Next 14 register pattern) |
| `1639738` | M3: lib/log/redact.ts (PII + composed forbidden-name); lib/logging/redactor.ts back-compat re-export; lib/cost/{categories,log}.ts; lib/paid/call.ts; lib/errors/categories.ts; ESLint custom rules + tests; eslint-plugin-cova-rules wiring; .eslintrc.json updates; package.json adds @aws-sdk + plugin |
| `990b9a7` | M3: lib/config/timeouts.ts; lib/capture/process.ts + EXIF test; lib/analytics/{posthog,events}.ts; lib/feature-flags/index.ts; lib/media/cloudflare.ts + roundtrip test (gated); .github/workflows/test.yml |

## Drift checks at session start (§B) — all PASS

- B.1 filesystem + dirs present; SEARCHAPI_KEY populated.
- B.2 PHASE_STATUS §4 P1A row was `NOT STARTED` at session start.
- B.3 Supabase: rooms cols=93 (≥70 ✓), dead-table candidates=17 (≥14 ✓).
- B.4.a/b/c: 4 V8-stage apps deployed; 6 KEEP apps deployed; cova-redesign-pipeline NOT deployed (`modal app history` returned "Could not find a deployed app"). Captured to `cova-plan/auto-evidence/P01a/modal-app-list.before.txt`.
- B.5 covainterior.com → 307 to www. (live).

## What is COMPLETE

### M0 (committed `a2c7e93`)
All M0 scope met. Subagent files exist in both `cova-plan/subagents/` (source of truth) and `.claude/agents/` (synced). Sync script tested manually (`./scripts/sync-subagents.sh` produced "synced: ... OK"). Cron route + workflows wired.

**Caveat for verifier:** the 4 P01a subagent files in `.claude/agents/` were written verbatim per spec (no YAML frontmatter), which differs from the pre-existing executor.md / planner.md / verifier.md (which had `name`, `description`, `tools`, `model` frontmatter). If `/agents <subagent>` invocation requires frontmatter for parsing, the human can patch each file's top with a frontmatter block; the body content is the spec-prescribed system prompt.

### M1 LOCAL-WRITE work (committed `29e8b49` `9145c69` `d2555db`)
- All 6 migration .sql files + paired _down.sql written.
- Pre-drop snapshot captured (349 KB) — well over the 50 KB threshold.
- 19 modal_pipeline/*.py files archived; 1 .bak file deleted; AnySplat dir checked (does not exist; spec was speculative).
- 5 lib files archived (`unsplash.ts` KEPT — actively imported by redesign route at `apps/web/app/api/pipeline/redesign/route.ts:30`; spec option (b) applied).
- SplatViewer archived (only one of the spec's "12 dead components" actually existed).
- 46 fix_*.mjs archived to `_archive/scripts/`.
- 8 ARCHIVE test files relocated; 1 DELETE removed (`apps/web/tests/lib/affiliates.test.ts`).
- Edge-fn patches in source: `delete-account` lines 47/52 commented + explanatory blocks; `aggregate-style-profiles` + `render-room` top-of-file DEPRECATED 2026-05-02 blocks.
- Dormant `apps/web/app/api/render/retry/route.ts` archived to `_archive/web/api/render/retry-route.ts`.
- RLS isolation tests at `apps/web/tests/rls/two-user-isolation.test.ts` (13 tables, two real test users).
- Cron-table audit at `cova-plan/auto-evidence/P01a/cron-table-audit.md`.
- Modal app-ids resolved at `cova-plan/auto-evidence/P01a/modal-app-ids.txt`.
- Back-bugs filed: `cova-plan/back-bugs/P01a-python-test-imports.md`, `P01a-stale-data-flagging.md`.

### M3 partial (committed `56e63bb` `1639738` `990b9a7`)
All NEW M3 files exist. Sentry triplet adjusted. ESLint custom rules + tests wired. .eslintrc.json updated (cova-rules plugin + timeout literal restrictions + paid-call/timeouts/test overrides). package.json: added eslint-plugin-cova-rules file: dep, @aws-sdk/client-s3 3.726.1, @aws-sdk/s3-request-presigner 3.726.1.

## What is DEFERRED (the gate)

### Destructive remote actions — REQUIRE EXPLICIT DAKSH CONFIRMATION

**Pre-condition (per handoff `05-`):** Daksh confirms via Modal dashboard
that the 4 deployed V8-stage apps (`cova-preprocessing-pipeline`,
`cova-structural-extraction`, `cova-professionalization`, `cova-generation`)
show **zero invocations in the last 30 days**. Modal CLI cannot retrieve
historical invocation counts; this is a manual dashboard check at
`https://modal.com/apps/cova-interior/main/<app-id>` for each (IDs in
`cova-plan/auto-evidence/P01a/modal-app-ids.txt`). If any have non-zero
recent traffic, halt and re-evaluate.

**Once gate clears, the next executor session must:**

1. **Apply the 6 migrations** in order to production Supabase
   (`xdeacbmkdwqrwxonqaqh`):
   1. `20260502203000-drop-dead-indexes.sql` (rows lost: 0; safe)
   2. `20260502203100-drop-dead-room-cols.sql` (28 cols; per-column row counts in
      file header; pre-flight grep before applying — see in-file note)
   3. `20260502203200-drop-dead-tables.sql` **GATED** on cron-table audit at
      `cova-plan/auto-evidence/P01a/cron-table-audit.md` (PASS) AND on
      `delete-account` re-deploy (step 4 below)
   4. `20260502203300-render-cost-log-recreate.sql` (drop & recreate; D-022)
   5. `20260502203400-feature-flags-table.sql` (additive)
   6. `20260502203500-rls-consolidation.sql` (drops legacy per-op policies;
      creates p1_ FOR ALL policies)

   Use Supabase MCP `apply_migration` for each. After each, capture a screenshot
   of the schema state to `cova-plan/auto-evidence/P01a/supabase-screenshots/`
   per §F.3.

2. **Stop the 4 V8-stage Modal apps** (per `cova-plan/auto-evidence/P01a/modal-app-ids.txt`):
   ```bash
   modal app stop ap-FElGd2FhTf5QKGfuE4b9vF  # cova-preprocessing-pipeline
   modal app stop ap-8cm6jU3O64tyLwJhNbVLkf  # cova-structural-extraction
   modal app stop ap-QMSansNQCC0ob67UmemjPw  # cova-professionalization
   modal app stop ap-hpMfKgb0I8y0FgIbERk81F  # cova-generation
   ```
   Capture stdout to `cova-plan/auto-evidence/P01a/modal-stops.log`.
   Then `COLUMNS=200 modal app list 2>&1 > cova-plan/auto-evidence/P01a/modal-app-list.after.txt`.
   Daksh follows up with manual dashboard delete + per-app screenshot to
   `cova-plan/auto-evidence/P01a/modal-deletions/{app-name}.png` (4 files).

3. **Re-deploy `delete-account` Edge Function** (the only Rule 12 exception in P01a):
   ```bash
   supabase functions deploy delete-account --project-ref xdeacbmkdwqrwxonqaqh
   ```

### Remaining M3 surgical work (DEFERRED to next executor session)

These touch existing files and need careful surgery — defer to the next session
so the verifier sees a clean diff:

1. **E.11 phantom env var cleanup** (per executor prompt §E.11):
   - `apps/web/lib/env.ts` — REMOVE the `REDESIGN_PIPELINE_WEBHOOK_URL` schema entry (around line 24; verify at execute time)
   - `apps/web/.env.example` — REMOVE `PREPROCESS_PIPELINE_WEBHOOK_URL` and `REDESIGN_PIPELINE_WEBHOOK_URL` if present
   - `apps/web/app/api/pipeline/redesign/route.ts` — REMOVE legacy `REDESIGN_PIPELINE_WEBHOOK_URL` fallback branches (~lines 142, 148, 762; verify)
   - `apps/web/app/api/test-pipeline/route.ts` — DELETE the route OR rewire to `COVA_REDESIGN_URL`. Decision by greppability: `rg 'test-pipeline' apps/web/ tests/ scripts/ -g '!_archive/**'`
   - Verify clean: `rg 'REDESIGN_PIPELINE_WEBHOOK_URL|PREPROCESS_PIPELINE_WEBHOOK_URL' apps/web/ supabase/ scripts/ -g '!_archive/**' -g '!docs/**'` MUST return 0 hits
   - Verify boot: `cd apps/web && npm run build` must complete without env-validation errors mentioning the removed vars
   - Commit: `phase-1a-m3: remove phantom V8-orchestrator env vars + dead fallback`

2. **next.config.mjs Sentry wrap** for sourcemap upload (low-priority; can land any time before P12 deploy):
   - Wrap export with `withSentryConfig(nextConfig, { silent: true, org: ..., project: ..., authToken: ..., hideSourceMaps: true })`. ESM equivalent of spec snippet (existing `next.config.mjs` is ESM).
   - Add SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN to Vercel env.

3. **16 direct paid-fetch site migrations** to `paidCall<T>()` (executor prompt §E.3):
   - 11 files, 16 sites enumerated in spec — start by re-reading §E.3 for the exact list (line numbers may have drifted).
   - For each: replace raw `fetch()` with `paidCall<T>({...})`; provide cost estimate from spec's per-provider table; supply category/stage/model.
   - Site #16 (`apps/web/tests/ai/llm-judge.test.ts:248`) keeps raw fetch with inline `// eslint-disable-next-line cova-rules/no-direct-paid-fetch` per spec.

4. **`npm install` in apps/web** to wire `eslint-plugin-cova-rules` file: dep
   and @aws-sdk packages, then `npm run lint` to confirm no false-positives in
   the existing tree (this is also a useful smoke test of the new rules).

### Verifier readiness

Per §F.1/F.2 the verifier runs in 2 fresh sessions after the destructive gate
clears + remaining M3 work lands. Session 1 may self-heal; session 2 reviews
fresh. Auto-evidence index at `cova-plan/auto-evidence/P01a/INDEX.md` is NOT
yet written; the next session should compose it after the destructive actions
complete.

## Cursor for the next session

1. Read this handoff + `cova-plan/PHASE_STATUS.md`.
2. Re-run §B drift checks (confirm nothing has shifted).
3. Confirm with Daksh the Modal-dashboard zero-invocation gate per `05-` handoff.
4. If GREEN, proceed to the 3 destructive remote actions in order: migrations
   apply → modal stop → delete-account deploy.
5. Then complete the 4 deferred M3 surgical items (E.11, withSentryConfig,
   16 paidCall migrations, npm install).
6. Compose `cova-plan/auto-evidence/P01a/INDEX.md` and any missing evidence
   artifacts (after-snapshots, ESLint clean log, etc.).
7. Hand off again or proceed to verifier sessions.

## Files NOT modified in this session (deliberately)

- `apps/mobile/` — frozen.
- `apps/web/app/auth/*` — P01b territory.
- `next.config.mjs` — Sentry wrap deferred.
- 11 files containing the 16 paid-fetch sites — deferred surgery.
- `apps/web/lib/env.ts`, `apps/web/.env.example`, `apps/web/app/api/pipeline/redesign/route.ts`, `apps/web/app/api/test-pipeline/route.ts` — E.11 deferred.
- 4 frozen Edge Functions besides the 3 listed — frozen per Rule 12.
- Production Supabase schema (xdeacbmkdwqrwxonqaqh) — destructive actions deferred behind gate.
- Modal app deployed state — same.
- All untracked files outside this session's scope (`docs/audit/*`, `scripts/bakeoff*`, `scripts/audit-quiz-catalog/*`, `scripts/density-test/*`, etc.) — pre-existing, not P01a.

## Manual gate items requiring Daksh

- Confirm zero recent invocations on the 4 V8-stage Modal apps via dashboard.
- Set the following env vars in Vercel (Production + Preview):
  - `CRON_SECRET` (32-byte hex; generate via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  - `SLACK_WEBHOOK_URL` (optional; cost-monitor Slack notification)
  - `COVA_LAUNCH_DATE` (default `2026-05-15`; update at deploy time)
  - `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (for E.8)
  - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_ENV` (for E.1 sourcemap upload, when next.config.mjs is wrapped)
- Set GitHub Actions repo secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (for `.github/workflows/{schema-review,test}.yml`).

## Stop conditions honored (§G)

- No `apps/web/app/auth/*` touched (P01b).
- No `/terms` / `/privacy` / `/account-deleted` created (P01b).
- No `apps/mobile/` touched.
- Live KEEP Modal apps untouched.
- Frozen Edge Functions only patched per the narrow §D.4 exception.
- No D-NNN re-litigation.
- Pre-drop snapshot captured at §D.1.
- Test classification was selective (Decision 4) — 8 ARCHIVE, 1 DELETE.
- No remote pushes (local commits only).
- Stopped at session boundary before exceeding context budget.
