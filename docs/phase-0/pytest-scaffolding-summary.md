# Phase 0 Prompt 6 — pytest Scaffolding Summary

Date: 2026-04-19
Scope: Establish minimal pytest framework + golden-image smoke tests for the Modal pipeline. The full 48-test plan in `docs/audit/tests.md` is deferred to per-phase implementation.

---

## Files Created

### pytest Setup (8 files)

- `pyproject.toml` — pytest config, dev deps, markers (`smoke`, `modal`, `slow`)
- `tests/python/__init__.py`
- `tests/python/conftest.py` — shared fixtures: `cluttered_bedroom_path`, `cluttered_bedroom_image`, `goldens_dir`
- `tests/python/_helpers/__init__.py`
- `tests/python/_helpers/golden.py` — SSIM comparison helper with `WRITE_GOLDEN=1` escape hatch
- `tests/python/stages/__init__.py`
- `tests/python/fixtures/__init__.py`
- `tests/python/fixtures/images/cluttered_bedroom.jpg` — 27 KB, 384x512 RGB fixture (derived from experiments/ bedroom sample)

### Smoke Tests (6 files — one per pipeline stage)

- `test_preprocessing_smoke.py` (2 tests: import + image transform shape)
- `test_structural_extraction_smoke.py` (2 tests: import + `@modal` skip)
- `test_segmentation_smoke.py` (2 tests: import + `@modal` skip)
- `test_generation_smoke.py` (2 tests: import + `@modal` skip)
- `test_postprocess_smoke.py` (1 test: import)
- `test_furniture_match_smoke.py` (1 test: import)

### Goldens Directory

- `tests/python/fixtures/goldens/` — present, empty. Populated lazily by per-phase tests via `WRITE_GOLDEN=1`.

### CI Wiring

- `.github/workflows/python-tests.yml` — runs `pytest tests/python -m "smoke and not modal"` on PR + push to main. TypeScript workflow `cova-ci.yml` untouched.

---

## Test Execution Results (local, 2026-04-19)

```
collected 10 items / 3 deselected / 7 selected

6 passed, 1 skipped, 3 deselected in 0.66s
```

- **6 passed:** import checks for preprocessing, postprocess, segmentation, structural_extraction, furniture_matching + PIL image-shape test
- **1 skipped:** `test_generation_module_imports` (skipped cleanly: heavy ML deps not installed locally — expected behavior)
- **3 deselected:** `@pytest.mark.modal` tests in structural_extraction, segmentation, generation (require live Modal + GPU; to be implemented in Phase 1 / Phase 5 integration suites)

**No test errored or failed unexpectedly.** Scaffolding verified clean.

---

## Plan for Per-Phase Tests

Each subsequent Phase (1–11) owns its deeper test coverage as part of phase deliverables. This scaffolding only establishes:

1. The framework is installable + runnable.
2. Every pipeline stage module is importable (catches broken imports fast).
3. Golden image helper is available for stages that need visual regression.
4. CI enforces smoke passage on every PR.

Per-phase tests will add: integration tests against live Modal (behind `@pytest.mark.modal`), additional goldens, SSIM / perceptual thresholds, and the full 48-test suite from `docs/audit/tests.md`.

---

## Phase 0 follow-ups consolidated

Tracked here so Phase 1 can batch-resolve before starting new work:

- **Apply Phase 0 migrations to staging then production** — 3–4 migrations accumulated across Prompts 1, 2, 5 (RLS fixes, LoRA registry backup columns, other schema additions). Run in staging first, verify, then production.
- **Upload `lora-backups/canonical-archetypes.json` to Supabase storage** — generated in Prompt 4; currently only on disk.
- **Patch `getLorasFromFluxPrompt` resolver to populate `backupUrl`** — second LoRA registry resolver still returns null for backupUrl. Mirror the primary resolver patch from Prompt 5.
- **Investigate pre-existing TS errors blocking project-wide `tsc --noEmit`** — verification gate runs tsc only on edited files. Full-repo tsc has pre-existing errors that need triage.
- **Investigate 14 baseline test failures** — quiz-flow stale Supabase admin mock chain, env drift, navigation drift. Documented in `docs/phase-0/pre-existing-test-failures.md`.
