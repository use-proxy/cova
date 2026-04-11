# Three Bug Fixes Session

## Bug 1: Quiz fingerprint always returns 400

**Root cause:** `completeQuiz(responses)` is called from the "Neither — skip" button handler when `currentPair + 1 >= TOTAL_PAIRS`. If the user skips all 19 pairs, `responses` state is `[]`, the fingerprint API receives `responses: []` and returns 400.

**Fix:** Added an early return guard at the start of `completeQuiz`'s try block:

```typescript
if (finalResponses.length === 0) return;
```

The `return` exits the try block, the `finally` block still runs (`setStep(4); router.push('/design/step-4')`), so navigation always happens. The fingerprint API is never called with empty data.

**File:** `app/design/step-3/page.tsx` line ~43

---

## Bug 2A: Duplicate words in detection labels

**Root cause:** GroundingDINO matches multiple prompt tokens simultaneously. The prompt includes both `pillow` and `throw pillow`, so detections can come back as "pillow pillow" or "curtain curtains blinds". `grounding.ts` used raw labels without any cleanup.

**Fix:** Added `cleanLabel()` to `grounding.ts`:

1. Lowercase + split on whitespace
2. Deduplicate words (case-insensitive, keep first occurrence)
3. Re-capitalize first word
4. Join

Examples: `"pillow pillow"` → `"Pillow"`, `"curtain curtains blinds"` → `"Curtain blinds"`

Applied to both `detectFurniture` and `detectArchitecture` label mappings.

**File:** `lib/ai/grounding.ts`

---

## Bug 2B: Duplicate React keys and bounding-box collisions

**Root cause 1 — Key collisions:** `dotId()` only used `bbox[0]` and `bbox[1]` with `.toFixed(0)` (integer rounding). Normalized coordinates like 0.123 and 0.456 both round to 0, making many different items produce identical IDs.

**Fix:** Updated `dotId()` to use all four bbox values with `.toFixed(4)`:

```typescript
function dotId(item: KeepMaskItem): string {
  return `${item.label}-${bbox[0].toFixed(4)}-${bbox[1].toFixed(4)}-${bbox[2].toFixed(4)}-${bbox[3].toFixed(4)}`;
}
```

React keys in both dots and list items now include the list index as a suffix: `key={\`${id}-${idx}\`}`.

**Root cause 2 — Missing IoU dedup:** GroundingDINO can return multiple overlapping boxes for the same object. No deduplication existed.

**Fix:** Added `computeIoU()` + `deduplicateByIoU()` to `grounding.ts`. Sorts by confidence descending, keeps highest-confidence detection when any two boxes have IoU > 0.85. Applied to both furniture and architecture detections.

**Files:** `lib/ai/grounding.ts`, `app/design/step-6/page.tsx`

---

## Bug 3: SAM mask format failure in inpainting

**Root cause:** `downloadAndDecodeMaskPng` manually parsed raw PNG bytes and rejected anything that didn't start with the PNG magic bytes (`89 50 4E 47 0D 0A 1A 0A`). Replicate's CDN can serve the mask as WebP or JPEG depending on request headers, causing the PNG check to fail silently → bbox fallback → incorrect two-stage render.

**Fix:** Replaced the 70-line manual PNG parser with a 10-line `sharp`-based decoder:

```typescript
async function downloadAndDecodeMask(maskUrl, targetWidth, targetHeight) {
  const res = await fetch(maskUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { data } = await sharp(buffer)
    .resize(targetWidth, targetHeight, { kernel: "nearest" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}
```

`sharp` handles PNG, JPEG, WebP, TIFF, and any other format it supports. Removed `inflateSync` import (no longer needed).

**File:** `lib/ai/inpainting.ts`

---

## Verification

- `npx tsc --noEmit` → 0 errors
- `npm run build` → passes, 0 errors
- `npx playwright test tests/e2e/render-pipeline.spec.ts` → both tests pass (run separately)
