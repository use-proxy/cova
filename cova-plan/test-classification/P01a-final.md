# Final test classification — P01a M1

Date: 2026-05-02
Decision: 4 (selective; default-to-archive on uncertainty)

## Methodology

1. Read planner's provisional classification table in
   `cova-plan/planner-output/P01a-executor-prompt.md` §D.2.
2. Cross-checked file existence at execute time.
3. Spot-checked the 4 ARCHIVE entries in `apps/web/` for V8-pipeline
   references (e.g. `cova-generation`, `redesign_pipeline`, dropped tables).
4. Verified the 4 `tests/e2e/fire_v*.py` files reference `cova-generation`.
5. Verified `apps/web/tests/lib/affiliates.test.ts` is duplicated by the
   colocated `apps/web/lib/affiliates.test.ts`.

## Final classification

### ARCHIVE (8 files)

| Filepath | Destination |
|---|---|
| apps/web/__tests__/area3/render-pipeline.test.ts | _archive/tests/apps/web/__tests__/area3/render-pipeline.test.ts |
| apps/web/__tests__/pipeline.test.ts | _archive/tests/apps/web/__tests__/pipeline.test.ts |
| apps/web/tests/e2e/data-integrity.test.ts | _archive/tests/apps/web/tests/e2e/data-integrity.test.ts |
| apps/web/tests/e2e/render-pipeline.spec.ts | _archive/tests/apps/web/tests/e2e/render-pipeline.spec.ts |
| tests/e2e/fire_v6_diagnostic.py | _archive/tests/e2e/fire_v6_diagnostic.py |
| tests/e2e/fire_v6_tests.py | _archive/tests/e2e/fire_v6_tests.py |
| tests/e2e/fire_v7_tests.py | _archive/tests/e2e/fire_v7_tests.py |
| tests/e2e/fire_v8_tests.py | _archive/tests/e2e/fire_v8_tests.py |

### DELETE (1 file)

| Filepath | Reason |
|---|---|
| apps/web/tests/lib/affiliates.test.ts | duplicate of `apps/web/lib/affiliates.test.ts` (colocated version is canonical) |

### KEEP (everything else in the planner table)

All other rows in the planner's classification table are confirmed KEEP.
Notable items requiring follow-up but kept in place per spec:

- `apps/web/__tests__/area1/quiz-flow.test.ts` — KEEP (broken; mock chain stale per
  CLAUDE.md test-debt; fix in P2).
- `apps/web/tests/types/supabase.test.ts` — KEEP but UPDATE after migrations apply
  (regenerate types).
- `apps/web/tests/security/rls-negative.test.ts` — KEEP; verify no duplication
  with the new `apps/web/tests/rls/two-user-isolation.test.ts` introduced in §D.9.
- `apps/web/tests/ai/lora-weighted-blending.test.ts` — KEEP (D-003 marks LoRAs
  deprecated, but tests document Phase 3 work — kept as historical doc per spec).

### Tests outside the planner classification table (discovered at execute time)

The following Python tests reference now-archived `modal_pipeline/` modules and
will fail to import once the source files are archived. Filed as a back-bug
(see `cova-plan/back-bugs/P01a-python-test-imports.md`).

| Filepath | Broken import | Disposition |
|---|---|---|
| tests/python/stages/test_forbidden_names.py | `modal_pipeline.generation` | back-bug; not classified by planner |
| tests/quality/test_runner.py | `modal_pipeline.redesign_pipeline` | back-bug; not classified by planner |
