# Screen 1 — Welcome (Manus design, ready for integration)

**Source:** Manus 1.6 Max
**Date:** 2026-05-04
**Status:** Approved by Daksh; awaiting Phase 2 executor cycle integration

## Files

- `Home.tsx` — page wrapper with wordmark, eyebrow, headline, subhead, CTA, 
  microcopy, footer. Imports CovaDiorama.
- `CovaDiorama.tsx` — 3D diorama with 8-second auto-loop, cursor agent, 
  particle field, progress arc.

## Inputs already in place

- Eight FLUX placeholder cards at `apps/web/public/welcome-demo-cards/`
  - 01-modern-coastal.webp through 08-mediterranean.webp
  - Generated via `scripts/generate-welcome-demo-cards.ts` in earlier 
    Claude Code session
  - 8 rows in `render_cost_log` with category=`quiz_card_placeholder`

## Card pairing across 4-cycle 32-second demo loop

- Cycle 1 (0-8s):   01-modern-coastal vs 02-warm-japandi
- Cycle 2 (8-16s):  03-industrial vs 04-biophilic
- Cycle 3 (16-24s): 05-mid-century vs 06-modern-farmhouse
- Cycle 4 (24-32s): 07-bohemian vs 08-mediterranean

## Phase 1 alignment confirmed

- Wordmark "C O V A" tracked uppercase + horizontal rule (matches /auth/signin)
- Eyebrow "ONBOARDING — STEP ONE" tracked, em-dash, ivory 50%
- Italic-gold accent on "that speaks to you." 
- "BEGIN →" with gold underline, no pill, no fill (matches "CONTINUE WITH GOOGLE")
- Hairline diorama frame at rgba(201, 168, 76, 0.20)
- Centered composition with generous negative space
- Footer "STEP 1 — STYLE QUIZ" bottom-right with em-dash
- Gold count outside diorama: 2 elements (headline line 2 + CTA underline)

## Issues to fix at integration time (not blockers, just flagged)

### SSR safety

- `CovaDiorama.tsx` references `window.innerWidth` directly in component 
  body (search for `FRAME_W_ACTUAL = isMobile ? Math.min(window.innerWidth...`). 
  Will throw during SSR. Wrap in useEffect or initial state guard.
- `Home.tsx` `useIsMobile()` hook accesses window in useState initializer. 
  Same SSR issue. Use the standard pattern: 
  `useState(false)` initially, then `useEffect` to set the real value 
  after mount.

### Image path swap

- `CovaDiorama.tsx` references images at `/manus-storage/01-modern-coastal_c9891b36.webp` 
  etc. (Manus's CDN paths). At integration time, swap all 8 paths to:
  - `/welcome-demo-cards/01-modern-coastal.webp`
  - `/welcome-demo-cards/02-warm-japandi.webp`
  - `/welcome-demo-cards/03-industrial.webp`
  - `/welcome-demo-cards/04-biophilic.webp`
  - `/welcome-demo-cards/05-mid-century.webp`
  - `/welcome-demo-cards/06-modern-farmhouse.webp`
  - `/welcome-demo-cards/07-bohemian.webp`
  - `/welcome-demo-cards/08-mediterranean.webp`

### Stubs to wire

- The current Home.tsx headline is generic ("Discover the space that speaks 
  to you.") — no first_name greeting. This was an intentional design 
  choice. No first_name wiring needed.
- "BEGIN →" CTA has no onClick. Wire to: `router.push('/onboarding/room-picker')` 
  at integration time.
- Add `/onboarding/welcome` to PROTECTED_PAGE_ROUTES in middleware.ts at 
  integration time.

### Analytics events to add at integration time

- `onboarding_welcome_viewed` (on mount)
- `onboarding_welcome_diorama_loaded {time_ms}` (after first cycle completes)
- `onboarding_begin_clicked {time_on_screen_ms}` (on CTA click)

Use the existing PostHog typed events pattern from lib/analytics/events.ts.

### Dependencies needed at integration time

Verify `apps/web/package.json` includes:
- framer-motion (the diorama relies on AnimatePresence, motion, useReducedMotion)
- If missing, add latest stable.

No Three.js, no GSAP, no Spline runtime needed. Pure framer-motion + CSS 
transforms. Bundle weight is reasonable.

### File location at integration time

- Move `Home.tsx` content to `apps/web/app/onboarding/welcome/page.tsx` 
  (Next.js App Router convention). Mark as client component with 
  `'use client'` directive at the top.
- Move `CovaDiorama.tsx` to `apps/web/components/onboarding/CovaDiorama.tsx`
- Update the import path in Home.tsx → page.tsx accordingly.

## Inherited Phase 1 rules at integration

- D-011 paidCall wrapper required for any paid provider fetch (none in 
  this screen)
- D-010 redactLogPayload before any console.log/error with object payloads 
  (none in this screen)
- ESLint cova-rules/no-direct-paid-fetch is "error" severity
- ESLint cova-rules/no-unsafe-console is "warn" — don't add violations
- D-008 forbidden style names: the Manus design has no raw style names 
  in source strings, so no D-008 risk

## Manual gate for this screen (later)

- Verify on /onboarding/welcome route renders correctly
- Verify 8-second loop plays continuously
- Verify cursor visits all 4 corners across 4 cycles
- Verify all 8 placeholder cards rotate through pairs correctly
- Verify reduced-motion fallback shows static frame
- Verify mobile layout (resize to 380px viewport)
- Verify "BEGIN →" routes to /onboarding/room-picker
