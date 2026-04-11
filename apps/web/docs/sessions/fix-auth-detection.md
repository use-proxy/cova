# Fix: Auth on Detect API, Confidence Thresholds, QR Code

Date: 2026-04-05

## Problems Fixed

### FIX 1 — detect API missing credentials

**File:** `app/design/step-5/page.tsx:353`
**Problem:** `triggerDetection()` called `fetch('/api/detect')` without `credentials: 'include'`, so the auth cookie was never forwarded. The detect route checked for a valid Supabase session and returned 401, resulting in zero furniture detected, zero hotspots in step-6 and step-10.
**Fix:** Added `credentials: 'include'` to the fetch options.

### FIX 2 — confidence thresholds too high

**File:** `lib/ai/grounding.ts`
**Problem:** Grounding DINO was called with `box_threshold: 0.7` and `text_threshold: 0.7`, then results were filtered again at `>= 0.7`. `showToUser` was gated at `>= 0.85`. This was eliminating most real detections.
**Fix:**

- Replicate call: `box_threshold: 0.3`, `text_threshold: 0.3`
- Post-call filter: `>= 0.50` (return everything reasonable)
- `showToUser`: `>= 0.60`

**File:** `app/design/step-6/page.tsx:520`
**Problem:** `visibleDetections` filtered at `>= 0.85` — showed almost nothing in the keep/remove UI.
**Fix:** Lowered to `>= 0.60`.

**File:** `app/design/step-10/page.tsx:36`
**Problem:** `toDetectedItems` filtered at `>= 0.75` — excluded many real furniture items from hotspots.
**Fix:** Lowered to `>= 0.60`.

### FIX 3 — wall art and architecture labels missing

**File:** `lib/ai/grounding.ts`
**Problem:** `FURNITURE_LABELS` lacked floor lamp, table lamp, ceiling light, wall art, painting, picture frame, wall decoration, side table, etc. `ARCHITECTURE_LABELS` lacked wall color, window treatment, curtain, blind, crown molding, etc.
**Fix:** Expanded both label lists comprehensively.

### FIX 4 — QR code generation required auth (401 at step-5)

**File:** `app/api/capture/generate-token/route.ts`
**Problem:** The route called `supabase.auth.getUser()` and returned 401 if no session. Step-5 is an open route (not protected by middleware), so unauthenticated users couldn't generate a QR code.
**Fix:** Removed auth requirement. The route now generates a signed JWT with just `roomId` and no session check. Security boundary remains: the token must still be validated by `/api/capture/validate-token` before any upload is accepted (Hard Rule 10 preserved).

## Acceptance Criteria Status

| Criteria                                                    | Status |
| ----------------------------------------------------------- | ------ |
| `npm run build` passes                                      | ✅     |
| All `fetch('/api/detect')` include `credentials: 'include'` | ✅     |
| Furniture detection returns items with confidence >= 0.50   | ✅     |
| Keep/Remove screen shows items with confidence >= 0.60      | ✅     |
| Step-10 hotspots show items with confidence >= 0.60         | ✅     |
| Wall art, mirrors, curtains included in detection prompts   | ✅     |
| QR code appears on desktop capture screen                   | ✅     |
| `/api/capture/generate-token` works without auth            | ✅     |
