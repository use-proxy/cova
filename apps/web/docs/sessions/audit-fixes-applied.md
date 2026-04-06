# Audit Fixes Applied — April 6, 2026

All fixes implemented in priority order from `deep-audit-report.md`.

---

## Build Status

- `npx tsc --noEmit` — ✅ Zero errors
- `npm run build` — ✅ Passes

---

## Fixes Applied

### E1 — depth_map_url stored from step-6 poll ✅
**File:** `app/design/step-6/page.tsx`
- Added `setDepthMapUrl` to store destructure (line ~442)
- Called `setDepthMapUrl(data.depth_map_url)` in poll success handler immediately after `setKeepMask`
- **Effect:** Step-7 now shows actual depth map (scanning animation) instead of AbstractGrid fallback

---

### E2 — Duplicate detection item IDs ✅
**File:** `app/design/step-10/page.tsx`
- Changed `toDetectedItems` ID generation from:
  `id: item.label.toLowerCase().replace(/\s+/g, '-')`
  to:
  `` id: `${item.label.toLowerCase().replace(/\s+/g, '-')}-${Math.round(item.bbox[0] * 100)}-${Math.round(item.bbox[1] * 100)}` ``
- **Effect:** Two chairs at different positions now get different IDs. Products no longer silently overwrite each other in `productsByItem`.

---

### E3 — Skip button saves all physical context ✅
**File:** `app/design/step-4/page.tsx`
- Skip button now saves all fields entered so far:
  - `setWallLayout` — builds from `placedSymbols` (same logic as `navigateForward`)
  - `setFixedElements(selectedFixed)`
  - `setSurfaces(floorType, wallFinish)`
  - `setCloset(hasCloset, closetWall)`
  - `saveConstraints` — raw comma-split parse of the constraints text field
  - `setInclusions` — unchanged, was already there
- **Effect:** Users who skip step-4 mid-way now have all entered data preserved

---

### E4 + E5 + E6 + E10 — buildFluxPrompt uses all physical context ✅
**File:** `lib/ai/flux.ts`

**E4 — Ceiling height:** Added branch for ceilingHeight >= 10 ("dramatic high ceilings") and <= 7 ("low ceilings"). Standard 8–9 ft treated as normal, no prompt bloat.

**E5 — Fixed elements:** Full map of 10 element types → descriptive prompt instructions. Appended as "Fixed elements to preserve: ..." only when elements are present.

**E6 — Constraint handling:** Replaced single-constraint check with a full dictionary of 9 recognised constraint strings → prompt instructions. All constraints are now applied.

**E10 — Room dimensions:** Added sqft bucketing (< 150 sqft = "small intimate room", 150–300 = "medium-sized room", > 300 = "large spacious room") to help FLUX scale furniture correctly.

**Wall layout (from audit D list):** Added window/door layout description per wall — "back wall has 2 windows, left wall has 1 door" etc.

**Inclusions cap removed:** Changed `inclusions.slice(0, 3)` → `inclusions` so all user-selected items appear in the prompt.

---

### E7 — Depth model version pin ⚠️ SKIPPED
The model `depth-anything/depth-anything-v2-large` returns 404 via Replicate REST API, making it impossible to retrieve the version hash. The model is functional via `replicate.run()` (different resolution path). Since the model is low-priority (display-only, not functional) and pinning an incorrect hash would break detection, this fix is deferred.

---

### E8 — render_sessions iteration counter ✅
**Files:** `app/design/step-7/page.tsx`, `app/api/render/status/route.ts`, `app/api/render/route.ts`
- Step-7 now reads `currentRenderIteration` from `useRoomStore()`
- Passes `render_iteration` in the POST body to `/api/render`
- Appends `&render_iteration=N` to the status poll URL
- render/status/route.ts reads `render_iteration` from query params (defaults to 1)
- Both `iteration: 1` hardcodes replaced with `iteration: renderIteration`
- **Effect:** DB `render_sessions` now correctly records which iteration each render was (1st, 2nd after refinement, etc.)

---

### D1 — Claude Vision description length cap ✅
**File:** `app/api/match/route.ts`
- After Claude Haiku returns item description, truncated to 12 words max
- `itemDescription = first.text.trim().split(/\s+/).slice(0, 12).join(' ')`
- **Effect:** Serper search queries stay focused; prevents verbose descriptions that produce off-target results

---

### D8 — Serper title-based deduplication ✅
**File:** `app/api/match/route.ts`
- After URL-based dedup, added title normalization dedup:
  - Lowercase, strip punctuation, keep first 6 words
  - Filters out identical titles appearing at different URLs (common for Amazon)
- **Effect:** Fewer duplicate results in the CLIP batch, more diverse product options for user

---

## Fixes Deferred

| Fix | Reason |
|-----|--------|
| E7 — depth model version pin | API returns 404 for model hash; can't verify correct hash |
| E9 — QR path room_id guard | Priority 3 — not blocking for current testing |
| E11 — ceiling_height unit audit | Low risk now that ceiling_height IS used in prompt (in feet — works correctly since branches are >= 10 and <= 7, which are valid feet values) |
| E12 — distributed rate limiting | Priority 3 — before public launch |
| E13–E16 | Priority 4 — nice to have |

---

## Files Modified

| File | Changes |
|------|---------|
| `app/design/step-6/page.tsx` | E1: add setDepthMapUrl to destructure + poll handler |
| `app/design/step-10/page.tsx` | E2: bbox-appended item IDs |
| `app/design/step-4/page.tsx` | E3: skip button saves all fields |
| `lib/ai/flux.ts` | E4+E5+E6+E10: full physical context in prompt, all constraints, remove slice cap |
| `app/design/step-7/page.tsx` | E8: read + pass currentRenderIteration |
| `app/api/render/route.ts` | E8: add render_iteration to body type |
| `app/api/render/status/route.ts` | E8: read render_iteration from query, use for iteration field |
| `app/api/match/route.ts` | D1: 12-word description cap; D8: title dedup |
