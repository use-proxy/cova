# Frontend Visionary — /terms

## Verdict

CONDITIONAL PASS. The component is structurally sound and design-system faithful. Two issues require fixes before ship: the "RETURN HOME" link lacks a minimum touch target, and the fixed Wordmark in the ui-gen source was correctly replaced in the implementation with the shared `<Wordmark>` component — but that component renders at `z-10`, which collides with the sticky header's own `z-10` and will cause the wordmark to slide behind the header on scroll. One contrast value needs verification. No D-008 violations found.

---

## Findings

### 1. Design-system tokens

PASS. Tokens are correctly applied throughout:

- Background: `bg-cova-navy` (line 247 of LegalPage.tsx)
- Gold rule: `bg-cova-gold/40` (lines 322, 356)
- Prose body color: `rgb(245 240 232 / 0.8)` — matches `#F5F0E8` at 80% opacity
- Font-serif UPRIGHT: `font-style: normal` enforced explicitly on `h1` (line 309), `h2` (prose CSS line 171), `h3` (line 183), and the sticky header title span (line 305). No italic serif leaks found.
- Gold link color in prose: `rgb(201 168 76 / 0.85)` — correct, matches `#C9A84C`
- Motion transition: 200ms ease-out on link underline (prose CSS line 207); page mount fade is 400ms ease-out (intentional page-in, not a state transition — acceptable)

One minor token note: the design language specifies `#0A1628` for background, but the Tailwind token `bg-cova-navy` maps to `#091829` per the apps/web CLAUDE.md. This is a 1-digit hex drift that should be reconciled in the Tailwind config, not here. Not a blocker for this component.

### 2. Layout invariants

PASS. The intentional break is correctly implemented:

- No form column, no hairline on the page edges, no fixed footer — all absent
- Reading column: `max-w-[720px] mx-auto` applied to both header inner div (line 260) and main content (line 288)
- Sticky header: `sticky top-0 z-10` (line 258) — functions correctly
- No border-radius on any surface elements (spec: sharp corners). The `<header>` border is a bottom hairline only, which is correct

### 3. Contrast (WCAG AA)

WARNING. Two values need attention:

- Prose body `rgb(245 240 232 / 0.8)` on `#091829` navy background: computed approximate luminance gives approximately 9:1 — clear pass.
- Eyebrow `text-cova-gold/60` at 10px uppercase tracked: gold at 60% opacity on navy is approximately `#C9A84C` at 0.60 alpha. At 10px this is small text; WCAG AA requires 4.5:1. The blended color is roughly `#7A6431` against the darkened navy, which may fall short of 4.5:1. The eyebrow is purely decorative/redundant labeling (the h1 below repeats the same information), so this is not a blocker, but should be verified with a real contrast tool and bumped to `/70` or `/80` if failing.
- Metadata footer copy `text-cova-ivory/40` at 10px: this is clearly below 4.5:1 at 40% opacity. These lines ("TERMS OF SERVICE — VERSION 0.1", "EFFECTIVE 3 MAY 2026") carry substantive legal metadata, not purely decorative content. This is a contrast failure for small text carrying meaningful information. Recommend `/60` minimum.
- "RETURN HOME" link `text-cova-ivory/40` default state: same issue — 40% ivory on navy at 10px will not pass 4.5:1. The hover state resolves to full `text-cova-ivory` which passes, but the resting state is insufficient for a navigational link. `/60` minimum required.
- Prose `line-height: 1.7` (line 196): meets the ≥ 1.5 requirement.

### 4. Focus order

PASS with one note. Tab sequence is logical: Wordmark (non-interactive, no tab stop) → sticky header (no interactive links) → prose body anchor links → RETURN HOME link. However, `focus-visible:outline-none` on the RETURN HOME link (line 394) removes the default focus ring without replacing it with a visible custom focus indicator. The color change to `focus-visible:text-cova-ivory` is the only signal. For a link this is borderline — it provides a color change but no outline or underline change. Recommend adding `focus-visible:underline` to complete the visible focus indicator.

### 5. ARIA

PASS. Correct landmark structure:

- `<header>` (line 257) is an implicit `role="banner"` landmark — correct
- `<main>` (line 287) provides the document landmark — correct
- `<h1>` renders `documentTitle` (line 305) — single h1 per page, correct
- All decorative spacer divs and hairlines carry `aria-hidden="true"` — correct
- Wordmark `<Wordmark>` component provides `aria-label="Cova"` (Wordmark.tsx line 32) — correct
- No `aria-live` regions needed (no forms or async error states on this screen)

### 6. Touch targets

FAIL. "RETURN HOME" link at 10px font with 0.25em tracking renders at approximately 180px wide but 12–14px tall — no vertical padding is applied. The clickable bounding box height will be roughly 14px, well below the 44px minimum. The link needs `py-3` or equivalent (`min-height: 44px; display: inline-flex; align-items: center`) to meet the mobile touch target requirement.

The sticky header spans (document title and last-updated) are non-interactive — no touch target requirement applies.

### 7. D-008

PASS. No internal style codenames (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) appear anywhere in either file. The legal copy references "Cova platform" and "AI-powered interior design" only.

### 8. Placeholder-state quality

PASS. The page passes `htmlContent` of `<p>This document is coming soon. Contact <a href="mailto:hi@covainterior.com">hi@covainterior.com</a> if you have questions.</p>` (terms/page.tsx line 3). The `proseContent` guard at LegalPage.tsx line 134 ensures non-empty content reaches the renderer. The full chrome — sticky header, eyebrow, h1, gold rule, footer metadata, RETURN HOME link — renders intact around even a single-sentence placeholder. The page does not look broken or empty. The version "0.1" in the footer metadata is a clear pre-launch signal for internal reviewers without exposing internal codenames.

### 9. Link styling inside legal prose

PASS with one note. Gold underline treatment is correctly applied:

- Default: `color: rgb(201 168 76 / 0.85)`, `text-decoration-color: rgb(201 168 76 / 0.3)` — visible gold with subtle underline
- Hover: underline color transitions to full opacity gold over 200ms ease-out — correct and consistent with design system motion spec
- `text-underline-offset: 4px` provides good visual breathing room

One gap: no `:focus-visible` rule exists in the `.cova-prose a` block inside the `<style>` tag (LegalPage.tsx lines 199–211). The browser default focus ring will appear on prose links during keyboard navigation, which is technically functional but visually inconsistent with the brand. Recommend adding `a:focus-visible { outline: 1.5px solid rgb(201 168 76 / 0.8); outline-offset: 3px; }` inside `.cova-prose`.

---

## Required fixes (blockers)

**Fix A — Wordmark z-index collision.**
`<Wordmark>` renders at `z-10` (Wordmark.tsx line 32) matching the sticky header's `z-10` (LegalPage.tsx line 258). When the page scrolls, the sticky header will paint at the same stacking level as the fixed wordmark, causing overlap artifacts. The wordmark must be at `z-20` minimum on this page. Options: pass a `className` prop to `<Wordmark>` to override, or add a `z-20` wrapper around `<Wordmark>` inside LegalPage.tsx, or extend the Wordmark component to accept a `zIndex` prop. The ui-gen source (cova-plan/ui-gen/P01b/legal-page.tsx line 259) used `zIndex: 20` on its inline wordmark — the implementation lost this when switching to the shared component.

**Fix B — Touch target on RETURN HOME link.**
LegalPage.tsx line 394: add `inline-flex items-center` and `min-h-[44px]` (or `py-3`) to the anchor element so the tappable area meets 44px on mobile.

**Fix C — Contrast: metadata footer and RETURN HOME resting state.**
LegalPage.tsx lines 368, 380, 395: `text-cova-ivory/40` at 10px fails WCAG AA for meaningful text. Raise to `text-cova-ivory/60` across all three instances.

---

## Suggested polish (nits)

- LegalPage.tsx line 394: add `focus-visible:underline` alongside the existing `focus-visible:text-cova-ivory` to complete the focus indicator without an outline ring.
- LegalPage.tsx prose `<style>` block (after line 211): add `.cova-prose a:focus-visible` rule with a gold outline for keyboard navigation consistency inside legal prose.
- LegalPage.tsx line 330: eyebrow `text-cova-gold/60` at 10px — verify contrast passes 4.5:1 with a real tool; if not, raise to `/80`.
- LegalPage.tsx line 113: mount fade is 400ms — this is double the design system's 200ms cap for state transitions. A page-in fade is a reasonable exception, but worth a product decision if strict adherence to the 200ms spec is required.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/terms/page.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/legal/LegalPage.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/legal-page.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
