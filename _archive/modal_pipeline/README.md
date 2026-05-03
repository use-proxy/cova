# Archived Modal pipeline files (P01a M1)

These Python files were archived during V1 demolition (P01a, 2026-05-02) per
docs/audit/modal.md and the V9 architecture migration (Phases 1–5).

## What was archived

- V8-era main pipeline: preprocessing, structural_extraction, professionalization,
  generation, redesign_pipeline (superseded by cova-perception + cova-empty-room +
  cova-redesign + cova-composite-art).
- Older versions superseded by current: empty_room_v2.py, redesign_v2.py.
- Stopped Modal apps with no V9 caller: clip_text_embed, restoration, depthflow_render,
  grounded_sam2_pipeline, mask2former_service, segmentation, pre_detection_pipeline,
  furniture_matching_pipeline.
- Catalog tooling superseded by GPU version: embed_catalog.py.
- One-off test scripts: canny_ablation_test, cn_lora_compat_test, kontext_probe_test
  (relocated to tests/).
- The .bak file `redesign_phase5.py.bak` was deleted (unrecoverable cruft).

## Why archived (not deleted)

Per cova-plan/OPEN_DECISIONS.md Decision 11: archives use `git mv` to preserve
history; the iOS app may need fallback paths during V1 redeploy.

## How to restore

```bash
git mv _archive/modal_pipeline/<file> modal_pipeline/<file>
modal deploy modal_pipeline/<file>
```

## Modal control panel

Source-only archives (never deployed to Modal): `redesign_pipeline.py`,
`clip_text_embed.py`, `restoration.py`, `grounded_sam2_pipeline.py`,
`depthflow_render.py`, `segmentation.py`, `pre_detection_pipeline.py`,
`furniture_matching_pipeline.py`, `empty_room_v2.py`, `redesign_v2.py`,
`embed_catalog.py`, `mask2former_service.py`. No Modal-side action needed.

Deployed archives requiring `modal app stop` (DEFERRED until destructive-action
gate in P01a closeout):

| App ID | Description |
|---|---|
| ap-FElGd2FhTf5QKGfuE4b9vF | cova-preprocessing-pipeline |
| ap-8cm6jU3O64tyLwJhNbVLkf | cova-structural-extraction |
| ap-QMSansNQCC0ob67UmemjPw | cova-professionalization |
| ap-hpMfKgb0I8y0FgIbERk81F | cova-generation |

Re-deploy via `modal deploy <file>` if needed (after restoring).
