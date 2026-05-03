# Session handoff: P01a executor prompt surgical patch

Date: 2026-05-03
Type: doc patch (no code execution, no planner run)
Status: COMPLETE
Source-of-truth: `cova-plan/phases/P01a-demolition-ops.md` (commit `b347462`) + `cova-plan/audit-reports/modal-deadness-2026-05.md`

## What was patched

6 surgical edits to `cova-plan/planner-output/P01a-executor-prompt.md`:

| # | Section | Change |
|---|---------|--------|
| 1 | A.2 (decisions recap) | Added "Deferred decisions (reference only)" block listing DEF-001, DEF-002, DEF-003 verbatim from `OPEN_DECISIONS.md`. DEF-003 explicitly cites this patch + the audit report. |
| 2 | B.4 (Modal CLI drift check) | Replaced flat "live apps" check with three sub-checks: B.4.a (KEEP — must remain deployed), B.4.b (4 archive-target apps must STILL be deployed at session start so §D.5 can stop them), B.4.c (`cova-redesign-pipeline` must NOT be deployed; if it IS, halt). Replaced §B.6 narrative (planner-time discrepancy) with a resolved-history note pointing at §D.5. |
| 3 | D.2 (test classification) | Appended 4 ARCHIVE rows for `tests/e2e/fire_v6_diagnostic.py`, `fire_v6_tests.py`, `fire_v7_tests.py`, `fire_v8_tests.py`. Added a note that these live at REPO ROOT `tests/e2e/`, not under `apps/web/`. |
| 4 | D.5 (Modal app archival) | Added a new §D.5.0 "Priority archive list — the 5 verified artifacts" at the top of D.5 with: (a) 4 deployed V8-stage apps + per-app stop pattern, (b) 1 source-only orchestrator with explicit "no `modal app stop`" instruction, (c) executable app-id resolution snippet (jq + bash fallback), (d) defensive verification step for `cova-redesign-pipeline`. The existing §D.5.1 broader-sweep table is preserved as the secondary, lower-priority sweep. |
| 5 | E.11 (NEW — phantom env var cleanup) | Inserted new subsection E.11 covering: env.ts removal, .env.example removal, redesign route fallback removal, test-pipeline route DELETE-or-rewire decision, verifier-check `rg` command, build-must-still-pass check, dedicated commit boundary. Renumbered the prior "M3 commit boundaries" from E.11 → E.12 and bumped its commit count from 4 → 5 to include E.11. |
| 6 | F.3 (auto-evidence) | Replaced the "Modal control-panel screenshot showing dead-app deletion" line with: 4 per-app PNGs at `cova-plan/auto-evidence/P01a/modal-deletions/{app-name}.png`, plus the source-only orchestrator note. Added `modal-app-ids.txt` and before/after `modal app list` snapshots to the evidence inventory. Added two rows to the F.3 INDEX table (5-Modal-artifact + phantom env vars removed). Added new §F.3.a "Verifier session checks for the patched items" with 5 explicit verifier confirmations both sessions must run. |

## Verification

Re-greps run after edits:

| Check | Result |
|-------|--------|
| `anysplat\|marble-mini\|marble-plus\|colmap-fastgs` in executor prompt | 3 hits, all expected: 1 in §B.6 history note (intentional) + 2 references to `modal_pipeline/anysplat/` vendored directory (separate dead-code artifact, not the nonexistent Modal app — per audit + the prompt's exception clause). No regressions. |
| `flythrough\|glb-render` in executor prompt | 7 hits, all in `rooms` column-drop SQL (`flythrough_video_url`, `flythrough_ready`, `flythrough_duration_seconds`) — not Modal app references. `glb-render` returned 0 hits. No regressions. |
| 5 correct artifacts (4 stage apps + cova-redesign-pipeline) | 24 occurrences across §A, §B.4, §B.6, §D.2, §D.5.0, §D.5.1, §F.3, §F.3.a. Distribution as expected. |
| `REDESIGN_PIPELINE_WEBHOOK_URL` and `PREPROCESS_PIPELINE_WEBHOOK_URL` | 6 hits, all in §E.11 (cleanup target) + §F.3 (evidence/verifier). No occurrences elsewhere — clean. |
| `DEF-003` | 2 hits: §A.2 deferred decisions block + §D.5 source-of-truth header. |
| `fire_v6\|fire_v7\|fire_v8` | 6 hits: 4 in §D.2 classification rows + 1 in §D.2 git-mv note + 1 in §F.3.a verifier check. |
| New drift check items in §B | §B.4.a/b/c present; §B.6 rewritten as resolved-history note. |

All verification checks PASS. The original executor prompt (commit `6a40188`) is preserved in git history; the patched version supersedes.

## What's NOT changed (deliberately)

- Other 90% of executor prompt content unchanged: M0 subagent setup, all M1 SQL migrations, RLS isolation tests, all M3 modules except E.11, verifier protocol command templates.
- No research re-run.
- No code touched.
- Phase doc unchanged (already corrected in commit `b347462`).
- OPEN_DECISIONS.md unchanged (DEF-003 already added in commit `b347462`).
- The prior planner-complete handoff (`03-`) and modal-doc-correction handoff (`04-`) preserved unchanged.

## What's next

1. **Daksh confirms via Modal dashboard** that the 4 deployed V8-stage apps (`cova-preprocessing-pipeline`, `cova-structural-extraction`, `cova-professionalization`, `cova-generation`) show **zero invocations in the last 30 days** (gate before executor fires). Modal CLI cannot retrieve historical invocation counts; dashboard URL pattern: `https://modal.com/apps/cova-interior/main/<app-id>`.
2. If clean, fire the executor against the patched `cova-plan/planner-output/P01a-executor-prompt.md` in a fresh Claude Code session. The executor:
   - Runs §B drift checks first; halts if anything has shifted (e.g. apps redeployed, `cova-redesign-pipeline` resurrected).
   - Processes §D.5.0 priority archive list FIRST (the 5 verified artifacts), capturing stop output to `modal-stops.log` and dashboard screenshots.
   - Then continues with the broader §D.5.1 sweep.
   - Runs E.11 phantom-env-var cleanup as part of M3.
   - Captures evidence per §F.3 (now with explicit per-app screenshot paths and the patched verifier checks in §F.3.a).
3. Executor handoffs land at `SESSION_HANDOFFS/06-`, `07-`, etc. as M0 → M1 → M3 progress.
4. Verifier sessions × 2 close the phase.

## Files modified

- `cova-plan/planner-output/P01a-executor-prompt.md` (6 surgical edits; ~90 net new lines, no other content changed)
- `cova-plan/SESSION_HANDOFFS/05-P01a-executor-prompt-patch.md` (this file)

## Files NOT modified

- `cova-plan/phases/P01a-demolition-ops.md` — already corrected in commit `b347462`.
- `cova-plan/OPEN_DECISIONS.md` — already updated with DEF-003 in commit `b347462`.
- `cova-plan/audit-reports/modal-deadness-2026-05.md` — read-only source.
- All `cova-plan/SESSION_HANDOFFS/0[1-4]-*.md` — preserved as written.
- No code touched anywhere.
