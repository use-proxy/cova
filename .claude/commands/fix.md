# /fix — Cova Fix Pipeline
# Usage: /fix [description of the problem]
# This command enforces the complete mandatory pipeline for every fix.
# No step can be skipped. No code is written until the spec is locked.

You are about to execute a fix on the Cova codebase. Follow every step below in exact order. Do not skip steps. Do not combine steps. Do not proceed to the next step until the current step is complete and confirmed.

---

## STEP 1 — READ CLAUDE.md

Before anything else, read the full CLAUDE.md at the root of the repository.
Confirm you have read it by outputting:
`✓ CLAUDE.md read. [N] sections loaded.`

---

## STEP 2 — WRITE THE SPEC FILE

Create a spec file at: `.claude/specs/[YYYY-MM-DD]-[kebab-case-description].md`

The spec file must contain ALL of the following sections.
Do not proceed until every section is complete and specific.

```markdown
# Spec: [one-sentence description]
Date: [today's date]
Status: DRAFT

## PROBLEM
[One sentence. What is broken or missing? Be exact.]

## FILES IN SCOPE
[List every file that will be touched. Full paths. No wildcards.]
- apps/mobile/src/...
- supabase/functions/...

## FILES OUT OF SCOPE
[List files that must not be touched even if related.]
- [every other file in the codebase not listed above]

## ACCEPTANCE CRITERIA
[Numbered list. Each item must be verifiable by reading code or running a command.]
1. [specific, testable criterion]
2. [specific, testable criterion]
...

## WHAT NOT TO DO
[Explicit list of changes that are forbidden in this fix.]
- Do not modify [file] for any reason
- Do not refactor [thing] even if it looks wrong
- Do not change any behavior outside of [specific scope]

## INTEGRATION TEST REQUIRED
[yes / no — yes if any file in scope touches the render pipeline]
```

After writing the spec, output it in full and ask:
`Spec written. Please review and confirm before I proceed to planning. Any changes?`

Wait for explicit confirmation before proceeding to Step 3.

---

## STEP 3 — RUN THE PLANNER AGENT

After spec is confirmed, invoke the planner:
`Use the planner agent with this spec: .claude/specs/[filename].md`

The planner will read all in-scope files and output a numbered phase plan.

After the planner outputs the plan, ask:
`Plan complete. [N] phases identified. Approve this plan to begin implementation?`

Wait for explicit approval before proceeding to Step 4.

---

## STEP 4 — EXECUTE PHASES ONE AT A TIME

For each phase in the approved plan, in order:

**4a. Invoke executor:**
`Use the executor agent to implement phase [N] of spec .claude/specs/[filename].md`

The executor will implement exactly one phase and output its completion report.

**4b. Invoke verifier immediately after:**
`Use the verifier agent to verify phase [N] of spec .claude/specs/[filename].md`

The verifier will check the implementation and return PASS, FAIL, or PARTIAL.

**4c. Handle the verdict:**
- If PASS → output `✓ Phase [N] passed. Proceeding to phase [N+1].` and repeat 4a for next phase
- If FAIL → output `✗ Phase [N] failed. Returning to executor with failures.` then re-invoke executor with the verifier's failure list. Re-run verifier. Repeat until PASS.
- If PARTIAL → treat as FAIL. Fix all issues before proceeding.

Do not proceed to phase N+1 until phase N returns PASS from the verifier.

---

## STEP 5 — RUN INTEGRATION TEST (if required)

If the spec marked INTEGRATION TEST REQUIRED: yes, run:
```bash
npx ts-node supabase/functions/tests/render-pipeline.test.ts
```

- If exit code 0 → output `✓ Integration test passed.`
- If exit code non-zero → the fix is NOT complete. Return to executor with the test output. Repeat until test passes.

---

## STEP 6 — CONFIRM COMPLETION

After all phases pass and the integration test passes (if required), output:

```
╔══════════════════════════════════════════════╗
║  FIX COMPLETE                                ║
╠══════════════════════════════════════════════╣
║  Spec:    .claude/specs/[filename].md        ║
║  Phases:  [N] completed                      ║
║  Files:   [list of files modified]           ║
║  Tests:   [PASS / SKIPPED]                   ║
║  CLAUDE.md compliance: PASS                  ║
╚══════════════════════════════════════════════╝

The following changes were made:
[bullet list of every change, file by file]

No other files were modified.
```

---

## PIPELINE RULES (enforced at every step)

- CLAUDE.md is always authoritative over any individual prompt or request
- If CLAUDE.md conflicts with the spec → CLAUDE.md wins, flag the conflict
- No code is written before the spec is confirmed
- No phase begins before the previous phase passes verification
- No file is touched that is not in FILES IN SCOPE
- No fix is complete until the verifier returns PASS on every phase
- No render pipeline fix is complete until the integration test returns exit code 0
- If at any point the scope needs to expand → stop, update the spec, get re-confirmation, re-plan