# Master Pipeline Fix — April 6, 2026

## Summary

Fixed the complete Cova pipeline from detection through product matching. The pipeline was broken at the detection stage, causing all downstream stages to fail.

---

## Stage 1: Detection System

### Root Bug 1: Wrong bbox coordinate format
**What was broken:** GroundingDINO returns bounding boxes as absolute pixel coordinates `[x1, y1, x2, y2]`. The downstream code (step-6 hotspots, step-10 hotspots, inpainting masks, render crop) all expected normalized fractions `[x, y, w, h]` (0–1).

**What was fixed:** `grounding.ts` now fetches image dimensions via a Range-limited HTTP request (reads only first 64KB to parse JPEG/PNG header), then normalizes the bbox before returning.

**Code:** `lib/ai/grounding.ts` — `getImageDimensions()` + `normalizeBbox()` functions.

### Root Bug 2: Detection thresholds too high
**What was broken:** `box_threshold: 0.3, text_threshold: 0.3` in grounding.ts, plus a post-filter of `confidence >= 0.50`. On the real room photo, only 2 items passed the showToUser filter (0.60). With 0.20/0.15 thresholds and 0.35 post-filter, 10 items are detected.

**What was fixed:**
- `box_threshold` → 0.20
- `text_threshold` → 0.15
- Post-filter: `confidence >= 0.35` (return), `confidence >= 0.50` (showToUser)

### Test Results
- Unsplash living room photo: sofa (0.75), curtain (0.26) — model confirmed working
- Real room photo (4284×5712): 10 items detected
  - curtain (0.65), chair (0.80), dresser/nightstand (0.52), lamp (0.38), pillow×2, blanket, bed, bed blanket, bookshelf
- Bbox center positions verified: (18%,39%) through (91%,67%) — all within valid range

---

## Stage 2: EXIF Rotation

**Status:** Already fixed in previous session. `apps/web/app/api/rooms/capture/route.ts` correctly calls `sharp().rotate()` before upload. `imageOrientation: 'from-image'` CSS is applied in step-8 (both before/after images).

---

## Stage 3: Step-6 Hotspot Positioning

### Bug: Hotspot calculation assumed pixel bbox
**What was broken:**
```typescript
// Old (wrong — divides fractional value by natural image width):
dotLeft = ((item.bbox[0] + item.bbox[2] / 2) / natural.w) * container.w
```

With fractional bbox values, dividing by `natural.w` (e.g. 4284px) gives near-zero — all dots pile up at top-left.

**What was fixed:**
```typescript
// New (correct for fractional [x, y, w, h]):
dotLeft = (item.bbox[0] + item.bbox[2] / 2) * container.w
dotTop = (item.bbox[1] + item.bbox[3] / 2) * container.h
```

Also removed `imageDimensions.natural.w > 0` from the render condition since natural dimensions are no longer needed for dot placement.

### Bug: Confidence filter too high
Step-6 filtered `confidence >= 0.60` — only shows 2 items on most photos. Changed to `0.35`.

---

## Stage 4: Render-Based Detection (Hotspots for Step-10)

### Problem: If original photo detection fails, step-10 has no hotspots
The render is a clean AI image — GroundingDINO gets better detections on it. After render completes, we now re-run detection on the rendered image and merge with user's keep=true choices.

**What was added:** `render/status/route.ts` now calls `triggerRenderDetection()` asynchronously (fire-and-forget) after both single-stage and two-stage renders complete. This:
1. Runs `detectFurniture()` on the rendered URL
2. Preserves user's `keep=true` selections from original photo
3. Adds render-detected items with `keep: null` (undecided)
4. Writes merged mask back to `rooms.keep_mask`

**Step-10 update:** On mount, fetches fresh `keep_mask` from DB (render detection may have completed). If more items arrive after initial product match fire, it re-fires the match API.

---

## Stage 5: Product Matching

### Bug: CLIP threshold too strict
**What was broken:** `CLIP_THRESHOLD = 0.70` in `match/route.ts`. CLAUDE.md spec says 0.65 to maximize hotspot coverage.

**What was fixed:** Changed to `0.65`.

### Step-10 confidence filter
**What was broken:** `item.confidence >= 0.60` filtered out most detected items.  
**What was fixed:** Changed to `0.30`.

---

## Stage 6: Build Fix

### Pre-existing: step-3 useSearchParams without Suspense
**What was fixed:** Renamed `Step3Page` to `Step3PageInner`, added Suspense wrapper as default export. Required by Next.js 14 for static generation compatibility.

---

## Test Results

| Check | Result |
|-------|--------|
| GroundingDINO model (Unsplash photo) | ✓ Returns detections |
| GroundingDINO on real room photo | ✓ 10 items at 0.35 threshold |
| Image dimension parsing | ✓ 4284×5712 correctly read |
| Bbox normalization | ✓ Centers in valid 0-100% range |
| Serper shopping API | ✓ 40 results for test query |
| TypeScript: `npx tsc --noEmit` | ✓ Zero errors |
| Next.js build: `npm run build` | ✓ Passes |

---

## Files Modified

| File | Change |
|------|--------|
| `lib/ai/grounding.ts` | Rewritten: normalize bbox, lower thresholds, expanded prompts |
| `app/design/step-6/page.tsx` | Fix hotspot positioning, lower confidence filter to 0.35 |
| `app/design/step-10/page.tsx` | Lower confidence filter to 0.30, fetch fresh DB data on mount |
| `app/api/match/route.ts` | Lower CLIP threshold from 0.70 → 0.65 |
| `app/api/render/status/route.ts` | Add async render-based re-detection after render completes |
| `app/design/step-3/page.tsx` | Wrap in Suspense to fix build error |

---

## Known Remaining Issues

- `/api/chat/history` triggers `DYNAMIC_SERVER_USAGE` during build (uses `request.url` for GET params). Non-critical — doesn't affect runtime.
- Render detection runs async after the render status polling cycle ends; step-10's fresh DB fetch may not see the new detections if the user loads step-10 very quickly after render completion. Second visit to step-10 will always have the data.
