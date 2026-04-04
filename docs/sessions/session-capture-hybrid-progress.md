# Session: Hybrid Capture Implementation
Date: 2026-04-04

## Decision Locked
Hybrid capture: QR for desktop, direct camera for mobile, upload as fallback.
Webcam removed permanently. Decision recorded in COVA_CONTEXT.md, ARCHITECTURE.md,
CLAUDE.md (root + apps/web), STATUS.md.

## Files Deleted
- `apps/web/components/capture/WebcamMode.tsx` — multi-shot webcam (violates spec)
- `apps/web/components/capture/ShotStrip.tsx` — multi-shot thumbnail strip (violates spec)
- `apps/web/components/capture/CompassRing.tsx` — gyro/compass navigation (webcam-specific)
- `apps/web/app/capture/mobile/page.tsx` — 8-shot webcam mobile page (violates spec)

## Files Created
- `apps/web/lib/deviceDetection.ts` — SSR-safe device + LiDAR detection utility
- `apps/web/components/capture/QRCapture.tsx` — QR code display + Supabase realtime polling
- `apps/web/components/capture/MobileCapture.tsx` — direct camera button + framing guide
- `apps/web/components/capture/UploadFallback.tsx` — gallery upload (no capture= attr)
- `apps/web/components/capture/CaptureResult.tsx` — photo preview + confirm/retake
- `apps/web/components/capture/index.ts` — barrel export for all capture components
- `apps/web/app/capture/mobile/[token]/page.tsx` — QR handoff mobile camera page
- `apps/web/app/design/step-6/page.tsx` — CANONICAL capture entry point (replaced placeholder)
- `apps/web/tests/capture/capture.test.ts` — 17 capture flow tests

## Files Modified
- `apps/web/components/capture/QualityChecker.tsx` — replaced video-hook with file-based checkImageQuality()
- `apps/web/components/capture/ModeSwitcher.tsx` — removed "webcam" mode, renamed "Use Phone" → "Scan QR"
- `apps/web/components/capture/UploadMode.tsx` — removed ShotStrip import/usage
- `apps/web/app/capture/[roomId]/page.tsx` — removed WebcamMode import, mobile defaults to upload
- `apps/web/app/api/capture/generate-token/route.ts` — accepts room_id (snake) + roomId (camel), returns { token, url }
- `apps/web/app/api/rooms/create/route.ts` — accepts room_type, returns { id, room_id } (backward compat)
- `COVA_CONTEXT.md` — added Step 6 Hybrid Capture section
- `ARCHITECTURE.md` — updated directory structure for capture
- `CLAUDE.md` (root + apps/web) — added Rule 16 (hybrid capture)
- `docs/STATUS.md` — added Decisions Log with hybrid capture entry

## Existing Code Preserved
- `app/api/capture/generate-token/route.ts` — kept, extended for snake_case + returns token directly
- `app/api/capture/validate-token/route.ts` — kept as-is, already correct
- `app/api/rooms/capture/route.ts` — kept as-is, already handles single-photo upload correctly
- `components/capture/QRMode.tsx` — kept for legacy `app/capture/[roomId]` route
- `components/capture/CompletionScreen.tsx` — kept, generic completion state
- `components/capture/UploadMode.tsx` — kept (minus ShotStrip), used by legacy route
- Supabase realtime channel pattern — preserved in QRCapture.tsx

## API Routes Verified
- `/api/capture/generate-token` — UPDATED: accepts room_id/roomId, returns { token, url }
- `/api/capture/validate-token` — VERIFIED: correct, returns { valid, roomId, userId }
- `/api/rooms/create` — UPDATED: accepts room_type, returns { id, room_id }
- `/api/rooms/capture` — VERIFIED: correct, handles single photo upload, updates rooms.original_photo_url

## Test Results
Total: 183
Passed: 183
Failed: 0
New capture tests: 17

## Build Status
TypeScript: PASS
Build: PASS

## Capture Flow Summary
Mobile path: READY — MobileCapture shows rear camera button with framing guide
Desktop QR path: READY — QRCapture generates token, builds /capture/mobile/[token] URL, polls realtime
Upload fallback: READY — UploadFallback opens gallery (no capture attr)
Quality checker: READY — checkImageQuality() handles blur/resolution/size checks on File + HTMLImageElement
Mobile QR handoff page: READY — validates token, shows MobileCapture, uploads to /api/rooms/capture

## Autonomous Decisions

AUTONOMOUS_DECISION: Deleted `app/capture/mobile/page.tsx` entirely. It was the old 8-shot
webcam page with compass/gyro — zero valid use case under hybrid spec. New token-based page
lives at `app/capture/mobile/[token]/page.tsx`.

AUTONOMOUS_DECISION: Kept `app/capture/[roomId]/page.tsx` with WebcamMode removed. This legacy
route still supports QR and Upload modes for existing deep links. Mobile defaults to 'upload'
(single-photo file input) instead of 'webcam'.

AUTONOMOUS_DECISION: `generate-token` now accepts both `room_id` (snake_case from new QRCapture)
and `roomId` (camelCase from legacy QRMode.tsx). Returns both `{ token, url }` — token is the raw
JWT, url is the full `/capture/mobile/[token]` path.

AUTONOMOUS_DECISION: `rooms/create` now returns `{ id, room_id }` (both). Spec requires `id`,
legacy code expects `room_id`. Step-6 page handles both via `data.id ?? data.room_id`.

AUTONOMOUS_DECISION: Used `import QRCode from 'react-qr-code'` (default) instead of `{ QRCodeSVG }`.
The installed version (2.0.18) does not export QRCodeSVG as a named export in TypeScript.

AUTONOMOUS_DECISION: CaptureResult uses `<img>` for blob: URLs (no Next.js Image optimization
needed for blobs) and `<Image>` for HTTPS URLs. This avoids Next.js image domain restrictions.

AUTONOMOUS_DECISION: step-6/page.tsx uses `analytics.photoUploaded(roomType)` directly from
the analytics module instead of creating a separate `trackPhotoUploaded` wrapper. The existing
function already tracks the required information.

AUTONOMOUS_DECISION: step-6/page.tsx omits file size and captureMode from analytics event.
The existing `analytics.photoUploaded()` signature takes `roomType: string` only. Adding new
properties would require schema changes — deferred to M9 analytics pass.

## Items Requiring Founder Attention
- Verify Supabase Realtime is enabled for `rooms` table in Supabase dashboard
  (required for desktop QR flow — desktop polls rooms.original_photo_url updates)
- Test QR flow on real devices: scan QR from desktop, take photo on phone, confirm
  desktop receives the photo via realtime channel
- Verify `room-photos` bucket exists in Supabase Storage with RLS for user uploads
- Step 6 navigates to `/design/step-7` on completion — confirm step-7 page exists
  and handles the incoming roomId from store
