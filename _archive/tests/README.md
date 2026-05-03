# Archived tests (P01a M1)

Tests relocated here when their dependencies were archived. `git mv` preserves
history; restore via `git mv _archive/tests/<path> <path>` if needed.

## Contents

### `apps/web/__tests__/area3/render-pipeline.test.ts`, `apps/web/__tests__/pipeline.test.ts`

V8 render pipeline tests. Originally classified ARCHIVE in P01a §D.2 because
they reference retired pipeline orchestration + dead Modal apps. Moved per
Decision 4 (selective; default-to-archive on uncertainty).

### `apps/web/tests/e2e/data-integrity.test.ts`, `apps/web/tests/e2e/render-pipeline.spec.ts`

E2E coverage of the retired V8 pipeline data shape + render orchestration.

### `tests/e2e/fire_v6_diagnostic.py`, `fire_v6_tests.py`, `fire_v7_tests.py`, `fire_v8_tests.py`

Pytest fire-test harnesses that exercise the V8 `cova-generation` Modal stage,
which was archived to `_archive/modal_pipeline/generation.py` in commit
`9145c69`. Originally at REPO ROOT `tests/e2e/`; preserved at the same relative
path under `_archive/tests/`.

### `tests/python/stages/test_forbidden_names.py`, `tests/quality/test_runner.py`

V8-era pytest files orphaned by the modal_pipeline archive in commit
`9145c69`:

- `test_forbidden_names.py` imports `sanitize_forbiddenNames` from
  `modal_pipeline.generation` (now at `_archive/modal_pipeline/generation.py`).
  The forbidden-name defense remains intact via the TypeScript
  `apps/web/lib/log/redact.ts` + `apps/web/lib/ai/forbidden-names.ts` Layer 5
  composition (P01a M3 commit `1639738`); this Python mirror is no longer
  exercised in V9.
- `test_runner.py` imports `redesign_room` from
  `modal_pipeline.redesign_pipeline` (now archived). The V9 redesign path is
  the `cova-redesign` Modal app + `apps/web/lib/ai/redesign-client.ts`.

Resolved per `cova-plan/back-bugs/P01a-python-test-imports.md` Option A
(archive). No production behavior affected (these tests are pytest, not part
of the apps/web Vitest CI).
