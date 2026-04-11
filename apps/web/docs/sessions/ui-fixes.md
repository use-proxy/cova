# UI Fixes — Landing Page, Step-1, Step-2, Step-3

**Date:** 2026-04-05
**Branch:** main

## Summary

Visual/UX fix pass covering 24 issues across 4 files. No backend changes. Build and tsc both pass with zero errors.

---

## Files Changed

- `app/page.tsx`
- `app/design/step-1/page.tsx`
- `app/design/step-2/page.tsx`
- `app/design/step-3/page.tsx`

---

## Fixes Applied

### `app/page.tsx`

**FIX 1 — Navbar (done in previous session fragment)**

- Solid `#0D2035` background, gold border bottom
- Nav links `#F5F0E8`, Sign In button gold (`#C9A84C`)

**FIX 2 — Before/After slider improvements**

- Handle enlarged from 52px → 64px diameter
- Divider width 2px → 3px, added `boxShadow: "0 0 12px rgba(201,168,76,0.5)"`
- Added BEFORE/After pill labels in hero (top-left / top-right, fade in with intro)

**FIX 3 — Rule 8 compliance (style names)**

- Renamed "WARM JAPANDI" → "WARM ARTISAN" in rooms array (user-facing display)
- Renamed "Warm Japandi" → "Warm Artisan" in fingerprints array
- Renamed "Cool Minimalist" → "Cool Refined" in fingerprints array
- Removed "Japandi" from styleMap → "Natural Organic"
- Removed "Warm Japandi" from styleMap → "Warm Artisan"

**FIX 4 — "How it works" section full width**

- Removed `max-w-6xl`, replaced with `w-full px-6`
- Removed `px-6` from section (moved to container)

**FIX 5 — Style Intelligence section**

- Removed `max-w-4xl` constraint on heading
- h2 font size `text-6xl` → `text-7xl`
- Body text `text-sm` → `text-base`
- Increased radar+content container from `max-w-[1000px]` → `max-w-[1100px]`

**FIX 6 — Hotspot positions corrected**

- TV: cx 50→72, cy 35 (unchanged)
- Soundbar: cx 50→72, cy 52 (unchanged)
- Smart Lighting: cx 50→25, cy 8→15
- Gaming Setup: cx 80→15, cy 68→60
- Updated label position arrays to match

**FIX 7 — Transformation gallery replaced**

- Removed 6-card IIFE carousel with SVG-drawn fake rooms
- Removed `activeCard` and `cardDragStart` state usage
- Added 3-column real image grid using Supabase storage before/after pairs
- Cards: `height: 320px`, Before/After pill labels, gold divider, style chip overlay

**FIX 8 — Footer + product count**

- `© 2025` → `© 2026`
- `5,000+` → `18,000+`, `11 premium` → `12 premium` in Step 03 description

**Additional fixes:**

- Removed unused `scrolled` state and scroll useEffect

---

### `app/design/step-1/page.tsx`

**FIX 10 — Removed "Step 1 of 10" div (done in previous session fragment)**

**FIX 11 — Budget selector: 3D carousel → flat 2-column grid**

- Removed `TierCard` component (3D transform with position-based scaling)
- Removed `BudgetCarousel` component (perspective 3D carousel with drag)
- Removed `ChevronLeft`, `ChevronRight` imports from lucide-react
- Removed `useRef`, `useCallback` from React imports
- Added inline 2-column grid (`grid-cols-1 sm:grid-cols-2 gap-3`)
- Each card: `minHeight: 80, padding: "20px 24px"`, flat design
- Selected: `border: 2px solid #C9A84C, background: rgba(201,168,76,0.1)`
- Unselected: `border: 1px solid rgba(201,168,76,0.2), background: #0D2035`

**FIX 12 — Room grid** (already correct: `grid-cols-2 sm:grid-cols-3`, centered via `maxWidth: 900, margin: "0 auto"`)

---

### `app/design/step-2/page.tsx`

**FIX 13 — Removed "Step 2 of 10" hardcoded text** from TOP ZONE

**FIX 14 — Reduced whitespace**

- TOP ZONE: `pt-4` → `pt-2`, `pb-2` → `pb-1`, `height: "12%"` → `height: "10%"`
- Counter margin-bottom `mb-3` → `mb-2`
- MIDDLE ZONE: `height: "75%"` → `height: "77%"` (rebalanced)

**FIX 15 — Progress bar formula** (done in previous session fragment)

- Formula: `(((currentPair + 1) / TOTAL_PAIRS) * 100).toFixed(1)` → genuine 0–100%

**FIX 16 — Skip no longer biases fingerprint**

- Old: recorded `chosen: "B"` which biased fingerprint toward B choices
- New: advances `currentPair` without adding to `responses`, no fingerprint effect

**FIX 17 — Dark card overlay reduced**

- `rgba(9,24,41,0.4)` → `rgba(9,24,41,0.15)`, start at `60%` → `80%`
- Applied to both left and right cards

---

### `app/design/step-3/page.tsx`

**FIX 18 — Radar chart uses correct 6 dims**

- `axisLabels` updated: `["Luminosity", "Temperature", "Form", "Texture", "Nature", "Scale"]`
- Added `chartFingerprint = [fp[0], fp[2], fp[3], fp[5], fp[7], fp[9]]`
- `shapePath` now uses `chartFingerprint` (was `fingerprint` — iterated all 10 dims, breaking 6-axis chart)
- Vertex dots now use `chartFingerprint`

**FIX 19 — Removed guest button**

- Removed `<button onClick={proceedToPhase2}>or continue as guest →</button>`

**FIX 20 — Added email auth**

- Added `useSessionStore` import
- Added states: `showEmailForm`, `email`, `password`, `isNewUser`, `authError`
- Added `handleEmailAuth`: `signInWithPassword` → fallback `signUp` → `setStep(4)` → `proceedToPhase2()`
- Added "Continue with email →" toggle button below Google/Apple
- Shows email + password inputs when toggled, with error/success feedback

**FIX 21 — renderUrls → showcaseImages with label**

- Renamed `renderUrls` → `showcaseImages`
- Type changed from `(string | null)[]` → `Array<{url: string; label: string} | null>`
- `loadShowcaseImages` and `handleRegenerate` now store `{url, label}` objects
- JSX card loop: `STOCK_PHOTOS.map` → `showcaseImages.map`, uses `img.url` and `img.label`
- Removed `STOCK_PHOTOS` derivation block
- Removed `QUIZ_STOCK_PHOTOS` import from `@/lib/ai/quiz-data`

**FIX 22 — Animated background orbs**

- Added two radial gradient divs (`absolute inset-0 pointer-events-none`) to Phase 1 wrapper
- Orb 1: gold, 320px, top-left, `floatOrb1` keyframe (8s)
- Orb 2: blue-grey, 240px, bottom-right, `floatOrb2` keyframe (10s)
- Added `@keyframes floatOrb1` and `floatOrb2` to style block

**FIX 23 — Removed STOCK_PHOTOS**

- Removed `import { STOCK_PHOTOS as QUIZ_STOCK_PHOTOS }` line
- Removed 4-line derivation block (stockPhotosForRoom + STOCK_PHOTOS)

**FIX 24 — handleShare implemented**

- Uses Web Share API (`navigator.share`) when available (mobile)
- Falls back to `navigator.clipboard.writeText` (desktop)
- Wired to share button `onClick`

**Additional:**

- Default `styleName` changed from `"Warm Japandi"` → `"Warm Artisan"` (Rule 8 compliance)

---

## Acceptance Criteria

| Criterion                       | Status           |
| ------------------------------- | ---------------- |
| `npm run build` passes          | ✅ zero errors   |
| `npx tsc --noEmit` passes       | ✅ zero errors   |
| Navbar visible on blue          | ✅ solid #0D2035 |
| Slider 64px handle + labels     | ✅               |
| Full-width "How it works"       | ✅               |
| Hotspot positions corrected     | ✅               |
| Gallery uses real images        | ✅ 3-column grid |
| Footer © 2026, 18,000+ products | ✅               |
| Budget cards flat/readable      | ✅ 2-column grid |
| Progress bar 0–100%             | ✅               |
| No "Step 2 of 10" text          | ✅               |
| Skip doesn't bias fingerprint   | ✅               |
| Dark overlay reduced            | ✅               |
| DNA chart uses 6 correct dims   | ✅               |
| No guest button                 | ✅               |
| Email auth on step-3            | ✅               |
| showcaseImages with labels      | ✅               |
| Animated orbs behind Phase 1    | ✅               |
| STOCK_PHOTOS removed            | ✅               |
| handleShare wired               | ✅               |
| No sessionStorage               | ✅               |
| No Rule 8 style names           | ✅               |
| No duplicate step indicators    | ✅               |
