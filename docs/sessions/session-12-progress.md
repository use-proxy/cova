# Session 12 Progress
Date: 2026-04-07

## What Was Built

### Part A — Render Reveal UI (`app/design/step-7/page.tsx`)

Replaced the render-loading screen with the cinematic reveal screen.

**Before:** step-7 was the render loading screen (fires `/api/render`, polls for completion, redirects to step-8).
**After:** step-7 is the render reveal screen. Guards redirect to step-6 if renderUrl is missing.

**Features implemented:**
- Phase 1 (video): full-screen parallax video player when `parallaxVideoUrl` is set. "Skip →" button. Framer Motion crossfade (0.8s) into comparison phase.
- Phase 2 (comparison): full-screen before/after drag comparison with clip-path reveal.
  - After image (bottom): Next.js Image with subtle CSS parallax (max ±8px on mouse move, only when depthMapUrl present).
  - Before image (top): clipped with `inset(0 N% 0 0)` — well supported in all modern browsers including Safari.
  - Drag handle: 40px white circle with ChevronLeft + ChevronRight icons (color via CSS var, no hardcoded hex). Vertical white line.
  - Drag interaction: mouse (onMouseMove on container when isDragging) + touch (native addEventListener with passive: false to allow preventDefault and prevent scroll).
  - Container click jumps drag position (ignores bottom 160px bar area).
- Bottom bar: fixed, gradient overlay, always visible over both phases.
  - "Shop This Look →" CovaButton primary → step-9
  - "Refine →" CovaButton ghost → step-8
  - Share button (Share2 icon): navigator.share or clipboard fallback
  - "View in Dashboard" link: shown only when authenticated (async getSession check in useEffect)

**State:**
- `showVideo`, `videoEnded`, `dragPosition`, `isDragging`, `isAuthenticated`, `mouseOffset`
- `isDraggingRef` (ref kept in sync with isDragging for use in passive touch listener)

### Part B — Parallax API (`app/api/parallax/route.ts`)

Stub route — returns `{ video_url: null }` until Modal DepthFlow function is deployed.

- Auth-protected (401 if no session)
- Validates `render_url`, `depth_map_url`, `room_id` are present (400 if missing)
- Step-7 handles null gracefully: `if (d.video_url) roomStore.setParallaxVideoUrl(d.video_url)` — no crash
- Added to middleware in a previous session (step-7 was already protected)

### Part C — Modal DepthFlow Function (`modal_pipeline/depthflow_render.py`)

Created Python Modal function (not yet deployed):
- GPU: T4, timeout: 120s
- Deps: `depthflow==0.9.1`, `requests`, `supabase`
- Downloads render + depth map, runs DepthFlow dolly animation (3s, 30fps, 1080×1920)
- Uploads to `room-videos/{room_id}/parallax.mp4` in Supabase Storage
- Returns public URL
- Secret: `supabase-credentials` Modal secret (must be created before deploying)

**To deploy:** `modal deploy modal_pipeline/depthflow_render.py`
Then wire the deployed URL into `/api/parallax/route.ts`.

---

## Check Results

| Check | Result |
|-------|--------|
| TSC clean | PASS — zero type errors |
| npm run build | PASS — zero errors |
| Zero hardcoded hex colors in step-7 | PASS |
| step-7 protected in middleware | PASS (pre-existing) |
| Parallax route exists | PASS |
| isDragging / dragPosition / clipPath / onMouseMove in step-7 | PASS |
| showVideo / videoEnded / parallaxVideoUrl in step-7 | PASS |
| isAuthenticated / getSession / dashboard in step-7 | PASS |
| render-pipeline playwright tests | 2 FAIL — pre-existing, confirmed same failures before this session |
| Full playwright suite | 69 PASS, 3 FAIL — 3 pre-existing failures (same as before session) |

---

## Modal Configuration

Modal IS configured (`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` in `.env.local`). However, the DepthFlow Modal function has not been deployed yet. The API stub returns `{ video_url: null }` — step-7 skips the video phase and goes directly to before/after comparison.

**To enable parallax video:**
1. `modal deploy modal_pipeline/depthflow_render.py`
2. Create Modal secret `supabase-credentials` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
3. Replace the stub in `/api/parallax/route.ts` with a real call to the deployed function HTTP URL

---

## Deviations from Spec

- **step-7 previously fired the render**: The old step-7 was the render-loading screen. It fired `/api/render`, polled for completion, then redirected to step-8. That code is now replaced. The new step-7 assumes `renderUrl` is already set (guard redirects to step-6 if not). The render must now be triggered elsewhere (step-6 or a processing step) for the user to reach step-7 with a renderUrl.
- **step-8 still redirects to step-7**: The existing step-8 page has `if (!renderUrl) router.replace('/design/step-7')`. With step-7 now being the reveal screen (which also requires renderUrl), the redirect chain becomes step-8 → step-7 → step-6 if renderUrl is missing. This is intentional.

---

## Next Steps

1. Wire render triggering into step-6 so `renderUrl` is in the store before step-7 loads.
2. Deploy DepthFlow Modal function and wire parallax route.
3. Wire PostHog analytics events (render_reveal_viewed, before_after_dragged, shop_cta_clicked).
