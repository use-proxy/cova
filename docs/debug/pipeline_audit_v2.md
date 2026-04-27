# Pipeline Audit V2 — Post-Empty-Room Architecture

**Date:** 2026-04-26
**Auditor:** Claude Code (from committed HEAD, read-only)
**Prior audit:** `docs/debug/fingerprint_audit.md` (2026-04-25) — partially stale, corrections in Section E.

---

## A. The Current Pipeline, End-to-End

### Step 1: User uploads photo

- **Input:** JPEG/PNG from user's device.
- **Stored in:** `rooms.original_image_url` (Supabase Storage).
- **Route:** Photo upload happens at step-6 (`app/design/step-6/`), which creates the `rooms` row.

### Step 2: Empty room generation (Gemini path)

- **File:** `modal_pipeline/empty_room_gemini.py` — Modal app `cova-empty-room-v3`.
- **Input:** `image_url` (the original room photo URL).
- **Process:**
  1. **Occlusion assessment** — Claude Sonnet 4.5 vision on original photo. Binary router: `needs_anti_hallucination` true/false.
  2. **Conditional pre-pass** — If anti-hallucination needed: Claude Sonnet 4.5 describes adjacent surfaces for each removable item (per-item "PAINT HERE" context).
  3. **Gemini edit** — `fal-ai/nano-banana-pro/edit` with either the static V1 removal prompt or the anti-hallucination prompt (with per-item context + CRITICAL RULE clause).
  4. **Strict emptiness audit** — Claude Sonnet 4.5 vision scores residual items 0-10.
  5. **Conditional retry** — If residuals found: second Gemini edit with "image still contains [items]" prompt, then re-audit.
  6. **Final verdict** — Returns `EmptyRoomV3Response` with `empty_room_url`, `quality_warning`, `residual_items`, `pipeline_path`, `cost_usd`.
- **Output:** URL to the empty room image (hosted on fal CDN). Written to `rooms.empty_room_url` by the web layer.
- **Cost:** ~$0.30-0.60/room (2 Claude calls minimum + 1-2 Gemini calls).

### Step 3: Redesign route orchestration (TypeScript)

- **File:** `apps/web/app/api/pipeline/redesign/route.ts` — Next.js API route, `POST`.
- **Triggered:** On step-7p "Generate my room" button.
- **What it does (sequentially):**
  1. Auth check + read room/user from Supabase (`rooms`, `users` tables).
  2. Resolve `StyleFingerprint` from `renderContext.fingerprint` or `users.style_fingerprint`.
  3. Fetch style reference anchor via `fetchTopStyleReference()` (cosine sim against `quiz_anchor_images`).
  4. Gemini room architecture analysis via `analyzeRoomArchitecture()` (camera angle, focal length).
  5. **Design Director** (`runDesignDirector()`) — 2 Claude calls:
     - Call 1: Claude Sonnet 4.6 + room photo + fingerprint context → `DesignBrief` (structured JSON, ~40 fields).
     - Call 2: Claude Haiku 4.5 + DesignBrief → 50-80 word FLUX prompt.
  6. Persist `design_brief` + `flux_prompt` + `unsplash_references` + `design_memory` to rooms table.
  7. Resolve LoRA stack from `style_blend` via `getLoraStackFromBlend()`.
  8. Seed management (retry detection, increment on retry).
  9. Change map assembly for differential diffusion (if user kept items via step-7c).
  10. **Empty room validation gate** — Claude Haiku 4.5 vision: is the empty room actually empty?
  11. **Dispatch to Modal** — sends V9 body to `cova-redesign-v3` endpoint.

- **V9 body sent to Modal:**
  ```json
  {
    "empty_room_url": "rooms.empty_room_url or original_image_url",
    "room_type": "bedroom",
    "style_blend": {"COVAJAPANDI": 0.7, "COVASCANDINAV": 0.3},
    "style_fingerprint": { "dimensions": {...}, "confidence": 0.82 },
    "personalization": { "art": {...}, "identity_objects": [...], ... },
    "budget_max": 5000,
    "seed": 42,
    "room_id": "...",
    "user_id": "..."
  }
  ```

**CRITICAL FINDING:** The Design Director's `compiledPrompt` (the 50-80 word FLUX prompt from Call 2) is **NOT sent in the V9 body**. It is persisted to `rooms.flux_prompt` but the V3 Modal pipeline builds its own prompts from scratch. The Design Director output is used for: (a) refinement continuity via `design_memory`, (b) the legacy webhook path only, (c) Unsplash reference selection.

### Step 4: V3 3-pass redesign (Python/Modal)

- **File:** `modal_pipeline/redesign.py` — Modal app `cova-redesign-v3`, CPU-only (all inference via fal.ai).
- **Input:** `RedesignRequest` Pydantic model (fields from V9 body above).
- **Process:**

  **Pass 0 — Layout Planner (Claude Sonnet 4.5 Vision):**
  - Input: empty room photo URL + room type + primary archetype + personalization dict + style blend.
  - Claude analyzes the empty room and produces a JSON scene spec:
    - `architecture_notes`, `focal_wall`
    - `pass1_hero_placement` (primary hero, secondary pieces, rug placement)
    - `pass2_surfaces` (list of {surface_name, vignette})
    - `personalization_placements` (art position, smart tech position, identity objects)
    - `life_objects` (3 "Gosling rule" lived-in items)
    - `pass3_lighting_preset` (warm_cozy | bright_natural | dramatic_moody)
  - Fallback: if Claude fails, uses `ROOM_TYPE_SPECS` defaults.

  **Pass 1 — Hero Furniture Lock (FLUX general i2i):**
  - Input: `empty_room_url` (the empty room image).
  - Model: `fal-ai/flux-general/image-to-image`.
  - Prompt: Built by `_build_pass1_prompt()` — ~100 words, structured as:
    - LoRA trigger + room type anchor
    - Art fragment (layout, frame style, content description)
    - Identity objects (plants, books, sneakers, vinyl, etc. with quantity-specific prompts)
    - Smart products (TV, monitors, hue strips, etc.)
    - Specific items (named products from personalization)
    - Freetext additions
    - Hero furniture + rug placement from layout plan
    - Lighting description from preset
    - Materials + palette from style_rules JSON
    - Photography direction ("Francois Halard, 35mm, AD editorial")
  - LoRA stack: primary style LoRA (capped at 0.65 scale) + add-details LoRA (0.40).
  - ControlNet: depth map from `fal-ai/imageutils/depth` at 0.80 scale.
  - Params: strength=0.92, steps=28, guidance=3.5.
  - 4-retry loop with ControlNet drop on final attempt for transient failures.
  - Output: URL to Pass 1 image.

  **Pass 2 — Per-Surface Decor Density (loop):**
  - Input: Pass 1 output image.
  - For each surface in the layout plan (max 4):
    - Builds a heuristic pixel mask for the surface region.
    - Builds a surface-specific prompt with style trigger + vignette description.
    - Calls `fal-ai/flux-general/image-to-image` at strength=0.55, steps=22.
    - Each call uses the previous call's output as input (sequential chaining).
  - Display-only identity objects (sneakers, vinyl, cameras, etc.) are added as extra surface vignettes.
  - Output: URL to Pass 2 image.

  **Pass 3 — IC-Light v2 Relight:**
  - Input: Pass 2 output image.
  - Model: `fal-ai/iclight-v2`.
  - Prompt: preset-specific lighting description.
  - Critical params: `lowres_denoise=0.85`, `highres_denoise=0.40`, `bg_threshold=0.50` (was 0.75 → fog-bombing), `guidance=5.0`, `steps=20`.
  - Output: URL to Pass 3 image.

  **Editorial Post-Processing (PIL + numpy, in-process):**
  - Warm white balance (R×1.03, B×0.97).
  - Gentle S-curve contrast (tanh, k=2).
  - 3% desaturation toward luminance.
  - Film grain (shadow-weighted, σ=0.006).
  - Corner vignette (very subtle, max 8% darkening).
  - Output: uploaded JPEG to fal CDN.

  **QA Check (Claude Sonnet 4.5 Vision):**
  - Scores 10 dimensions 1-5: room_type_correct, hero_furniture_quality, style_accuracy, decor_density, lighting_quality, personalization_features_visible, lived_in_quality, editorial_photography_quality, perspective_and_scale, art_accuracy.
  - Produces 3 `suggested_chips` for the refinement UI.
  - Output: `QAResult` with composite score + chips.

- **Response:** `RedesignResponse` with `render_url`, `pass1_url`, `pass2_url`, `pass3_url`, `qa`, `layout_plan`, `cost_usd`, `latency_seconds`.
- **Total cost:** ~$0.15-0.40/redesign (3-7 fal calls + 2 Claude calls).

### Step 5: User sees the redesign

- The `render_url` from the Modal response becomes `rooms.redesigned_pano_url` (legacy column name — holds a flat 2D JPEG, not a panorama).
- Step-8a shows the before/after slider.
- Step-8b shows tap-to-refine + suggestion chips from QA.

### Step 6: Product matching (separate pipeline)

- **Triggered:** After redesign completes, step-9 page mount.
- **Route:** `apps/web/app/api/pipeline/furniture-match/route.ts`.
- **Process:**
  1. Calls Modal `cova-furniture-matching` webhook for **detection only** (Claude Vision on the redesigned image).
  2. For each detected item (10-14 per room), runs Serper Google Shopping search.
  3. Filters by furniture allowlist, budget range, retry fallbacks.
  4. Writes to `room_products` table + `rooms.matched_products` JSONB.
- **Per-item matching** (when user taps a hotspot): `apps/web/app/api/match/route.ts`:
  1. Crops the render at the item's bounding box (tight + 15%-wider context crop).
  2. Claude Sonnet 4.6 Vision extracts structured product attributes (category, material, color, style, search queries).
  3. 5 parallel searches: 2 Google Lens (tight + wide crop) + 3 Serper Shopping (LLM-produced queries).
  4. RRF merge → furniture filter → CLIP embedding (Replicate) → cosine similarity scoring → budget scoring → fit scoring → final ranked list.
  5. Returns top 8 products with match labels.

---

## B. Where Does the Empty Room Go?

**Definitively answered from code:**

The empty room is **consumed by FLUX as the base image for Pass 1**. The styled output is generated FROM the empty room, NOT from the original room photo.

Evidence — `modal_pipeline/redesign.py:1616`:
```python
pass1_url = _call_flux_general_i2i(
    image_url=str(req.empty_room_url),  # ← THE EMPTY ROOM
    prompt=pass1_prompt,
    strength=strength_p1,
    ...
)
```

And `apps/web/app/api/pipeline/redesign/route.ts:766`:
```typescript
const v9Body = {
  empty_room_url: room?.empty_room_url ?? photoUrlForPipeline ?? null,
  // ...
};
```

The fallback chain is: `rooms.empty_room_url` → `rooms.original_image_url` → `rooms.original_photo_url`. So if the empty room step failed or wasn't run, the original photo is used instead.

Pass 0 (Layout Planner) also receives the empty room URL and analyzes it to produce the layout plan.

The original room photo is used by the TypeScript route for:
- Design Director (Claude Vision analysis)
- Gemini room architecture analysis
- EVF-SAM2 inline mask generation (for kept items)
- Empty room validation gate

But the actual image generation (Passes 1-3) operates exclusively on the empty room.

---

## C. Serper + Google Lens Product Flow

### When does product search happen?

**After image generation, as a completely separate pipeline.** Product search is NOT part of the redesign pipeline.

### What triggers it?

Step-9 page mount fires `POST /api/pipeline/furniture-match` which:
1. Calls Modal `cova-furniture-matching` webhook for Claude Vision detection on the **redesigned image** (`rooms.redesign_pano_url`).
2. For each of the 10-14 detected items, runs a Serper Shopping query.

### What's the input to product search?

Two inputs:
1. **Detection input:** The redesigned image (flat 2D JPEG) — Claude Vision identifies furniture items with labels, descriptions, categories, positions (azimuth/elevation or 2D hotspot x/y%), and a 10-16 word Google Shopping query per item.
2. **Per-item search input:** The `search_query` string from Claude Vision detection. This is NOT an image crop at this stage — it's a text-based shopping search.

### Per-item matching (tap-to-shop)

When the user taps a hotspot on step-9, `POST /api/match` fires with:
- `render_url` — the redesigned image
- `item_bbox` — bounding box [x,y,w,h] fractions
- `item_label` — what Claude detected

Then:
1. **Crop** the render at the bbox (tight + wide).
2. **Claude Vision** extracts structured attributes from the crop.
3. **Google Lens** (SearchAPI.io) — 2 parallel visual searches on tight + wide crops.
4. **Serper Shopping** — 3 parallel text searches using Claude's recommended queries.
5. **CLIP embedding** (Replicate) — batched visual similarity between crop and all candidate product images.
6. **Scoring:** weighted composite of visual similarity (CLIP), budget fit, physical fit, quality (rating), and dual-Lens overlap bonus.
7. Returns top 8 products.

### How are results displayed?

- **Step-9:** Hotspots overlaid on the redesigned image at detected positions. Each hotspot links to a product panel showing up to 5 products per item with affiliate URLs.
- The hotspot positions come from either 2D Claude Vision detection (hotspot_x/y%) or azimuth/elevation degrees (legacy 3D positioning).

---

## D. Style Application Mechanism

### Is the styled output a single image generated by FLUX?

**No — it's a 3-pass sequential pipeline, each pass producing a new image:**

1. **Pass 1** — FLUX general i2i on the empty room → hero furniture with style LoRA conditioning. This is the heaviest transformation (strength=0.92).
2. **Pass 2** — FLUX general i2i on Pass 1 output → per-surface decor additions with masked regions. Lower strength (0.55) to preserve Pass 1.
3. **Pass 3** — IC-Light v2 on Pass 2 output → relighting pass. Preserves furniture, changes lighting atmosphere.
4. **Post-process** — PIL/numpy editorial finishing (WB, contrast, grain, vignette).

### How is style applied?

**Three mechanisms simultaneously:**

1. **LoRA conditioning** — Primary style LoRA (e.g., `cvwmn` for Japandi) loaded by `fal-ai/flux-general` during inference. Scale capped at 0.65 (was higher but overrode personalization). Plus `add-details` universal LoRA at 0.40.

2. **Prompt text** — Style-specific vocabulary injected from `style_rules/*.json` files (materials, palette, density tier). The LoRA trigger word bookends the prompt. Style-specific furniture, material names, and palette colors are woven throughout.

3. **Depth ControlNet** — Structural preservation from the empty room's depth map. Scale 0.80 for Pass 1, varying per room type for Pass 2.

### Is it composited from multiple sources?

**Sequential, not composited.** Each pass uses the previous pass's output as its input image. There is no alpha blending or layer composition between passes. However, the art compositing path (`cova-composite-art` Modal app) is a separate compositing pipeline for wall art that uses SAM-3 wall detection + homography + Poisson blending — but this is not in the main redesign flow as committed.

### What does the user actually see as "the redesign"?

A single flat 2D JPEG (typically 1024×1024 or the input image's aspect ratio). Stored in `rooms.redesign_pano_url`. Displayed in a before/after slider on step-8a, with tap-to-refine on step-8b and shoppable hotspots on step-9.

---

## E. Gaps Between Prior Audit and Current Code

### E1. "3,000-product catalog with CLIP embeddings" — WRONG

The prior `fingerprint_audit.md` correctly identifies the current architecture: Serper + Google Lens for real-time product search. However, the `products` table (5,581+ rows with 768-dim CLIP embeddings) still exists in Supabase per CLAUDE.md but is **NOT used by the current pipeline**.

The current product matching has **two paths**:
- **Bulk detection** (`/api/pipeline/furniture-match`): Claude Vision detection → Serper Shopping text queries → no CLIP, no catalog.
- **Per-item tap** (`/api/match`): Claude Vision + Google Lens + Serper + CLIP (via Replicate, NOT against the `products` table — against candidate product images from search results).

The `products` table CLIP embeddings are orphaned. `apps/web/lib/clipSearch.ts` exists but its header says "DORMANT". `modal_pipeline/furniture_matching_pipeline.py:369` has a comment: "DEPRECATED — catalog-based CLIP/pgvector matching removed."

### E2. "Fingerprint → LoRA weight mapping" — PARTIALLY CORRECT

The prior audit correctly traces the fingerprint → style_blend → LoRA weights path. What it misses:

- The TS Design Director's compiled prompt is **not sent to the V3 Modal pipeline** (only in the legacy webhook path). The V3 pipeline builds prompts independently from `style_blend` + `style_rules/*.json` + Layout Planner output.
- The `redesign-client.ts` (Phase 5) schema expects fields like `redesign_url`, `archetype_resolved`, `primary_trigger` that **do not match** the V3 `RedesignResponse` schema (`render_url`, `pass1_url`, `pass2_url`, `pass3_url`, `qa`). There is a schema mismatch between the client library and the actual deployed service.

### E3. "Three parallel style channels" — NOT HOW IT WORKS

The prior audit describes three "conversion paths" for the fingerprint. While technically accurate (fingerprint feeds LoRA selection, Design Director, and anchor image lookup), these are not "parallel channels" in the pipeline. In the V3 flow:
- The LoRA path is the only one that reaches pixel generation (via `style_blend` → `_build_lora_stack()` on Modal).
- The Design Director runs in TypeScript but its prompt output does NOT reach the V3 Modal pipeline.
- The anchor image lookup is fallback-only.

### E4. Prior audit misses V3 3-pass architecture entirely

The prior audit describes a single FLUX i2i call. The actual pipeline is 3 sequential FLUX/IC-Light passes + a Layout Planner pass + a QA pass.

### E5. Prior audit misses Pass 0 Layout Planner

Claude Vision on the empty room producing a structured JSON scene spec is not mentioned. This is the spatial reasoning step that tells FLUX where to place furniture.

### E6. Prior audit misses editorial post-processing

The warm WB + s-curve + desat + grain + vignette PIL/numpy step is not documented.

### E7. Prior audit misses IC-Light v2

Pass 3 relighting is a distinct inference call, not a FLUX parameter.

### E8. Unsplash references — overstated in prior audit

The prior audit says Unsplash references are used for "IP-Adapter conditioning." In the V3 pipeline, Unsplash references are fetched and persisted by the TS route but **never sent to the V3 Modal endpoint**. They exist in the `rooms.unsplash_references` column and the legacy webhook body, but the V9 body does not include them.

---

## F. The Actual Remaining Problem

**Given:** Gemini empty room works (structural preservation solved). V3 3-pass pipeline produces styled redesigns that beat Collov on 14/15 rooms.

**The unsolved problem is:**

> The product matching pipeline detects furniture in the **AI-generated redesign image** (not a real photo), then searches Google Shopping with text queries derived from Claude's description of AI-generated furniture — producing results that look generically similar rather than specifically matching what the render depicts, because there is no visual grounding between the generated furniture and the real products being surfaced.

Specifically: the bulk detection path (`/api/pipeline/furniture-match`) runs a single Serper text query per item with no visual similarity scoring. The per-item tap path (`/api/match`) does use CLIP + Google Lens for visual matching, but only fires on user interaction — the initial hotspot panel is populated entirely by text search. The 5,581-product CLIP catalog is orphaned and unused. The dual-path architecture (text-only bulk + visual per-item) creates an inconsistent shopping experience where the initial product suggestions may look nothing like what's rendered, but tapping individual items produces better matches.
