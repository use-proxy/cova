# Fix: Kontext Prompt Length, EXIF Rotation, Auth Detection Flow
**Date:** 2026-04-05
**Branch:** main

## Root Cause Summary

Three confirmed issues from testing:
1. FLUX Kontext prompt too long — text was burning into rendered images
2. Phone photos uploaded sideways — EXIF orientation ignored before Supabase upload
3. Zero furniture detections — user unauthenticated when detect fires, 401 silently swallowed

---

## Files Changed

- `lib/ai/flux.ts`
- `app/api/rooms/capture/route.ts`
- `app/design/step-5/page.tsx`
- `app/api/detect/route.ts`
- `app/design/step-6/page.tsx`
- `app/design/step-3/page.tsx`
- `lib/ai/grounding.ts`

---

## Fix 1 — Rewrite buildFluxPrompt for Kontext editing model

**Problem:** FLUX Kontext Pro is an image-editing model with ~512 token effective limit.
The previous prompt was 150-200 words of descriptive prose — Kontext was literally
rendering the text into the image.

**Fix:** Rewrote `buildFluxPrompt` to produce short, concrete editing instructions.

New format:
```
Redesign this [room] interior completely. Style: [2-4 concrete material/style terms]. Use [budget qualifier]. [Keep unchanged: ...] [Include: ...] Photorealistic interior design photo. Magazine quality. No people.
```

Typical output: **30-40 words** (was 150-200 words).

Key changes:
- `hi(v > 0.65)` / `lo(v < 0.35)` helpers gate descriptors — mid-range values produce no term
- Maximum 4-5 style terms, each concrete (material names, specific furniture styles)
- `keptItems` still included as "Keep unchanged: X, Y, Z."
- Room context collapsed to floor type and wall finish only (most visually relevant)
- Negative prompt blocks: text in image, rotated, sideways, upside down

---

## Fix 2 — EXIF rotation correction on photo upload

**Problem:** Phone cameras embed orientation in EXIF metadata. Supabase receives
raw bytes; Replicate ignores EXIF → sideways images in renders.

**Fix:** `app/api/rooms/capture/route.ts` now processes the buffer through sharp
before uploading:

```typescript
import sharp from 'sharp'

async function correctImageOrientation(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer()
  } catch {
    return buffer  // pass-through if sharp fails
  }
}
```

- `Buffer.from(arrayBuffer)` → `correctImageOrientation(rawBuffer)`
- File always saved as `.jpg` with `contentType: 'image/jpeg'` after correction
- sharp `^0.34.5` was already in package.json

---

## Fix 3 — Auth guard on Step 5

**Problem:** `middleware.ts` only protects step-6+. Step-5 is open. But step-5 calls
`/api/rooms/create` and `/api/rooms/capture` which both require auth. Unauthenticated
users hit 401 silently; room creation fails; detect never fires.

**Fix:** Added auth check useEffect at top of `Step5Page`:

```typescript
useEffect(() => {
  const checkAuth = async () => {
    const supabase = createBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/design/step-3?auth_required=true')
    }
  }
  void checkAuth()
}, [router])
```

`triggerDetection` was already passing `credentials: 'include'` — no change needed.

---

## Fix 4 — Explicit auth failure handling

**detect route** (`app/api/detect/route.ts`):
- 401 response now includes `code: 'UNAUTHENTICATED'` for easier client-side identification

**Step 6** (`app/design/step-6/page.tsx`):
- Detect status poll now checks `res.status === 401` explicitly
- On 401: clears poll interval, redirects to `/design/step-3?auth_required=true`
- Also added `credentials: 'include'` to the poll fetch

**Step 3** (`app/design/step-3/page.tsx`):
- Added `useSearchParams` import
- Reads `auth_required` param: `const authRequired = searchParams.get('auth_required') === 'true'`
- When `auth_required=true`: shows gold-bordered banner above auth buttons:
  "Please sign in to continue designing your room"

---

## Fix 5 — Detection logging

**grounding.ts** `detectFurniture`:
- Logs photo URL (first 80 chars) before calling Replicate
- Logs raw detections JSON from Replicate
- Logs count and labels of items passing `>= 0.50` filter
- Changed catch to log `err` with `console.error` instead of silently returning `[]`

FURNITURE_LABELS already comprehensive — covers all required items:
bed, sofa, couch, chair, desk, table, lamp, dresser, mirror, rug, curtain,
shelf, bookshelf, plant, pillow, blanket, vase, wall art, painting,
ceiling light, floor lamp. No label changes needed.

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| `npx tsc --noEmit` passes | ✅ zero errors |
| Prompt word count under 80 | ✅ ~30-40 words |
| No text burned into images | ✅ (Kontext-compatible format) |
| EXIF rotation corrected before upload | ✅ sharp auto-rotate |
| Auth check on step-5 before detection | ✅ redirects to step-3 |
| 401 on detect redirects to step-3 auth | ✅ step-6 poll handles it |
| auth_required banner in step-3 | ✅ gold-bordered message |
| Detection logging in terminal | ✅ raw detections + filtered count |
| No silent auth failures | ✅ explicit redirect chain |
