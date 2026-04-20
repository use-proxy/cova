# Phase 0 Dead Code Cleanup — Summary

**Date:** 2026-04-19
**Baseline HEAD (pre-cleanup):** `e3c77bf`
**HEAD after cleanup (pre-summary):** `82c1f29`

## Totals

- **Files removed:** 228 (across categories 1-6)
- **Files modified (DORMANT headers):** 3
- **LOC delta across 7 commits:** +59 / −39,618
- **Net LOC removed:** ~39,559

## Commits

| SHA | Category | Description |
| --- | --- | --- |
| `6304fe9` | 1 | Delete vendored AnySplat directory (182 files, −31,063) |
| `ba34533` | 2 | Delete Marble test scripts + result JSONs (21 files, −5,163) |
| `34e448c` | 3 | Delete one-off FLUX/depth/Kontext experiment scripts (12 files, −2,133) |
| `8d67fd8` | 4 | Delete test result JSON artifacts (15 files, −537) |
| `8d43130` | 5 | Delete duplicate depthflow + unused `apps/web/lib/ai/modal.ts` (2 files, −240). Empty `modal_functions/` directory removed. |
| `071474f` | 6 | Delete root-level pipeline test scripts (2 files, −482) |
| `82c1f29` | 7 | Tag depthflow/restoration/grounded_sam2 as DORMANT (3 files, +9) |

## Files per category

### Category 1 — AnySplat
- `modal_pipeline/anysplat/` (entire tree, 181 tracked files + 1 pre-flight doc addition)

### Category 2 — Marble experiment scripts + JSONs
Scripts (modal_pipeline/):
- test_marble_session1.py
- test_marble_plus_session3.py
- test_marble_stitch_comparison.py
- test_marble_pano_plus.py
- test_three_marble_options.py
- test_b_flux_to_marble_single.py
- test_e_doorway_marble.py
- test_doorway_interior_ai.py
- test_pranav_single_image.py
- test_full_pipeline_session5.py
- test_redesign_session2.py
- test_furniture_session4.py

Scripts (root):
- test_marble_plus.py
- test_marble_f.py
- test_marble_comparison.py
- test_marble_cd.py

JSON results (root):
- marble_comparison_results.json, _cd, _e, _f, _plus

### Category 3 — Other experiment scripts
modal_pipeline/:
- test_a_flux_strong_prompt.py
- test_c_multi_image_kontext.py
- test_catalog.py
- test_composite_fix.py
- test_d_flux_depth_pro.py
- test_flux_depth_pro.py
- test_flux_fill_grounded_sam.py
- test_flux_kontext_named.py
- test_flux_redesign.py
- test_gpt_image_redesign.py
- test_postprocess_local.py

scripts/:
- test-generation-direct.py

### Category 4 — Test result JSONs
modal_pipeline/:
- test_1_results.json, test_2_results.json, test_3_results.json
- test_results_a.json, _b, _c, _d, _e
- test_session1_results.json, _2, _3, _4
- test_doorway_results.json
- test_flux_results.json
- test_pano_plus_results.json

### Category 5 — Duplicates / unused
- modal_functions/depthflow_render.py (duplicate)
- apps/web/lib/ai/modal.ts (never imported)
- modal_functions/ directory removed when empty

### Category 6 — Root-level pipeline scripts
- test_pipeline_e2e.py
- test_flythrough_verify.py

## Files preserved as DORMANT (Category 7)

Each received a top-of-file DORMANT header (dated 2026-04-19):
- `modal_pipeline/depthflow_render.py` — parallax video; `/api/parallax` route still exists in web app
- `modal_pipeline/restoration.py` — smart crop/resize utility
- `modal_pipeline/grounded_sam2_pipeline.py` — SAM2 fallback gated by `GROUNDED_SAM2_URL` env var; to retire after Phase 1 ships SAM 3 perception

## Files preserved by Prompt 2 (catalog isolation)

Handled in a prior Phase 0 prompt; not in scope for this cleanup. Prompt 2 already tagged catalog code as DORMANT.

## Pre-flight findings

- All candidate files were greped for any `*.py` / `*.ts` / `*.tsx` references outside their own category before deletion.
- **Zero files were restored** for hidden dependencies. All candidates had zero active-code references.
- Full findings: `docs/phase-0/dead-code-pre-flight.md`.

## Verification gate status

Every commit was preceded by `bash scripts/verify-before-commit.sh`:

| Commit | Gate |
| --- | --- |
| `6304fe9` | PASS |
| `ba34533` | PASS |
| `34e448c` | PASS |
| `8d67fd8` | PASS |
| `8d43130` | PASS |
| `071474f` | PASS |
| `82c1f29` | PASS |

Test-failure count held at the baseline 14 throughout. No tsc regressions on touched files.

## Final main HEAD SHA (after all 7 commits)

`82c1f29` — will be superseded by this summary commit.
