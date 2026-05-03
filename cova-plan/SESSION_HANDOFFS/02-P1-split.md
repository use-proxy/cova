# Session handoff: P01 split into P01a + P01b

Date: 2026-05-02
Session type: phase doc restructure (no code execution)
Status: COMPLETE

## What was done

- Original `cova-plan/phases/P01-foundations.md` moved to `cova-plan/phases/_archive/P01-foundations-pre-split.md` via `git mv` (history preserved).
- Two new phase docs created from the locked split plan:
  - `cova-plan/phases/P01a-demolition-ops.md` (712 lines) — M0 + M1 + M3 (subagents, demolition, ops hardening). NO user-facing UI.
  - `cova-plan/phases/P01b-auth-legal-deletion.md` (614 lines) — M2 only (6 auth screens, 9 auth API routes, Edge Function, GDPR export, Termly /terms + /privacy, /account-deleted).
- All 16 locked decisions from the planning conversation applied. See Section 2 of the split prompt; per-decision verification recorded in `cova-plan/coverage-logs/P01-split-coverage.md` Step 8.
- `cova-plan/OPEN_DECISIONS.md` created with D-001..D-022 + DEF-001 + DEF-002 + revision log.
- `cova-plan/PHASE_STATUS.md` updated: original P1 row in §4 replaced with P1A + P1B rows; §7 baseline likewise updated; top-of-file metadata bumped (`Last updated: 2026-05-02 (P01 split into P01a + P01b)`; `Next phase to plan: Phase 1A — Demolition + Ops Hardening`).
- Coverage verification: **PASSED** across all 9 steps. Artifact at `cova-plan/coverage-logs/P01-split-coverage.md`.

## Files created
- `cova-plan/phases/P01a-demolition-ops.md`
- `cova-plan/phases/P01b-auth-legal-deletion.md`
- `cova-plan/OPEN_DECISIONS.md`
- `cova-plan/coverage-logs/P01-split-coverage.md`
- `cova-plan/SESSION_HANDOFFS/02-P1-split.md` (this file)

## Files modified
- `cova-plan/PHASE_STATUS.md`

## Files moved (git mv)
- `cova-plan/phases/P01-foundations.md` → `cova-plan/phases/_archive/P01-foundations-pre-split.md`

## Decisions locked (additions only — D-001..D-021 are pre-existing)

- **D-022:** `render_cost_log.category` is `text` at DB layer; validated as TypeScript union at app layer (`apps/web/lib/cost/categories.ts`). Phases extend the union without `ALTER TYPE` migrations.
- **DEF-001:** `instrumentation.ts` Sentry pattern revisited at Phase 12 if Next 15 upgrade lands. Current pattern is Next 14 stable.
- **DEF-002:** Termly free-tier capability check — verified before P01b ships, not before P01a. If insufficient, decision pivots to paid tier or alternative.

## What's next

- Daksh reviews `cova-plan/phases/P01a-demolition-ops.md` and `cova-plan/phases/P01b-auth-legal-deletion.md` against `cova-plan/coverage-logs/P01-split-coverage.md`.
- If satisfied, returns to planning chat to receive the P01a planner prompt (Prompt 2 of the split workflow).
- Planner produces the executor prompt for P01a (writes to `cova-plan/planner-output/P1a-executor-prompt.md`).
- Executor runs P01a; verifier × 2 sessions confirm; PHASE_STATUS.md flips P1A → CLOSED.
- Then the same workflow for P01b in a fresh chat (a separate planner prompt; planner verifies P01a CLOSED before firing).

## Halt conditions / known issues

- All 9 verification steps passed. Two NEITHER cells in Step 1 (Archived / Deleted absent from P01b) are legitimate — P01b ships no archives or deletions; that work was completed in P01a.
- **Git artifact note (non-blocking):** the committed `cova-plan/phases/P01-foundations.md` blob at HEAD (commit `984aa1d`) is actually a 1.27 MB PDF with a `.md` extension (PDF header `%PDF-1.4` confirmed via `git show`). The working-tree version that was edited into a real 47 KB markdown phase doc — and which this split operates on — was an **uncommitted overwrite** of that PDF. Because the source blob and the new markdown share <30% similarity, `git diff --cached --name-status` shows them as separate `D` + `A` entries rather than `R`. The content we archived is correct (the 811-line markdown phase doc the user had been editing). To re-attach history, run `git log --follow` and trace through the working-tree changes manually if needed.

## Files touched by this session (for git review)

```
M  cova-plan/PHASE_STATUS.md
RM cova-plan/phases/P01-foundations.md -> cova-plan/phases/_archive/P01-foundations-pre-split.md
?? cova-plan/OPEN_DECISIONS.md
?? cova-plan/coverage-logs/
?? cova-plan/phases/P01a-demolition-ops.md
?? cova-plan/phases/P01b-auth-legal-deletion.md
?? cova-plan/SESSION_HANDOFFS/02-P1-split.md
```
