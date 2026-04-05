# Session 6 Progress — Step 6: Keep/Remove

Date: 2026-04-05

---

## Files Created

### `apps/web/app/api/detect/status/route.ts`
- GET `/api/detect/status?room_id=...`
- Requires auth. Queries `rooms` table for `depth_map_url` and `keep_mask`.
- Returns `{ ready: true, detections: KeepMaskItem[], depth_map_url }` when both columns are non-null.
- Returns `{ ready: false }` while detection is still running.
- Fully typed — no `any`.

### `apps/web/components/cova/StepIndicator.tsx`
- (Created in previous session — already in place)

---

## Files Modified

### `styles/tokens.css`
Added 8 new semantic tokens for the Keep/Remove UI:
- `--cova-keep: #1A7A4A`
- `--cova-keep-bright: #2ECC71`
- `--cova-keep-bg: rgba(26, 122, 74, 0.18)`
- `--cova-keep-bg-hover: rgba(26, 122, 74, 0.30)`
- `--cova-remove: #E74C3C`
- `--cova-remove-dark: #C0392B`
- `--cova-remove-bg: rgba(192, 57, 43, 0.12)`
- `--cova-dim: #4A5E7A`

### `apps/web/lib/store/room.ts`
- `KeepMaskItem` is now **exported** (was private)
- `KeepMaskItem.keep` changed from `boolean` to `boolean | null`
  - `null` = undecided (initial state from detection)
  - `true` = keep
  - `false` = remove
- `toggleKeepItem` rewritten: matches by `type + bbox[0] + bbox[1]` as stable ID.
  - If found: updates `keep` in-place
  - If not found: appends to array

### `apps/web/app/api/detect/route.ts`
- After detection, now saves `keep_mask` (detections with `keep: null`) to `rooms` table
  in addition to `depth_map_url`.
- New column write: `rooms.keep_mask = KeepMaskItem[]` (all items start undecided)

### `apps/web/app/design/step-6/page.tsx`
Full rewrite. Previous content was a capture page (wrong). Now implements
the Keep/Remove screen from the v0 component `what-stays.tsx`.

**State machine:**
- `isPolling` (keepMask === null, no timeout) → LoadingScreen
- `showFallback` (timed out OR zero visible detections) → fallback bottom panel
- Ready → photo panel + bottom panel + hotspot dots

**Polling:**
- Skips polling if `keepMask` already populated (back navigation)
- Polls `/api/detect/status?room_id=...` every 2500ms
- Times out after 30s → sets `detectionFailed = true` → shows fallback
- `pollRef` cleared on unmount

**Photo panel (58vh):**
- `ResizeObserver` on `photoContainerRef` for live container dimensions
- `onLoad` handler captures natural image dimensions
- Dots rendered only when both natural + container dims are available
- Dot positions computed from `bbox: [x, y, w, h]` → center = `(x + w/2, y + h/2)`
- Only shows detections where `confidence >= 0.85`
- Popup shows above by default, below if dot is in top 20% of container
- Outside-click closes popup

**Bottom panel (42vh):**
- Sticky header with "What stays?" + item count
- Scrollable item list, each row has `StateToggle` (3-state pill)
- `StateToggle` converts `boolean | null` ↔ `ItemState` ("keep"/"remove"/"undecided")
- Hint text at bottom: "Leave items neutral — we'll redesign them all"

**Loading screen:**
- Framer Motion spinner (`animate={{ rotate: 360 }}`, duration 1.2s, linear, infinite)
- Cycling phrases with fade animation (3s interval)
- Progress dots (1s interval)
- Blurred room photo as background if `originalPhotoUrl` is available

**CTA — "Design My Room →":**
- PATCH `/api/rooms/[roomId]` with `{ keep_mask: keepMask ?? [] }`
- On success: `setStep(7)` → `router.push('/design/step-7')`
- On failure: shows inline toast "Couldn't save your selections — tap to retry"
- Toast is tappable (retries the PATCH)

**Color compliance:**
- Zero hardcoded hex values in step-6/page.tsx
- All colors use `--cova-*` CSS variables from `styles/tokens.css`
- Verified with grep: `grep -n "#[0-9A-Fa-f]{6}" app/design/step-6/page.tsx` → 0 matches

---

## API Route Verified — No Change Needed

### `apps/web/app/api/rooms/[roomId]/route.ts`
- PATCH handler already exists; generic — accepts any JSON body and updates `rooms` table
- No change required; sends `{ keep_mask: [...] }` via the existing handler

---

## Build Status

- `npm run build` → **PASS** (58 static pages, zero errors)
- `npx tsc --noEmit` → **PASS** (zero errors)
- Only pre-existing warnings (console statements, img tags in other files)

---

## Decisions

- `ItemState` ("keep"/"remove"/"undecided") used internally in UI; converts to `boolean | null` for store via `keepToState()` / `stateToKeep()` helpers.
- Framer Motion used for loading spinner only (as specified). CSS keyframes kept for `dotPulse` and `popupEnter` (these are pre-existing global animations).
- Emoji map added for detection labels; falls back to 📦 for unrecognized labels.
- `KeepMaskItem` in `detect/status` route is a local interface (matching the store export exactly) to avoid a client-side import in a server route.

---

## What's Next

- step-7: Processing screen — triggers full redesign pipeline from store state
- The `keep_mask` is now persisted to `rooms` table on step-6 completion
- `/api/detect` saves initial detections (all `keep: null`) as `keep_mask` on detection complete
