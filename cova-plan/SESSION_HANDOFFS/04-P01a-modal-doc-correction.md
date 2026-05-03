# Session handoff: P01a Modal app correction

Date: 2026-05-03
Type: phase doc correction (no code execution)
Status: COMPLETE

## What was corrected

- **Wrong Modal app names removed.** The P01a phase doc named 6 Modal apps for archival (anysplat, marble-mini, marble-plus, colmap-fastgs, flythrough, glb-render) that **do not exist** in the live Modal workspace today. Per `cova-plan/audit-reports/modal-deadness-2026-05.md`:
  - The 6 names came from an older planning era (pre-V8); the current dead-app set is different.
  - Replaced with **5 verified artifacts**:
    - 4 deployed V8-stage apps: `cova-preprocessing-pipeline`, `cova-structural-extraction`, `cova-professionalization`, `cova-generation` (all Tasks=0, no containers, last deploys 2026-04-13/14/14/17).
    - 1 undeployed orchestrator source file: `modal_pipeline/redesign_pipeline.py` deploys to `cova-redesign-pipeline`, which is NOT deployed (`modal app history cova-redesign-pipeline` returns "Could not find a deployed app"). Archive .py only — no `modal app stop` needed.
- **e2e test archival list added.** Per Decision 4 ARCHIVE bucket, the 4 V6/V7/V8 e2e diagnostic scripts that referenced `cova-generation` are now explicit in §6 M1 + §8:
  - `tests/e2e/fire_v6_diagnostic.py`
  - `tests/e2e/fire_v6_tests.py`
  - `tests/e2e/fire_v7_tests.py`
  - `tests/e2e/fire_v8_tests.py`
- **Env hygiene task added to M3.** Phantom env vars left by the now-archived V8 orchestrator:
  - `apps/web/lib/env.ts` line 24: REMOVE `REDESIGN_PIPELINE_WEBHOOK_URL` entry.
  - `apps/web/.env.example`: REMOVE `PREPROCESS_PIPELINE_WEBHOOK_URL` and `REDESIGN_PIPELINE_WEBHOOK_URL` entries.
  - `apps/web/app/api/pipeline/redesign/route.ts`: remove the legacy `REDESIGN_PIPELINE_WEBHOOK_URL` fallback branch (dead code; orchestrator gone).
  - `apps/web/app/api/test-pipeline/route.ts`: prefer DELETE (V8 test harness; no longer relevant). Alternate: rewire to `COVA_REDESIGN_URL`. Executor decides.
- **Verifier check added** (§13): "Phantom env vars removed: `REDESIGN_PIPELINE_WEBHOOK_URL` absent from `apps/web/lib/env.ts` and `.env.example`; `PREPROCESS_PIPELINE_WEBHOOK_URL` absent from `.env.example`."
- **Verifier check added** (§13): "5 Modal artifacts archived correctly: 4 deployed apps confirmed stopped + 1 .py source archived + `_archive/modal_pipeline/README.md` written."
- **Adversarial probes added** (§14):
  - Any reference to archived V8 orchestrator or its 4 stages in active code outside `_archive/`.
  - Any remaining reference to `REDESIGN_PIPELINE_WEBHOOK_URL` or `PREPROCESS_PIPELINE_WEBHOOK_URL` in `apps/web/` outside `_archive/`.
- **Auto-evidence updated** (§16): screenshot expectation now lists 4 deployed apps (not 6); cross-references the audit report.
- **DEF-003 process rule added to OPEN_DECISIONS.md.** Codifies "verify artifacts exist before planner emits archival commands". Future planners halt + update doc on mismatch instead of silently substituting names from audit docs.

## Verification

Re-greps run after edits:

| Check | Result |
|-------|--------|
| Old 6-app list (`anysplat\|marble-mini\|marble-plus\|colmap-fastgs\|flythrough\|glb-render`) appears in P01a doc | Only at line 83 (G10 explanation, intentional) and line 243 (lib-file names like `flythrough-builder.ts`, `glb-loader.ts` — these are `apps/web/lib/` TypeScript files, not Modal app names; same word roots from V0-era naming overlap). No Modal-app-archive context. |
| 5-artifact list appears in §6 M1 + §8 Archived | YES — 4 deployed V8-stage apps + 1 undeployed orchestrator source file, with named .py paths. |
| 4 e2e test files appear in §8 Archived | YES — listed under `_archive/tests/e2e/`. |
| Env hygiene task in §6 M3 + §13 + §14 | YES — M3 bullet, two §13 rows (5-artifact + phantom-env), two §14 probes. |
| DEF-003 in OPEN_DECISIONS.md | YES — appended; revision log entry dated 2026-05-03. |
| Audit report cross-referenced | YES — `cova-plan/audit-reports/modal-deadness-2026-05.md` cited in G10, M1 archive bullet, §8 README, §13 verifier row, §16 evidence note, OPEN_DECISIONS DEF-003. |

## What's next

1. **Daksh confirms via Modal dashboard** that all 4 deployed V8-stage apps show zero invocations in the last 30 days (CLI cannot retrieve historical invocation counts; dashboard URL pattern `https://modal.com/apps/cova-interior/main/<app-id>`). If clean, proceed.
2. **Re-fire planner** against the updated `cova-plan/phases/P01a-demolition-ops.md` to regenerate the executor prompt at `cova-plan/planner-output/P01a-executor-prompt.md`.
   - Most research will hit the planner's prior research artifacts (saved in `cova-plan/SESSION_HANDOFFS/03-P01a-planner-complete.md`); only the Modal-archival section + new env-hygiene section need fresh enumeration.
   - The previously-generated executor prompt (commit `6a40188`) used the wrong app names; the regenerated one will use the verified 5-artifact list and include the env-hygiene step.
3. After regen, Daksh approves and fires the executor.

## Files modified

- `cova-plan/phases/P01a-demolition-ops.md` — 6 edits (G10, §4.2, §6 M1 archive bullet + e2e bullet, §8 Archived, §6 M3 env hygiene, §8 Modified, §13 two new rows, §14 two new probes, §16 evidence note)
- `cova-plan/OPEN_DECISIONS.md` — DEF-003 appended; revision log updated
- `cova-plan/SESSION_HANDOFFS/04-P01a-modal-doc-correction.md` — this file

## Files NOT modified

- No code touched.
- No migrations run.
- No Modal apps stopped.
- No planner or executor invoked.
- No commits pushed to remote (local commit only, on `main`).
