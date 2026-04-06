# Cova Recon Report — April 5, 2026

Read-only reconnaissance. No files were modified.

---

## 1. Render Pipeline

### What Step 7 calls
`step-7/page.tsx` (`fireRender`, line 305) POSTs to `/api/render` with:
```
photo_url, depth_map_url, keep_mask, fingerprint_vector, room_type,
budget (budgetTier), inclusions, constraints, dimensions, room_id,
style_strength, refinement_text (optional)
```

### What /api/render/route.ts does
- Calls `buildFluxPrompt()` from `lib/ai/flux.ts` to build the prompt from the 10-dim fingerprint
- Optionally calls Claude (`claude-sonnet-4-6`) to refine the prompt if `refinement_text` is present
- Creates a Replicate prediction directly using `replicate.predictions.create` with model `black-forest-labs/flux-kontext-pro`
- **Does NOT call Modal.** Does NOT call the Supabase `render-room` edge function.
- Returns: `{ prediction_id: string }`

### /api/render/status/route.ts
- Exists and is functional.
- Accepts `GET ?prediction_id=&room_id=`
- Polls Replicate directly via `replicate.predictions.get(predictionId)`
- On `succeeded`: writes to `render_sessions` table + updates `rooms.render_url`, returns:
  `{ status: 'complete', render_url: string, render_session_id: string | null }`
- On in-progress: `{ status: 'processing' }`
- On failure: `{ status: 'failed', error: string }`

### /api/render/refine/route.ts
- A synchronous (blocking) refine endpoint.
- Calls Claude to modify the prompt, then calls `runFluxRender()` from `lib/ai/flux.ts` which also hits `flux-kontext-pro` via Replicate.
- This is a **separate, older code path** from the main async render. It blocks until the render completes. Currently used nowhere visible in the step pages — Step 9 refine sends users back to step-7 which uses `/api/render`, not `/api/render/refine`.

### Pipeline start/redesign flow
`/api/pipeline/start` is a **completely separate orchestrator** (used for the full Modal/Marble 3D pipeline). It is NOT called by step-7. It calls webhook URLs for Marble/Modal 3D reconstruction. It has two modes: `full` (new architecture with Marble + flythrough video) and legacy (`mini_both`, `mini_async_plus`). This route is called from somewhere in the processing/pipeline flow for the full 3D redesign track, NOT from step-7.

`/api/pipeline/redesign` triggers the FLUX redesign webhook for the 3D pipeline specifically — not used in step-7.

### Model in use for step-7 renders
**`black-forest-labs/flux-kontext-pro`** via Replicate, called directly from `/api/render/route.ts`.
The Supabase `render-room` edge function uses `flux-depth-pro` (primary) with `flux-2-pro` fallback — this is a completely different, legacy code path.

---

## 2. Product Matching

### What Step 10 calls
`step-10/page.tsx` calls `/api/match` (POST) for each detected item in parallel (line 94–108). Request body per call:
```
render_crop_url: renderUrl  ← IMPORTANT: the FULL render, not a crop
fingerprint_vector: fingerprint
budget_range: budgetRange
room_type: roomType
item_label: detection.label (optional)
```

**Critical issue**: The field name is `render_crop_url` but the value is `renderUrl` — the full render image, not a crop of a specific item. The spec says cube face crops; what is sent is the entire redesigned image.

### What /api/match/route.ts does
1. Calls Claude vision (`claude-sonnet-4-20250514`) to build a query description for the item (uses `item_label` as focus hint)
2. Calls `embedImage(render_crop_url)` from `lib/ai/clip.ts` — embeds the full render URL via Replicate `andreasjansson/clip-features`
3. Fetches candidate products from Supabase `products` table directly (NOT via Supabase edge function) filtered by `room_types`, `price` range, `active=true`, limit 50
4. Ranks using the formula: `0.35 * visualSim + 0.30 * fingerprintAlign + 0.20 * budgetFit + 0.10 * behavioral + 0.05 * affiliateWeight`
5. Returns top 8 products with `match_score` and `match_label`

Response shape:
```json
{
  "products": [{ "id", "name", "price", "retailer", "affiliate_url",
                 "image_url", "match_score", "match_label", "style_tags" }],
  "query_description": string
}
```

### Supabase match-products edge function
`supabase/functions/match-products/index.ts` takes `render_embedding` (a pre-computed vector) and calls the `search_products_by_embedding` RPC. This is a **completely different code path** from `/api/match/route.ts`. Step 10 does NOT call this edge function. It is either a legacy path or unused in the current UI flow.

### lib/clipSearch.ts
`lib/clipSearch.ts` (`findMatchingProducts`) embeds a text search query via a `clipEmbedUrl` endpoint and then calls `search_products_by_embedding` or `search_products_by_fusion_embedding` RPC. This is also NOT called by `/api/match/route.ts`. It appears unused in the current step-10 matching flow — it's a standalone utility that was built but not wired in.

### Catalog source
Products come from the existing Supabase `products` table (5,581+ rows). There is no web search involved. `lib/clipSearch.ts` uses a pgvector RPC — not connected to step-10.

---

## 3. Fingerprint

### Fields in fingerprintStore (lib/store/fingerprint.ts)
```typescript
roomType: string | null
budgetTier: 'budget' | 'mid' | 'premium' | 'luxury' | null
budgetRange: [number, number] | null
quizResponses: QuizResponse[]
fingerprint: number[] | null
styleName: string | null
entryPath: 'pairs' | 'natural_language' | 'inspo_photo' | null
dimensions: 'small' | 'medium' | 'large' | null  // DEPRECATED/UNUSED
constraints: string[]
inclusions: string[]
roomLength: number | null
roomWidth: number | null
ceilingHeight: number | null
naturalLight: string | null
wallLayout: WallLayout | null
fixedElements: string[]
floorType: string | null
wallFinish: string | null
hasCloset: boolean
closetWall: string | null
```

### Fingerprint dimensionality
**10-dimensional.** All files agree: `flux.ts` comments, `quiz/fingerprint/route.ts` comment block, and `clip.ts`'s `fingerprintToStyleTags` (uses 6 dims but the vector is 10). The fingerprint order is: `luminosity, density, temperature, form, era, texture, scale, nature, saturation, materialOrigin`.

### Does fingerprint flow into the render prompt?
**Yes.** Step 7 passes `fingerprint_vector` to `/api/render`. The route calls `buildFluxPrompt(fingerprint_vector, ...)` in `lib/ai/flux.ts`, which maps all 10 dimensions to style descriptors and builds the positive/negative prompt.

**However**: `buildFluxPrompt` receives `roomContext` as an optional 5th argument in the function signature (line 54), but the call in `/api/render/route.ts` (line 68–74) does **NOT pass `roomContext`** — it only passes `fingerprint_vector, room_type, budget, inclusions, constraints`. Room dimensions, wall layout, floor type, etc., stored in fingerprintStore, are NOT passed to `buildFluxPrompt`.

Step 7 sends `dimensions` (the 'small'/'medium'/'large' enum, line 319) but `/api/render/route.ts` destructures the body and does NOT use `dimensions` at all — it's ignored server-side.

### Does fingerprint flow into product matching?
**Yes.** Step 10 passes `fingerprint_vector` to `/api/match`. The route uses `fingerprintToStyleTags()` from `lib/ai/clip.ts` to generate style tags and includes `fingerprintAlign` (30% weight) in the scoring formula.

---

## 4. Room Dimensions

### Does Step 5 collect room dimensions?
**No.** Step 5 (`step-5/page.tsx`) is the **capture step** — it handles photo upload and QR handoff. No dimensions are collected here.

Room dimensions (length, width, ceiling height, natural light, wall layout, floor type, wall finish, fixed elements) are collected in **Step 4** (`step-4/page.tsx`). Step 4 is the "room context" step with numeric inputs and the floor plan SVG drag-and-drop interface.

### Are dimensions stored in room store or fingerprint store?
Stored in **fingerprintStore** (`lib/store/fingerprint.ts`) via:
- `setRoomDimensions()` for length, width, ceilingHeight, naturalLight
- `setWallLayout()` for the wall layout
- `setFixedElements()` for fixed elements
- `setSurfaces()` for floorType, wallFinish

They are NOT stored in `useRoomStore` (`lib/store/room.ts`).

### Are dimensions passed to the render API?
**Partially and incorrectly.** Step 7 sends a `dimensions` field (line 319 of step-7/page.tsx) but this is the enum (`'small'/'medium'/'large'`), not the actual measurements. The actual `roomLength`, `roomWidth`, `ceilingHeight`, `naturalLight`, `wallLayout`, `fixedElements`, `floorType`, `wallFinish` from the store are **never sent** to `/api/render`. The API's `buildFluxPrompt()` has a `roomContext?: RoomPhysicalContext` parameter ready to receive them, but it's not wired up.

### Are dimensions used in product matching or fit scoring?
**No.** `/api/match/route.ts` does not accept or use any room dimension fields.

---

## 5. Keep/Remove

### keepMask shape
`KeepMaskItem[]` where each item is:
```typescript
{ type: string; bbox: [number, number, number, number]; confidence: number; keep: boolean | null; label: string }
```
`keep: null` = undecided, `keep: true` = keep, `keep: false` = remove.

### Does keep mask flow into the render API call?
**Yes, it is sent.** Step 7 passes `keep_mask: keepMask ?? null` (line 311).

**But `/api/render/route.ts` does NOT use it.** The route destructures the body (lines 52–64) and `keep_mask` is in the `RenderRequestBody` interface but is **not destructured, not used, not passed to `buildFluxPrompt`**. It is dead weight in the request.

### How is the inpainting mask generated?
It **isn't.** The web API has no inpainting mask generation. The Supabase `render-room` edge function (which uses `flux-depth-pro` + ControlNet) doesn't receive or use a keep mask either. There is no code in any web route that converts `keepMask` bounding boxes into an inpainting mask image.

The `/api/pipeline/redesign/route.ts` does pass `inpainting_mask_url` (line 73) to the Modal webhook — but this is a pre-existing URL stored on the room record, not generated from the keep mask in real time.

### Are kept items excluded from product matching in Step 10?
**Partially.** Step 10 (`step-10/page.tsx`, line 15–25) converts the keepMask into `DetectedItem[]` by filtering for `confidence >= 0.75`. It does NOT filter by `keep === false` — it shows hotspots for ALL items above the confidence threshold, regardless of whether the user marked them to keep or remove. Items the user wanted to keep are matched just as aggressively as removed items.

---

## 6. Store Conflicts

### Two store systems
- `apps/web/lib/store/` — 4 stores: `fingerprint.ts`, `room.ts`, `session.ts`, `refine.ts`. Re-exported via `lib/store/index.ts`.
- `apps/web/lib/stores/` — 2 stores: `roomStore.ts`, `userStore.ts`.

### Which one do step pages use?
All step pages (1–10) import from `@/lib/store` or `@/lib/store/room`, `@/lib/store/fingerprint`, etc. — they use the `lib/store/` system exclusively.

`lib/stores/roomStore.ts` and `lib/stores/userStore.ts` are **NOT imported by any step page**. They appear unused by the UI.

### Conflicts and duplications
`lib/stores/roomStore.ts` and `lib/store/room.ts` are **two different stores both named `useRoomStore`** but with completely different schemas:

- `lib/store/room.ts` (`useRoomStore`): tracks `roomId`, `originalPhotoUrl`, `depthMapUrl`, `renderUrl`, `keepMask`, `renderSessions`. **This is what step pages use.**
- `lib/stores/roomStore.ts` (`useRoomStore`): tracks `currentRoomId`, `splatUrl`, `redesignSplatUrl`, `processingStage`. **This appears unused by step pages.**

If any code accidentally imports from the wrong path, state will be silently missing.

`lib/stores/userStore.ts` (`useUserStore`): has `user` and `styleVector`. Unused by step pages (they use Supabase auth directly).

---

## 7. Edge Functions vs API Routes

### Render: which is actually called?
**`/api/render/route.ts` is called by step-7.** The Supabase `render-room` edge function is NOT called by any step page. It appears to be a legacy function from an earlier architecture. The edge function uses `flux-depth-pro` + ControlNet; the API route uses `flux-kontext-pro` + image editing. These are fundamentally different models.

### Match: which is actually called?
**`/api/match/route.ts` is called by step-10.** The Supabase `match-products` edge function is NOT called by any step page. It's also a different algorithm: the edge function takes a pre-computed `render_embedding` vector and calls the `search_products_by_embedding` RPC. The API route does CLIP embedding inline and uses a multi-factor ranking formula.

### Are the edge functions deployed and active?
The edge functions exist in `supabase/functions/` and per CLAUDE.md are frozen (except `chat-room`). They are presumably deployed but are not called by the current UI. They may be called by the Modal pipeline via webhooks, but there's no evidence in the scanned files that the step UI triggers them directly.

The `clip-embed` edge function uses HuggingFace (`HUGGINGFACE_API_TOKEN`) and requires `HUGGINGFACE_API_TOKEN` to be set in Supabase secrets — this variable does not appear in `apps/web/lib/env.ts` at all.

The `detect-furniture` edge function is for **3D furniture placement suggestions** (returns `{ catalog_id, position_x, position_y, rotation_y }`), NOT for the keep/remove detection flow. The keep/remove detection in step-6 uses `lib/ai/grounding.ts` via `/api/detect/route.ts` (Grounding DINO on Replicate).

---

## 8. Env Vars

### Variables declared in lib/env.ts
```
NEXT_PUBLIC_SUPABASE_URL       (required)
NEXT_PUBLIC_SUPABASE_ANON_KEY  (required)
SUPABASE_SERVICE_ROLE_KEY      (required, server-only)
REPLICATE_API_TOKEN            (required, server-only)
ANTHROPIC_API_KEY              (required, server-only)
NEXT_PUBLIC_POSTHOG_KEY        (optional)
SENTRY_DSN                     (optional, server-only)
AMAZON_AFFILIATE_TAG           (optional, server-only)
```

### Variables referenced in code but NOT in env.ts

The following are referenced in API route/lib code but not declared in `env.ts`, meaning they are never validated at startup:

| Variable | Used in |
|---|---|
| `MODAL_RENDER_ENDPOINT` | `lib/ai/modal.ts` (submitRenderJob) |
| `MODAL_STATUS_ENDPOINT` | `lib/ai/modal.ts` (pollRenderJob) |
| `PIPELINE_MODE` | `lib/pipelineConfig.ts` (getPipelineConfig) |
| `MARBLE_PIPELINE_WEBHOOK_URL` | `api/pipeline/start/route.ts` |
| `MARBLE_MULTI_IMAGE_WEBHOOK_URL` | `api/pipeline/start/route.ts` |
| `REDESIGN_PIPELINE_WEBHOOK_URL` | `api/pipeline/start/route.ts`, `api/pipeline/redesign/route.ts` |
| `FURNITURE_MATCHING_WEBHOOK_URL` | `api/pipeline/start/route.ts`, `api/pipeline/furniture-match/route.ts` |
| `DEPTH_VIDEO_WEBHOOK_URL` | `api/pipeline/start/route.ts` |
| `MARBLE_PLUS_WEBHOOK_URL` | `api/pipeline/start/route.ts` |
| `MARBLE_MINI_FINAL_WEBHOOK_URL` | `api/pipeline/start/route.ts` |
| `SUPABASE_JWT_SECRET` | (in CLAUDE.md env list but not in env.ts) |

Missing affiliate IDs that are referenced in `lib/affiliates.ts` but not declared in `env.ts`:
`ARTICLE_AFFILIATE_ID`, `CRATE_BARREL_AFFILIATE_ID`, `CB2_AFFILIATE_ID`, `WEST_ELM_AFFILIATE_ID`, `POTTERY_BARN_AFFILIATE_ID`, `RUGGABLE_AFFILIATE_ID`, `ONE_KINGS_LANE_AFFILIATE_ID`, `OVERSTOCK_AFFILIATE_ID`, `ETSY_AFFILIATE_ID`

### SERPER_API_KEY
Not found in env.ts, not found in any code file scanned. If it was added somewhere, it's not being read via `lib/env.ts` validation.

---

## 9. Step Navigation

| Step | Route | What it does | Navigates to |
|---|---|---|---|
| 1 | `/design/step-1` | Room type + budget selection | → step-2 |
| 2 | `/design/step-2` | 19-pair style quiz (calls `/api/quiz/fingerprint`) | → step-3 |
| 3 | `/design/step-3` | Style profile reveal + 3 FLUX render previews (calls `/api/render` × 3) | → step-4 (button at line 765 calls `router.push("/design/step-4")`) |
| 4 | `/design/step-4` | Room context: dimensions, surfaces, wall layout, constraints, must-haves | → step-5 |
| 5 | `/design/step-5` | Photo capture (upload/QR/mobile direct) | → step-6 (after photo upload + detection fires) |
| 6 | `/design/step-6` | Keep/Remove UI — shows detections, user marks items | → step-7 (CTA) |
| 7 | `/design/step-7` | Fires render → polls `/api/render/status` | → step-8 on complete |
| 8 | `/design/step-8` | Before/after reveal (full-screen image toggle + share) | → step-9 (via CTA, not visible in scanned portion) |
| 9 | `/design/step-9` | Refine panel — text input + style strength slider | → step-7 (refine/try again), step-10 (shop this look), step-1 (start over) |
| 10 | `/design/step-10` | Shop the look — product hotspots + buy links | End of flow |

**Incomplete steps:**
- **Step 3** fires 3 real FLUX renders in parallel on mount using stock photos (not the user's room). This is an expensive preview feature — each fires `/api/render`. The `budget` field passed in step-3's render call is `[500, 5000]` (hardcoded array, line 95), but `/api/render/route.ts` expects `budget` to be `'budget' | 'mid' | 'premium' | 'luxury'`. This is a **type mismatch** — the string enum is expected server-side.
- **Step 8** does not have a visible CTA to step-9 in the first 80 lines scanned. The navigation from step-8 → step-9 is likely via an off-screen button.
- **Step 5 navigation**: after upload completes, pushes to `/design/step-6`, not step-6 detection wait screen. But the detection is triggered asynchronously (`triggerDetection`) and step-6 must poll for it. This means the user can reach step-6 before detection is complete — step-6 has its own loading state to handle this.

---

## 10. Biggest Gaps

### Gap 1: Room dimensions collected but never reach the render
This is the most significant functional disconnect. Step 4 collects 10+ room context fields (dimensions, ceiling height, natural light, wall layout, floor type, wall finish, fixed elements). `buildFluxPrompt()` in `lib/ai/flux.ts` has a complete `RoomPhysicalContext` parameter that uses all of these. But the API route `/api/render/route.ts` never passes `roomContext` to `buildFluxPrompt`. All that context collection is wasted — the render prompt is generated without it. The spec explicitly says room context should be in the prompt.

### Gap 2: keep_mask is sent to /api/render but completely ignored
Step 7 sends `keep_mask` in the request body. The `RenderRequestBody` type declares it. But `/api/render/route.ts` never destructures or uses it — there is no inpainting mask generation, no keep/remove logic in the render. The user's keep/remove decisions have zero effect on the AI render output.

### Gap 3: Step 10 matches products against the full render image, not per-item crops
The spec (and CLAUDE.md) say product matching should use 6 cube face crops with Claude Vision detecting furniture on each. Instead, step-10 sends the entire redesigned render URL as `render_crop_url` for every item match. All `n` parallel match calls embed the same full-room image regardless of which item they're matching. This means all items will tend to surface similar products (dominated by the most visually prominent elements in the full render), and precision matching is not working as specified.

### Gap 4: Two parallel render architectures with no clear handoff
There are two completely separate render paths: (a) The step-7 → `/api/render` → Replicate `flux-kontext-pro` path for the 2D redesign flow, and (b) the `/api/pipeline/start` → webhooks → Modal + Marble + `supabase/functions/render-room` path for the full 3D pipeline. These are entirely disconnected. Step-7 never triggers the 3D pipeline. The 3D pipeline is triggered externally (from some other page/component not in this read list). There is no visible step page that calls `/api/pipeline/start`. If the full 3D redesign pipeline is supposed to be the primary track for M8, it's not wired to the step flow.

### Gap 5: lib/clipSearch.ts, lib/fluxKontext.ts and lib/ai/modal.ts are built but unconnected
- `lib/clipSearch.ts`'s `findMatchingProducts()` is not called anywhere in the step flow — it builds text-embedding-based CLIP search but `/api/match/route.ts` uses image embedding + direct Supabase query instead.
- `lib/fluxKontext.ts` (`runFluxKontext`) is not called anywhere in the step flow — `/api/render/route.ts` uses the Replicate SDK directly.
- `lib/ai/modal.ts` (`submitRenderJob`, `waitForRenderJob`) is not called by any step page or API route — the Modal render endpoint env vars are unset and the functions are disconnected dead code.
- `lib/stylePrompt.ts`'s `generateStylePrompt` (Claude-powered version) is not called in the render flow — `buildFluxPrompt` from `lib/ai/flux.ts` is used instead.
