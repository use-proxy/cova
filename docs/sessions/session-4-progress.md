# Session 4 Progress — Zustand Stores: 10-Dim Spec Reconciliation

**Date:** 2026-04-07  
**Milestone:** M8 (pre-work)  
**Commit:** `df2374f` — session-4: zustand stores updated for 10-dim spec

---

## Objective

Reconcile three Zustand stores with the 10-dimension StyleFingerprint spec. Pure state management — no UI, no API routes. Zero `tsc --noEmit` errors. Build passes. Playwright suite holds at 37/37.

---

## Stores Rewritten

### `lib/store/fingerprint.ts`
- **Removed:** `QuizResponse`, `EntryPath`, `Dimensions`, `WallLayout` types; all room dimension/constraint/inclusion fields and actions (`quizResponses`, `addQuizResponse`, `toggleConstraint`, `toggleInclusion`, `inclusions`, `constraints`, `dimensions`, `roomLength`, `roomWidth`, `ceilingHeight`, `naturalLight`, `floorType`, `wallFinish`, `fixedElements`, `wallLayout`, `entryPath`)
- **Added:** `PairwiseResponse`, `ShowcasePrediction` (exported interfaces); `isGiftMode`, `phaseASelections`, `phaseBResponses`, `styleTags`; actions `setGiftMode`, `addPhaseASelection`, `removePhaseASelection`, `addPhaseBResponse`
- **Changed:** `setFingerprint(fingerprint, styleName, styleTags)` — now 3 params; `setShowcasePredictionIds` takes `ShowcasePrediction[]` not nullable

### `lib/store/room.ts`
- **Added exported types:** `Detection` (with `showToUser`, `keep: boolean | null`, `maskUrl?`), `RoomAnalysis`, `RenderSession` (with `previewUrl`, `parallaxVideoUrl`)
- **Updated:** `KeepMaskItem` — `maskUrl?` (camelCase), `keep: boolean` (NOT nullable)
- **New state:** `depthQuality`, `roomAnalysis`, `detections`, `previewUrl`, `parallaxVideoUrl`, `referenceImageUrls`, `swapRenderUrl`, `predictionId`, `schnellPredictionId`
- **Renamed:** `setDepthMapUrl(url)` → `setDepthMap(url, quality)`; `clearRoom()` → `resetRoom()`
- **Changed:** `toggleKeepItem(label: string, keep: boolean | null)` — syncs Detection.keep AND upserts keepMask
- **Added:** `setRoomAnalysis`, `setDetections`, `setPreviewUrl`, `setParallaxVideoUrl`, `setReferenceImages`, `setPredictionIds`, `setSwapRenderUrl`

### `lib/store/session.ts`
- `nextStep` max changed: 10 → 9
- Added `createJSONStorage(() => sessionStorage)` to persist config

### `lib/store/index.ts`
- Re-exports: `useFingerprintStore`, `PairwiseResponse`, `ShowcasePrediction`, `useRoomStore`, `Detection`, `RoomAnalysis`, `RenderSession`, `KeepMaskItem`, `useSessionStore`, `useRefineStore`

---

## Consumer Files Fixed

| File | Change |
|------|--------|
| `app/design/step-3/page.tsx` | `setFingerprint` now takes 3 args (`style_chips ?? []`) |
| `app/design/step-4/page.tsx` | `setShowcasePredictionIds([])` not null; `setStoreFingerprint` 3 args |
| `app/design/step-5/page.tsx` | Removed `WallLayout` import; simplified `navigateForward` — removed 7 deleted actions |
| `app/design/step-6/page.tsx` | Import `Detection`; `setDepthMap`; `setDetections`; `visibleDetections` from detections; `toggleKeepItem(label, bool)` signature; remove `setKeepMask` unused |
| `app/design/step-7/page.tsx` | Removed 9 old fingerprint fields from destructuring and API POST body; removed from useCallback deps |
| `app/design/step-9/page.tsx` | `addRenderSession` now includes `previewUrl: null, parallaxVideoUrl: null` |
| `app/design/step-10/page.tsx` | Removed `roomLength`/`roomWidth` (replaced with `undefined`); removed `showToUser` check from `toDetectedItems` filter |
| `app/api/render/route.ts` | Normalized `keep_mask` keep values (`?? false`) before passing to `generateInpaintingMask` |
| `lib/ai/inpainting.ts` | `mask_url` → `maskUrl` (camelCase) |

---

## Tests Updated

- `tests/stores/fingerprint.test.ts` — complete rewrite for new store shape (removed `quizResponses`, `toggleConstraint`, `toggleInclusion`; added `phaseBResponses`, `addPhaseBResponse`, `setGiftMode`, `phaseASelections`, `styleTags`, `showcasePredictionIds`)
- `tests/stores/room.test.ts` — `setDepthMapUrl`→`setDepthMap(url, quality)`; `clearRoom`→`resetRoom`; `toggleKeepItem(label, bool)` signature; added `RenderSession` required fields (`previewUrl`, `parallaxVideoUrl`); added `Detection` type tests

---

## Verification

```
npx tsc --noEmit    → 0 errors ✅
npm run build       → clean ✅
playwright test     → 37/37 passing ✅
```
