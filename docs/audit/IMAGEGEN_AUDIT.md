# Cova V1 — Image Generation Audit

**Date:** 2026-04-29
**Scope:** LoRA assets, Modal apps, fal endpoints, render orchestration code,
CLIP/product-matching infrastructure, Google Lens integration.
**Source of truth at time of writing:** local-disk inventory under
`lora-backups/`, `modal_pipeline/`, `apps/web/`, plus the most recent
bake-off telemetry in `scripts/bakeoff-final/scores.json` and
`scripts/density-test/results.json`.

---

## 1. LoRA Asset Inventory

### Where they live

| Layer | Location |
|-------|----------|
| Local `.safetensors` (offline backup) | `lora-backups/COVA*_2026-04-17.safetensors` (10 files, 89,745,224 bytes each) |
| Per-LoRA metadata | `lora-backups/COVA*_2026-04-17.meta.json` (10 files) |
| Backup archetype name map | `lora-backups/canonical-archetypes.json` |
| Supabase backup pointer | `lora-backups/upload_results.json` (all 10 mirrored to `xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/lora-backups/`) |
| Live registry (TS, primary) | `apps/web/lib/styles/lora-registry.ts` |
| Secondary TS registry | `apps/web/lib/ai/lora-registry.ts` |
| Modal mirror (Python) | `modal_pipeline/redesign.py` lines 87–138 |
| Training input zips | `lora-training/COVA*.zip` (10) + `lora-training/results.json` |

All 10 fal-hosted URLs are temporary `v3b.fal.media/files/...` paths. The
local `.safetensors` and the Supabase mirror are the durable copies.

### Per-LoRA inventory (FLUX.1-dev base, all)

| Archetype (key) | cv-trigger | Steps | Default scale | sha256 (first 12) | Trained | Notes |
|-----------------|-----------|-------|---------------|-------------------|---------|-------|
| COVAJAPANDI    | cvwmn | 1500 | 0.88 | `80558f5f9c2d` | 2026-04-17T01:09 | Primary tested style |
| COVASCANDINAV  | cvscn | 1500 | 0.88 | `4a64d31e973e` | 2026-04-17T01:03 | |
| COVABIOPHILIC  | cvbio | 2000 | 0.92 | `ea15827c023f` | 2026-04-17T01:14 | Higher steps, plant-heavy |
| COVAMINIMAL    | cvmin (*) | 1500 | 0.95 | `54611bbcd832` | 2026-04-17T01:29 | **Trigger collision — see §1.1** |
| COVAMIDCENTURY | cvmcm | 1500 | 0.85 | `40d5818969b9` | 2026-04-17T01:37 | |
| COVACOASTAL    | cvcst | 1500 | 0.85 | `75e301963fda` | 2026-04-17T01:41 | |
| COVABOHEMIAN   | cvboh | 2000 | 0.78 | `c46706a9f28d` | 2026-04-17T01:46 | |
| COVAINDUSTRIAL | cvind | 2000 | 0.80 | `bc5e111c8b7a` | 2026-04-17T01:51 | |
| COVAFARMHOUSE  | cvfrm | 1500 | 0.85 | `d49c05c35ed0` | 2026-04-17T01:55 | |
| COVAARTDECO    | cvdco | 1500 | 0.82 | `9d5a0af870c0` | 2026-04-17T02:00 | |

All sizes identical (89,745,224 bytes ≈ 85.6 MiB), consistent with
`fal-ai/flux-lora-fast-training` outputs at rank-32. Trained in a single
batch the night of 2026-04-17 by `scripts/train-loras.ts`.

### Quality assessment (what we actually know)

- `lora-training/results.json` records 5 sample renders per LoRA
  (bedroom / living-room / kitchen / bathroom / home-office) at fal-hosted
  URLs, each as a "with-LoRA vs without-LoRA" pair.
- Every entry is stamped `qualityScore: 2.5` — that number is hardcoded
  by the trainer and **was never overwritten by a real evaluation**.
  `docs/audit/loras.md` (Phase-0 audit, 2026-04-19) explicitly calls this
  out: "All quality scores are 2.5 (auto-assigned)."
- The closest thing to a real eval is the most recent bake-off
  (`scripts/bakeoff-final/`, 2026-04-29). It includes a `flux1-lora`
  candidate using `fal-ai/flux-general/image-to-image` + the COVAJAPANDI
  LoRA at scale 0.88, scored against four FLUX.2-family edit endpoints.
  Per-room totals (sum of nine 0–10 axes, max 90):

  | Room | flux1-lora | flux2-pro | flux2-max | nano-banana-pro |
  |------|-----------|-----------|-----------|-----------------|
  | input-01 (bedroom) | 56 | **74 (winner)** | – | – |
  | input-02 (gaming bedroom) | 62 | – | **74 (winner)** | – |
  | input-03 (loft bedroom) | 68 | – | **76 (winner)** | – |
  | input-04 (living room) | 64 | **75 (winner)** | – | – |
  | input-05 (attic music room) | 61 | – | – | **75 (winner)** |
  | **Mean** | **62.2** | – | – | – |

  flux1-lora was beaten on every room by a FLUX.2 prompt-only candidate
  (mean ≈ 74.8). Style-match (`cvwmn` activated) scored well (8–9), but
  paint/architecture/camera scores collapsed (paint 2–8, camera 4–7) —
  the LoRA path lost on architecture preservation, not on aesthetics.

### 1.1 The cvmin / cvscn collision (still unresolved)

`lora-backups/COVAMINIMAL_2026-04-17.meta.json` records:

```
"trigger_token": "COVAMINIMAL",
"full_trigger":  "cvscn interior"
```

i.e. the COVAMINIMAL LoRA was actually **trained on the `cvscn` token**,
the same token that COVASCANDINAV uses (`COVASCANDINAV_2026-04-17.meta.json`
also records `full_trigger: "cvscn interior"`).

But `apps/web/lib/styles/lora-registry.ts:29` and
`modal_pipeline/redesign.py:105` both expose COVAMINIMAL with
`trigger: "cvmin"`. The runtime token (`cvmin`) does not match the trained
token (`cvscn`). Result: the COVAMINIMAL LoRA is loaded with zero T5
activation — it acts as random extra weights with the `cvmin` prompt
prefix. The model never sees the trigger it was trained on.

Two ways out:

- **Drop the LoRA entirely.** COVASCANDINAV already covers the same
  archetype family ("Pure Minimal White" per `canonical-archetypes.json`),
  and the v9 audit notes the duplicate.
- **Switch the runtime trigger to `cvscn` for COVAMINIMAL.** Cheaper but
  it then collides with COVASCANDINAV when both are in the same blend
  (top-3 stack). FLUX will see the trigger appear with two different
  weight contributions and the second LoRA's activation will dominate.

For V1, **drop COVAMINIMAL** (see §3 recommendation).

### File-size sanity check

10 × 89,745,224 B ≈ 856 MiB on disk for `lora-backups/`. Inexpensive to keep.

---

## 2. LoRA Compatibility Assessment

### Current base model

Confirmed FLUX.1-dev for all 10 LoRAs:
- Every `*.meta.json` file has `"base_model": "FLUX.1-dev"`.
- Trainer endpoint was `fal-ai/flux-lora-fast-training` (FLUX.1-dev only).
- The runtime that loads them is `fal-ai/flux-general/image-to-image` —
  itself a FLUX.1-dev wrapper.

### FLUX.2 compatibility

Black Forest Labs' published guidance is unambiguous: **FLUX.1 LoRAs are
not compatible with FLUX.2.** The architectures differ (FLUX.2 uses a
new joint text-image attention layout and a different VAE scale), and
there is no in-place adapter for FLUX.1 weights. To use these LoRAs at
all, we need a FLUX.1-dev pipeline.

Our codebase confirms this empirically:
`scripts/bakeoff-final/stage5.ts` defines `flux1-lora` as
`fal-ai/flux-general/image-to-image` and the FLUX.2 candidates as
`fal-ai/flux-2-{pro,max}/edit` — the FLUX.2 endpoints **do not accept
the `loras` parameter** in the bake-off setup, only `image_urls + prompt`.

### Three options for V1

1. **Use FLUX.1-dev as the redesign base.** Today's V3 pipeline
   (`modal_pipeline/redesign.py`) does exactly this with the LoRA stack.
   Slower (~10–20s per call vs 5–8s for FLUX.2-dev edit), aesthetics lag
   FLUX.2 by ~12 points on the 0–90 rubric per the latest bake-off.
   Cost is competitive (~$0.04/call vs $0.10 for FLUX.2-pro/edit).

2. **Retrain on FLUX.2-dev via `fal-ai/flux-2-trainer`.** The trainer
   endpoint exists and is reachable
   (`experiments/fal_endpoint_smoke_test/report.md` line 8: "queued
   (accessible) … 0.2 s"). Per Phase-0 estimates, retraining 10 LoRAs
   serially is $80–$160 and 1–2.5 hours of trainer time. After that,
   they could plug into `fal-ai/flux-2-pro/edit` with `loras: [...]`.
   But: the recent bake-off shows FLUX.2 prompt-only is already at
   74–76/90 with no LoRAs. Retraining adds spend, complexity, and a new
   tuning surface for marginal style-fidelity gain.

3. **Ship without LoRAs.** Use FLUX.2-Max or FLUX.2-Pro edit with the
   enumerated single-image prompt that scored **80/80** in
   `scripts/density-test/results.json` (room-01 condition `A`) and
   79–80 again at condition `B2`. The prompt is a comma-separated list
   of materials, items, palette and lighting hints; no style references,
   no LoRAs. This is what the user's task spec calls "the V1 winning
   architecture."

---

## 3. LoRA V1 Recommendation

**Recommendation: archive for V1.5. Ship V1 without LoRAs.**

The bake-off and density-test data make the case directly:

- **The prompt-only path already wins.** FLUX.2-Max with the enumerated
  prompt scored 80/80 (`scripts/density-test/results.json`, room-01 cond
  `A`) and 79/80 on the two-pass variant. flux1-lora's best score in the
  same rubric on the same rooms was 68/90 — and the rubrics aren't even
  the same: density-test uses 8 axes×10, bakeoff uses 9×10, so the LoRA
  delta is even larger normalized (~0.78 vs 0.99).

- **Style fidelity is not the gap.** flux1-lora's `style_match` axis
  consistently scored 7–9. It loses on `architecture` (6–8), `paint`
  (2–8), and `camera` (4–7) — all preservation axes, where prompt-driven
  i2i with LoRAs has too much creative latitude. The LoRA isn't broken,
  but it's optimizing for the wrong axis vs what V1 needs.

- **The `cvmin` collision is unresolved** and the only realistic fix is
  retraining or dropping COVAMINIMAL — which lowers archetype coverage
  for "Pure Minimal White" to a single LoRA (COVASCANDINAV).

- **Could LoRA-on-FLUX.2-dev beat prompt-only on FLUX.2-Max for harder
  styles (industrial, art deco)?** Possibly, but we don't have evidence.
  The bake-off only covered Warm Japandi. To answer it, we'd need to
  retrain on FLUX.2-dev ($80–160) and run a follow-up bake-off across
  ≥5 archetypes. That's a Phase-7+ experiment, not V1 work.

**Specific call:**

- Ship V1 without LoRAs.
- Keep `lora-backups/` and the Supabase mirror — they're cheap insurance
  and the only durable copy.
- Mark `LORA_REGISTRY` entries in `apps/web/lib/styles/lora-registry.ts`
  and `modal_pipeline/redesign.py` as deprecated; don't delete the
  registry yet (the V3 pipeline still depends on it). The registry can
  be removed when `cova-redesign-v3` is retired in V1's pipeline.
- File `cvmin / cvscn` collision as a follow-up (do not attempt to fix
  in V1 — the right fix is to retrain on FLUX.2-dev, which is a V1.5
  decision).

---

## 4. Modal Apps Detail

Inventory below is grouped by V3 production status. URLs are
`cova-interior--<app-name>-<endpoint>.modal.run` per Modal naming.

### Active in V3 production

| App | Code | Status | Cost / call | fal-replaceable? | Verdict for V1 |
|-----|------|--------|-------------|------------------|----------------|
| `cova-redesign-v3` | `modal_pipeline/redesign.py` | Deployed, primary redesign | ~$0.20 (3-pass FLUX-general + IC-Light + Sonnet QA) | **Yes** — bake-off says swap to `fal-ai/flux-2-pro/edit` direct ($0.10, fewer moving parts) | Replace with thin TS wrapper around FLUX.2-pro/edit; archive |
| `cova-empty-room` | `modal_pipeline/empty_room.py` | Deployed, Phase-2 strict-inpaint pipeline | $0.14 (SAM3 + flux-pro/v1/fill, with LaMa/Bria fallbacks) | **Mostly** — but the SAM3-mask + dilate-close + passthrough-blend logic is non-trivial; pure fal endpoints can't replicate the architecture-preserving mask | Keep until V1 ships, then evaluate vs nano-banana-2 (current bake-off Stage-3 winner at $0.10 with simpler control flow) |
| `cova-empty-room-v3` | `modal_pipeline/empty_room_gemini.py` | Deployed, Gemini-conditional anti-hallucination path | ~$0.10 (nano-banana-pro/edit + Sonnet audit) | **Yes** — entirely fal + Anthropic; the Modal layer is just orchestration glue | Inline the orchestration into `apps/web/app/api/render/empty-room/route.ts`; archive the Modal app |
| `cova-composite-art` | `modal_pipeline/composite_art.py` | Deployed, art-on-wall compositing | ~$0.05 (SAM-3 + cv2 homography + IC-Light) | **Partly** — cv2 homography is in-process; SAM-3 + IC-Light are fal | Keep for V1 (no cleaner alternative); reconsider in V1.5 |
| `cova-perception` | `modal_pipeline/perception.py` | Deployed, depth + SAM3 + furniture-spec endpoints | $0.005–0.02 / endpoint | **Each endpoint is a fal call** (`fal-ai/imageutils/depth`, `fal-ai/sam-3/image`) wrapped in batching/cache logic | The wrapping is genuine value (parallel SAM3 + caching). Keep for V1 unless we measure cache hit rate and find it's <10% |

### Stopped / dormant (kept on disk)

Per `apps/web/CLAUDE.md` lines 88–93 and the Phase-5 closeout note:

| App | Code | Why stopped |
|-----|------|-------------|
| `cova-redesign` (Phase-5) | `modal_pipeline/redesign_phase5.py.bak` | Superseded by V3 redesign; bak-suffixed |
| `cova-redesign-v2` | `modal_pipeline/redesign_v2.py` | Staging only, never promoted |
| `cova-empty-room-v2` | `modal_pipeline/empty_room_v2.py` | Staging only, superseded by v3 |
| `cova-mask2former-v3` | `modal_pipeline/mask2former_service.py` | Replaced by SAM-3 path in `empty_room.py` |
| `cova-pre-detection` | `modal_pipeline/pre_detection_pipeline.py` | Stopped 2026-04-23 to free Modal slots; V1 step-7 doesn't pre-detect |
| `cova-segmentation` | `modal_pipeline/segmentation.py` | Stopped 2026-04-23; replaced by SAM3 in perception |
| `cova-restoration-pipeline` | `modal_pipeline/restoration.py` | Phase-0 audit: "no web callers"; stopped to free Modal slots |
| `cova-clip-text-embed` | `modal_pipeline/clip_text_embed.py` | Stopped to free Modal slots; consumer (`apps/web/lib/clipSearch.ts`) is DORMANT — V9 uses Serper + Google Lens |
| `cova-grounded-sam2` | `modal_pipeline/grounded_sam2_pipeline.py` | Replaced by SAM-3 |
| `cova-redesign-pipeline` | `modal_pipeline/redesign_pipeline.py` | V1 orchestrator from M7; superseded by direct V3 calls |
| `cova-generation` | `modal_pipeline/generation.py` | V1 (M7) main generator; the 2-stage Fill-Pro pipeline; superseded by V3 |
| `cova-preprocessing-pipeline` | `modal_pipeline/preprocessing.py` | V1 white-balance/CLAHE preproc; not in V3 |
| `cova-structural-extraction` | `modal_pipeline/structural_extraction.py` | V1 depth+canny; superseded by perception |
| `cova-professionalization` | `modal_pipeline/professionalization.py` | V1 cleanup pass; explicitly disabled in code header |
| `cova-furniture-matching` | `modal_pipeline/furniture_matching_pipeline.py` | V1 product matching on render; superseded by client-side `/api/match` (Serper + Lens) |
| `cova-clip-embedder-gpu` | `modal_pipeline/embed_catalog_gpu.py` | Catalog tooling, run manually |
| `cova-fusion-embedder` | `modal_pipeline/embed_fusion_gpu.py` | Catalog tooling, run manually |
| `cova-catalog-embedder` | `modal_pipeline/embed_catalog.py` | Superseded by GPU version |
| `cova-depthflow` | `modal_pipeline/depthflow_render.py` | Parallax video — disabled in apps/web/CLAUDE.md ("Disabled: depth video pipeline") |
| `cova-structural-extraction` (dup) | `modal_functions/depthflow_render.py` | Duplicate; delete |

### AnySplat

`docs/audit/modal.md` notes: `modal_pipeline/anysplat/` is a vendored
copy of the AnySplat repo (~30,856 LOC) with **zero callers**. The
service file `modal_pipeline/room_reconstruction.py` was already
deleted. AnySplat was the M1 splat-reconstruction path; it was reused
in the V0 mobile pipeline but **is not used by the V1 web app**. Safe
to delete.

### Modal-app summary for V1

The web app talks to Modal in 4 places (per
`apps/web/lib/ai/{perception,empty-room,redesign}-client.ts` and the
`api/parallax`/`api/render/empty-room` routes):

1. `cova-perception` — kept, depth + SAM3.
2. `cova-empty-room-v3` (Gemini) — kept for V1 because it's the
   active anti-hallucination path. Inline into TS for V1.5.
3. `cova-redesign-v3` — replace with direct fal-ai/flux-2-pro call.
4. `cova-composite-art` — kept (no cleaner alternative).

Everything else is archive-able. We can free a lot of Modal slots
(workspace cap is 8 web endpoints; we're already at the ceiling and
have stopped 4 to make room).

---

## 5. fal Endpoint Usage

Active in production code (`apps/web/**` plus `modal_pipeline/{empty_room,redesign,empty_room_gemini,composite_art,perception}.py`):

| Endpoint | Where called | Purpose | Status |
|----------|--------------|---------|--------|
| `fal-ai/sam-3/image` | `empty_room.py`, `composite_art.py`, `perception.py`, `apps/web/app/api/render/refinement/detect/route.ts`, `apps/web/lib/ai/segmentation.ts`, `apps/web/app/api/pipeline/redesign/route.ts` | Furniture / wall / architecture detection (text-prompted) | **Active** |
| `fal-ai/imageutils/depth` | `empty_room.py`, `redesign.py`, `perception.py` | Depth-Anything-V2 depth maps | **Active** |
| `fal-ai/flux-pro/v1/fill` | `empty_room.py` (primary inpainter), `redesign.py` (Pass 1 fallback), `apps/web/app/api/render/refinement/apply/route.ts`, `apps/web/lib/ai/flux.ts` | FLUX Fill Pro inpainting | **Active** |
| `fal-ai/flux-general/image-to-image` | `redesign.py` (Pass 1 + Pass 2 with LoRA stack) | LoRA-conditioned i2i | **Active in V3, recommend retire** (see §3) |
| `fal-ai/iclight-v2` | `redesign.py` (Pass 3 relight), `composite_art.py` (art harmonize), `apps/web/app/api/personalization/lighting-previews/route.ts` | Relighting | **Active** |
| `fal-ai/nano-banana-pro/edit` | `empty_room_gemini.py`, `redesign.py` (NB-Pro fallback), `redesign_v2.py`, bakeoff stage5 | Gemini 3-1-pro edit | **Active** (primary in `cova-empty-room-v3`) |
| `fal-ai/flux-pro/kontext` | `apps/web/lib/ai/flux.ts:1609`, `apps/web/app/api/render/refinement/apply/route.ts:97` | Kontext text edit | **Active for refinement** |
| `fal-ai/lama` | `empty_room.py`, `empty_room_v2.py`, `empty_room_v3.py` | LaMa inpainting fallback | **Active fallback** |
| `fal-ai/bria/eraser` | `empty_room.py`, `empty_room_v2.py` | Bria eraser fallback | **Active fallback** |
| `fal-ai/florence-2-large/ocr-with-region` | `empty_room_v3.py` | OCR for Phase-A protect mask | **Active in Phase-A scaffold** |
| `fal-ai/sam2/image`, `fal-ai/sam2/auto-segment` | `apps/web/app/api/pipeline/segment-masks/route.ts`, `mask_build.py` | Per-item SAM2 fallback | **Active fallback** |
| `fal-ai/evf-sam` | `apps/web/app/api/pipeline/segment-masks/route.ts`, `apps/web/app/api/pipeline/redesign/route.ts:620` (kept-item differential mask), bakeoff stage6 | EVF text-prompted SAM | **Mostly vestigial** — Q5 audit: "block dead in V3" because keep_remove_decisions are empty in V3 |
| `fal-ai/flux/schnell` | `apps/web/app/api/personalization/generate-art-preview/route.ts` | Fast preview gen | **Active** |
| `fal-ai/flux-pro/v1.1` | `scripts/generate-missing-anchors.ts` | Quiz anchor image generation | **Active (offline tooling)** |
| `fal-ai/flux/dev/image-to-image` | `apps/web/app/design/_future/step-7e/page.tsx` | V1 retired step | **Vestigial** (`_future/`) |
| `fal-ai/image-preprocessors/canny` | `modal_pipeline/canny_ablation_test.py`, `cn_lora_compat_test.py` | Canny edges (ablation) | **Tooling only** |

Active in **bake-off / experiment** code only (not production):

| Endpoint | Used in | Notes |
|----------|---------|-------|
| `fal-ai/flux-2-max/edit` | density-test, structural-conditioning-test, camera-anchor-test, bakeoff-final | **The 80/80 winner** (density-test cond A) |
| `fal-ai/flux-2-pro/edit` | bakeoff-final (Stage 3 + Stage 5 winner) | The recommended V1 redesign endpoint |
| `fal-ai/flux-2-dev/edit` (`flux-2/edit`) | bakeoff-final stage3 | Cheap empty-room option |
| `fal-ai/flux-2-pro/edit`, `fal-ai/flux-2/edit` | bakeoff-final stage3 | |
| `fal-ai/nano-banana-2/edit`, `fal-ai/nano-banana/edit` | bakeoff-final stage3 | nano-banana-2 wins Stage-3 |
| `fal-ai/gpt-image-2/edit` | bakeoff-final stage5 | Loses to flux2-pro |
| `fal-ai/flux-pro/v1/depth` | structural-conditioning-test | Two-pass depth-conditioning ablation |
| `fal-ai/flux-2-trainer` | `experiments/fal_endpoint_smoke_test/` | Reachable; would be the FLUX.2 LoRA trainer |
| `fal-ai/flux-lora-fast-training` | `scripts/train-loras.ts` | The trainer that produced the 10 LoRAs |
| `fal-ai/esrgan`, `fal-ai/aura-sr`, `fal-ai/supir` | `modal_pipeline/postprocess.py` | Upscalers — listed disabled in CLAUDE.md, code path likely dead |

---

## 6. Image-Gen Pipeline Code

### Active V3 path (entry point)

| Stage | Code | Cost | Status |
|-------|------|------|--------|
| Step-7p submit | `apps/web/app/api/personalization/save/route.ts` | – | active |
| Render orchestrator | `apps/web/app/api/pipeline/redesign/route.ts` | – | active (700+ lines) |
| Empty-room call | `apps/web/lib/ai/empty-room-client.ts` → `cova-empty-room` Modal | $0.14 | active (Phase-2) |
| Empty-room V3 (Gemini) | `apps/web/lib/render/empty-room-v3.ts` → `cova-empty-room-v3` Modal | $0.10 | active (V3 anti-hallucination route) |
| Redesign | `apps/web/lib/ai/redesign-client.ts` → `cova-redesign-v3` Modal | $0.20 | active |
| Director | `apps/web/lib/ai/design-director.ts` (Anthropic Sonnet 4.5/4.6) | $0.012 | active |
| Render-context assembly | `apps/web/lib/ai/renderContext/assembler.ts` | – | active (Phase-3 fix wired blend → context) |
| Refinement | `apps/web/app/api/render/refinement/{detect,apply}/route.ts` | – | active (V3 step-8b) |

### Verification / scoring

| Component | Code | Status |
|-----------|------|--------|
| In-pipeline Sonnet QA | `modal_pipeline/redesign.py` lines 1480–1700 (10-axis rubric → composite + suggested chips) | **Active** |
| Bench reflection loop | `bench/scripts/run_phase_5_reflection.py` + `_judge.py` | **Bench-only** |
| Three-model aesthetic ensemble | `modal_pipeline/scoring.py` (HPSv2 + Q-Align + Aesthetic V2.5) | **Active in `cova-generation`** which is now V1-legacy → vestigial |

### Vestigial / future / `_future/`

`apps/web/app/design/_future/step-7{e,f,g,h}/` — V1's retired step-7
sub-routes (multi-shot, ShotStrip, anchor display). Preserved for V4
per `apps/web/CLAUDE.md` line 8. Some still reference `fal-ai/flux/dev`
endpoints. **Do not import from `_future/`.**

`apps/web/lib/marble.ts` — all functions commented out under
`MARBLE_DISABLED` annotations. Legacy from M7 3D-lift. Vestigial.

`apps/web/app/api/parallax/route.ts` — calls `cova-depthflow`. Listed
disabled in `apps/web/CLAUDE.md`. Vestigial.

V1 `submitFalKontextRender` / `submitFalFillRender` in
`apps/web/lib/ai/flux.ts` — direct fal proxy calls. Active for the
refinement route, vestigial elsewhere.

---

## 7. CLIP Embeddings & Product Catalog Infrastructure

### Catalog state (today)

Per `SCRAPING_LOG.md` and `SPRINT_LOG.md`:

- `products` table: 5,581 rows (was 3,136 pre-seed → +2,445 from M2/M6).
- 768-dim CLIP embeddings: **3,052 / 5,581 (55%)**. The other 45% are
  scraped products with placeholder images that the trainer skipped.
- IVFFlat index: built (migration `20240034000000_rebuild_ivfflat_index.sql`,
  rebuild at `20240038000000_rebuild_ivfflat_expanded.sql`).
- pgvector RPC: `search_products_by_embedding` — exists, exercised by
  `apps/web/lib/clipSearch.ts`.

### V9 product-match path is **not** the catalog

`apps/web/lib/clipSearch.ts` header (line 1):

> DORMANT — Curated product catalog infrastructure
> Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
> Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).

The active matcher is `apps/web/app/api/match/route.ts`:

1. Crop bbox → 2 versions (tight + 15% wider) via `cropAndUploadRenderRegion`.
2. Claude Sonnet 4.6 vision tool-use to extract `{category, material,
   color, style, era, size_descriptor, distinctive_features,
   search_queries[3]}`.
3. **Serper** (`google.serper.dev/shopping`) for the 3 text queries.
4. **Google Lens via SearchApi** (`searchapi.io/api/v1/search?engine=google_lens`)
   on the cropped image.
5. RRF merge; per-product CLIP embedding via Replicate
   (`andreasjansson/clip-features:75b33...`); cosine vs the render crop;
   budget + fit + style scoring; top-3 return.

So per-product CLIP **is still used for re-ranking** (via Replicate, not
the Modal endpoint). The Modal `cova-clip-text-embed` and the
`products` table CLIP column are not in the V9 critical path.

### EVF-SAM status

Two layers:

- `fal-ai/evf-sam` is wired into `apps/web/app/api/pipeline/segment-masks/route.ts`
  (line 237) and `apps/web/app/api/pipeline/redesign/route.ts:620`
  (per-item kept-item mask). The V3 audit
  (`docs/debug/cova_pipeline_diagnostic.md` Q1.8) flags this branch as
  **dead in V3** because `keep_remove_decisions` is always empty (the
  step-7c keep/remove UI is in `_future/`).
- The bake-off (`scripts/bakeoff-final/stage6.ts`) compared SAM3 vs
  EVF-SAM for art-on-wall segmentation. **SAM3 won** (avg 38.3 vs lower
  for EVF-SAM, faster).

### Recommendation

For V1:

- **Archive** `apps/web/lib/clipSearch.ts` and `cova-clip-text-embed` —
  already dormant/stopped.
- **Archive** `cova-fusion-embedder`, `embed_catalog{,_gpu}.py` — catalog
  tooling for an embedding strategy V9 doesn't use.
- **Archive** the `products` CLIP column reads (the table itself stays
  for V1.5 catalog work). Don't drop the column.
- **Keep** `apps/web/lib/ai/clip.ts` (`embedImage` via Replicate) — the
  V9 match route still uses per-result CLIP scoring, even though it's not
  the search index.
- **Keep** SAM-3 (production) and drop EVF-SAM from the redesign-route
  kept-item path (dead anyway). EVF-SAM does not feed Google Lens
  queries — Google Lens takes the rendered crop directly. So EVF-SAM
  isn't worth keeping as a "region-detection upstream of Lens" either.

---

## 8. Google Lens API Integration

**Status: integrated, working, V1 critical-path.**

### Where

`apps/web/app/api/match/route.ts` lines 63–125. Helper:
`async function searchGoogleLens(imageUrl: string): Promise<SerperProduct[]>`.

### API contract

```
GET https://www.searchapi.io/api/v1/search
  ?engine=google_lens
  &search_type=products
  &hl=en
  &gl=us
  &url=<imageUrl>
  &api_key=<SEARCHAPI_KEY>
```

Response shape: `{ visual_matches: [{title, link, source, price, thumbnail|image, rating, reviews}] }`.

The route normalizes Lens results to the `SerperProduct` shape so
downstream code (RRF merge, scoring) handles Lens + Serper
interchangeably.

### Cost

SearchApi.io pricing (per their docs): **$0.005 / Google Lens query**
on the standard plan, free trial includes a few hundred. Each `/api/match`
call fires one Lens query + 3 Serper queries = ~$0.005 + $0.005 = **~$0.01
per item**. At ~6 items per render, ~$0.06/render in search alone.

### Credential

`SEARCHAPI_KEY`. Per `apps/web/docs/sessions/foundation-repair-progress.md`
line 174 (older note): "Not in .env.local. Google Lens visual search not
available." **Verify locally before V1 launch** — if missing, the route
gracefully falls back to Serper-only (`if (!key) return []`).

### Surprises

- The `/api/match` route still imports `Replicate` and `replicate.run(…)`
  for CLIP embeddings on Lens/Serper results. This is per-result
  embedding, not catalog search. Stays, since the alternative (CLIP via
  Modal) was retired with `cova-clip-text-embed`.
- The route does **not** call any Modal app. End-to-end product matching
  on V1 is fal-free and Modal-free apart from the crop-upload step.

---

## 9. Recommended Architecture for V1

Inputs: today's V3 pipeline + the bake-off and density-test telemetry.

### Modal apps to keep deployed

1. `cova-perception` — depth + SAM3 + furniture-spec, production.
2. `cova-empty-room` (Phase-2) — primary empty-room pipeline. Already on
   strict-inpaint flow with passthrough blend.
3. `cova-empty-room-v3` (Gemini) — the anti-hallucination path. Inline
   into TS for V1.5 if we want to free a Modal slot, but keep deployed
   for V1.
4. `cova-composite-art` — art-on-wall homography + IC-Light. No cleaner
   alternative.

### Modal apps to retire / archive

- `cova-redesign-v3` — replace with a thin TS wrapper around
  `fal-ai/flux-2-pro/edit` using the density-test winning prompt
  template. Keep `redesign.py` on disk; delete deployment.
- All `*-v2`, `*-bak`, `cova-redesign-pipeline`, `cova-generation`,
  `cova-preprocessing-pipeline`, `cova-structural-extraction`,
  `cova-professionalization`, `cova-furniture-matching`,
  `cova-mask2former-v3`, `cova-grounded-sam2`, `cova-pre-detection`,
  `cova-segmentation`, `cova-clip-text-embed`,
  `cova-restoration-pipeline`, `cova-depthflow`, `cova-fusion-embedder`,
  `cova-catalog-embedder`, `cova-clip-embedder-gpu` — already stopped or
  superseded; safe to leave un-deployed and remove from Modal workspace.
- `modal_pipeline/anysplat/` — vendored AnySplat repo, no callers.
  Delete the directory (~30,856 LOC) when the team has bandwidth.

### Image-gen call pattern for V1

```
empty-room: fal-ai/nano-banana-2/edit  ($0.10, Stage-3 winner)
            OR keep cova-empty-room (Phase-2) for inputs that need
            architecture-preserving SAM3 mask → flux-pro/v1/fill

director:   Anthropic claude-sonnet-4-6  ($0.012)

redesign:   fal-ai/flux-2-pro/edit       ($0.10, Stage-5 winner)
            with single-image enumerated prompt (density-test cond A)
            optional 2nd-pass refinement using the same endpoint

composite:  cova-composite-art            ($0.05, kept)
```

Predicted cost / room: **~$0.23–0.28 end-to-end** (matches the bake-off
report's $0.233 estimate). Predicted latency: ~190s sequential, ~120s
with stage parallelism.

### CLIP / EVF-SAM / catalog

- Drop the catalog/CLIP search path from V1. `clipSearch.ts` stays as
  dormant code; `products` table stays in Supabase (don't drop the
  column).
- Drop EVF-SAM from the redesign route's kept-item branch — dead in V3
  per the diagnostic. Keep SAM-3 (production) and drop EVF-SAM
  bake-off candidate (lost to SAM3).
- Per-product CLIP rerank in `/api/match` stays — it uses Replicate,
  not Modal, and improves Lens result quality.

### LoRAs

- Archive all 10 trained LoRAs. They live in `lora-backups/` and are
  mirrored in Supabase storage. Mark `LORA_REGISTRY` deprecated when
  we retire `cova-redesign-v3`.
- Revisit in V1.5 *only if* a multi-archetype bake-off (not just Warm
  Japandi) shows FLUX.2 prompt-only failing on a specific style.

### Google Lens

Confirm `SEARCHAPI_KEY` is set in `apps/web/.env.local` before launch.
The route falls back gracefully to Serper-only if it's missing, which
means a soft-fail; verify with one e2e test.

---

## 10. Open Questions

1. **`SEARCHAPI_KEY` set?** Per the older session note it wasn't. Need
   to confirm in current `.env.local` before V1 launch — otherwise Google
   Lens is silently disabled.

2. **Does "V1 winning architecture" mean FLUX.2 Max or FLUX.2 Pro?**
   Density-test winner was Max (80/80). Bake-off Stage-5 winner was Pro
   ($0.10 vs Max's $0.20, similar quality 74–76/90). Pro is cheaper at
   parity quality on bedroom + living-room. Max may pull ahead on
   harder rooms (input-03 loft, input-05 attic). Recommend Pro for V1
   baseline, escalate to Max only on specific failure modes.

3. **Empty-room: nano-banana-2 (bake-off Stage-3 winner) vs cova-empty-room
   (Phase-2 SAM3+Fill-Pro pipeline)?** Bake-off used a single prompt
   template; Phase-2 has the strict passthrough-blend that bit-exactly
   preserves unmasked pixels. For high-contrast input rooms (e.g.
   stacked-stone walls) Phase-2 is safer. For typical inputs nano-banana-2
   may be enough. Decide with a 5-room A/B before swapping.

4. **Should we delete `modal_pipeline/anysplat/` (~30,856 LOC)?** No
   callers, but a meaningful cleanup. Suggest yes, in a single commit
   labeled "remove vendored AnySplat".

5. **`cvmin/cvscn` collision** — fix it now (drop COVAMINIMAL),
   or leave the LoRA registry alone since we're archiving LoRAs anyway?
   Recommend: leave alone if archiving; remove the COVAMINIMAL entry from
   `LORA_REGISTRY` only if we're keeping the registry alive in V1.5.

6. **Modal slot quota.** We're already at the workspace endpoint cap (8)
   per the Phase-5 closeout note. Retiring `cova-redesign-v3` frees one
   slot; retiring `cova-empty-room-v3` (by inlining its orchestration
   into TS) frees another. After both, we'd be comfortably under the
   cap.

7. **`empty_room_v3.py` vs `empty_room_gemini.py`.** The first is a
   deprecated Phase-A scaffold (SAM3+LaMa local orchestration); the
   second is the production Gemini engine (cova-empty-room-v3 Modal app).
   `bench/` scripts still import helpers from the deprecated one — do we
   delete the deprecated file and break bench, or rename it? Suggest
   rename to `empty_room_phase_a.py` for clarity.

8. **The `cova03-20` Amazon tag should not appear in any test fixture
   or doc that gets committed publicly.** Spot-checked — it's in this
   audit (mention only). No PII risk; flag because the tag is the
   monetization handle and shouldn't leak in places we don't expect.

