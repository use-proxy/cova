# Pre-Session 10: Detection Pipeline Fix

**Date:** 2026-04-07
**Scope:** Targeted bug fixes only — no UI changes

---

## Fix 1: Per-Item SAM Masks → Removed (bbox fallback)

**Problem:** `getGroundedSamMaskUrl` ran once and returned a single combined mask for all furniture, attached identically to every detected item. A sofa and lamp had the same mask URL, making per-item highlighting meaningless.

**Fix:** Removed `getGroundedSamMaskUrl` function and `SAM_FURNITURE_PROMPT` constant entirely from `lib/ai/grounding.ts`. All items now return `mask_url: undefined`. The step-5 canvas compositing already has a bbox rectangle fallback for null maskUrl (gold `strokeRect` + `fillRect` at normalized bbox coordinates).

**Deferred:** Per-item SAM masks (calling SAM 2.1 with point prompts per bbox center) scheduled for Session 11.

---

## Fix 2: Depth Estimation

### Live model test output

```
Output type: object
Constructor: Object
Keys: [ 'color_depth', 'grey_depth' ]
  color_depth → FileOutput, .url() → URL { href: 'https://replicate.delivery/.../color.png' }
  grey_depth  → FileOutput, .url() → URL { href: 'https://replicate.delivery/.../grey.png' }
```

**Conclusion:** The existing `depth.ts` parsing logic was already correct — it checks `typeof .url === 'function'` and calls `.url().href`. The code did not need to change.

**Root cause of historical null depth_map_url:** Depth errors were fatal — if `estimateDepth` threw, the entire `Promise.all` in `detect/route.ts` rejected, nothing was written to the DB. The existing rooms with `keep_mask` but no `depth_map_url` were likely from runs where depth timed out or hit a transient Replicate error.

**Fix applied:** Wrapped `estimateDepth` in `.catch()` — depth failure is now non-fatal:
```typescript
estimateDepth(photo_url).catch((err: Error) => {
  console.error('[detect] Depth estimation failed (non-fatal):', err.message)
  return { depth_map_url: null, quality_score: 0 }
})
```
Also changed `DepthResult.depth_map_url: string → string | null` to match.

---

## Fix 3: Confidence Thresholds

**Context:** GroundingDINO with compound prompts consistently returns 0.3–0.6 confidence for furniture in real indoor photos. The spec's 0.75 threshold would show nothing.

| Parameter | Before | After |
|-----------|--------|-------|
| `box_threshold` | 0.28 | 0.25 |
| `text_threshold` | 0.22 | 0.20 |
| Filter (keep detections) | >= 0.35 | >= 0.30 |
| `showToUser` (shelf display) | >= 0.35 | >= 0.40 |
| Status route `showToUser` | >= 0.35 | >= 0.40 |

Applied to both `detectFurniture` and `detectArchitecture`.

---

## Live Detect API Verification

```
Status: 200
Detection count: 10
Depth map: PRESENT — https://replicate.delivery/yhqm/S0TmNP1...grey.png
Depth quality: 0.75

Sample detections:
  Sofa accent chair | conf: 0.55 | showToUser: true  | maskUrl: null
  Pillow            | conf: 0.47 | showToUser: true  | maskUrl: null
  Ceiling light     | conf: 0.41 | showToUser: true  | maskUrl: null
  Pillow            | conf: 0.41 | showToUser: true  | maskUrl: null
  Pillow            | conf: 0.31 | showToUser: false | maskUrl: null
```

All expected results confirmed:
- Detection count: 5-15 range ✅
- Depth map: PRESENT ✅
- maskUrl: null (bbox fallback in step-5) ✅
- showToUser correctly based on 0.40 threshold ✅

---

## Playwright

**72/72 passing** — full regression suite clean.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/ai/grounding.ts` | Removed SAM mask function + constant; updated all thresholds |
| `lib/ai/depth.ts` | `depth_map_url: string → string \| null` |
| `app/api/detect/route.ts` | Depth is now non-fatal (`.catch()` fallback) |
| `app/api/detect/status/route.ts` | `showToUser` threshold 0.35 → 0.40 |
