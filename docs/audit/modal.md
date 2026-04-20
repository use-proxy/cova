# Modal Service Audit

Generated: 2026-04-19

## Summary Table

### Active Pipeline Services (called from production code paths)

| File | Modal App Name | Purpose | Status | LOC |
|------|---------------|---------|--------|-----|
| `modal_pipeline/redesign_pipeline.py` | `cova-redesign-pipeline` | Orchestrator: runs preprocessing -> professionalization -> structural -> generation | **ACTIVE** (webhook from web app) | 571 |
| `modal_pipeline/generation.py` | `cova-generation` | v8 main generation: input cleaning, Fill Pro empty room, vision-aware design director, styled render x4, scoring | **ACTIVE** (called by orchestrator) | 1826 |
| `modal_pipeline/preprocessing.py` | `cova-preprocessing-pipeline` | White balance, resize, OpenCV preprocessing | **ACTIVE** (called by orchestrator) | 176 |
| `modal_pipeline/structural_extraction.py` | `cova-structural-extraction` | Depth map (Depth-Anything-V2) + Canny edges | **ACTIVE** (called by orchestrator) | 255 |
| `modal_pipeline/segmentation.py` | `cova-segmentation` | 4-layer segmentation: OneFormer + SAM3 + ceiling ROI + depth | **ACTIVE** (called from web app segment-masks route) | 569 |
| `modal_pipeline/pre_detection_pipeline.py` | `cova-pre-detection` | Claude Vision furniture detection on capture photo | **ACTIVE** (called from web app pre-detect route) | 308 |
| `modal_pipeline/furniture_matching_pipeline.py` | `cova-furniture-matching` | Claude Vision item detection + CLIP matching on redesigned render | **ACTIVE** (called from web app furniture-match route) | 566 |
| `modal_pipeline/clip_text_embed.py` | `cova-clip-text-embed` | CLIP text encoder endpoint for query embedding | **ACTIVE** (deployed endpoint, used by product search) | 86 |

### Dormant Pipeline Services (deployed but status uncertain)

| File | Modal App Name | Purpose | Status | LOC |
|------|---------------|---------|--------|-----|
| `modal_pipeline/professionalization.py` | `cova-professionalization` | FLUX img2img cleanup pass (strength 0.55) | **DORMANT** -- marked `# DISABLED 2026-04-13` at top but still called by orchestrator; may be deployed but possibly no-ops in practice | 309 |
| `modal_pipeline/depthflow_render.py` | `cova-depthflow` | Parallax video from render + depth map | **DORMANT** -- web app route exists (`/api/parallax`) but listed as disabled in apps/web/CLAUDE.md | 110 |
| `modal_functions/depthflow_render.py` | `cova-depthflow` | Duplicate of above (same app name, different implementation) | **DORMANT** -- older copy | 160 |
| `modal_pipeline/restoration.py` | `cova-restoration-pipeline` | Smart square crop + resize to 1024x1024 | **DORMANT** -- not called by orchestrator; only referenced from `tests/quality/test_professionalization.py` | 116 |

### Batch/Tooling Services (run manually, not in real-time pipeline)

| File | Modal App Name | Purpose | Status | LOC |
|------|---------------|---------|--------|-----|
| `modal_pipeline/embed_catalog_gpu.py` | `cova-clip-embedder-gpu` | GPU CLIP embedding for product catalog (batch job) | **KEEP** -- catalog tooling | 224 |
| `modal_pipeline/embed_fusion_gpu.py` | `cova-fusion-embedder` | Fusion embedding: 0.6*image + 0.4*text CLIP vectors (batch) | **KEEP** -- catalog tooling | 210 |
| `modal_pipeline/embed_catalog.py` | `cova-catalog-embedder` | Replicate-based CLIP embedding (batch, superseded by GPU version) | **DEAD** -- superseded by `embed_catalog_gpu.py` | 196 |

### Dead Code (deletable)

| File | Purpose | Reason Dead | LOC |
|------|---------|-------------|-----|
| `modal_pipeline/grounded_sam2_pipeline.py` | Grounded-SAM2 segmentation | Superseded by `segmentation.py` (OneFormer + SAM3); only used as last-resort fallback via env var `GROUNDED_SAM2_URL` | 414 |
| `modal_pipeline/embed_catalog.py` | Replicate CLIP embedding | Superseded by `embed_catalog_gpu.py` (runs CLIP on Modal GPU directly) | 196 |
| `modal_pipeline/restoration.py` | Smart crop + resize | No caller in orchestrator or web app | 116 |
| `modal_functions/depthflow_render.py` | DepthFlow parallax (duplicate) | Duplicate of `modal_pipeline/depthflow_render.py`, same Modal app name | 160 |
| `apps/web/lib/ai/modal.ts` | Generic Modal job submit/poll client | Never imported by any production code | 60 |

### Support Files (not Modal services themselves, but used by them)

| File | Purpose | Status | LOC |
|------|---------|--------|-----|
| `modal_pipeline/scoring.py` | 3-model ensemble quality scorer | **ACTIVE** (imported by `generation.py`) | 285 |
| `modal_pipeline/mask_build.py` | Semantic mask building utilities | **ACTIVE** (imported by `generation.py`) | 535 |
| `modal_pipeline/postprocess.py` | 11-step post-processing chain | **ACTIVE** (imported by `generation.py`) | 760 |
| `modal_pipeline/spatial_templates.py` | Room-type spatial placement directives | **ACTIVE** (imported by `generation.py`) | 165 |
| `modal_pipeline/utils.py` | Shared pipeline utilities | **ACTIVE** (imported by multiple services) | 214 |
| `modal_pipeline/insert_products.py` | Product DB insertion script | **KEEP** -- catalog tooling | 334 |
| `modal_pipeline/scrape_catalog.py` | Product scraper | **KEEP** -- catalog tooling | 887 |

---

## AnySplat Dead Code Analysis

**Status: DEAD.** AnySplat was used in M1 (Pipeline Proof) for real-time 3D room reconstruction from video. The pipeline has since pivoted to 2D image-based redesign using FLUX Fill Pro. AnySplat is explicitly listed as disabled in `apps/web/CLAUDE.md`.

- `modal_pipeline/room_reconstruction.py` -- the Modal service file -- has been **deleted** (no longer exists on disk).
- The AnySplat source code directory `modal_pipeline/anysplat/` is still present: **178 Python files, ~30,856 lines of code**.
- No production code imports or references the AnySplat directory.
- Last git commit touching `modal_pipeline/anysplat/`: 2026-03-31.
- References in `CLAUDE.md`, `ARCHITECTURE.md`, `.claude/SESSION_MEMORY.md` are historical documentation only.

**Recommendation:** Delete `modal_pipeline/anysplat/` directory entirely. It is a vendored copy of the AnySplat repo with no callers. Saves ~30,856 LOC.

---

## Marble Dead Code Analysis

**Status: DEAD.** Marble (World Labs) was the primary 3D lift option during M7. It is explicitly listed as disabled in `apps/web/CLAUDE.md`. The API client at `apps/web/lib/marble.ts` has all functions commented out with `MARBLE_DISABLED` annotations.

### Marble references in production code:
- `apps/web/lib/marble.ts` -- all functions commented out, type definitions preserved (66 lines)
- `modal_pipeline/generation.py` -- only references "marble" as a material name in style prompts (e.g., "white oak, marble, matte black metal"), not as an API call. **Not dead code.**

### Marble test/experiment files (all dead):

| File | LOC |
|------|-----|
| `modal_pipeline/test_marble_session1.py` | 177 |
| `modal_pipeline/test_marble_plus_session3.py` | 190 |
| `modal_pipeline/test_marble_stitch_comparison.py` | 393 |
| `modal_pipeline/test_marble_pano_plus.py` | 260 |
| `modal_pipeline/test_three_marble_options.py` | 483 |
| `modal_pipeline/test_b_flux_to_marble_single.py` | 276 |
| `modal_pipeline/test_e_doorway_marble.py` | 394 |
| `modal_pipeline/test_doorway_interior_ai.py` | 412 |
| `modal_pipeline/test_pranav_single_image.py` | 992 |
| `modal_pipeline/test_full_pipeline_session5.py` | 114 |
| `modal_pipeline/test_redesign_session2.py` | 223 |
| `modal_pipeline/test_furniture_session4.py` | 178 |
| `test_marble_plus.py` (root) | 226 |
| `test_marble_f.py` (root) | 253 |
| `test_marble_comparison.py` (root) | 242 |
| `test_marble_cd.py` (root) | 217 |
| `test_pipeline_e2e.py` (root) | 375 |
| `test_flythrough_verify.py` (root) | 107 |
| `marble_comparison_results_plus.json` (root) | 26 |
| `marble_comparison_results_f.json` (root) | 27 |
| `marble_comparison_results_e.json` (root) | 17 |
| `marble_comparison_results_cd.json` (root) | 25 |
| `marble_comparison_results.json` (root) | 33 |

### Marble Supabase migrations (historical, do not delete):
- `supabase/migrations/20240036000000_marble_pipeline_columns.sql`
- `supabase/migrations/20240050000000_marble_plus_columns.sql`
- `supabase/migrations/20240059000000_new_pipeline_architecture.sql`

---

## Other Test Files (Modal-based, no production callers)

These are one-off experiment scripts that use Modal but are not part of the production pipeline:

| File | LOC |
|------|-----|
| `modal_pipeline/test_a_flux_strong_prompt.py` | 183 |
| `modal_pipeline/test_c_multi_image_kontext.py` | 246 |
| `modal_pipeline/test_catalog.py` | 132 |
| `modal_pipeline/test_composite_fix.py` | 102 |
| `modal_pipeline/test_d_flux_depth_pro.py` | 223 |
| `modal_pipeline/test_flux_depth_pro.py` | 126 |
| `modal_pipeline/test_flux_fill_grounded_sam.py` | 292 |
| `modal_pipeline/test_flux_kontext_named.py` | 131 |
| `modal_pipeline/test_flux_redesign.py` | 256 |
| `modal_pipeline/test_gpt_image_redesign.py` | 160 |
| `modal_pipeline/test_postprocess_local.py` | 215 |
| `scripts/test-generation-direct.py` | 67 |
| `tests/quality/test_professionalization.py` | 187 |
| `tests/quality/test_runner.py` | 143 |

### Test result JSON files (safe to delete):

| File | LOC |
|------|-----|
| `modal_pipeline/test_1_results.json` | 5 |
| `modal_pipeline/test_2_results.json` | 5 |
| `modal_pipeline/test_3_results.json` | 30 |
| `modal_pipeline/test_results_a.json` | 5 |
| `modal_pipeline/test_results_b.json` | 14 |
| `modal_pipeline/test_results_c.json` | 18 |
| `modal_pipeline/test_results_d.json` | 26 |
| `modal_pipeline/test_results_e.json` | 30 |
| `modal_pipeline/test_session1_results.json` | 9 |
| `modal_pipeline/test_session2_results.json` | 12 |
| `modal_pipeline/test_session3_results.json` | 11 |
| `modal_pipeline/test_session4_results.json` | 328 |
| `modal_pipeline/test_doorway_results.json` | 7 |
| `modal_pipeline/test_flux_results.json` | 9 |
| `modal_pipeline/test_pano_plus_results.json` | 13 |

---

## Deletion Summary

### High-confidence deletions (confirmed dead, no callers):

| Category | Files | LOC |
|----------|-------|-----|
| AnySplat source directory | `modal_pipeline/anysplat/` (178 .py files + 3 other) | ~30,856 |
| Marble test scripts (modal_pipeline/) | 12 files | 4,092 |
| Marble test scripts (root) | 4 files | 938 |
| Marble test JSON results (root) | 5 files | 128 |
| Other experiment test scripts | 14 files | 2,463 |
| Test result JSON files | 15 files | 522 |
| Dead Modal services | 4 files (restoration, embed_catalog, grounded_sam2, modal_functions/depthflow) | 886 |
| Dead web app Modal client | `apps/web/lib/ai/modal.ts` | 60 |
| Root-level test scripts | 2 files (test_pipeline_e2e, test_flythrough_verify) | 482 |

**Total removable LOC: ~40,427**
**Total removable files: ~235** (mostly AnySplat vendor dir)

### Do NOT delete:

- `apps/web/lib/marble.ts` -- type definitions may be useful if Marble is re-enabled; only 66 lines
- `supabase/migrations/*` -- migration history must be preserved
- `modal_pipeline/professionalization.py` -- marked DISABLED but still called by orchestrator; needs investigation before removal
- `modal_pipeline/depthflow_render.py` -- parallax feature may be re-enabled; web app route exists
- All active pipeline services, support files, and catalog tooling listed above

---

## Architecture: Active Pipeline Call Graph

```
Web App API Routes
  |
  +-- /api/pipeline/pre-detect     --> PRE_DETECTION_WEBHOOK_URL     --> cova-pre-detection
  +-- /api/pipeline/segment-masks  --> LAYERED_SEGMENTATION_URL      --> cova-segmentation
  |                                    (fallback: GROUNDED_SAM2_URL  --> cova-grounded-sam2)
  +-- /api/pipeline/redesign       --> REDESIGN_PIPELINE_WEBHOOK_URL --> cova-redesign-pipeline
  |                                      |
  |                                      +-- cova-preprocessing-pipeline
  |                                      +-- cova-professionalization (DISABLED flag, still called)
  |                                      +-- cova-structural-extraction (depth + edges)
  |                                      +-- cova-generation (main render pipeline)
  |
  +-- /api/pipeline/furniture-match --> FURNITURE_MATCHING_WEBHOOK_URL --> cova-furniture-matching
  +-- /api/parallax                 --> DEPTHFLOW_WEBHOOK_URL          --> cova-depthflow (dormant)
```
