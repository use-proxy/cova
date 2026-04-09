# Session 11 Progress — Flux Prompt Builder + Style Refs + Pipeline Gaps

## Gap Fixes

### Gap 1 — inclusions/constraints in store (FIXED)

**Root cause:** Step-5 collected `selectedInclusions`, `selectedConstraints`, `selectedDimension`
in local React state, sent them to the server via PATCH, but never persisted to the
fingerprint store. Step-6 had hard-coded `inclusions: []`, `constraints: []`.

**Fix:**
- Added `inclusions: string[]`, `constraints: string[]`, `roomDimension: 'small' | 'medium' | 'large' | null`
  to `FingerprintState` in `lib/store/fingerprint.ts`
- Added setters: `setInclusions`, `setConstraints`, `setRoomDimension`
- Step-5 `handleDesignMyRoom` now calls all three setters after PATCH succeeds
- Step-6 render payload updated: `inclusions: fingerprintStore.inclusions ?? []`,
  `constraints: fingerprintStore.constraints ?? []`

### Gap 2 — fingerprint field naming (ALREADY FIXED)

Step-6 already sends `fingerprint_vector` which matches the render route's
`fingerprint_vector: StyleFingerprint` interface field. No change needed.

### Gap 3 — Schnell preview in status route (FIXED)

**Root cause:** Render route only fired one prediction (FLUX.2 pro). No Schnell prediction
was tracked anywhere. Status route never returned `preview_url`.

**Fix:**
- `lib/ai/flux.ts`: Added `submitSchnellRender(prompt)` — fires `black-forest-labs/flux-schnell`
  (text-to-image, no input_images)
- `app/api/render/route.ts`: Fires Schnell in parallel (non-fatal if it fails). Stores
  `schnell_prediction_id` in `pipeline_cost_log` for both single-stage and two-stage renders.
  Returns `schnell_prediction_id` in response body.
- `app/api/render/status/route.ts`: Accepts `schnell_prediction_id` query param. When main
  prediction is `starting|processing`, checks Schnell status — if succeeded, returns
  `{ status: 'processing', preview_url: <schnell_output_url> }`.
- `app/design/step-6/page.tsx`: Status poll URL now includes `&schnell_prediction_id=...`
  when stored in roomStore.

## buildFluxPrompt live test output

```
PROMPT: A bedroom,. bright airy space, flooded with natural light, sun-drenched, stark,
near-empty, intentional void, almost no objects, warm amber tones, honey wood, terracotta,
beeswax, organic curves, soft rounded forms, natural shapes, no hard edges, abundant natural
materials, wood grain, stone, live plants, rattan, linen, achromatic palette, near-neutral,
greige, white, grey, black, artisanal craft, hand-thrown ceramics, hand-woven textiles,
bespoke joinery. quality mid-range furniture, well-made everyday pieces. including Plants,
Desk. constraints: I rent. preserving existing Bed. Negative: distorted walls, wrong
perspective, AI artifacts, text, watermarks, people, animals

WORD COUNT: 85
CHAR COUNT: 680
```

- 85 words (well under 400 limit)
- Dimensions inside neutral band skipped: `era` (0.2), `scale` (-0.3), `texture` (0.3)
- Contains correct descriptors for: luminosity (0.5), density (-0.6), temperature (0.4),
  form (0.6), nature (0.7), saturation (-0.5), materialOrigin (0.6)
- Contains Plants, Desk in inclusions
- Contains "I rent" in constraints
- Contains "Bed" in preserved_items

## buildFluxPrompt signature change

Old: `buildFluxPrompt(fingerprint, roomType, budgetTier, inclusions, keptItems?)`  
New: `buildFluxPrompt(params: BuildFluxPromptParams)` where params includes:
- `fingerprint`, `roomType`, `budgetTier`, `inclusions`, `constraints`, `keptItemLabels`, `roomAnalysis`

Note: JSON format NOT used. Kept natural language — FLUX diffusion models don't parse JSON.
The spec claimed "FLUX.2 [pro] natively parses this" but this is incorrect.

## style_references seeded

- Total: **15 rows** (3 per style × 5 styles)
- Source: `swipe_cards` table, `phase = 'baseline'`, `active = true`, ordered by `discriminability_score` DESC
- Styles: bohemian, coastal, japandi, mid_century, minimalist

## Style references match API test

```
POST /api/style-references/match (japandi-like fingerprint, room_type: bedroom, count: 3)

references: 3
  japandi | sim: 1.0
  japandi | sim: 1.0
  japandi | sim: 1.0
```

All 3 results are japandi — correct for the test fingerprint (warm, organic, natural, low
saturation). Similarity of ~1.0 due to room_type boost (1.3×) + high cosine similarity with
japandi archetype dimension_labels.

## Render pipeline test evidence

Pipeline_cost_log for single-stage render now includes `schnell_prediction_id`:
```json
{
  "positive_prompt": "A bedroom,. bright airy...",
  "schnell_prediction_id": "pvm0fnyy5xrmy0cxdbzbqpbk00"
}
```

## Playwright results

- `render-pipeline.spec.ts`: **2/2 passing**
- Full suite: **72/72 passing** — zero regressions

## Files changed

| File | Change |
|---|---|
| `lib/store/fingerprint.ts` | +inclusions, constraints, roomDimension state + setters |
| `app/design/step-5/page.tsx` | Calls store setters in handleDesignMyRoom |
| `app/design/step-6/page.tsx` | Uses store inclusions/constraints; passes schnell param |
| `lib/ai/flux.ts` | params object signature; +constraints/roomAnalysis; +submitSchnellRender |
| `app/api/render/route.ts` | Updated buildFluxPrompt call; fires Schnell; stores schnell ID |
| `app/api/render/status/route.ts` | Checks Schnell; returns preview_url |
| `scripts/seed-style-references.ts` | NEW — seeds 15 style references |
| `app/api/style-references/match/route.ts` | NEW — cosine sim match API |
| `middleware.ts` | +/api/style-references/match to public routes |
| `tests/ai/flux.test.ts` | Updated to use new params object signature |

## Commit

`c3e7f32` — session-11: flux prompt builder + style refs + pipeline gaps fixed
