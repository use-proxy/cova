# Fix: Showcase Renders Use Actual Fingerprint

## Summary

Replaced the static anchor_renders fallback on step-3 with a live render pipeline
that fires FLUX Kontext Pro predictions using the user's actual fingerprint vector.

## Changes

### lib/store/fingerprint.ts

- Added `showcasePredictionIds: Array<{ predictionId: string; label: string }> | null`
  to `FingerprintState` interface, `INITIAL_STATE`, and store implementation.
- Added `setShowcasePredictionIds` action.
- Stored in Zustand (never localStorage — Rule 1 compliance).

### app/api/render/route.ts

- Added `showcase_mode?: boolean` and `style_name?: string` to `RenderRequestBody`.
- Validation now allows missing `room_id` when `showcase_mode` is true.
- Added showcase fast path: builds FLUX prompt from fingerprint, fires prediction,
  returns `{ prediction_id }` immediately — skips inpainting mask and all DB writes.

### app/api/render/status/route.ts

- Added `isShowcaseMode` flag from `?showcase_mode=true` query param.
- Validation now allows missing `room_id` when showcase mode is active.
- Added showcase fast path immediately after auth check: polls Replicate only,
  returns `{ status, render_url }` without any DB operations.
- Added `!` non-null assertions on `roomId` in `InsertTables` usages (safe because
  showcase mode returns early, so roomId is always present at those lines).

### app/design/step-2/page.tsx

- Destructured `budgetTier` and `setShowcasePredictionIds` from `useFingerprintStore`.
- After fingerprint is set in `completeQuiz`, fires 3 showcase render predictions
  non-blocking using `void Promise.all(...)`.
- Stores prediction IDs in Zustand store via `setShowcasePredictionIds`.
- Updated `useCallback` dependency array to include new dependencies.

### app/design/step-3/page.tsx

- Destructured `budgetTier`, `showcasePredictionIds`, `setShowcasePredictionIds`,
  and `setStoreFingerprint` from `useFingerprintStore`.
- Replaced `loadShowcaseImages` useEffect with a polling-based approach:
  - If prediction IDs exist in store: polls each prediction at 3s intervals,
    updates cards individually as they resolve (max 90s per prediction).
  - If no IDs: falls back to anchor_renders table (existing behavior).
  - Clears stored IDs on mount to prevent re-polling stale predictions on refresh.
- Replaced `handleRegenerate` with fingerprint-adjustment approach:
  - Applies chip adjustments directly to fingerprint dimensions (no API roundtrip).
  - Fires 3 new showcase render predictions using adjusted fingerprint.
  - Polls each prediction inline and updates cards as they complete.
  - Removed unused `setStyleName` and `setStyleChips` from state destructuring.

## Architecture Note

Showcase renders bypass all room/DB state — they use `showcase_mode: true` which
skips inpainting masks, keep masks, room DB writes, and render_sessions inserts.
This keeps the preview flow fast and cheap (~$0.05 per render via Replicate).
