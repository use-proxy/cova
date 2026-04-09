# Session 6b Progress — Step-2 Room Capture UI Rebuild

Date: 2026-04-07

## What Was Built

Replaced `app/design/step-2/page.tsx` (complex multi-mode: QR, device detection,
auth flow, 637 lines) with a streamlined photo-first viewfinder UI per the v2.0 spec.

## Page Appearance

### Viewfinder states

**Idle:** Rule-of-thirds SVG overlay (rgba gold at 33/66%), center crosshair (CSS
var gold, 0.4 opacity), pulsing Camera icon (Framer Motion 0.6→1→0.6, 2.5s loop),
"Tap to capture your room" label.

**Uploading:** Photo preview fades in (0.4s), black/40 overlay, shimmer progress
bar at bottom (CSS keyframe 1.2s infinite).

**Complete:** Photo preview + gold circle checkmark badge (top-right).

**Error:** Photo preview stays, Retry/Choose Different Photo buttons.

### Animations
- Heading: opacity 0→1, y 16→0, 0.5s delay 0s
- Subheading: same, delay 0.1s
- Viewfinder: scale 0.97→1 + opacity, delay 0.2s
- Buttons: y 12→0 + opacity, delay 0.35s

## Pre-flight Check Outputs

| Check | Result |
|---|---|
| Initial build | PASS (warnings only, pre-existing) |
| sonner | NOT installed → installed via npm install sonner |
| Toaster in layout | Added to app/layout.tsx |
| step-2 middleware | Public (not in PROTECTED_PAGE_ROUTES) |
| API routes | All 3 exist (/api/rooms/create, /api/rooms/capture, /api/detect) |

## All 8 Verification Checks

| # | Check | Status |
|---|---|---|
| 1 | TypeScript (tsc --noEmit) | PASS — zero errors |
| 2 | Build (npm run build) | PASS — zero errors |
| 3 | No hardcoded hex colors | PASS — grep empty |
| 4 | No `: any` types | PASS — grep empty |
| 5 | Middleware guard (step-2 public) | PASS |
| 6a | Page returns 200 | PASS |
| 6b | Guard in code (router.push step-1) | PASS |
| 6c | /api/detect returns 401 | PASS |
| 6d | /api/rooms/capture returns 401 | PASS |
| 7 | Playwright suite | PASS — 72 passing, 0 failures |
| 8a | revokeObjectURL present | PASS (lines 44, 50) |
| 8b | Detection fire-and-forget .catch | PASS (line 116) |
| 8c | Guard wrapped in useEffect | PASS |
| 8d | Input value reset in handleRetake | PASS (lines 53, 54) |

## Playwright Final Count

72 passing (1.9 minutes). 0 failures.

## Files Changed

1. `apps/web/app/design/step-2/page.tsx` — complete replacement (637→256 lines)
2. `apps/web/app/layout.tsx` — added Toaster from sonner
3. `apps/web/package.json` + `package-lock.json` — sonner added

## Deviations from Spec

None. All requirements implemented as specified including:
- Imports from @/lib/store only
- Zero localStorage/sessionStorage direct access
- All button states (idle/uploading/complete/error)
- Shimmer keyframe in inline style tag
- handleRetake revokes blob URL and resets input.value
- Guard useEffect + pre-populate useEffect + cleanup useEffect
