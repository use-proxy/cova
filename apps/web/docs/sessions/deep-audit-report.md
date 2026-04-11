# Cova Deep Audit Report — April 6, 2026

> Full line-by-line audit of every pipeline file. No code changes were made.
> Covers: capture → detection → keep/remove → render → product matching → shop UI.

---

## Section A: Data Flow Traces

### Trace 1 — Happy Path: Upload → Detection → Keep/Remove → Step-6 Hotspots

```
User selects photo (step-5)
  → handleConfirm()
    → POST /api/rooms/capture (FormData: photo + room_id)
      → sharp().rotate() [EXIF auto-rotation ✓]
      → upload to Supabase Storage → returns photo_url
      → setRoom(data.room_id), setPhotoUrl(data.photo_url)
    → triggerDetection(photo_url, room_id) [fire-and-forget, no await]
      → POST /api/detect  { photo_url, room_id }
        → Promise.all([
            withRetry(() => detectFurniture(photo_url)),   // grounding.ts
            withRetry(() => detectArchitecture(photo_url)),
            estimateDepth(photo_url),                      // depth.ts
          ])
        → detectFurniture:
            Promise.all([replicate.run(GroundingDINO), getImageDimensions(url)])
            → box_threshold: 0.20, text_threshold: 0.15
            → returns rawBbox [x1,y1,x2,y2] pixels
            → normalizeBbox(pixelBbox, imgW, imgH) → [x,y,w,h] fractions
            → post-filter: confidence >= 0.35 (return), >= 0.50 (showToUser)
        → admin.from('rooms').update({ depth_map_url, keep_mask })
        → returns { detections, depth_map_url, depth_quality }
  → setTimeout(1500ms) → router.push('/design/step-6')

Step-6 mounts:
  → if keepMask !== null: skip polling (back-nav case)
  → else: poll /api/detect/status?room_id every 2500ms (30s max)
    → GET /api/detect/status → SELECT depth_map_url, keep_mask FROM rooms
    → if both present: setKeepMask(data.detections) → stops poll
  → visibleDetections = keepMask.filter(d => d.confidence >= 0.35)
  → hotspot render:
      dotLeft = (item.bbox[0] + item.bbox[2] / 2) * container.w  ✓ fixed
      dotTop  = (item.bbox[1] + item.bbox[3] / 2) * container.h  ✓ fixed
  → user taps dots → toggleKeepItem(keep: true/false)
  → handleDesignRoom() → PATCH /api/rooms/:id { keep_mask } → router.push('/design/step-7')
```

**Data format invariant**: All bbox values are `[x,y,w,h]` normalized fractions (0–1) from this
point forward. This is now consistent across detection, step-6, step-10, and match API.

---

### Trace 2 — Fingerprint → Render Prompt → FLUX

```
Step-2 quiz completes:
  → POST /api/quiz/fingerprint { quiz_responses }
    → returns { fingerprint: number[10], style_name: string }
  → setFingerprint(fingerprint, style_name) → Zustand

Step-4 (room dimensions / wall layout):
  → navigateForward() at line 1092:
      setRoomDimensions({ length, width, ceilingHeight, naturalLight })
      setWallLayout(wallLayout)        [async fire-and-forget PATCH]
      setFixedElements(fixedElements)  [sync, before navigate]
      setSurfaces(floor, wall)         [sync]
      setCloset(hasCloset, wall)       [sync]
      setConstraints(constraints)      [async fire-and-forget PATCH]  ← RACE CONDITION
      setInclusions(inclusions)        [sync]
    → router.push('/design/step-5')  [fires before constraint PATCH resolves]

  "Skip for now" button (line ~1774):
    → only saves: dimensions + inclusions
    → MISSING: wallLayout, fixedElements, surfaces, constraints  ← DATA LOSS

Step-7 fires render:
  → POST /api/render {
      photo_url, fingerprint_vector, room_type, budget, inclusions, constraints,
      room_length, room_width, ceiling_height, natural_light,
      floor_type, wall_finish, fixed_elements, wall_layout,
      keep_mask, room_id, style_strength, refinement_text
    }
    → buildFluxPrompt(fingerprint, roomType, budgetTier, inclusions, constraints, roomContext, keptItems)
      → roomContext uses: floorType, wallFinish ONLY
      → ceiling_height: READ but NOT used in prompt  ← MISSING
      → room_length/width: READ but NOT used in prompt  ← MISSING
      → fixedElements: READ but NOT used in prompt  ← MISSING
      → wallLayout: READ but NOT used in prompt  ← MISSING
      → constraints: only 'I rent' handled  ← INCOMPLETE
      → inclusions capped at 3: inclusions.slice(0, 3)
    → if refinement_text: Claude modifies prompt (claude-sonnet-4-6)
    → if keep_mask has keep=true items → two-stage render (Kontext + Fill Pro)
    → returns { prediction_id }

Step-7 polls /api/render/status every 3s:
  → replicate.predictions.get(predictionId)
  → if two-stage: orchestrates Stage 2 via pipeline_cost_log JSON in rooms table
  → on complete: triggerRenderDetection(renderUrl, roomId, admin) [fire-and-forget]
  → setRenderUrl(renderUrl) → router.push('/design/step-8')
```

**Critical gap**: `ceiling_height` stored in Zustand as feet (step-4 `ceilingHeight` field),
but CLAUDE.md spec references `ceiling_height_inches`. No conversion anywhere. If the unit
mismatch is real (feet stored, inches expected), prompt context would be wrong.

---

### Trace 3 — Render Detection → Product Match → Shop UI

```
render/status/route.ts on render complete:
  → triggerRenderDetection(renderUrl, roomId, admin) [async, fire-and-forget]
    → detectFurniture(renderUrl)
    → preserves keep=true items from existing keep_mask
    → adds render detections with keep: null
    → admin.from('rooms').update({ keep_mask: mergedMask })

Step-10 mounts:
  → useEffect [roomId dep]: fetch fresh keep_mask from DB
    → if data.keep_mask.length > 0: setLocalKeepMask(data.keep_mask)
  → toDetectedItems(localKeepMask):
      filter confidence >= 0.30, keep !== true
      → id = label.toLowerCase().replace(/\s+/g, '-')
      → left = (bbox[0] + bbox[2] / 2) * 100  [% of image]
      → top  = (bbox[1] + bbox[3] / 2) * 100
  → fireAllMatches():
      for each detection: POST /api/match { render_url, item_id, item_label, item_bbox,
        fingerprint_vector, budget_range, room_type, room_id, primary_wall_usable_inches }
    → /api/match:
        cropAndUploadRenderRegion(render_url, bbox, room_id, item_id)
        → Claude Haiku Vision: describe item → itemDescription
        → buildSearchQuery → 2 Serper searches in parallel
        → batched CLIP call: [cropUrl, ...candidateImageUrls].join('\n')
        → cosineSimilarity(cropEmbed, candidateEmbed) >= 0.65
        → budgetScore = computeBudgetScore(price, itemBudgetRange)
        → fitResult = scoreFit(item_label, dims, primary_wall_usable_inches)
        → finalScore = 0.55*visual + 0.25*budget + 0.10*fit + 0.10*quality
        → returns top 5 products sorted by finalScore
    → POST /api/match/coherence { productsByItem, styleName, fingerprint, roomType, keptItemLabels }
      → Claude Haiku: coherenceScore + outlier identification
      → if outlier: swap to index 1
    → optimizeRoomSelection(products, budgetRange) → reorder by budget optimizer
    → setProductsByItem(optimizedByItem)
    → POST /api/match/accessories { styleName, fingerprint, roomType, budgetRange, primaryItemLabels }
      → 3 accessory searches via Serper
      → returns top 1 per category, match_score hardcoded 0.75
    → setAccessories(accessories)

ShopRoom renders:
  → hotspot dots at item.left%, item.top% on renderUrl image
  → bottom sheet: pill nav + product card carousel per item
  → accessories section below main products
```

---

## Section B: Bugs and Gaps

### B1 — CRITICAL: ceiling_height unit ambiguity

**File**: `apps/web/lib/store/fingerprint.ts:78` — `ceilingHeight: number | null`
**File**: `apps/web/app/design/step-4/page.tsx` — saves feet (e.g. "9" for 9 ft)
**File**: `apps/web/app/api/render/route.ts:118` — passes `ceiling_height` as-is
**File**: `apps/web/lib/ai/flux.ts:25` — type says `ceilingHeight?: number | null`, unused in prompt
**Severity**: Medium — currently no-op since ceiling_height isn't used in prompt, but when added it would be wrong units
**Impact**: When ceiling_height is eventually added to prompt: "9 ft" would be described as "9 inches"

---

### B2 — HIGH: buildFluxPrompt ignores ceiling_height, room_length, room_width, fixedElements, wallLayout

**File**: `apps/web/lib/ai/flux.ts:119–128`
**What happens**: `roomContext` is accepted but `contextParts` only uses `floorType` and `wallFinish`.
All other physical context is silently dropped before reaching the FLUX prompt.
**Severity**: High — step-4 data collection is largely wasted. Users who specify "TV stand on left wall"
or "9ft ceilings" get no benefit in the render.
**Specific missing fields**:

- `ceiling_height` → never included
- `roomLength`, `roomWidth` → never included
- `fixedElements` → never included (fireplace, built-in shelves, etc.)
- `wallLayout` → never included (window/door positions)

---

### B3 — HIGH: "Skip for now" button in step-4 loses wallLayout, fixedElements, surfaces, constraints

**File**: `apps/web/app/design/step-4/page.tsx` line ~1774
**What happens**: The skip handler only saves `dimensions` and `inclusions` to the store.
`wallLayout`, `fixedElements`, `floorType`, `wallFinish`, and `constraints` are never set.
**Severity**: High for users who skip step-4 — render prompt gets no physical context at all.
**Expected behavior**: Should at minimum call `setWallLayout(null)`, `setFixedElements([])`, etc. with defaults.

---

### B4 — HIGH: Constraint handling incomplete in buildFluxPrompt

**File**: `apps/web/lib/ai/flux.ts:109–111`
**What happens**: Only `'I rent'` constraint generates prompt text. All other constraints
(e.g. "No major furniture changes", "Working with existing HVAC layout", "No structural changes")
produce no effect.
**Severity**: High — other constraint values are silently ignored

---

### B5 — MEDIUM: detect/status returns depth_map_url but step-6 never reads it

**File**: `apps/web/app/api/detect/status/route.ts:51–55` — returns `{ ready: true, detections, depth_map_url }`
**File**: `apps/web/app/design/step-6/page.tsx:520–529` — poll handler calls `setKeepMask(data.detections)` only
**What happens**: `depth_map_url` is returned from the status API but the client never calls `setDepthMapUrl()`.
Step-7 uses `depthMapUrl` from store as visual display (the scanning animation). If the user starts at step-6
(not via direct upload path), step-7 will show the fallback AbstractGrid instead of the actual depth map.
**Severity**: Medium — UX degradation, not a functional failure

---

### B6 — MEDIUM: Race condition — constraints saved async before navigation

**File**: `apps/web/app/design/step-4/page.tsx` lines ~1100–1130
**What happens**: `setConstraints(constraints)` is called inside an async PATCH callback.
`router.push('/design/step-5')` fires synchronously. If the async save order matters (it does for
DB writes), the render may fire with stale constraints from the DB if step-4 data drives DB-side prompting.
**Current risk level**: Low for Zustand state (sync), but medium if any server-side path reads
constraints from DB rather than the POST body.

---

### B7 — MEDIUM: Synthetic item ID collision risk in step-10

**File**: `apps/web/app/design/step-10/page.tsx:38`

```typescript
id: item.label.toLowerCase().replace(/\s+/g, "-");
```

**What happens**: Two items with the same label (e.g. two chairs detected) produce identical IDs.
The second one overwrites the first in `productsByItem` Record since it's keyed by `id`.
**Severity**: Medium — causes silent product loss for duplicate-label detections

---

### B8 — MEDIUM: CLIP batch call slices at 20 candidates but serper fetches 20 (10+10) — off-by-one possible

**File**: `apps/web/app/api/match/route.ts:188–198`
`allUrls = [cropUrl, ...candidates.slice(0, 20).map(p => p.imageUrl)].join('\n')`
Then at line 245: `candidates.slice(0, 20).forEach(...)` — matching correctly.
The `candidates` array is deduplicated from two searches of 10 each → max 20 candidates.
**Status**: Not a bug — index arithmetic is correct (cropUrl at 0, candidates at 1-20). ✓

---

### B9 — LOW: depth model has no version hash — uses "latest"

**File**: `apps/web/lib/ai/depth.ts`

```typescript
"depth-anything/depth-anything-v2-large"; // no :version_hash
```

**What happens**: Replicate resolves to the latest published version. If the model author
publishes a breaking version, behavior changes silently.
**Severity**: Low — depth map is only a visual, not functional

---

### B10 — LOW: render_sessions iteration hardcoded to 1

**File**: `apps/web/app/api/render/status/route.ts:242` and `:318`

```typescript
iteration: 1,
```

**What happens**: Every render session is stored as iteration 1 regardless of how many
re-renders the user has done. The `currentRenderIteration` counter in room store is
incremented correctly client-side, but the DB record doesn't reflect it.
**Severity**: Low — analytics gap, not functional

---

### B11 — LOW: Step-9 "Refine My Design" disabled when slider is at default (70) but no text

**File**: `apps/web/app/design/step-9/page.tsx:82`

```typescript
const isRefineDisabled = inputValue.trim().length === 0 && sliderValue === 70;
```

**What happens**: If the user changes the slider from 70 to any other value, they can submit
with empty text. `refinementText` will be `null` (step-9 sets `setRefinement(inputValue.trim() || null, ...)`)
and the render route skips Claude modification. This is correct behavior — just noting it.
**Status**: Correct behavior ✓

---

### B12 — LOW: Step-5 detection fire-and-forget doesn't handle QR path consistently

**File**: `apps/web/app/design/step-5/page.tsx:94–108` (handlePhotoReceivedFromQR)
**What happens**: QR path calls `triggerDetection(photoUrl, currentRoomId)` correctly,
but only if `currentRoomId` is set. If the room creation async call (line 63) hasn't completed
yet when QR completes, `currentRoomId` is null and detection is never triggered.
**Severity**: Low — QR path may silently skip detection, requiring polling fallback to time out.

---

### B13 — LOW: accessories match_score hardcoded to 0.75

**File**: `apps/web/app/api/match/accessories/route.ts`
**What happens**: All accessories return `match_score: 0.75` regardless of actual fit.
**Severity**: Low — cosmetic, but misleads users about accessory relevance

---

### B14 — LOW: ShopRoom activeTab initialized to `detections[0]?.id ?? ''`

**File**: `apps/web/components/cova/ShopRoom.tsx:268`
**What happens**: If detections change after mount (e.g. render detection adds items),
the `activeTab` state is stale and never updates because the initial `useState` only runs once.
The secondary `useEffect` on line 279 catches this: `if (!activeTab && detections.length > 0)`.
But if `activeTab` was already set to `''` (empty string), that condition never fires.
**Severity**: Low — mitigated by the sync useEffect, but relies on `''` being falsy

---

## Section C: Missing Integration Checklist

| Integration                               | Status     | Gap                                                     |
| ----------------------------------------- | ---------- | ------------------------------------------------------- |
| GroundingDINO bbox normalization          | ✅ Fixed   | —                                                       |
| Step-6 hotspot positioning                | ✅ Fixed   | —                                                       |
| Step-10 confidence filter (0.30)          | ✅ Fixed   | —                                                       |
| CLIP threshold (0.65)                     | ✅ Fixed   | —                                                       |
| Render-based re-detection                 | ✅ Added   | —                                                       |
| depth_map_url propagation via step-6 poll | ❌ Missing | setDepthMapUrl never called in step-6 poll handler (B5) |
| ceiling_height in FLUX prompt             | ❌ Missing | Collected but never reaches prompt (B1, B2)             |
| room dimensions in FLUX prompt            | ❌ Missing | Collected but never reaches prompt (B2)                 |
| fixedElements in FLUX prompt              | ❌ Missing | Collected but never reaches prompt (B2)                 |
| wallLayout in FLUX prompt                 | ❌ Missing | Collected but never reaches prompt (B2)                 |
| Full constraint handling                  | ❌ Partial | Only 'I rent' handled (B4)                              |
| Skip button saves all fields              | ❌ Missing | Loses wallLayout, surfaces, constraints (B3)            |
| Duplicate item ID deduplication           | ❌ Missing | Same label → same ID → product overwrite (B7)           |
| render_sessions iteration counter         | ❌ Wrong   | Always 1 (B10)                                          |
| depth model version pin                   | ❌ Missing | No hash → uses latest (B9)                              |
| QR path room_id guard                     | ❌ Partial | Detection skipped if room creation is slow (B12)        |

---

## Section D: Optimization Gaps

### D1 — Claude Vision prompt could be tighter

**File**: `apps/web/app/api/match/route.ts:133–145`
The current prompt asks for "a single search-optimized phrase under 15 words" but the example
shows 9 words. Claude Haiku sometimes returns more verbose descriptions. No length enforcement.
**Opportunity**: Add explicit truncation: `itemDescription = itemDescription.split(' ').slice(0, 12).join(' ')`

### D2 — CLIP batch call wastes a slot on zero-price products

**File**: `apps/web/lib/ai/serper.ts:94`
Serper filter `p.price > 0` runs AFTER the batch call builds the URL list. Products with
price=0 are excluded from candidates array before CLIP call, so this is fine.
**Status**: No issue ✓

### D3 — No caching of CLIP embeddings for the same render_url + item_bbox

Each call to `/api/match` crops and embeds the same render region from scratch. If the user
hits "Refresh" on an item, a new crop + new CLIP call fires.
**Opportunity**: Cache crop upload URL and embedding in Supabase by `(room_id, item_id)`.
Not critical for M8 but worth noting for cost optimization.

### D4 — Rate limit in-memory only (restarts on server restart)

**File**: `apps/web/lib/rateLimit.ts` (inferred from usage)
In-memory rate limit map resets on Vercel cold starts. No distributed rate limiting.
**Severity**: Low for current traffic, but worth noting before public launch.

### D5 — Step-7 timeout is 90s but FLUX Kontext typically takes 15-30s

**File**: `apps/web/app/design/step-7/page.tsx:302–309`
Two-stage renders (Kontext + Fill Pro) take ~45-60s. 90s should be sufficient, but there's
no user feedback about the two-stage nature.
**Opportunity**: Show different copy for two-stage renders ("Preserving your items...").

### D6 — Poll interval in step-6 is 2500ms but step-7 is 3000ms — inconsistency

**File**: `apps/web/app/design/step-6/page.tsx:501` — 2500ms
**File**: `apps/web/app/design/step-7/page.tsx:363` — 3000ms
Not a bug, but inconsistent. Step-6 detection is faster so 2500ms is appropriate.

### D7 — Accessories endpoint runs sequentially after products in the zero-detection path

**File**: `apps/web/app/design/step-10/page.tsx:165–186`
In the zero-detection fallback, the accessories POST fires after `setIsLoadingProducts(false)`.
In the normal path (line 289–309), accessories also run after products are shown. This is correct
UX (show products first). No issue.

### D8 — Serper deduplication is by productUrl only — same product on different URLs appears twice

**File**: `apps/web/app/api/match/route.ts:165–174`
Amazon sometimes has the same product at multiple URLs (e.g. with/without affiliate params).
**Opportunity**: Also deduplicate by normalized title similarity.

---

## Section E: Prioritized Fix List

### Priority 1 — Fix Now (before any demo)

| #   | Fix                                                                                                                          | File                    | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------ |
| E1  | **depth_map_url not set from step-6 poll** — add `setDepthMapUrl(data.depth_map_url)` in poll handler                        | `step-6/page.tsx:522`   | 2 min  |
| E2  | **Duplicate detection item IDs** — append bbox to ID: `` `${label}-${Math.round(bbox[0]*100)}-${Math.round(bbox[1]*100)}` `` | `step-10/page.tsx:38`   | 5 min  |
| E3  | **Skip button loses all physical context** — save defaults for all fields in skip handler                                    | `step-4/page.tsx:~1774` | 15 min |

### Priority 2 — Fix Before M9

| #   | Fix                                                                                  | File                             | Effort |
| --- | ------------------------------------------------------------------------------------ | -------------------------------- | ------ |
| E4  | **Add ceiling_height to FLUX prompt** — "high ceilings" / "low ceilings" phrase      | `flux.ts:119`                    | 15 min |
| E5  | **Add fixedElements to FLUX prompt** — "Keep existing: fireplace, built-in shelves." | `flux.ts:119`                    | 10 min |
| E6  | **Expand constraint handling** — map all constraint strings to prompt text           | `flux.ts:109`                    | 20 min |
| E7  | **Pin depth model version hash** — prevents silent breakage from upstream updates    | `depth.ts`                       | 5 min  |
| E8  | **Fix render_sessions iteration** — use `currentRenderIteration` from store          | `render/status/route.ts:242,318` | 10 min |

### Priority 3 — Fix Before Public Launch

| #   | Fix                                                                              | File                 | Effort |
| --- | -------------------------------------------------------------------------------- | -------------------- | ------ |
| E9  | **QR path room_id guard** — wait for room creation before navigating to QR       | `step-5/page.tsx:94` | 30 min |
| E10 | **Add room dimensions to prompt** — "X×Y foot room" for furniture scale          | `flux.ts:119`        | 10 min |
| E11 | **Resolve ceiling_height unit** — confirm ft vs inches, add conversion if needed | `step-4, flux.ts`    | 15 min |
| E12 | **Distribute rate limiting** — use Supabase/Redis for persistent limits          | `lib/rateLimit.ts`   | 2 hrs  |

### Priority 4 — Nice to Have

| #   | Fix                                                             | File                         | Effort |
| --- | --------------------------------------------------------------- | ---------------------------- | ------ |
| E13 | CLIP embedding cache per `(room_id, item_id)`                   | `match/route.ts`             | 3 hrs  |
| E14 | Claude Vision description length cap                            | `match/route.ts:148`         | 5 min  |
| E15 | Accessories match_score based on CLIP instead of hardcoded 0.75 | `match/accessories/route.ts` | 1 hr   |
| E16 | Serper title-based deduplication                                | `match/route.ts:165`         | 30 min |

---

## Summary Statistics

- **Total files read**: 23
- **Critical bugs**: 0 (all blocking bugs fixed in session 1)
- **High severity**: 4 (B2, B3, B4 + implicit B1 when prompt uses it)
- **Medium severity**: 3 (B5, B6, B7)
- **Low severity**: 7 (B9–B14)
- **Missing integrations**: 9 of 16 checklist items incomplete
- **Optimization opportunities**: 8 identified

The pipeline is functional end-to-end. The highest-value fix is **E4+E5+E6** (buildFluxPrompt
using collected physical context) — this directly improves render quality and makes step-4's
data collection meaningful. The detection → hotspot → product match chain is solid.
