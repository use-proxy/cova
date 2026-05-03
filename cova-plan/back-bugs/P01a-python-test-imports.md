# Back-bug: Python tests import archived modal_pipeline modules

Discovered: 2026-05-02 (P01a M1)
Owner of fix: next phase to touch the affected tests, OR a verifier session
that classifies them as ARCHIVE/KEEP-with-update.

## Repro

After P01a M1 archives `modal_pipeline/generation.py` and
`modal_pipeline/redesign_pipeline.py` (per spec), two Python test files have
broken imports:

| File | Failing import |
|---|---|
| tests/python/stages/test_forbidden_names.py | `from modal_pipeline.generation import sanitize_forbidden_names` (lines 17, 71) |
| tests/quality/test_runner.py | `from modal_pipeline.redesign_pipeline import redesign_room` (line 74) |

Both files are at REPO ROOT under `tests/python/` and `tests/quality/` — not
under `apps/web/tests/`. The planner's test classification table only
enumerated `apps/web/tests/` and `tests/e2e/fire_*.py`; these two files were
not classified.

## Blast radius

- These tests are not part of the apps/web Vitest CI run (different test
  harness — pytest).
- Running `pytest tests/python/ tests/quality/` will fail at import time.
- No production behavior affected.

## Suggested fix

Option A (cleanest): archive both files via `git mv` to
`_archive/tests/python/stages/test_forbidden_names.py` and
`_archive/tests/quality/test_runner.py`. Add notes in the archive README.

Option B: rewrite each test to import from the archive path:
- `from _archive.modal_pipeline.generation import sanitize_forbidden_names`
- `from _archive.modal_pipeline.redesign_pipeline import redesign_room`
(Python's import system supports this if the `_archive/` directory is on the
PYTHONPATH; otherwise add an `__init__.py` or use a sys.path hack.)

Option C: delete both files (duplicates of forbidden-name layer 1–5
defenses in `apps/web/lib/log/redact.ts` and Python sanitizer; redesign_room
is fully retired).

Recommendation: Option A. Cheapest, preserves history, doesn't pretend the
tests still run.

---

RESOLVED in commit c87df47 (Option A applied).
