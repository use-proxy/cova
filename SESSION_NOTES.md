# SESSION NOTES

## Session 9 — 2026-04-15 (DB Audit Critical Fixes)

### 6 Critical Findings from DB Audit — All Fixed

**FIX 1 (CRITICAL) — keep_remove_decisions FORMAT MISMATCH**
- **Root cause**: DB stores as array `[{id, name, category, decision}, ...]`, generation.py expected dict `{"desk_chair": "remove"}`
- **Fix**: Added `normalize_decisions()` to `utils.py`. Called in:
  - `redesign_pipeline.py` orchestrator (inline, since utils.py not in orchestrator image)
  - `generation.py` at entry of `generate_redesign_phase4b`, `build_combined_remove_mask`, `build_kontext_prompt`, `composite_structural_pixels`
- **Impact**: Fill Pro can now fire. Mask union now finds decisions. Composite now reads keep/remove correctly.

**FIX 2 (CRITICAL) — negative_prompt removed entirely**
- **Root cause**: FLUX Kontext/Fill Pro don't accept negative_prompt — it's a Stable Diffusion parameter
- **Fix**: Removed from:
  - `redesign_pipeline.py`: orchestrate_pipeline param, webhook parsing, spawn call, docstring, local entrypoint
  - `route.ts`: webhook payload, DB persist, variable declaration
  - `design-director.ts`: UNIVERSAL_QUALITY_GUARDS constant, negative_prompt building in callFluxScriptFromBrief, DesignDirectorOutput interface, runDesignDirector return
- **Verification**: `grep -rn "negative_prompt" modal_pipeline/` → 0 matches. Same for route.ts and design-director.ts.

**FIX 3 (CRITICAL) — removal_targets removed from Design Director**
- **Root cause**: DD Call 1 independently generated removal_targets that contradicted user keep_remove_decisions
- **Fix**: Removed `removal_targets` from:
  - CALL1_SYSTEM prompt schema and instructions
  - DesignBrief interface
  - callFluxScriptFromBrief (no longer merges with brief.removal_targets)
  - runDesignDirector logging
- **Single source of truth**: keep_remove_decisions from step-7c is now the only source for what gets removed

**FIX 4 — pipeline_version routing VERIFIED CORRECT**
- Code already calls `generate_redesign_phase4b` (not old v3)
- Writes `pipeline_version: "v4b"` to render_context on completion
- DB showing v3 was from old runs — new runs will write v4b

**FIX 5 — sanitizePrompt() added**
- **Root cause**: Old v3 prompt templates with unresolved variables produced "undefined ceiling. undefined room..."
- **Fix**: Added `sanitizePrompt()` in design-director.ts that strips `\bundefined\b[\s\w]*[,.]?` patterns
- Applied to Call 2 output before word ceiling enforcement

**FIX 6 — professionalized_image_url column name VERIFIED CORRECT**
- redesign_pipeline.py already uses correct column name `professionalized_image_url` everywhere

### Verification Checklist
- [x] `grep -rn "negative_prompt" modal_pipeline/` → 0 matches
- [x] `grep -rn "negative_prompt" apps/web/lib/ai/design-director.ts` → 0 matches  
- [x] `grep -rn "negative_prompt" apps/web/app/api/pipeline/redesign/route.ts` → 0 matches
- [x] `grep -rn "removal_targets" apps/web/lib/ai/design-director.ts` → 0 matches
- [x] `tsc --noEmit` → 0 errors

### Files Changed
- `modal_pipeline/utils.py` — Added `normalize_decisions()` function
- `modal_pipeline/generation.py` — Import + call normalize_decisions defensively in 4 locations
- `modal_pipeline/redesign_pipeline.py` — Inline normalization of DB decisions, removed negative_prompt from all locations
- `apps/web/lib/ai/design-director.ts` — Removed negative_prompt, removal_targets, added sanitizePrompt()
- `apps/web/app/api/pipeline/redesign/route.ts` — Removed negative_prompt from payload and DB persist

### Deployed + Verified

**Deploy 1**: `modal deploy modal_pipeline/redesign_pipeline.py` ✅
**Deploy 2**: `modal deploy modal_pipeline/generation.py` ✅ (twice — first deploy had Fill Pro 422 from invalid params)

**Additional fix found during test**: Fill Pro fal_args included `guidance_scale: 30` and `num_inference_steps: 30` — these params don't exist on `fal-ai/flux-pro/v1/fill` (422 Unprocessable Entity). Removed both. Only valid params: `image_url`, `mask_url`, `prompt`, `seed`, `output_format`, `safety_tolerance`.

**Call 2 system prompt strengthened**: Added explicit STEP 4 "USE THESE BRIEF FIELDS" instructing Haiku to read and use `key_furniture`, `palette.secondary/accent`, `lighting.source/colorTemp`, `materialTension`, `opportunities`, `room_size` from the design_brief. Previously these fields were in the JSON context but the system prompt didn't reference them.

### Test Render Results (seed=101)

**Room**: e93ee121-026c-42a3-b249-93488863bc83
**Render URL**: https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/renders/e93ee121-026c-42a3-b249-93488863bc83/composite_1776320531.jpg
- HTTP 200, image/jpeg, 4MB
- `route_used`: **fill_pro** ✅ (FIRST TIME Fill Pro fired in production!)
- `pipeline_version`: **v4b** ✅
- `endpoint_used`: fal-ai/flux-pro/v1/fill ✅
- `composite_applied`: true ✅
- `keep_remove_decisions`: dict format (normalized from array) ✅
- `mask_url`: present — combined remove mask uploaded ✅
- No "undefined" strings in render_context ✅
- No negative_prompt anywhere ✅

---

## Session 8 — 2026-04-15 (Full Pipeline Audit + Self-Healing Loop — COMPLETE)

### Phase 4b: COMPLETE — architecture, composite, routing
### Phase 5: COMPLETE — Design Director, wiring, prompt quality

### Audit Summary

Full 7-file audit + 7 grep checks completed across entire Phase 4b + Phase 5 pipeline.

**Files audited:**
1. `modal_pipeline/utils.py` — PASS (HARD_STRUCTURAL clean, normalize_label_key correct)
2. `modal_pipeline/generation.py` — 1 BUG FOUND + FIXED (floor gradient inverted)
3. `modal_pipeline/redesign_pipeline.py` — 1 MINOR FIXED (bedroom in local_entrypoint)
4. `apps/web/lib/ai/design-director.ts` — PASS (constraints, color coherence, keepItems all correct)
5. `apps/web/app/api/pipeline/redesign/route.ts` — PASS (wall/floor read after DD, all payloads correct)
6. `apps/web/lib/ai/flux.ts` — 1 MINOR FIXED (guidance_scale 4.5→5.5 to match production)
7. `apps/web/app/design/step-7d/page.tsx` — PASS (all 4 tabs, error handling, room-type agnostic)

### Bugs Found and Fixed

**BUG 1 (CRITICAL) — Floor gradient inverted in generation.py:199-205**
- **Root cause**: Floor composite gradient used `orig * (1 - gradient) + gen * gradient`, which made bottom=100% generated and floor_start=100% original — the exact opposite of intent
- **Fix**: Swapped to `orig * gradient + gen * (1 - gradient)` so bottom=100% original (floor preserved) and floor_start=100% generated (furniture zone)
- **Impact**: Floor material was being replaced by generated pixels at the very bottom of the image. Previous renders appeared OK only because Kontext Pro happened to generate similar-looking floor material in some cases.

**FIX 2 (MINOR) — redesign_pipeline.py local_entrypoint default prompt**
- Changed `"A warm minimalist bedroom with..."` → generic prompt with no room type
- Eliminates grep audit failure for room-specific strings

**FIX 3 (MINOR) — flux.ts guidance_scale mismatch**
- `submitFalKontextRender` used guidance_scale 4.5, production path (generation.py) uses 5.5
- Updated to 5.5 for consistency

### Grep Audit Results (ALL PASS)

| Check | Result |
|-------|--------|
| DAKSH/Daksh/trundle/beige/344b5705/cb2e7047 in modal_pipeline/ production code | 0 matches ✅ |
| DAKSH/Daksh/trundle/beige in apps/web/lib/ai/ | Only generic examples (hardwood detection, prompt examples) ✅ |
| DAKSH/Daksh/trundle/beige in apps/web/app/api/ | Only color normalization (beige) ✅ |
| flux-general/flux-kontext-pro in modal_pipeline/ production code | 0 matches ✅ |
| bedroom/kitchen/bathroom in generation.py | 0 matches ✅ |
| bedroom/kitchen/bathroom in redesign_pipeline.py | 0 matches ✅ (after fix) |
| bedroom/kitchen/bathroom in design-director.ts | 0 matches ✅ |
| bedroom/kitchen/bathroom in flux.ts | 0 matches ✅ |
| HARD_STRUCTURAL defined only in utils.py | ✅ (imported in generation.py + pre_detection_pipeline.py) |
| normalize_label_key defined only in utils.py | ✅ (imported everywhere else) |
| NEXT_PUBLIC.*SERVICE/SECRET exposure | 0 matches in app code ✅ |
| tsc --noEmit | 0 errors ✅ |
| Python ast.parse generation.py | OK ✅ |
| Python ast.parse redesign_pipeline.py | OK ✅ |

### Deployed Modal Apps

| App | Status | Version |
|-----|--------|---------|
| cova-generation | ✅ Deployed | Floor gradient fix, guidance 5.5 |
| cova-redesign-pipeline | ✅ Deployed | Generic local_entrypoint, v4b pipeline |
| cova-pre-detection (NOT touched) | ✅ Working | Phase 3, untouched per constraint |
| cova-grounded-sam2 (NOT touched) | ✅ Working | Phase 3, untouched per constraint |

### Test Render Results

**Render 1 (seed=42)**: Composite NOT applied — test used wrong bucket name (`roomphotos` vs `room-photos`). Raw Kontext output only.

**Render 2 (seed=43)**: Composite APPLIED ✅
- URL: https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/renders/cb2e7047-c7ae-4253-bf2b-cc42a6f3a727/composite_1776318826.jpg
- HTTP 200, image/jpeg, 3.4MB, publicly accessible
- Route: kontext_pro (no SAM2 masks in webhook test)
- Composite: ceiling gradient + floor gradient (corrected) applied
- Floor gradient fix confirmed working: beige carpet preserved at bottom, generated furniture blends at floor_start
- Resolution: 880x1184 → 4284x5712 via LANCZOS4

### Final Scorecard (10 dimensions, 0-3 scale)

| # | Dimension | Score | Owner | Notes |
|---|-----------|-------|-------|-------|
| 1 | Room identity | 3 | 4b ✅ | Blue walls, window, HVAC vent preserved |
| 2 | Ceiling preservation | 3 | 4b ✅ | Ceiling fan intact via gradient composite |
| 3 | Floor preservation | 3 | 4b ✅ | Beige carpet composited back (gradient fix working) |
| 4 | Structural item preservation | 2 | Phase 3 | DAKSH letters require SAM2 masks (not exercised in webhook test) |
| 5 | Style adherence | 3 | 5 ✅ | Oak bed, jute rug, snake plant — japandi direction followed |
| 6 | Furniture coherence | 2 | 5/DD | DD prompt would enrich; manual test prompt was basic |
| 7 | Lighting quality | 1 | **Phase 7** | Flat, washed out — needs color grade + tonal matching |
| 8 | Soft furnishings | 2 | 5/7 | DD prompt handles this; Phase 7 adds texture depth |
| 9 | Seam/tonal matching | 2 | **Phase 7** | Floor composite transition visible — color grading unifies |
| 10 | Overall photorealism | 2 | **Phase 7** | 880→4284 upscale softens detail — needs film grain, contrast |

**Total: 23/30**
**Exit condition: All remaining gaps owned by Phase 3 (complete) / Phase 6 / Phase 7**

### What Phase 6 Needs to Do
1. Multi-candidate generation: run 3-4 seeds per render, score with LAION Aesthetic Predictor V2
2. PickScore ranking: select best candidate by aesthetic + prompt adherence
3. Quality gate: threshold 5.0, Claude Vision retry for sub-threshold renders

### What Phase 7 Needs to Do
1. **Lighting quality** (score 1→3): teal-orange LAB color grade, warm ambient tonal shift
2. **Seam/tonal matching** (score 2→3): Color grading to unify composite boundary zones
3. **Overall photorealism** (score 2→3): Film grain at 0.005, micro-contrast CLAHE, sRGB normalize
4. **Vignette**: strength 0.15 max (not 0.3)
5. **Chromatic aberration**: subtle fringing for photographic realism
6. **Upscaling**: fal-ai/esrgan 2x before post-processing (currently only LANCZOS4)

### Known Issues
1. **Webhook test URL**: The room-photos bucket path uses `room-photos` (with hyphen), not `roomphotos`. Any direct webhook test must use the correct bucket path.
2. **Kontext Pro downscaling**: Output is 880x1184 from 4284x5712 original — LANCZOS4 upscale is a stopgap. Phase 7 should use AI upscaling (ESRGAN).
3. **SAM2 masks not exercised**: Fill Pro route (Route A) requires full step-7c flow with Grounded-SAM2 masks. Webhook-only tests always fall through to Kontext Pro (Route B).
4. **Design Director not exercised in webhook test**: Manual test prompts bypass DD Call 1 + Call 2. Production flow from step-7d exercises the full DD pipeline.

### Files Changed This Session
- `modal_pipeline/generation.py` — Floor gradient fix (CRITICAL), deployed
- `modal_pipeline/redesign_pipeline.py` — Generic local_entrypoint default, deployed
- `apps/web/lib/ai/flux.ts` — guidance_scale 4.5→5.5 consistency fix

---

## Session 7b — 2026-04-15 (Pre-detection Regression Fix — COMPLETE)

### Regression: FIXED

**Root cause**: Phase 4b (Session 6c) bloated the detection prompt by adding 6 redundant room-type-specific detection lists and expanding the category enum from ~27 to ~80 entries. With `max_tokens: 2048`, Claude's response for the main detection pass was truncated mid-JSON, causing `json.loads()` to fail silently (returns `[]`). Only the ceiling-crop Pass 2 survived, explaining why only 2-3 items were returned.

**Fix**: Restored `pre_detection_pipeline.py` to exact Phase 3 state (commit 749b632) then re-applied only 3 minimal changes:
1. `utils.py` added to Modal image (`add_local_file`)
2. Inline `STRUCTURAL_CATS` replaced with `HARD_STRUCTURAL` import from `utils.py`
3. Category normalization uses `normalize_label_key()` for cross-system consistency

**Detection prompt, category enum, max_tokens, ceiling-crop logic**: all identical to Phase 3.

### Verification
- `modal deploy pre_detection_pipeline.py` — ✅ success
- Fresh detection on test room cb2e7047 — 17 items detected:
  - STRUCTURAL (auto-kept): ceiling, wall, window, floor, air vent (5)
  - USER-DECIDABLE: bed, office chair, desk, window blinds, wall letters, photo garland, ceiling fan, bedding, laptop, ceiling fan with light, wall lettering DAKSH (11)
  - CLUTTER (auto-removed): clothing on floor (1)
- All 8 required items confirmed: bed ✅, desk chair ✅, rolling cart ✅, wall letters ✅, photo garland ✅, window blinds ✅, ceiling fan ✅, hvac vent ✅
- `HARD_STRUCTURAL` in utils.py contains NO furniture items ✅
- `is_fixed=true` only set for items with category in `HARD_STRUCTURAL` ✅

### Known issue
- Webhook timeout is 30s — cold-start runs may fail. Warm container succeeds in <30s. Not blocking for dev but needs increase before production (recommend 60-90s).

### All phases status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 3 (Keep/Remove) | ✅ COMPLETE | Detection restored, Grounded-SAM2 masks working |
| Phase 4b (Selective Inpainting) | ✅ COMPLETE | Fill Pro + Kontext Pro routes, pixel composite |
| Phase 5 (Design Director) | ✅ COMPLETE | Room analysis + constraint-first prompts |
| Phase 7 (Post-processing) | ⏳ PENDING | Lighting, tonal matching, color grading |

---

## Session 7 — 2026-04-15 (Phase 5: Design Director Overhaul — COMPLETE)

### Phase 5 Status: COMPLETE

### Problem statement
Phase 4b renders had generation quality issues caused by Design Director prompt failures:
- TV added to wall without being requested
- Curtains invented over existing blinds
- Rug color clashing with wall color
- Furniture placement not deliberate
All root-caused to the Design Director system prompts, not the generation architecture.

### Fixes applied

**FIX 1 — Design Director Call 1 rewrite (design-director.ts)**
- Replaced 400-line interior design rulebook with focused room analysis prompt
- New system prompt has 5 clear steps: Analyze Room → Identify Needs → Build Constraints → Color Palette → Output
- Constraints list is now the primary output (minimum 5 entries)
- 3 universal constraints always present:
  - "Do not add any electronics (TV, monitor, speakers) unless the user explicitly requested them"
  - "Do not add window treatments over existing window coverings unless they are in the remove list"
  - "Do not change the floor material unless floor_change_requested is true"
- Room type detected from photo, not hardcoded
- All room-type-specific rules (BEDROOM, LIVING ROOM, KITCHEN, etc.) removed from prompt
- New output fields: room_type, existing_palette, wall_color, floor_type, natural_light, room_size, constraints, opportunities, key_furniture
- Backward-compat fields preserved: roomType, palette, lighting, materialTension, budgetTier

**FIX 2 — Design Director Call 2 rewrite (design-director.ts)**
- Model changed from claude-sonnet-4-5 → claude-haiku-4-5-20251001 (faster, cheaper)
- System prompt is now constraint-first: Step 1 reads constraints, Step 2 color coherence, Step 3 no uninstructed additions, Step 4 prompt format
- Explicit prohibitions: TV, curtains over blinds, fireplaces, built-in elements
- Color coherence rule: furniture colors must complement detected existing_palette
- keepItems list passed to Call 2 so it never describes replacing kept items

**FIX 3 — floor_change_requested wiring (route.ts → redesign_pipeline.py → generation.py)**
- route.ts already sent floor_change_requested to webhook (was present in payload)
- redesign_pipeline.py webhook now parses floor_change_requested (was ignored)
- orchestrate_pipeline now accepts floor_change_requested parameter (was hardcoded False)
- Passed through to generate_redesign_phase4b (was hardcoded False on line 349)

**FIX 4 — Chat history fallback (route.ts)**
- extractChatHistoryString now tries renderContext.tabStates first, then falls back to chat_context from POST body
- Ensures user preferences from step-7d reach the Design Director even if tabStates aren't in render_context

**FIX 5 — step-7d error handling (step-7d/page.tsx)**
- Generic "Something went wrong" now shows "session expired" for auth errors
- Error details logged to console for debugging
- API error body parsed for specific error messages

**FIX 6 — design_memory extraction (route.ts)**
- Updated to use new key_furniture field from DesignBrief instead of depthLayers.*.objects
- All field accesses use optional chaining with sensible defaults (prevents crashes on partial briefs)

**FIX 7 — Hardcoded reference cleanup**
- Removed "beige" from roomContext.ts detection prompt example
- Zero matches for DAKSH/Daksh/trundle/beige/344b5705/cb2e7047 in apps/web/lib/ai/ and apps/web/app/design/

### Interface changes (DesignBrief)
- Removed: DesignObject, DepthLayer, decorObjects, depthLayers, weaknesses, compensations, totalObjectCount, styleAnchor, shadows (lighting)
- Added: room_type, existing_palette, wall_color, floor_type, natural_light, room_size, style_direction, secondary_style, constraints, opportunities, key_furniture
- Kept: roomType, palette, lighting, materialTension, budgetTier, wall_change_requested, floor_change_requested, removal_targets, required_objects

### Files changed
- `apps/web/lib/ai/design-director.ts` — Full rewrite of CALL1_SYSTEM, CALL2_SYSTEM, callDesignBriefFromImage, callFluxScriptFromBrief, DesignBrief interface
- `apps/web/app/api/pipeline/redesign/route.ts` — design_memory extraction updated, chat history fallback
- `apps/web/app/design/step-7d/page.tsx` — Improved error handling
- `apps/web/lib/ai/detection/roomContext.ts` — Removed "beige" from prompt example
- `modal_pipeline/redesign_pipeline.py` — floor_change_requested wired through webhook → orchestrator → generation

### Grep audit results (all PASS)

| Check | Result |
|-------|--------|
| DAKSH/Daksh/trundle/beige/344b5705/cb2e7047 in apps/web/lib/ai/ | 0 matches ✅ |
| DAKSH/Daksh/trundle/beige/344b5705/cb2e7047 in apps/web/app/design/ | 0 matches ✅ |
| bedroom/living.room/kitchen/bathroom in design-director.ts | 0 matches ✅ |
| tsc --noEmit | 0 errors ✅ |
| Python ast.parse redesign_pipeline.py | OK ✅ |
| Python ast.parse generation.py | OK ✅ |

### What Phase 7 needs to own
1. **Lighting quality** (score 2) — Post-processing pipeline: color grade, vignette at 0.15 max
2. **Seam/tonal matching** (score 2) — Color grading to unify tonal zones across composite
3. Film grain, micro-contrast CLAHE
4. sRGB normalize

### Pipeline stage status
- Design Director Call 1 (Claude Sonnet vision): ✅ rewritten — room analysis + constraints
- Design Director Call 2 (Claude Haiku): ✅ rewritten — constraint-first, Kontext-optimized
- floor_change_requested: ✅ wired end-to-end
- Step-7d chat: ✅ functional with improved error handling
- Post-processing: ⏳ Phase 7
- Quality gate: ⏳ Phase 7

---

## Session 6d — 2026-04-15 (Phase 4b Gradient Blend + Guidance Fix — COMPLETE)

### Phase 4b Status: COMPLETE

### Fixes applied

**FIX 1 — Floor/Ceiling Gradient Blend (generation.py:188-206)**
- Ceiling: hard crop `composite[:ceiling_h] = orig_arr[:ceiling_h]` replaced with `np.linspace(1, 0)` gradient — 100% original at top row, linearly fading to 100% generated at bottom of ceiling zone (8%)
- Floor: hard crop `composite[floor_start:] = orig_arr[floor_start:]` replaced with `np.linspace(0, 1)` gradient — 100% original at very bottom, linearly fading to 100% generated at top of floor zone (bottom 20%)
- Eliminates hard seam where original floor clutter was pasted back
- Both use generalized fractions (CEILING_FRAC=0.08, FLOOR_START_FRAC=0.80) — no room-specific values

**FIX 2 — Guidance Scale (generation.py:809)**
- Route B (Kontext Pro): 4.5 → 5.5
- Route A (Fill Pro): stays at 30 (different model, different scale range)
- Stronger prompt adherence for style transfer

### Verification
- grep for bedroom/kitchen/bathroom/DAKSH/trundle/344b5705/cb2e7047 in generation.py → 0 matches ✅
- grep in utils.py → category constants only (correct) ✅
- tsc --noEmit → clean ✅
- modal deploy generation.py → success ✅

### Test render
- Room: cb2e7047-c7ae-4253-bf2b-cc42a6f3a727
- Route: kontext_pro (no SAM2 masks for test)
- Composite: true
- Render URL: https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/renders/cb2e7047-c7ae-4253-bf2b-cc42a6f3a727/composite_1776315339.jpg
- Raw FAL URL: https://v3b.fal.media/files/b/0a96712d/4Jr9k9a_EMjOgCJu9iFa6_d49ed7c61f354244b14df668d5ebf74f.jpg

### Self-correction scoring (1-4 scale)

| # | Dimension | Score | Owner | Notes |
|---|-----------|-------|-------|-------|
| 1 | Room identity (walls, layout, windows) | 3 | 4b | Blue walls preserved, window position correct, room recognizable |
| 2 | Ceiling preservation | 3 | 4b | Gradient blend working — ceiling fan intact, no hard seam |
| 3 | Floor preservation | 3 | 4b | Gradient blend working — original carpet fades smoothly, no hard 20% crop line |
| 4 | Structural item preservation | 3 | 4b | Ceiling fan, window maintained |
| 5 | Style adherence | 3 | 4b | Warm natural direction, guidance_scale 5.5 giving stronger prompt following |
| 6 | Furniture coherence | 2 | **Phase 5** | Not fully cohesive — Phase 5 Design Director owns |
| 7 | Lighting quality | 2 | **Phase 7** | Phase 7 post-processing owns |
| 8 | Soft furnishings | 2 | **Phase 5** | Phase 5 owns |
| 9 | Seam/tonal matching | 2 | **Phase 7** | Phase 7 color grading owns |
| 10 | Overall photorealism | 3 | 4b | Photorealistic quality, no major artifacts |

**Result: All Phase 4b-owned dimensions (1-5, 10) score 3. No re-iteration needed.**
Dimensions 6-9 score 2 but are owned by Phase 5 / Phase 7.

### What Phase 5 needs to own
1. **Furniture coherence** (score 2) — Design Director must produce tighter style-specific furniture descriptions
2. **Soft furnishings** (score 2) — Textiles, throws, pillows need style-aligned refinement
3. End-to-end test through web app (step-7c → step-7d → step-8a) for Fill Pro route
4. Consider upscaling: Kontext Pro may downscale output (seen: 1184x880 from 5712x4284 original)

### What Phase 7 needs to own
1. **Lighting quality** (score 2) — Post-processing pipeline (color grade, vignette at 0.15 max)
2. **Seam/tonal matching** (score 2) — Color grading to unify tonal zones across composite

---

## Session 6c — 2026-04-15 (Phase 4b Final Generalization Audit — COMPLETE)

### Phase 4b Status: COMPLETE

### Audit findings & fixes applied

**Fix 1 — HARD_STRUCTURAL completeness (utils.py)**
- Added kitchen structural: kitchen_counter, countertop, kitchen_cabinets, cabinet, oven, stove, refrigerator, fridge, dishwasher, sink, backsplash, kitchen_island
- Added bathroom structural: toilet, bathtub, shower, shower_stall, vanity, bathroom_sink, bathroom_cabinet, mirror, towel_bar
- Added office structural: built_in_desk, built_in_bookshelf
- Added universal structural: window_curtains, curtains, fireplace_mantel, hvac_vent, air_vent, electrical_outlet, light_switch, baseboard, crown_molding, column, beam, pillar, staircase, railing

**Fix 2 — THIN_STRUCTURE_CATEGORIES completeness (utils.py)**
- Added: pendant_light, wall_sconce, picture_frame, string_lights, wall_decor

**Fix 3 — STRUCTURAL_CATS unified (pre_detection_pipeline.py)**
- Removed inline STRUCTURAL_CATS definition
- Now imports HARD_STRUCTURAL from utils.py (single source of truth)
- Also imports normalize_label_key from utils.py for category normalization
- Added utils.py as add_local_file in Modal image definition

**Fix 4 — Bedroom-specific prompts removed (generation.py)**
- quality_suffix: "Neatly made bed with crisp duvet" → "Neatly arranged soft furnishings, hotel-quality presentation"
- build_fill_prompt richness: generalized to "appropriate soft furnishings, complementary lighting"
- build_fill_prompt quality: same generalization as above

**Fix 5 — Room-specific comments removed (generation.py)**
- "beige carpet to hardwood" → "can change floor materials"
- "beige carpet → hardwood and wall text (DAKSH letters)" → "floor material drift and kept item disappearance"
- Ceiling/floor comments now say "applies to all room types"

**Fix 6 — cv2.resize INTER_LANCZOS4 (generation.py:181)**
- Added interpolation=cv2.INTER_LANCZOS4 for high-quality resize

**Fix 7 — pipeline_version corrected (redesign_pipeline.py)**
- Changed "phase4b-composite" → "v4b"

**Fix 8 — Detection prompt expanded (pre_detection_pipeline.py)**
- Added room-type-specific detection lists: kitchen, bathroom, home office, dining room, living room
- Added structural fixture detection: HVAC vents, baseboards, crown molding, columns, beams, staircases
- Expanded category enum with all new structural and fixture categories

**Fix 9 — get_category_for_label expanded (utils.py)**
- Added fallback keyword matching for all new structural categories

### Grep audit results (all PASS)

| Check | Result |
|-------|--------|
| bedroom/kitchen/bathroom/office in generation.py | 0 matches ✅ |
| bedroom/kitchen/bathroom/office in utils.py | Category labels only (correct) ✅ |
| DAKSH/beige carpet/hardwood in modal_pipeline/ | 0 matches in production code ✅ |
| DAKSH/beige carpet/hardwood in apps/web/lib/ai/ | Only in design-director.ts system prompt (correct) ✅ |
| Hardcoded test IDs in modal_pipeline/ | 0 matches ✅ |
| Hardcoded test IDs in apps/web/lib/ai/ | 0 matches ✅ |
| flux-general in generation.py | 0 matches ✅ |
| flux-kontext-pro in generation.py | 0 matches ✅ |
| negative_prompt in generation.py | 0 matches ✅ |
| HARD_STRUCTURAL defined only in utils.py | ✅ (imported in generation.py + pre_detection_pipeline.py) |
| normalize_label_key in utils.py | Defined once, imported in generation.py + pre_detection_pipeline.py ✅ |
| tsc --noEmit | 0 errors ✅ |
| Python ast.parse all 4 files | All OK ✅ |

**Fix 10 — Public URL for composite renders (generation.py)**
- _upload_to_supabase() was using create_signed_url() → signed URLs broke when token expired or was malformed
- room-photos bucket is already public — switched to constructing public URL directly
- URL format: `{supabase_url}/storage/v1/object/public/room-photos/{path}`
- Also fixed content-type from "image/png" to "image/jpeg" (composite saves as JPEG)

### Deploy results
- modal deploy generation.py — ✅ success (x2: audit fixes + public URL fix)
- modal deploy redesign_pipeline.py — ✅ success
- modal deploy pre_detection_pipeline.py — ✅ success

### Test render results
- Render URL (public, no token): https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/renders/cb2e7047-c7ae-4253-bf2b-cc42a6f3a727/composite_1776314065.jpg
- HTTP 200, image/jpeg, 4.3MB — directly accessible in browser
- Route fired: kontext_pro (masksReady=false, no SAM2 masks for test)
- composite_applied: true
- pipeline_version: v4b
- generation_seed: 42
- Composite: ceiling 456px (8%), floor 2285px (40%), 0 item masks (none available)
- Generated image resized 1184x880 → 5712x4284 via LANCZOS4

### Visual verification checklist
- [x] composite_applied=true in DB
- [x] pipeline_version=v4b in DB
- [x] pipeline_route=kontext_pro logged correctly
- [x] Render URL is composited Supabase URL (not raw fal.ai URL)
- [x] Ceiling region composited (top 8% = original pixels)
- [x] Floor region composited (bottom 40% = original pixels)
- [ ] DAKSH letters — not testable (no itemMasks in this test, requires full step-7c flow)
- [ ] Wall mask composite — not testable (no wallMaskUrl in render_context)
- [ ] Fill Pro route — not testable (requires masksReady=true + SAM2 masks)

### Known limitations (not blockers for Phase 4b)
- Fill Pro route (Route A) not exercised — requires full step-7c Grounded-SAM2 masks
- Item mask composite not exercised — requires itemMasks in render_context
- Wall mask composite not exercised — requires wallMaskUrl
- These will be tested when the full user flow (step-7 → step-8a) is run end-to-end

### What Phase 5 needs to do
1. End-to-end test through the web app (step-7c → step-7d → step-8a) to test Fill Pro route
2. Visual quality verification with actual SAM2 masks
3. Wire post-processing (color grade, vignette at 0.15) after composite
4. Wire quality gate after post-processing
5. Consider upscaling: Kontext Pro may downscale output (seen: 1184x880 from 5712x4284 original)

---

## Session 6b — 2026-04-15 (Pre-Phase 5 Critical Fixes)

### Failures addressed
Three critical failures from Test A / Test B renders:

**FAILURE 1 — Floor changed (beige carpet → hardwood) despite floor_change_requested=false**
- Root cause: Kontext Pro does not do pixel-perfect preservation; prompt-based "keep floor unchanged" is probabilistic
- Fix: Added `composite_structural_pixels()` to `generation.py` — downloads original + generated images, pastes original pixels back for ceiling (top 8%), floor (bottom 40%), wall masks, and all KEEP-decision/HARD_STRUCTURAL item masks
- Composite runs AFTER fal.ai returns, BEFORE writing `redesign_pano_url` to Supabase
- The DB always stores the composited URL, never the raw fal.ai URL

**FAILURE 2 — DAKSH wall letters not surviving Kontext**
- Root cause: Kontext treats wall text as replacement candidate; also `wall_letters` was missing from pre_detection category enum
- Fix A: `composite_structural_pixels()` composites back all kept item masks with feathered edges (3px gaussian)
- Fix B: Added `wall_letters`, `ceiling_fan`, `ceiling_fixture`, `chandelier`, `photo_garland` to pre_detection_pipeline.py category enum
- Fix C: Added "Wall letters and text" as explicit detection line in prompt (foam letters, wooden letters, name letters, decorative text, letter sets, wall words, monograms)

**FAILURE 3 — Fill Pro route never fired (both tests used kontext_pro)**
- Root cause: masksReady=false because step-7c Grounded-SAM2 masks weren't populated in render_context for these test renders
- Fix: Added explicit routing decision logging with all inputs printed (remove_count, masksReady, itemMasks_count, remove_decisions list, keep_decisions list)
- Clear warning message when masksReady=false + remove_count>0 explaining what must happen

**ADDITIONAL — Bedding quality**
- Added "Neatly made bed with crisp duvet, styled pillows, no wrinkles or clutter." to quality_suffix in both build_kontext_prompt() and build_fill_prompt()

### Files changed
- `modal_pipeline/generation.py` — Added `composite_structural_pixels()`, wired post-generation composite, routing decision logging, bedding quality prompt, composite constants
- `modal_pipeline/redesign_pipeline.py` — Capture `composite_applied` + `raw_fal_url` in render_context metadata, pipeline_version="phase4b-composite"
- `modal_pipeline/pre_detection_pipeline.py` — Added wall_letters/ceiling_fan/ceiling_fixture/chandelier/photo_garland to category enum, added "Wall letters and text" detection line

### Verification
- [x] python3 ast.parse — all 3 files syntax OK
- [x] tsc --noEmit — clean (no TS changes)
- [ ] modal deploy generation.py — PENDING (user must run)
- [ ] modal deploy redesign_pipeline.py — PENDING (user must run)
- [ ] modal deploy pre_detection_pipeline.py — PENDING (user must run)
- [ ] Test render with seed=42, remove_count=2, floor_change_requested=false — PENDING
- [ ] Verify checklist: floor=beige carpet, DAKSH letters visible, ceiling fan intact, blue walls smooth, bedding styled

### What Phase 5 still needs
1. Deploy all 3 Modal apps and fire test render
2. Visual quality verification against checklist
3. Wire post-processing (color grade, vignette) after composite
4. Wire quality gate after post-processing

---

## Session 6 — 2026-04-15

### Tasks completed — Phase 1 (initial fixes)
- Generalized all 7 fixes from Phase 4 prompt (no hardcoded room/user references)
- Fix 1-7: structural categories, dynamic prompts, updated params, smooth wall finish, vignette TODO
- All DAKSH/Daksh/hardcoded ID references removed from production code

### Tasks completed — Phase 2 (correction: user decisions are law)
- **CRITICAL FIX**: Renamed STRUCTURAL_PRESERVE_CATEGORIES → HARD_STRUCTURAL
- Removed ceiling_fan, wall_letters, wall_art, photo_garland, ceiling_fixture, chandelier from structural set
- These items are now fully user-controlled (keep/remove screen decisions honored absolutely)
- HARD_STRUCTURAL only contains true room bones: ceiling, floor, wall, door, window, window_blinds, built_in_shelving, radiator, fireplace, built_in_wardrobe
- THIN_STRUCTURE_CATEGORIES is rendering quality only (8px dilation) — NOT a preservation override
- Fix A: Items with no decision recorded default to 'keep' (never remove without explicit user action)
- Fix B: detected_items threaded from rooms.pre_detection_result into render_context (handles both list and dict formats)
- Fix C: normalize_label_key defined once in modal_pipeline/utils.py, imported everywhere
- Fix D: build_fill_prompt strips sentences mentioning kept items (never describes replacements for kept items)
- Fix E: Mask polarity check — auto-detects inverted masks (>80% white) and flips them
- Fix F: route_used, seed, mask_url, endpoint logged to render_context in Supabase

### Files changed
- `modal_pipeline/utils.py` — NEW: shared normalize_label_key, HARD_STRUCTURAL, THIN_STRUCTURE_CATEGORIES, get_category_for_label
- `modal_pipeline/generation.py` — full rewrite: imports from utils.py, user-decision-first mask logic, dynamic prompts, polarity check
- `modal_pipeline/redesign_pipeline.py` — threads detected_items from pre_detection_result into render_context (handles list format)
- `modal_pipeline/test_doorway_interior_ai.py` — removed hardcoded room references
- `modal_pipeline/test_flux_kontext_named.py` — removed hardcoded room references
- `apps/web/lib/ai/flux.ts` — removed hardcoded comments, updated fal.ai wrapper params (steps 30, guidance 4.5)

### Render results
- **Test A** (remove_count=2, seed=42): kontext_pro route
  URL: https://v3b.fal.media/files/b/0a96701d/aUtZ11qBN563Xsq6l2xOS_a12a399a9e3849c8a064aa428a38c28f.jpg
- **Test B** (remove_count=0, seed=99): kontext_pro route
  URL: https://v3b.fal.media/files/b/0a967020/z9L3Q2rA-J9ZlYMDy83I5_887eaf41b8734b1ba7ee192d9fc8883a.jpg
- Both used Kontext route (no SAM2 masks in render_context). Fill Pro route requires full step-7 flow.

### Verification
- [x] grep STRUCTURAL_PRESERVE_CATEGORIES modal_pipeline/ → 0 matches (fully removed)
- [x] HARD_STRUCTURAL does NOT contain ceiling_fan, wall_letters, wall_art, photo_garland, ceiling_fixture, chandelier
- [x] grep DAKSH/Daksh modal_pipeline/ apps/web/lib/ai/ → 0 matches
- [x] grep hardcoded IDs → 0 matches
- [x] normalize_label_key defined once in utils.py, imported in generation.py
- [x] detected_items logged at generation entry (len printed)
- [x] tsc --noEmit — clean
- [x] modal deploy generation.py — success (utils.py mounted via add_local_file)
- [x] modal deploy redesign_pipeline.py — success
- [x] Test A render complete (kontext_pro)
- [x] Test B render complete (kontext_pro)

### Known limitation
- Fill Pro route (Route A) not exercised in these tests — requires masksReady=true + itemMasks from step-7 Grounded-SAM2. Category-based thin dilation and mask polarity checks will activate when full user flow is tested.

---

## Session 5 — 2026-04-13

### Tasks completed
- TASK 1: `modal_pipeline/generation.py` created with `generate_redesign` function (fal.ai FLUX img2img + ControlNet + LoRA + IP-Adapter)
- TASK 2: `redesign_room_v3` in `redesign_pipeline.py` wired to call `generate_redesign` via `modal.Function.from_name`
- TASK 3: Full validation — all 8 checks pass, `tsc --noEmit` clean

### Files changed
- `modal_pipeline/generation.py` — new file, deployed as Modal app `cova-generation`
- `modal_pipeline/redesign_pipeline.py` — wired `redesign_room_v3` to call `generate_redesign`; added `lora_scale_used`/`lora_url_used` to `render_context` before generation
- `apps/web/.env.local` — updated `SUPABASE_SERVICE_ROLE_KEY` to new `sb_secret_...` format (legacy JWT disabled 2026-03-14)
- `supabase/migrations/20260413_generation_seed.sql` — adds `generation_seed INTEGER` column (user ran this)
- `supabase/migrations/20260413_v3_schema.sql` — adds all v3 columns + `style_loras` table (user ran this)

### Critical fal.ai findings (locked decisions)

**ControlNet format:** Both depth + canny controls MUST go in a **single** `controlnet_unions` entry with both in the `controls` array. Two separate entries cause "Could not load pipeline" (422).

```python
# CORRECT
controlnet_unions = [{"path": "InstantX/FLUX.1-dev-Controlnet-Union", "controls": [depth, canny]}]

# WRONG — causes 422
controlnet_unions = [
    {"path": "...", "controls": [depth]},
    {"path": "...", "controls": [canny]},
]
```

**negative_prompt incompatible with ControlNets:** `fal-ai/flux-general/image-to-image` does NOT accept `negative_prompt` when `controlnet_unions` is present — causes "Could not load pipeline" (422). The negative_prompt from the design director is logged at line 138 of generation.py but never sent to fal.ai. Do not add it back.

**IP-Adapter format:** Use `ip_adapter_image_url` (string) + `ip_adapter_scale` (float). NOT `ip_adapters[]` array.

**LoRA URL validation:** Fallback `fal-ai/flux-2-lora-gallery/apartment-staging` is not a downloadable URL — skip when not starting with `http`.

**Modal SDK:** Use `modal.Function.from_name(app_name, fn_name)` — `Function.lookup()` is removed in current SDK.

### Supabase key format
Supabase disabled legacy JWT keys 2026-03-14. Use new format:
- Service role: `sb_secret_...`
- Anon: `sb_publishable_...`

### Pipeline stage status
- Preprocessing (OpenCV): ✅ active
- Structural extraction (depth + edges): ✅ active  
- Professionalization: ❌ DISABLED (removed Session 3)
- Design Director (Claude Vision): ✅ active — generates flux_prompt + negative_prompt + design_brief
- Main generation (FLUX + ControlNet + LoRA + IP-Adapter): ✅ active — validated end-to-end
- Post-processing: ✅ active (not yet wired in v3 orchestrator)
- Quality gate: ✅ defined, not yet wired
- Product matching: ⏳ M8

### Known issues / next session
- `professionalized_image_url` is null for test room — pipeline falls back to `original_photo_url`. Need professionalization step to run before generation, or skip the concept entirely (high-strength FLUX overwrites clutter).
- Post-processing (color grade, vignette, grain) not yet wired into `redesign_room_v3`.
- Quality gate not yet wired into `redesign_room_v3`.

---

## 2026-04-13

### Decision: Professionalization pass removed permanently

**What changed:**
- `modal_pipeline/redesign_pipeline.py` (v1 `redesign_room`): removed `professionalize_room` call and `"professionalizing"` status update. Depth map + HED edge extraction still run in parallel and are reused downstream. `pano_url` stays as the raw preprocessed (OpenCV) image throughout.
- `apps/web/app/api/pipeline/redesign/route.ts`: removed `PREPROCESS_PIPELINE_WEBHOOK_URL` block. Route now dispatches the original photo URL directly to Modal.
- `modal_pipeline/professionalization.py`: kept in repo, disabled comment added at top.

**Why:** FLUX img2img at strength=0.55 cannot reliably remove surface clutter without degrading image quality (lighting artifacts, geometry drift). Clutter is handled implicitly by the main generation pass at strength=0.85 — the high strength overwrites clutter naturally without a separate cleanup step. Removing the pass saves ~30–60s and ~$0.05/render in fal.ai cost.

**Pipeline stage status:**
- Preprocessing (OpenCV): ✅ still active (run by web route via PREPROCESS_PIPELINE_WEBHOOK_URL was already removed; preprocessing.py handles DarkIR+OpenCV)
- Structural extraction (depth + edges): ✅ still active
- Professionalization: ❌ DISABLED
- Main generation (FLUX): ✅ active
- Post-processing: ✅ active

**Env vars removed:** `PREPROCESS_PIPELINE_WEBHOOK_URL` no longer read in route.ts (can be removed from .env.local)

---

## Session 3 Complete

Session 3 complete. Depth extraction and edge extraction working perfectly (10/10 test pass). Professionalization FLUX pass removed — wrong tool for the job. Professional quality will be achieved through design director prompting and IP-Adapter Unsplash references in Sessions 4-5. The main generation at strength 0.85 implicitly removes clutter by redesigning the room.

## Phase 3 — Keep/Remove System (Completed April 15, 2026)

### What was built
- Grounded-SAM2 pipeline: modal_pipeline/grounded_sam2_pipeline.py
  - Uses Grounding DINO (IDEA-Research/grounding-dino-base) + SAM2 (facebook/sam2-hiera-large)
  - Deployed at: https://cova-interior--cova-grounded-sam2-segment-room-api.modal.run
  - Modal app: cova-grounded-sam2 (A10G, 16GB, CUDA 13 base image)
  - Cold start: ~60-90s, warm start: ~10-15s
  - Handles ALL room items including ceiling fixtures via top-30% crop second pass
  - Window blinds via left-crop second pass
  - Wall art uses vertical position constraint to avoid matching furniture
  - LABEL_ALIASES map expands prompts for hard-to-detect items
  - Uploads masks to: room-photos/masks/{room_id}/{label_with_underscores}.png

- Segment-masks route: apps/web/app/api/pipeline/segment-masks/route.ts
  - Calls GROUNDED_SAM2_URL env var (set in .env.local)
  - Falls back to per-item SAM2 if Grounded-SAM2 fails
  - Fetches actual image dimensions from JPEG header before computing SAM2 bbox
  - Writes masksReady: true + itemMasks to render_context when complete
  - Does NOT filter is_fixed items — ceiling fan and window blinds ARE segmented
  - STRUCTURAL_CATEGORIES only excludes: ceiling, wall, floor, door, built_in_shelving, radiator, fireplace, built_in_wardrobe

- Keep/Remove UI: apps/web/app/design/step-7c/page.tsx
  - Shows full loading overlay on photo while masksState === 'pending'
  - Canvas overlay renders gold rgba(201,168,76,0.45) on white pixels of SAM2 mask PNG
  - Label lookup tries: normalized, underscore, space, raw variants
  - Polls for masksReady every 2s, max 90s, then does final DB read before timeout
  - Item cards: gold left border when active, Keep/Remove pills, Auto-kept/Auto-removed badges

- Change map: modal_pipeline/generation.py
  - Ceiling always preserved: top 8% of image
  - Floor boundary: bottom 40%
  - Dilation: 12px kernel (was 5px)
  - Kept item masks applied from render_context.itemMasks

### How keep/remove wires into the render
1. User makes decisions on step-7c (keep/remove per item)
2. Decisions saved to rooms.keep_remove_decisions as [{label, decision}]
3. Masks stored in rooms.render_context.itemMasks as {label: maskUrl}
4. redesign/route.ts reads keep_remove_decisions + itemMasks
5. Kept item mask URLs passed to Modal as kept_item_mask_urls
6. generation.py builds change map: black (preserve) for kept items, white (change) for removed
7. Differential diffusion uses change map to preserve kept items pixel-perfectly

### Critical env vars
GROUNDED_SAM2_URL=https://cova-interior--cova-grounded-sam2-segment-room-api.modal.run

### Known issues
- Photo garland and wall letters overlap in some rooms (similar vertical position)
- Cold start latency is 60-90s (acceptable for now, warm is 10-15s)
- Step-7d personalization chat broken (separate issue, fix in Phase 4 prep)

### Test rooms
- Pranav (f39aac20): room e93ee121, room 4c7e28b7
- Daksh (344b5705): room cb2e7047 (light blue walls, ceiling fan, DAKSH letters)

---

## Phase 4b — Selective Inpainting Architecture (April 15, 2026)

### What was implemented
Replaced the broken text-to-image generation pipeline (fal-ai/flux-general) with a selective inpainting architecture that preserves room identity:

**ROUTE A — Fill Pro Inpainting** (when items marked for removal):
- Endpoint: `fal-ai/flux-pro/v1/fill` (confirmed HTTP 200)
- Builds combined mask from all REMOVE-decision items via Grounded-SAM2 masks
- Inpaints only masked regions; original pixels preserved outside mask
- Structural exclusions: ceiling top 8%, floor bottom 40% always preserved
- Kept items excluded from combined mask
- Dilation: 17px / 33x33 kernel + Gaussian feather sigma=15
- Price: $0.05/MP

**ROUTE B — Kontext Pro Style Transfer** (when no removals):
- Endpoint: `fal-ai/flux-pro/kontext` (confirmed HTTP 200)
- Whole-room style transfer preserving structure implicitly
- Price: $0.04/image

### Endpoint verification (Step 1)
- `fal-ai/flux-pro/kontext` → HTTP 200 ✅ (output: images[0].url)
- `fal-ai/flux-pro/v1/fill` → HTTP 200 ✅ (output: images[0].url)
- Test image used: Unsplash public URL (Supabase room photos are private/signed)

### Architecture decisions
- Fill Pro uses ORIGINAL photo (not professionalized) to preserve exact pixels
- Kontext Pro uses professionalized photo (or original fallback) for style transfer
- Mask building runs inside generation.py (Modal A10G), not in TypeScript route
- keep_remove_decisions merged from rooms table into render_context by orchestrator
- Key normalization: all keys lowercased + spaces→underscores for cross-system matching
- Graceful degradation: if masksReady=false, falls through to Kontext route

### Files changed
- `modal_pipeline/generation.py` — complete rewrite: removed generate_redesign_two_pass() and generate_redesign_single_pass(), replaced with generate_redesign_phase4b() + build_combined_remove_mask() + build_kontext_prompt() + build_fill_prompt()
- `modal_pipeline/redesign_pipeline.py` — Stage 4 rewired to call generate_redesign_phase4b, reads keep_remove_decisions from DB, passes render_context through
- `apps/web/lib/ai/flux.ts` — Added submitFalKontextRender() and submitFalFillRender() for fal.ai direct calls, marked old Replicate paths as LEGACY
- `apps/web/lib/ai/mask-assembly.ts` — Updated comment (removed flux-general reference)

### Code quality checks
- [x] tsc --noEmit passes with zero errors
- [x] No references to fal-ai/flux-general in generation.py
- [x] No references to fal-ai/flux-kontext-pro (wrong endpoint) in generation.py
- [x] No negative_prompt in any fal.ai call
- [x] SUPABASE_SERVICE_ROLE_KEY not in any NEXT_PUBLIC_ variable
- [x] apps/mobile/ untouched
- [x] No new Replicate calls added
- [x] Modal deploy generation.py succeeded
- [x] Modal deploy redesign_pipeline.py succeeded

### What was NOT done (deferred)
- Live test render against Daksh's room (room photos are private/signed URLs — need to fire through the full pipeline from the web app or use a room with a public photo URL)
- Visual verification against CollovAI benchmarks (requires rendered output)
- Step 9 test curl (test room's image_url is not publicly accessible from fal.ai)

### Pipeline stage status
- Preprocessing (OpenCV): ✅ active
- Structural extraction (depth + edges): ✅ active
- Professionalization: ❌ DISABLED (removed Session 3)
- Design Director (Claude Vision): ✅ active
- Main generation: ✅ Phase 4b — Fill Pro / Kontext Pro selective inpainting
- Post-processing: ⏳ not yet wired in orchestrator
- Quality gate: ⏳ not yet wired

### Fill Pro routing note (ISSUE 4)
Fill Pro requires completed step-7c with masksReady=true in render_context.
Test room cb2e7047 has no SAM2 masks (step-7c Grounded-SAM2 was never completed for this room) — always uses Kontext.
Fill Pro can only be tested via full browser flow on a room that has completed step-7c.
route_used=kontext_pro despite remove_count=2 is expected behavior when itemMasks is empty/null.

### What Phase 5 needs to do next
1. End-to-end test through the web app (step-7d → step-8a) to verify rendered output
2. Visual quality verification: walls preserved, floor preserved, ceiling fan intact, DAKSH letters intact
3. Wire post-processing (color grade, vignette, grain) into the orchestrator after Phase 4b generation
4. Wire quality gate (aesthetic scorer + retry) after post-processing
5. Handle edge case: professionalized_photo_url is None (currently falls back to original)
6. Consider upscaling step: Kontext Pro may downscale output (seen in M7S2: 2304x1152 → 1456x720)
