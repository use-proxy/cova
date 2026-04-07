# Session 5 Progress — Step 1: Room Type + Budget UI

**Date:** 2026-04-07  
**Milestone:** M8  
**Commit:** `b1150d4` — session-5: step-1 room type + budget UI

---

## Objective

Rebuild `app/design/step-1/page.tsx` — room type selection + budget picker screen.

---

## What Was Built

### Page Layout
- `bg-cova-bg min-h-screen` with `max-w-2xl` content width
- `StepIndicator currentStep={1} totalSteps={10}` at top (note: spec said 9, tests require 10 — tests win)
- EB Garamond heading: "What are we designing today?"
- Muted subheading: "Choose a room to get started"
- Sticky CTA bar at bottom with `CovaButton primary size="lg" className="w-full"`

### Room Type Grid
- 3×3 grid, 9 rooms in spec order with emoji
- `<button>` elements (not CovaCard div) — required for Playwright `locator('button', {hasText: 'Room Name'})`
- Visual: `bg-cova-surface border border-cova-border rounded-xl py-6` styled to match CovaCard interactive variant
- Selected state: `border-cova-border-gold bg-cova-surface-3` + gold ✓ badge (absolute top-2 right-2)
- Dorm Room + First Apartment: "Preset" badge in gold border below label
- Framer Motion stagger fade-in: `initial={{ opacity: 0, y: 8 }}` → `animate={{ opacity: 1, y: 0 }}`, delay `index * 0.04s`, duration `0.25s`

### Budget Pills
- 4 horizontal pill buttons (Budget, Mid-Range, Premium, Luxury) with mapped ranges
- Selected: `bg-cova-gold text-cova-bg border-cova-gold font-medium`
- Unselected: `bg-cova-surface border-cova-border text-cova-ivory hover:border-cova-border-gold`
- Preview text below pills: descriptive sentence per tier (no style names)
- `min-h-[1.25rem]` to prevent layout shift when text is empty

### Gift Mode Toggle
- Custom `GiftToggle` component (no shadcn Switch — not installed)
- Off: `bg-cova-surface-2`; On: `bg-cova-gold`
- Label switches between "Designing for someone else?" and "Gift mode on"

### Store Connection
- `useFingerprintStore` — `setRoomType`, `setBudget`, `setGiftMode`
- `useSessionStore` — `setStep`
- Pre-populates from store on mount (handles back navigation)
- Budget range map defined in component (not in store)
- CTA defaults to `mid` tier if no budget selected

---

## Visual Description

Navy `#0A1628` background. Gold progress bar at top showing 1/10 progress. EB Garamond heading. 3×3 grid of dark surface cards with emoji + room name. Clicking a card shows a gold border + gold ✓ badge. Below grid: 4 gold-outlined budget pills with descriptive text below. Gift toggle. Sticky gold CTA button at bottom enabled after room selection.

---

## Deviations from Spec

| Spec | Deviation | Reason |
|------|-----------|--------|
| `totalSteps={9}` | Used `totalSteps={10}` | Tests check "Step 1 of 10" — all other steps use 10. Tests are acceptance criteria. |
| CovaCard interactive variant for room cards | Used `<button>` with matching classes | Tests use `page.locator('button', {hasText: 'Living Room'})` — CovaCard renders `div[role="button"]` not `<button>`. |
| shadcn Switch | Custom GiftToggle | shadcn Switch not installed in project. |

---

## Verification

```
npx tsc --noEmit           → 0 errors ✅
npm run build              → clean ✅
grep hardcoded colors      → empty ✅
user-workflows.spec.ts     → 13/13 passing ✅ (was 35 total)
visual-checks.spec.ts      → 22/22 passing ✅
api-contracts.test.ts      → 35/35 passing ✅
data-integrity.test.ts     → (included above) ✅
```

**Playwright pass count: 35/35** (user-workflows + visual-checks) + 35/35 (api + data-integrity)

---

## Issues Encountered

1. **Stale server on port 3001**: Old build from session 4 was running. After running `npm run build`, the running server still served old chunks. Fixed by killing it and letting Playwright restart with new build.

2. **`button` locator mismatch**: CovaCard renders `div[role="button"]`, but Playwright tests require `button` HTML elements. Switched to styled `<button>` elements with equivalent Tailwind classes.

3. **`totalSteps={9}` vs `totalSteps={10}`**: Spec said 9, but tests check for "Step 1 of 10". Tests win — used 10.
