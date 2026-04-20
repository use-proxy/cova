# Phase 0 Dead Code — Pre-flight Findings

Date: 2026-04-19

Pre-flight grep scan performed for every candidate deletion across `*.py`, `*.ts`, `*.tsx`.
Goal: confirm no active code imports or references the files targeted for deletion.

## Category 1 — `modal_pipeline/anysplat/`

- Command: `grep -rn -i "anysplat" ...` (excluding `modal_pipeline/anysplat/`, node_modules, .git).
- Result: **zero hits** in active code.
- Decision: safe to delete entire directory (181 files).

## Category 2 — Marble test scripts + JSON

- 16 scripts + 5 JSONs checked.
- Result: no active-code references; only self-references among the test scripts themselves.
- Decision: safe to delete.

## Category 3 — Other experiment scripts

- 12 scripts checked.
- Result: no active-code references.
- Decision: safe to delete.

## Category 4 — Test result JSONs

- 15 JSONs in `modal_pipeline/`.
- Decision: safe to delete (produced by deleted scripts).

## Category 5 — Duplicates

- `modal_functions/depthflow_render.py`: only `modal_functions/` contents is the dup (+ `__pycache__`). Directory will be empty after deletion → remove directory too.
- `apps/web/lib/ai/modal.ts`: grep `lib/ai/modal` and `@/lib/ai/modal` returned zero imports.
- Decision: safe to delete both.

## Category 6 — Root-level test scripts

- `test_pipeline_e2e.py`, `test_flythrough_verify.py`: only self-references.
- Decision: safe to delete.

## Category 7 — KEEP-BUT-FLAG

- `modal_pipeline/depthflow_render.py` — keep (not-yet-DORMANT-tagged).
- `modal_pipeline/restoration.py` — keep (not-yet-DORMANT-tagged).
- `modal_pipeline/grounded_sam2_pipeline.py` — keep (not-yet-DORMANT-tagged).

## Files kept due to hidden dependencies

None. All scanned files were clean.
