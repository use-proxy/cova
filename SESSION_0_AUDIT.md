# SESSION 0 AUDIT — Cova v3 Pre-Build Ground Truth
**Date:** April 13, 2026
**Auditor:** Claude Code (read-only, no changes made)
**Purpose:** Complete codebase audit before v3 pipeline rebuild

---

## CRITICAL DISCOVERY UPFRONT

**The codebase is in a split-brain state.**
`apps/web/CLAUDE.md` (the spec) says **fal.ai** is the generation provider.
The actual code (`redesign_pipeline.py`, `flux.ts`, `render/status/route.ts`) uses **Replicate** exclusively.
There is no `app/api/fal/proxy/route.ts` file. No FAL_KEY in `.env.local`.
**Every pipeline section below reflects what is actually in code, not what CLAUDE.md specifies.**

---

## 1. CURRENT FLUX PIPELINE (EXACT PARAMETERS)

### Provider: Replicate (not fal.ai)

Three active FLUX models, all called via raw Replicate API:

#### FLUX Kontext Pro — `black-forest-labs/flux-kontext-pro`
**Called in:** `modal_pipeline/redesign_pipeline.py` → `run_flux_kontext()`
```
input_image:        pano_url (user's room photo)
prompt:             compiled prompt (Claude-generated or TS-compiled)
guidance:           3.5
steps:              28
prompt_strength:    0.82
prompt_upsampling:  False
aspect_ratio:       "match_input_image"
output_format:      "webp"
output_quality:     95
safety_tolerance:   2
```
- If `style_reference_url` is provided, switches to `flux-kontext-apps/multi-image-kontext-pro` and adds `input_image_2: style_reference_url`
- Polled every 3s, timeout 120s
- Called with `"Prefer": "wait"` header for synchronous response attempt

**Also called in:** `apps/web/lib/ai/flux.ts` (TS side via Replicate SDK) via:
- `submitRender()` — single image Kontext Pro
- `submitMultiImageRender()` — multi-image Kontext Pro (2 inputs)
- `submitArchitectureCorrection()` — pass 2 of two-pass flow

Two-pass flow (in `render/status/route.ts`):
- Pass 1: Kontext Pro style render (or Depth Pro)
- Pass 2: Architecture correction via `submitArchitectureCorrection()`, fires automatically when pass 1 completes

#### FLUX Depth Pro — `black-forest-labs/flux-depth-pro`
**Called in:** `modal_pipeline/redesign_pipeline.py` → `run_flux_depth_pro()`
```
control_image:        room photo URL (depth extracted internally by model)
prompt:               compiled prompt
num_inference_steps:  50
guidance_scale:       30
output_format:        "jpg"
safety_tolerance:     2
```
- Polled every 3s, timeout 180s

**Also referenced in:** `apps/web/lib/ai/flux.ts` → `submitDepthRender()`
- Used as an alternative to Kontext Pro when original photo is available

#### FLUX Canny Pro — `black-forest-labs/flux-canny-pro`
**Called in:** `modal_pipeline/redesign_pipeline.py` → `run_flux_canny_pro()`
- Same structure as Depth Pro
- Used for edge-conditioned generation (structural preservation)

#### FLUX Fill Pro — `black-forest-labs/flux-fill-pro` (LEGACY)
**Called in:** `apps/web/app/api/render/status/route.ts` (Stage 2 of two-stage legacy branch)
```
image:           stage1 output URL
mask:            inpainting mask URL
prompt:          from costLog.positive_prompt
steps:           28
guidance:        30
output_format:   "jpg"
output_quality:  90
safety_tolerance: 2
```
- Only fires when `costLog.two_stage = true && costLog.stage2_pending = true`
- This is the old inpainting path — still wired in status route

#### FLUX Schnell — `black-forest-labs/flux-schnell`
- Used for fast preview during render loading only (text-to-image, no input_image)
- Not a generation model — just a loading screen

#### Clarity Upscaler — `philz1337x/clarity-upscaler`
- Fires after pass 2 completes (two-pass flow) or after single-stage
- 2× upscale with AI detail enhancement, ~$0.012/run
- Non-fatal: falls back to unupscaled URL on failure

### What drives the prompt:

**TS path (primary for web-triggered renders):**
`apps/web/lib/ai/prompt-compiler.ts` → `compilePromptWithClaude()`
- Model: `claude-sonnet-4-5`
- Skeleton (Part A, ~60 tokens): room type, geometry preservation, keep/remove items
- Synthesizer (Part B, max 380 tokens): style mood + materials + lighting + density + all 7d fields
- Iterative compression up to 2 passes if over token budget
- Final prompt: `{skeleton} {Claude output}` → `sanitizeForbiddenStyleNames()`

**Python path (Modal webhook renders):**
`modal_pipeline/redesign_pipeline.py` → `generate_prompt_with_claude()`
- Model: `claude-sonnet-4-6`
- Simpler 280-word budget, style blend → vocabulary → Claude prompt
- Fallback: `generate_prompt_fallback()` (no Claude, template-based)

**There are TWO prompt compilers** — TS and Python — with different system prompts, different Claude versions, and different field coverage. They are not synchronized.

### ControlNet status:
- Depth Pro: depth conditioning is **built into the Replicate model** (no separate ControlNet call)
- Canny Pro: edge conditioning is **built into the Replicate model**
- No separate ControlNet module is called anywhere in the codebase
- The CLAUDE.md spec references `depth ControlNet=0.60, edge ControlNet=0.40` — **these parameters do not exist in the current code**

---

## 2. STEP-7C STATE

**File:** `apps/web/app/design/step-7c/page.tsx` (846 lines)

### What it does:
- Displays furniture items detected from the original photo
- User can mark each item "keep" or "remove"
- Fixed items (`is_fixed: true`) are auto-set to "keep" and cannot be changed
- Items positioned on a visual room overlay using azimuth/elevation degrees → pixel coordinates
- Polls `rooms.pre_detection_result` with 60s timeout

### Data source:
- **Reads:** `rooms.pre_detection_result` (JSONB) — populated by `pre_detection_pipeline.py`
- **Stores decisions to:** Zustand `useArea2Store` + Supabase `rooms.keep_mask` JSONB

### Segmentation: NO
- No EVF-SAM2 or any segmentation model runs in step-7c
- The CLAUDE.md spec describes "EVF-SAM2 segments furniture from keep/remove selections" — **this is NOT implemented**
- Detection is bounding-box only (azimuth/elevation angles, no pixel masks)
- Highlight boxes are approximated from azimuth/elevation → fake CSS percentages

### Keep/remove → FLUX: PARTIAL
- Keep/remove decisions flow into `prompt-compiler.ts` skeleton via `context.keepMask.objects`
- Kept items appear as: `"Keep exactly as-is: {items}."`
- Removed items appear as: `"Remove: {items}. Replace with style-appropriate alternatives."`
- **No differential diffusion / change map (white=change, black=preserve)** — specified in CLAUDE.md but not implemented
- The `rooms.keep_mask` data reaches the prompt but does NOT mask pixels during generation

---

## 3. STEP-7D FIELDS AUDIT

**File:** `apps/web/app/design/step-7d/page.tsx` (exists — tabbed chatbot UI)

Step-7d is a **chatbot interface** (4 tabs: All, Products, Tech, Art) that sends messages to `/api/design-chat`. It is NOT a form with explicit fields — it collects preferences via conversation.

| Tab | Starters / Chips | Stored Where | Reaches FLUX Prompt |
|-----|-----------------|--------------|---------------------|
| All | Vibe, boutique hotel, cozy | `area2Store.renderContext` | YES — via `chatContext` in prompt-compiler |
| Products | Sofa, coffee table, rug links | `area2Store.requestedProducts` | YES — `context.requestedProducts` |
| Tech | TV, audio, smart lighting, WFH, gaming | `area2Store.techSpec` | YES — full techSpec object in context |
| Art | Artist, direction, vinyl, books | `area2Store.artBrief` | YES — full artBrief object in context |

**Additional context objects also wired in (from prior steps):**

| Field | Source | Stored Where | Reaches FLUX |
|-------|---------|-------------|--------------|
| `sensoryProfile` | Implicit from chat | `area2Store` | YES — rugSize, rugStyle, plantPresence, candles, etc. |
| `identityBrief` | Implicit from chat | `area2Store` | YES — culturalRef, fandoms, interests, moodTarget |
| `roomConstraints` | step-7b | `area2Store` | YES — wallPermanence, physicalConstraints, hasPetsOrKids |
| `budget` | step-5 | `fingerprint store` | YES — rangeMin/Max, tier, strategy |
| `keepMask` | step-7c | `area2Store` | YES — keep/remove labels in skeleton |
| `styleBlend` | step-2 quiz | `fingerprint store` | YES — drives styleAnchor derivation |

**Fields collected but SILENTLY DROPPED (none found):**
The prompt-compiler.ts comment explicitly notes that previously-dropped fields have been re-added.
Based on code review, **no fields are currently dropped** — all wired in as of v2 prompt-compiler.

**Fields specified in CLAUDE.md but NOT implemented:**
- Unsplash IP-Adapter references (`rooms.unsplash_references` exists in DB, but `UNSPLASH_ACCESS_KEY` is missing and no Unsplash fetch fires at step-3)
- Style LoRA scale (no `style_loras` table, no LoRA injection in any FLUX call)
- Professionalization pass (no preprocessing.py, no professionalization.py)
- Quality gate / LAION Aesthetic Predictor (no quality_gate.py)

---

## 4. PRODUCT MATCHING STATE

**File:** `apps/web/app/api/pipeline/furniture-match/route.ts` (536 lines)

### Pipeline flow:
1. Caller sends `{room_id, render_url}` (fired from `render/status/route.ts` after render completes)
2. Atomic idempotency lock: sets `redesign_status = "matching_products"`, bails if already running/complete
3. Fetches room context: `redesign_pano_url ?? render_url`, `style_blend`, `room_type`
4. Calls **Modal webhook** (`FURNITURE_MATCHING_WEBHOOK_URL`) to detect furniture via Claude Vision
5. Modal returns: `{ items: DetectedItem[] }` with `label, description, category, azimuth_degrees, elevation_degrees, search_query, hotspot_x?, hotspot_y?`
6. For each detected item: calls `searchProducts()` → Serper Shopping API
7. Filters results: `isFurnitureProduct()` + budget range filter
8. Builds affiliate URLs via `buildAffiliateUrl()`
9. Writes to `room_products` table (stage-then-swap strategy to prevent partial writes)
10. Updates `rooms.redesign_status = "complete"`

### Search APIs:
- **Serper Shopping API:** YES, primary. `SERPER_API_KEY` is in `.env.local` ✓
- **SearchAPI / Google Lens:** `SEARCHAPI_KEY` is in `.env.local` ✓, but Google Lens visual search is **NOT wired** in `furniture-match/route.ts`. SearchAPI key is present but the route only calls `searchProducts()` (Serper).
- **pgvector CLIP search:** The `products_v1` table has CLIP embeddings and there is a `clip.ts` file, but furniture-match route does NOT call pgvector search. Matching is SERP-only.

### Hotspot x/y computation:
- `hotspot_x` and `hotspot_y` come from the Modal webhook response (Claude Vision detects items and estimates pixel positions in the render)
- Fallback: computed from `azimuth_degrees` and `elevation_degrees` in step-7c using formula:
  `x = Math.round(50 + (azimuth_degrees / 90) * 40)`
  `y = Math.round(50 + (elevation_degrees / 60) * 30)`
- These are **approximate pixel fractions (0-100)**, not true geometric projections

### Affiliate link handling:
- `buildAffiliateUrl()` in `apps/web/lib/affiliates.ts`
- Amazon: `?tag=cova03-20` appended
- Other retailers: affiliate IDs from env vars, most are empty in `.env.example`

### Pre-detection (step-7 / step-7c source):
- `apps/web/app/api/detect/render` → fires async after render completes
- Also uses `grounding.ts` → `detectFurniture()` for render-side re-detection
- `pre_detection_pipeline.py` (8,585 lines) handles the step-7c pre-detect before redesign

---

## 5. SUPABASE SCHEMA (RENDER PIPELINE RELEVANT TABLES)

### `rooms` — Main table
```
id, user_id, created_at
room_type, budget
original_photo_url, original_image_url (legacy alias), photo_url (legacy alias)
preprocessed_image_url, professionalized_image_url
render_url
redesign_pano_url          ← stores flat 2D render (legacy column name)
redesign_splat_url         ← unused (legacy 3D)
marble_pano_url, marble_spz_url, marble_world_id (DISABLED — Marble off)
marble_plus_pano_url, marble_plus_splat_url, marble_plus_world_id (DISABLED)
pre_detection_result       JSONB — populated by pre_detection_pipeline.py
render_detection_result    JSONB — populated after render completes
design_brief               JSONB — Design Director Call 1 output (staging JSON)
flux_prompt                TEXT — Design Director Call 2 output (staging script)
personalization            JSONB
style_blend                JSONB
room_analysis              JSONB
room_constraints           JSONB
room_context               JSONB
unsplash_references        JSONB — column exists, but never populated (no Unsplash key)
keep_mask                  JSONB — step-7c decisions
fixed_furniture            JSONB
inpainting_mask_url        TEXT — for FLUX Fill Pro legacy path
pipeline_cost_log          JSONB — stores two_pass/two_stage metadata
aesthetic_score, depth_map_quality_score
design_step, render_count, furniture_matches_count
redesign_status            TEXT — pending/matching_products/complete
status                     TEXT CHECK ('active','archived')
```

### `room_products` — Furniture matching output
```
id, room_id, user_id, created_at
product_id                 → products_v1.id (nullable)
furniture_label, furniture_description, category
hotspot_x, hotspot_y       FLOAT — pixel fraction 0-100
azimuth_degrees, elevation_degrees
match_score, similarity_score, rank
serp_price, serp_retailer, serp_product_url, serp_title, serp_image_url
is_unlocked, is_sale
visible_from_second, visible_to_second (unused)
```

### `render_sessions` — Render iteration log
```
id, room_id, created_at
render_url, prompt, style_strength, iteration
```

### `products_v1` — Main product catalog (FROZEN)
```
id, name, description, price, image_url, product_url
retailer, brand, category, style_tags[], room_types[]
clip_embedding (768-dim), clip_fusion_embedding
affiliate_url_base, affiliate_url
dimensions_m (JSON), style_weights (JSON)
price_tier, primary_style, linked_product_id
```

### `style_fingerprints` — User style profiles
```
id, user_id, created_at
dimensions (JSONB — 12D vector: colorTemperature, colorSaturation, density, formality,
             era, material, texture, pattern, lineQuality, lightPreference, nature, culturalInfluence)
covariance, confidence
quiz_responses (JSONB), vector_data (JSONB)
```

### `style_loras` — **DOES NOT EXIST**
Documented in `apps/web/CLAUDE.md` and referenced throughout. Table is absent from `lib/types/supabase.ts`. No LoRA selection logic implemented anywhere.

---

## 6. MISSING ENVIRONMENT VARIABLES

Checked against `apps/web/.env.local` and `apps/web/.env.example`:

| Variable | Required By | Status |
|----------|-------------|--------|
| `FAL_KEY` | V3 spec (fal.ai provider) | **MISSING** — not in .env.local, not in .env.example |
| `UNSPLASH_ACCESS_KEY` | Step-3 reference fetch | **MISSING** — not in .env.local, not in .env.example |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Room analyzer / Gemini vision | **MISSING** from .env.example; `GEMINI_API_KEY` is present in .env.local (different name) |
| `REDESIGN_PIPELINE_WEBHOOK_URL` | Python pipeline trigger | Not in .env.example; present in .env.local as webhook URLs |
| `FURNITURE_MATCHING_WEBHOOK_URL` | furniture-match route.ts:80 | Present in .env.local ✓ |
| `AMAZON_ASSOCIATE_TAG` | CLAUDE.md spec | AMAZON_AFFILIATE_TAG in .env.example (different name) |

**Present and active in .env.local:**
- `NEXT_PUBLIC_SUPABASE_URL` ✓
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓
- `ANTHROPIC_API_KEY` ✓ (balance status unknown)
- `REPLICATE_API_TOKEN` ✓
- `SERPER_API_KEY` ✓
- `SEARCHAPI_KEY` ✓
- `GEMINI_API_KEY` ✓ (but CLAUDE.md calls it `GOOGLE_GENERATIVE_AI_API_KEY`)
- `MARBLE_API_KEY` ✓ (Marble is disabled per CLAUDE.md)
- Affiliate IDs: Amazon active, others present

---

## 7. DEAD CODE / DISABLED FEATURES

### Python pipeline files (disabled per CLAUDE.md):
| File | Description | Status |
|------|-------------|--------|
| `marble_pipeline.py` | Marble 3D lift | DISABLED per CLAUDE.md |
| `marble_plus_pipeline.py` | Marble Plus 3D | DISABLED per CLAUDE.md |
| `marble_mini_final_pipeline.py` | Marble Mini | DISABLED per CLAUDE.md |
| `marble_multi_image_pipeline.py` | Marble multi-image | DISABLED per CLAUDE.md |
| `depth_video_pipeline.py` (18,450 lines) | Depth video | DISABLED per CLAUDE.md |
| `depthflow_render.py` | DepthFlow render | DISABLED per CLAUDE.md |
| `room_reconstruction.py` | AnySplat | DISABLED per CLAUDE.md |
| `furniture_matching_pipeline.py` | Legacy matching | Superseded by route.ts |

### TS pipeline files with dead code:
| File/Section | Description |
|-------------|-------------|
| `render/status/route.ts` lines 479-607 | Two-stage FLUX Fill Pro branch (`costLog.two_stage`) — legacy inpainting path, superseded by two-pass Kontext |
| `flux.ts` → `submitFillRender()` | FLUX Fill Pro call — legacy, referenced in status route only |
| `flux.ts` → `submitSchnellRender()` | Preview-only model, wired only for loading animation |
| `rooms.redesign_splat_url` | 3D splat column — never written (3D disabled) |
| `rooms.marble_*` columns | All Marble columns — never written (Marble disabled) |

### Missing files referenced in CLAUDE.md:
| File | Referenced For |
|------|---------------|
| `lib/ai/design-director.ts` | Design Director Calls 1 & 2 (VLM staging JSON) |
| `modal_pipeline/preprocessing.py` | DarkIR + OpenCV preprocessing |
| `modal_pipeline/professionalization.py` | FLUX professionalization pass |
| `modal_pipeline/generation.py` | FLUX main generation module |
| `modal_pipeline/postprocessing.py` | Color grade + grain + vignette |
| `modal_pipeline/quality_gate.py` | Aesthetic scorer + retry logic |
| `app/api/fal/proxy/route.ts` | fal.ai proxy (createRouteHandler) |
| `lib/unsplash.ts` | Unsplash reference fetching |
| `lib/ai/lora-registry.ts` | LoRA selection by style |

---

## 8. TOP 5 ISSUES TO FIX BEFORE BUILDING V3

### Issue 1: PROVIDER MISMATCH — fal.ai spec vs Replicate in code
**Severity: BLOCKER**
CLAUDE.md (the spec, the single source of truth) mandates fal.ai for all generation. The actual code uses Replicate. Before writing a single line of v3 pipeline code, a decision must be made and a single sentence written into CLAUDE.md: "Provider is X." Then all code must be consistent with it.

If fal.ai: Add FAL_KEY to .env, create `app/api/fal/proxy/route.ts`, replace all `replicate.predictions.create()` calls.
If Replicate stays: Update CLAUDE.md spec to remove all fal.ai references.

### Issue 2: MISSING PIPELINE MODULES (spec exists, code does not)
**Severity: BLOCKER**
Six pipeline stages are fully specified in CLAUDE.md but have zero implementation:
- Preprocessing (DarkIR + OpenCV)
- Professionalization pass (strength=0.55, depth ControlNet=0.70)
- Design Director (VLM staging JSON → flux_prompt)
- Post-processing (7-step color grade, grain, vignette)
- Quality gate (LAION Aesthetic Predictor V2, threshold 5.0)
- Unsplash IP-Adapter (reference images never fetched)

The v3 build plan must explicitly address each of these as individual buildable units.

### Issue 3: TWO UNSYNCHRONIZED PROMPT COMPILERS
**Severity: HIGH**
`prompt-compiler.ts` (TS, claude-sonnet-4-5, ~480 tokens, skeleton+synthesizer, all 7d fields) and `redesign_pipeline.py::generate_prompt_with_claude()` (Python, claude-sonnet-4-6, 280 words, style blend only) produce different prompts for the same room. The Python path ignores all step-7d personalization. Whichever path fires depends on which trigger reaches the pipeline first. Result: inconsistent outputs.

Fix: One canonical prompt compiler. Python pipeline should receive the compiled prompt from the TS side, not generate its own.

### Issue 4: NO SEGMENTATION — step-7c keep/remove is text-only
**Severity: HIGH**
Keep/remove decisions produce text labels injected into the FLUX prompt ("Keep exactly as-is: sofa, bookshelf"). The spec calls for EVF-SAM2 pixel masks enabling differential diffusion (change map: white=change zones, black=preserve zones). Without pixel masks, FLUX may ignore or partially follow keep/remove text. The differential diffusion path is entirely unimplemented.

### Issue 5: MISSING UNSPLASH + STYLE LORAS (IP-Adapter + LoRA hooks absent)
**Severity: MEDIUM**
The spec calls for `IP-Adapter scale=0.45` feeding Unsplash style reference images. `rooms.unsplash_references` column exists but is never populated (no UNSPLASH_ACCESS_KEY, no fetch at step-3). Style LoRAs: `style_loras` table doesn't exist, no `lora-registry.ts`, no `lora_url` passed to any FLUX call. Both are multipliers on output quality that cost near-zero to implement once fal.ai provider question is resolved (fal-ai/flux-general supports both natively; Replicate's Kontext models do not accept LoRA URLs).

---

## PIPELINE MAP SUMMARY

```
User uploads photo → step-6 → rooms row created

PRE-DETECTION (async, ~20s):
  modal pre_detection_pipeline.py
  → Claude Vision detects furniture
  → rooms.pre_detection_result (JSONB)

step-7c: Keep/Remove UI
  reads: rooms.pre_detection_result
  writes: rooms.keep_mask, area2Store
  segmentation: NONE (text labels only)

step-7b: Room constraints
  writes: area2Store.roomConstraints

step-7d: Tabbed chatbot (All/Products/Tech/Art)
  all fields → area2Store.renderContext via /api/design-chat
  "Design My Room" CTA fires redesign

REDESIGN TRIGGER (step-7d CTA):
  → POST to redesign_pipeline.py Modal webhook
  → generate_prompt_with_claude() OR receives compiled prompt from TS
  → run_flux_kontext() + run_flux_depth_pro() (parallel)
  → store result in rooms.redesign_pano_url

step-8a: Polls rooms.redesign_pano_url (180s timeout)
  on complete → shows render + before/after slider

TS RENDER PATH (alternative / step-8b refinements):
  → compilePromptWithClaude() (prompt-compiler.ts)
  → submitRender() / submitDepthRender() → Replicate
  → GET /api/render/status polls prediction
  → on complete: Clarity Upscaler → rooms.render_url
  → triggerDetectionThenMatching() fires after 20s delay

PRODUCT MATCHING:
  POST /api/pipeline/furniture-match
  → Modal FURNITURE_MATCHING_WEBHOOK_URL → Claude Vision detects items in render
  → searchProducts() → Serper Shopping API
  → buildAffiliateUrl() → room_products table
  → rooms.redesign_status = "complete"

step-9: Reads room_products, renders hotspot overlay + product cards
```

---

## FILE INVENTORY (key files audited)

| File | Lines | Status |
|------|-------|--------|
| `modal_pipeline/redesign_pipeline.py` | 4,001 | ACTIVE — Replicate-based |
| `apps/web/lib/ai/flux.ts` | 1,604 | ACTIVE — Replicate SDK |
| `apps/web/lib/ai/prompt-compiler.ts` | 428 | ACTIVE — primary TS compiler |
| `apps/web/app/api/render/status/route.ts` | 693 | ACTIVE — two-pass + legacy |
| `apps/web/app/api/pipeline/furniture-match/route.ts` | 536 | ACTIVE — Serper-only |
| `apps/web/app/design/step-7c/page.tsx` | 846 | ACTIVE — text labels, no masks |
| `apps/web/app/design/step-7d/page.tsx` | ~500+ | ACTIVE — chatbot UI |
| `apps/web/app/design/step-8a/page.tsx` | 703 | ACTIVE — polls redesign_pano_url |
| `apps/web/app/design/step-8b/page.tsx` | 1,356 | ACTIVE — refinements |
| `apps/web/app/design/step-9/page.tsx` | ~1000+ | ACTIVE — shoppable products |
| `modal_pipeline/marble_*.py` (4 files) | varies | DISABLED |
| `modal_pipeline/depth_video_pipeline.py` | 18,450 | DISABLED |
| `modal_pipeline/room_reconstruction.py` | varies | DISABLED |

---

*This document is the ground truth for all v3 build sessions. Update SESSION_NOTES.md after each session with changes and decisions.*
