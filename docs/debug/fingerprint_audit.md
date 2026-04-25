# Fingerprint-to-FLUX Data Flow Audit

**Date:** 2026-04-25
**Purpose:** Trace the style fingerprint from quiz output to FLUX prompt construction to evaluate whether FLUX+LoRA can be replaced with a multimodal model (GPT-4o / Gemini).

---

## Section A — Redesign Entry Points

### Path 1: Next.js API Route → V3 Modal Service (active)

**Entry:** `apps/web/app/api/pipeline/redesign/route.ts` (POST)

The route reads from Supabase, runs the Design Director, then dispatches to the Modal `cova-redesign-v3` service.

**V9 body** (sent when `COVA_REDESIGN_URL` is set — the active path):

| Field | Type | Required | Populated from |
|---|---|---|---|
| `room_id` | string | yes | POST body |
| `user_id` | string | yes | auth session |
| `empty_room_url` | string | yes | `rooms.empty_room_url` fallback to `original_image_url` |
| `room_type` | string | yes | `rooms.room_type` (default `"room"`) |
| `style_blend` | `Record<string, number> \| null` | no | `rooms.style_blend` or `renderContext.styleBlend` |
| `style_fingerprint` | `StyleFingerprint \| null` | no | `renderContext.fingerprint` or `users.style_fingerprint` |
| `personalization` | `Record<string, unknown>` | no | `rooms.personalization` |
| `budget_max` | number | no | `renderContext.budget.rangeMax` (default 2000) |
| `seed` | number | no | `rooms.generation_seed` or random |

**Legacy body** (sent when only `REDESIGN_PIPELINE_WEBHOOK_URL` is set):

Additional fields: `compiled_prompt`, `anchor_prompt`, `style_reference_url`, `unsplash_references`, `loras_json`, `change_map_url`, `kept_item_mask_urls`, `wall_change_requested`, `floor_change_requested`, `chat_context`, `image_url`, `remove_count`.

### Path 2: Modal `cova-redesign-v3` (V3 3-pass pipeline)

**Entry:** `modal_pipeline/redesign.py` — `POST /v1/generate_redesign`

**Pydantic request model (`RedesignRequest`):**

| Field | Type | Required | Default |
|---|---|---|---|
| `empty_room_url` | HttpUrl | yes | — |
| `room_type` | str | no | `"bedroom"` |
| `style_blend` | `dict[str, float] \| None` | no | None |
| `style_fingerprint` | `dict[str, Any] \| None` | no | None |
| `personalization` | `dict[str, Any] \| None` | no | None |
| `room_id` | `str \| None` | no | None |
| `user_id` | `str \| None` | no | None |
| `budget_max` | float | no | 2000.0 |
| `strength_override` | `float \| None` | no | None |
| `guidance_override` | `float \| None` | no | None |
| `prompt_override` | `str \| None` | no | None |
| `lora_scale_multiplier` | `float \| None` | no | None |
| `seed` | `int \| None` | no | None |
| `skip_pass2` | bool | no | False |
| `skip_pass3` | bool | no | False |
| `lighting_preset_override` | Literal enum | no | None |

### V7 stash

The stash `stash@{0}` (`v7-pipeline-state-pre-cn-lora-test`) contained no diffs for `apps/web/app/api/pipeline/redesign/` or `modal_pipeline/redesign.py`.

---

## Section B — Reconstructed Example Payload

**Source:** Test fixture from `apps/web/tests/ai/redesign-client.test.ts` lines 96-122 (SYNTHETIC values, real field structure).

```json
{
  "empty_room_url": "https://example.com/empty.png",
  "room_type": "bedroom",
  "style_blend": {
    "COVAJAPANDI": 0.7,
    "COVASCANDINAV": 0.3
  },
  "style_fingerprint": {
    "dimensions": {
      "colorTemperature": 0.60,
      "colorSaturation": 0.25,
      "density": 0.25,
      "formality": 0.80,
      "era": 0.30,
      "material": 0.70,
      "texture": 0.50,
      "pattern": 0.10,
      "lineQuality": 0.50,
      "lightPreference": 0.60,
      "nature": 0.55,
      "culturalInfluence": 0.50
    },
    "covariance": [],
    "confidence": 0.82,
    "fingerprint_version": "v3"
  },
  "personalization": {
    "art": {
      "layout": "triptych",
      "frame_style": "natural wood",
      "images": [
        { "description": "abstract landscape in earth tones" }
      ]
    },
    "identity_objects": [
      { "type": "plants", "quantity": "many" },
      { "type": "books", "quantity": "few" }
    ],
    "smart_products": [
      { "type": "hue_strips" }
    ],
    "lighting": { "mood": "warm_cozy" },
    "freetext": { "raw_text": "I want a calming bedroom with a 65 inch Samsung Frame TV" }
  },
  "budget_max": 5000,
  "seed": 42,
  "room_id": "<REDACTED>",
  "user_id": "<REDACTED>"
}
```

**Note:** This is SYNTHETIC — constructed from the Pydantic model + test fixtures + type definitions. No real pipeline run payloads were found in the repo.

---

## Section C — The Style Fingerprint

### C1. Data Structure

**File:** `apps/web/types/fingerprint.ts`

Three versions coexist:

**V1 (legacy, 12-dim):**
```typescript
interface StyleFingerprint {
  dimensions: {
    colorTemperature: number;  // [0,1] cool→warm
    colorSaturation: number;   // [0,1] muted→bold
    density: number;           // [0,1] sparse→layered
    formality: number;         // [0,1] casual→formal
    era: number;               // [0,1] modern→heritage
    material: number;          // [0,1] manufactured→natural
    texture: number;           // [0,1] smooth→tactile
    pattern: number;           // [0,1] solid→patterned
    lineQuality: number;       // [0,1] geometric→organic
    lightPreference: number;   // [0,1] dim→bright
    nature: number;            // [0,1] urban→biophilic
    culturalInfluence: number; // [0,1] western→global
  };
  covariance: number[][];      // 12×12
  confidence: number;          // [0,1]
  fingerprint_version?: "v1" | "v2";
}
```

**V2 (collapsed, 6-dim stored in first 6 slots):**

| Slot | V2 Dimension | Formula |
|---|---|---|
| `colorTemperature` | warmth | 0.6×colorTemp + 0.4×lightPref |
| `colorSaturation` | visual_complexity | 0.5×colorSat + 0.5×pattern |
| `formality` | organicness | 0.4×material + 0.3×texture + 0.3×nature |
| `density` | density | unchanged |
| `era` | traditionalism | 0.5×formality + 0.5×era |
| `material` | character | 0.6×lineQuality + 0.4×culturalInfluence |
| slots 7-12 | unused | all 0.5 |

**V3 (current active, 12-dim new names):**
```typescript
interface StyleFingerprintV3 {
  dimensions: Record<DimensionName, number>;
  covariance: number[][];  // 12×12
  confidence: number;
  fingerprint_version: "v3";
}
```

### C2. The 12 V3 Dimensions

From `apps/web/lib/quiz/style-archetypes.ts`:

1. **warmth** — cool↔warm
2. **complexity** — simple↔complex
3. **formality** — casual↔formal
4. **natureMateriality** — manufactured↔natural
5. **colorSaturation** — muted↔bold
6. **textureRichness** — smooth↔tactile
7. **lightingDrama** — flat↔dramatic
8. **pattern** — plain↔patterned
9. **lightPreference** — dim↔bright
10. **lineQuality** — geometric↔organic
11. **symmetryPreference** — asymmetric↔symmetric
12. **plantPresence** — none↔abundant

### C3. Style Anchor Mapping

10 named COVA* archetypes each have a 12-dim center vector in `STYLE_ARCHETYPES`. Example for COVAJAPANDI:

```
warmth=0.60, complexity=0.25, formality=0.50, natureMateriality=0.80,
colorSaturation=0.30, textureRichness=0.65, lightingDrama=0.35,
pattern=0.10, lightPreference=0.60, lineQuality=0.30,
symmetryPreference=0.25, plantPresence=0.55
```

### C4. How the Fingerprint Is Consumed by the Redesign Step

The fingerprint is consumed through **three simultaneous conversion paths**:

#### Path A: Fingerprint → `style_blend` → LoRA weights

```
V3 fingerprint.dimensions
  → fingerprintToStyleBlend(dims, temperature=0.35)       [style-archetypes.ts:179]
    → cosine similarity to all 10 archetypes
    → softmax with temperature 0.35
    → filter > 0.10 → renormalize
    → Record<StyleName, number>  e.g. { COVAJAPANDI: 0.85, COVASCANDINAV: 0.15 }
  → stored in renderContext.style_blend by assembler.ts
  → route reads as styleBlendForAnchor
  → getLoraStackFromBlend(blend)                          [lora-registry.ts:151]
    → resolves COVA* keys to safetensor URLs
    → scale = lora.default_scale × blend_weight × 0.85
  → JSON stringified as loras_json → sent to Modal
```

On the Modal side (V3 pipeline), the `style_blend` is consumed directly:
```python
primary_archetype = _primary_archetype(req.style_blend)  # top key
loras_p1 = _build_lora_stack(primary_archetype, blend, scale_mult)
# → [{path: safetensor_url, scale: capped_at_0.65}]
```

#### Path B: Fingerprint → Design Director (Claude Sonnet Vision) → DesignBrief → prompt

```
fingerprint
  → buildFingerprintContext(fp)                           [design-director.ts:665]
    → extractV2Vector() merges to 6-dim
    → each dim → band (low/moderate/high) → description string
    → e.g. "warmth: 0.60 (moderate) -> balanced warm-cool, neutral base"
  → injected into user message for Claude Sonnet 4.6 with room photo
  → Claude emits DesignBrief via tool_use (structured JSON)
  → style_weights.loras populated by buildLorasFromBlend()
  → DesignBrief.palette, materials, lighting, depth_zones all informed by fingerprint
```

#### Path C: Fingerprint → Anchor style reference image

```
fingerprint.dimensions
  → fetchTopStyleReference(fingerprint, roomType)         [style-references.ts:51]
    → cosine similarity against quiz_anchor_images.style_vector (12-dim)
    → returns closest anchor's image_url + flux_prompt
  → anchorPrompt used in fallback prompt path only
  → styleReferenceUrl passed to legacy webhook (not V9)
```

### C5. Where the "COVAJAPANDI 0.85 + COVASCANDINAV 0.15" Blend Comes From

**File:** `apps/web/lib/quiz/style-archetypes.ts:179` — `fingerprintToStyleBlend()`

```typescript
function fingerprintToStyleBlend(
  fingerprint: Record<DimensionName, number>,
  temperature: number = 0.35,
): Record<StyleName, number> {
  // 1. Cosine similarity to each of 10 archetypes
  // 2. Softmax with temperature 0.35 (sharper than default 1.0)
  // 3. Filter weights > 0.10
  // 4. Renormalize to sum to 1.0
}
```

Called from `assembler.ts:99` — `deriveStyleBlend()` — only for V3 fingerprints. V1/V2 return undefined → Director falls back to single-primary LoRA.

---

## Section D — Reference Image Availability

### D1. Does the quiz capture which specific reference images the user selected?

**No.** The quiz captures pair-wise A/B preference choices (left vs right), each updating a Bayesian posterior over the 12-dim fingerprint space. The individual image selections are not persisted — only the resulting dimension vector.

Grep for `quiz_selections`, `selected_images`, `pair_choices`, `user_choices` returned zero results.

### D2. Are quiz selections persisted?

**No.** Only the computed `StyleFingerprint` is stored in `users.style_fingerprint` (JSONB). The individual A/B choices that produced it are ephemeral.

### D3. Can we retrieve N images representing "their style"?

**Partially.** Two sources exist:

1. **`quiz_anchor_images` table** — stores anchor style images with 12-dim `style_vector` and `flux_prompt`. `fetchTopStyleReference()` returns the single closest match. Not multiple.

2. **Unsplash references** — `fetchScoredStyleReferences()` in `apps/web/lib/unsplash.ts` fetches 3-5 Unsplash images scored by orientation, resolution, engagement, and style keyword match. Stored in `rooms.unsplash_references`. These are third-party stock photos, not user selections.

**Bottom line:** There is no "user's chosen reference images" collection. The system can produce ~5 style-matched stock images, but they represent the archetype, not explicit user selections.

### D4. Can we map fingerprint → top-K closest anchors?

**Yes, trivially.** `quiz_anchor_images` has `style_vector` columns. `fetchTopStyleReference()` already does cosine similarity — extending it to return top-K instead of top-1 is a 2-line change. The images are in Supabase Storage; count and resolution unknown without querying the table.

---

## Section E — Material/Structure Extraction

### E1. Is Claude Vision called on the input photo before FLUX?

**Yes — in two places:**

1. **Design Director (Call 1)** — `design-director.ts:1047` — Claude Sonnet 4.6 with the room photo + fingerprint context. This is the primary extraction path.

2. **Gemini Room Analyzer** — `room-analyzer.ts` via `analyzeRoomArchitecture()` — called at `route.ts:261`. Extracts camera angle, focal length, and architectural features.

3. **V3 Pass 0 — Layout Planner** — `redesign.py:523` — Claude Sonnet 4.5 with the empty room photo. Produces a JSON scene spec (hero placement, surface targets, lighting preset).

### E2. What does Claude Vision extract?

**Design Director (Call 1)** extracts a full `DesignBrief` (~40 structured fields) via forced tool_use. Key structured fields:

- `architecture_preserved`: walls, windows, ceiling_height_est_ft, floor_type, camera_pov
- `anchor`: category, material, color, scale (room-type-specific hero piece)
- `palette`: primary_hex, secondary_hex, accent_hex, neutral_hex (60-30-10 rule)
- `materials`: 3-6 specific material names
- `lighting`: direction, fixture, color_temp_k, shadow_intensity
- `depth_zones`: foreground[], midground[], background[] objects
- `three_materials`: [{name, finish, application}] × 3
- `color_story`: 4 named colors with hex and coverage_pct
- `object_hierarchy`: hero + supporting[] + accessories[]
- `focal_point`, `negative_space`, `statement_piece`
- `wall_change_requested`, `floor_change_requested`, `room_scale`

**V3 Pass 0 Layout Planner** extracts:

- `architecture_notes`, `focal_wall`
- `pass1_hero_placement`: primary_hero, secondary_pieces, rug_placement
- `pass2_surfaces`: [{surface_name, vignette}]
- `personalization_placements`: art, smart_tech, identity_objects
- `life_objects`: 3 "Gosling rule" lived-in items
- `pass3_lighting_preset`: warm_cozy | bright_natural | dramatic_moody

### E3. Does extraction include floor, ceiling, color palette?

**Yes.** The Design Director explicitly extracts floor_type, ceiling_height, wall colors, and full palette. The V3 Layout Planner extracts architecture_notes (walls, windows, ceiling).

### E4. Where does this output flow?

- **DesignBrief** → `compilePrompt()` (Call 2, Claude Haiku) → 50-80 word FLUX prompt. Stored in `rooms.design_brief` and `rooms.flux_prompt`.
- **DesignBrief** → Also drives LoRA selection via `style_weights.loras`.
- **Layout Plan** → Drives Pass 1 prompt construction, Pass 2 surface targets, Pass 3 lighting preset — all within `modal_pipeline/redesign.py`.
- **Neither** flows into the furniture matching layer (that's a separate Claude Vision call on cube face crops at M8).

---

## Section F — Prompt Construction

### F1. Two-Part Architecture

**Part 1: TypeScript Skeleton (Design Director)**

`apps/web/lib/ai/design-director.ts` — `runDesignDirector()`

1. **Call 1** — `generateDesignBrief()`: Claude Sonnet 4.6 + room photo + fingerprint context → forced tool_use → `DesignBrief` (structured JSON, ~40 fields).
2. **Call 2** — `compilePrompt()`: Claude Haiku 4.5 + DesignBrief → 50-80 word natural language FLUX prompt.

The skeleton provides: system prompt with room-type rules, material specificity requirements, anti-clutter rules per style, 7-token ordering specification.

**Part 2: Claude Sonnet Synthesizer**

Claude Sonnet 4.6 looks at the actual room photo and emits a structured design plan (DesignBrief). Then Claude Haiku 4.5 compresses the brief into a 50-80 word prompt following a strict 7-token order:

1. Style trigger word(s) (LoRA trigger)
2. Room type + structural features
3. Exactly 3 materials
4. Object hierarchy (hero first)
5. Lighting
6. Camera
7. Mood

### F2. Inputs to `compilePrompt()`

The function accepts a single `DesignBrief` object (all ~40 fields). Key fields it reads:

- `style_weights.primary_lora` → Token 1 (trigger word)
- `room_type` → Token 2
- `architecture_preserved` → Token 2
- `three_materials` → Token 3
- `object_hierarchy.hero` → Token 4
- `lighting_concept` → Token 5
- `color_story` → Token 7 mood
- `hard_constraints` → exclusions
- `room_scale` → density hint

### F3. V3 Modal `_build_pass1_prompt()` (parallel path)

On the Modal side, the V3 pipeline builds its OWN prompt from scratch using `style_rules/*.json` + layout planner output + personalization dict. This is independent of the TS Design Director.

**Inputs:**
- `primary_archetype` (from `style_blend`)
- `room_type`
- `plan` (from Pass 0 Layout Planner)
- `style_rules` (loaded from `style_rules/{slug}.json` — materials, palette, density)
- `personalization` (art, smart products, identity objects, freetext)
- `budget_max`

### F4. Example Constructed Prompt (Synthetic Japandi User)

**Design Director path (50-80 words):**
```
cvwmn bedroom with arched window and warm beige walls. Light oak, cream linen, brushed brass. Low platform bed centered on focal wall, walnut nightstand left, ceramic table lamp right. Warm afternoon light from south-facing window, brass arc floor lamp behind reading chair. Eye level, wide-angle, magazine photography. Restrained, calm, generous negative space. cvwmn
```

**V3 Modal Pass 1 path (~100 words):**
```
cvwmn bedroom interior — this is a BEDROOM with a real bed and headboard as the primary hero piece. a triptych of exactly three framed artworks in a horizontal row on the focal wall, identical frames, evenly spaced with natural wood frames, depicting abstract landscape in earth tones. six to eight lush potted plants of varied sizes. a small curated stack of hardcover books. warm LED strip lighting glowing behind the headboard. I want a calming bedroom with a 65 inch Samsung Frame TV. HERO: low-profile light oak platform bed, two nightstands, dresser, bench at foot of bed, extends 18-24 inches past each side of the bed. LIGHTING: warm tungsten 2700K lamp pools casting amber-gold light, visible lit table lamps and floor lamps, deep chiaroscuro shadows, golden hour evening interior, not bright, not flat. Materials: light oak, linen, ceramic, stone. Palette: beige, cream, soft taupe, warm gray, terracotta, designer-tier finishes. Styled with open book, folded throw, layered textiles. Photographed by Francois Halard, 35mm lens eye-level 44 inches, Architectural Digest editorial quality, asymmetric composition, one clear directional light source, richly decorated, lived-in, preserve original room architecture, walls, windows, ceiling, floor
```

---

## Section G — Summary Table

| Input Source | Format | Used By | How Consumed | Replaceable by GPT-4o/Gemini? |
|---|---|---|---|---|
| **Style Fingerprint** | 12-dim vector [0,1] per dim | LoRA weight selection, Design Director context, anchor image lookup | `fingerprintToStyleBlend()` → softmax → COVA* weights → safetensor URLs; `buildFingerprintContext()` → text description for Claude | **Partially.** The numeric vector can be passed as structured context to any multimodal model. The LoRA selection mechanism would need replacement — either style reference images or very detailed text prompts. |
| **Style Blend** | `Record<COVA*, number>` e.g. `{COVAJAPANDI: 0.85, COVASCANDINAV: 0.15}` | LoRA stack construction, primary archetype resolution, style_rules JSON lookup | `getLoraStackFromBlend()` → safetensor URLs + scales; `_primary_archetype()` → room-type-specific prompts | **Yes, if LoRAs are dropped.** The blend tells you "85% Japandi, 15% Scandi" — this can be expressed as text or reference images. |
| **Anchor images** | URLs in `quiz_anchor_images` table | Style reference for anchor-fallback prompt path | `fetchTopStyleReference()` → cosine similarity → top-1 image_url + flux_prompt | **Highly useful for multimodal.** Top-K anchor images could be passed directly as visual style references to GPT-4o/Gemini. Currently under-utilized (only used in fallback path). |
| **Quiz pair selections** | **Not persisted** | Only used to compute fingerprint during quiz session | Bayesian posterior updates; discarded after fingerprint computation | **N/A.** Would need to be persisted to be useful as reference images for multimodal. |
| **Source room photo** | URL (JPEG/PNG) | Empty room input to FLUX i2i, Claude Vision analysis, depth ControlNet | Direct input to `fal-ai/flux-general/image-to-image` as `image_url` | **Yes.** Multimodal models accept images natively. GPT-4o/Gemini can analyze the room + generate a description; a separate generation model would still be needed for the actual image synthesis. |
| **Empty room (from cova-empty-room)** | URL (JPEG) | Base image for redesign passes; input to V3 Pass 0 layout planner | SAM furniture removal → LaMa/Bria inpaint → empty room URL → FLUX i2i base | **Yes.** Empty room can be input to any model. |
| **Claude Vision output (Design Director)** | Structured JSON (`DesignBrief`, ~40 fields) | FLUX prompt compilation (Call 2), LoRA blend override, design_memory persistence | `compilePrompt()` → 50-80 word FLUX prompt; `_build_pass1_prompt()` on Modal uses separate plan | **Already uses Claude.** Could be replaced by GPT-4o/Gemini Vision for the analysis step. The structured output quality is the key comparison point. |
| **Claude Vision output (Layout Planner)** | Structured JSON (scene spec) | V3 Pass 1/2/3 prompt construction, surface mask generation | Consumed entirely within `modal_pipeline/redesign.py` | **Yes.** Any VLM can produce a layout plan. Quality depends on spatial reasoning capability. |
| **Style Rules JSON** | JSON files in `modal_pipeline/style_rules/` | V3 prompt construction (materials, palette, density, hero furniture, negatives) | `_load_style_rules(archetype)` → materials list, density tier, hero furniture nouns, pass1/pass2 fragments | **Yes as text context.** These are static config files — can be injected as system prompt context to any model. |
| **Personalization** | `rooms.personalization` dict + `rooms.personalization_context` | Art layout, smart tech, identity objects, lighting, freetext → prompt fragments | `_art_pass1_fragment()`, `_smart_pass1_fragment()`, `_identity_pass1_fragment()` build prompt clauses | **Yes.** Pure structured data → text conversion. No model dependency. |
| **Unsplash references** | 3-5 URLs | IP-Adapter conditioning in legacy path; curated fallback refs | `unsplash_references` field in legacy webhook body | **Highly useful for multimodal.** Style reference images that could be passed directly to GPT-4o/Gemini as visual context. Currently only used in legacy path. |
| **LoRA safetensors** | Binary model files on fal.media CDN | FLUX model conditioning for style | Loaded by `fal-ai/flux-general` during inference; 1-2 style LoRAs + add-details LoRA | **Not portable.** LoRAs are FLUX-specific. Multimodal replacement would need equivalent style conditioning via reference images + detailed prompts. This is the core question. |
| **Depth ControlNet** | Depth map URL from `fal-ai/imageutils/depth` | Structural preservation in FLUX i2i | `controlnet_unions` parameter to flux-general | **Partially.** Multimodal models don't have explicit depth conditioning. Architecture preservation would rely on the model's inherent spatial understanding + explicit instructions. |

---

## Key Findings for Multimodal Replacement Evaluation

### What LoRAs actually provide

Each trained LoRA (10 styles, ~$2/training) encodes a visual vocabulary that cannot be fully expressed in text:
- Material rendering quality (the specific way cvwmn renders linen vs how cvind renders aged leather)
- Lighting preferences (warm pools vs even flat light)
- Composition biases (negative space vs density)
- Color palette tendencies

The LoRA scale is capped at 0.65 (V3 redesign.py:482) specifically because higher scales override personalization — **the LoRA is already a relatively weak influence** in the current pipeline.

### What a multimodal model would receive instead

If LoRAs are dropped, the multimodal model would need:
1. **Style reference images** — top-K from `quiz_anchor_images` (trivial to implement)
2. **Style rules JSON** — the full `warm-japandi.json` etc. (already exists, ~120 lines of structured design vocabulary)
3. **The fingerprint itself as text context** — already implemented in `buildFingerprintContext()` — e.g., "warmth: 0.60 (moderate), natureMateriality: 0.80 (high) -> natural organic materials"
4. **The DesignBrief** — already structured JSON; model-agnostic

### The gap

The pipeline currently uses **three AI calls** to go from fingerprint → rendered image:
1. Claude Sonnet Vision → DesignBrief (structured analysis)
2. Claude Haiku → FLUX prompt (text compilation)
3. FLUX + LoRA → pixel output (image generation)

A multimodal replacement would collapse calls 1+2 but still needs an image generation backend. GPT-4o and Gemini can analyze and plan but cannot generate photorealistic interior renders at FLUX quality. The evaluation should focus on:
- **Can reference images replace LoRA conditioning?** (test with flux-general without LoRAs but with IP-Adapter)
- **Can a multimodal model produce better DesignBriefs?** (compare Claude Sonnet vs GPT-4o vision structured output)
- **Can the FLUX prompt be eliminated in favor of direct multimodal generation?** (only if a multimodal model can generate at Architectural Digest quality, which none currently can)
