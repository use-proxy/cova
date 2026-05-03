# Frontend Visionary — /privacy

## Verdict

CONDITIONAL PASS. The component is structurally sound for a placeholder-state legal page. Three issues need resolution before this goes to users: a z-index collision between the Wordmark and the sticky header, a missing focus-visible ring on the "RETURN HOME" link, and a prose-link contrast shortfall at the 85% alpha value. No D-008 violations found.

---

## Findings

### 1. Design-system tokens

The component uses `bg-cova-navy`, `text-cova-ivory`, `text-cova-gold`, and `text-cova-warm-error` correctly. The Tailwind config at `/Users/daksh/Desktop/cova/apps/web/tailwind.config.ts:14-19` maps `cova.navy` to `#091829`, not `#0A1628` as specified in CLAUDE.md. This is a one-value delta (`091829` vs `0A1628`). The phase doc names `bg-cova-navy` as the background token and both pages use it consistently, so the visual result will match whatever the Tailwind token resolves to. Flag for the next Tailwind-config pass but not a component-level blocker.

Font-serif (`var(--font-serif)`) is declared `font-style: normal` explicitly on the h1 (line 309), the sticky header span (line 266), and via `font-style: normal` in every `.cova-prose h2` and `.cova-prose h3` rule (lines 170, 186). Upright-serif requirement is met.

The blockquote rule at line 233 sets `font-style: italic` for blockquotes. This is typographically intentional and does not contradict the "UPRIGHT non-italic for legal prose body and document headings" constraint because blockquotes are a pull-quote element, not body prose.

### 2. Layout invariants

Intentional break correctly applied: no form column, no fixed footer, no hairline divider between header and content (the border-b on the sticky header is structural, not the same element). Reading column is `max-w-[720px] mx-auto` at lines 260 and 288 — correct. Sticky header present, sticks via `sticky top-0`. Wordmark rendered from the canonical `Wordmark` component (`apps/web/components/brand/Wordmark.tsx:32`), which is `fixed z-10`.

**Z-index collision (blocker):** The Wordmark component is `fixed z-10`. The sticky header is `sticky z-10` (line 258 of `LegalPage.tsx`). Both share z-index 10. On scroll, the sticky header will visually overlap the Wordmark's "COVA" text because both occupy the same stacking order. The ui-gen source (`cova-plan/ui-gen/P01b/legal-page.tsx:259`) inlines the wordmark at `zIndex: 20` explicitly to solve exactly this — but the shipped component swaps the inline wordmark for the `<Wordmark />` component which is only z-10. The sticky header needs `z-20` or the Wordmark component's default left variant needs to be updated to `z-20`.

### 3. Contrast

Prose body color: `rgb(245 240 232 / 0.8)` on `#091829` background. At 80% alpha the effective color is approximately `#C5C0B9`. Contrast ratio against `#091829` is approximately 8.8:1 — comfortably above 4.5:1 AA.

Prose link color: `rgb(201 168 76 / 0.85)` (line 203). Effective color is approximately `#C6A155` on `#091829`. Contrast ratio is approximately 4.3:1, which falls just below the 4.5:1 AA threshold for normal text. Use `#C9A84C` at 100% opacity (the `text-cova-gold` token value) or at minimum 90% to clear the threshold.

Eyebrow and metadata: `text-cova-gold/60` and `text-cova-ivory/40` are presentational small-caps labels at 10px. These are display-only, not inline reading text. WCAG Large Text applies at 14px bold / 18px regular; 10px elements are technically not exempt but are conventionally treated as decorative labels. Flag as nit only.

Line-height: prose `p` is `line-height: 1.7` (line 194). Requirement of ≥ 1.5 is met.

### 4. Focus order

Tab order flows: Wordmark (no tabstop, correct — it is not a link), sticky header (no interactive elements, correct), body prose links, "RETURN HOME" anchor. Logical on a static page.

**Missing focus ring (blocker):** The "RETURN HOME" link at line 394 has `focus-visible:outline-none` with `focus-visible:text-cova-ivory` as the only focus indicator. A color-only change from `/40` to full ivory does not satisfy WCAG 2.4.7 (Focus Visible). No outline, box-shadow, or underline accompanies it. The prose link rule at line 207–210 has no `focus-visible` rule either — links inside `.cova-prose` get no visible focus indicator beyond browser default (which will be suppressed if any reset is in scope). Add at minimum `focus-visible:ring-1 focus-visible:ring-cova-gold` or an explicit `outline` to both locations.

### 5. ARIA

`<main>` landmark present (line 287). Document title rendered as `<h1>` (line 305). Decorative spacers and rules use `aria-hidden="true"`. Wordmark wrapper has `aria-label="Cova"`. No issues.

The `<header>` element provides the implicit `banner` landmark — correct. No explicit `role` needed.

### 6. Touch targets

"RETURN HOME" link (line 394) has `font-size: 10px` and no explicit padding or min-height. Its tap target is almost certainly below 44px in height. Add `py-3` (24px top+bottom) or `min-h-[44px] flex items-center` to bring it to the minimum. The prose email/body links inside `dangerouslySetInnerHTML` are similarly at 10px context size but those are inside the 16px prose block so they inherit line-height 1.7 × 16px ≈ 27px line box — still under 44px. For the placeholder single link to `mailto:`, this is a low-risk state but needs a note for Termly production HTML.

### 7. D-008

No internal style codenames (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) appear anywhere in either file. Pass.

### 8. Placeholder-state quality

`privacy/page.tsx:3` supplies the placeholder: `<p>This document is coming soon. Contact <a href="mailto:hi@covainterior.com">hi@covainterior.com</a> if you have questions.</p>`. The full chrome renders correctly around it. The component's `proseContent` guard (line 134) correctly falls through to the passed `htmlContent` since it is non-empty — the internal `PLACEHOLDER_PROSE` is never shown on `/privacy`. This is the correct behavior. Placeholder text is user-appropriate and does not expose any internal identifiers.

### 9. Anchor / link styling inside legal prose

`.cova-prose a` (line 199): gold at 85% opacity, underline, 4px offset, animated decoration-color on hover. No `:focus-visible` rule. As noted in check 4, this is a blocker. `target="_blank"` links in the placeholder prose (in `PLACEHOLDER_PROSE`, not in the actual privacy placeholder) use `rel="noopener noreferrer"` — correct.

### 10. Cross-page consistency with /terms

`/Users/daksh/Desktop/cova/apps/web/app/terms/page.tsx` and `/Users/daksh/Desktop/cova/apps/web/app/privacy/page.tsx` are structurally identical page wrappers. Both pass the same `lastUpdatedISO` and `effectiveDateISO` (`2026-05-03`), differ only in `documentType`, `documentTitle`, and the `metadata.title`. The shared `LegalPage.tsx` component is identical in both the shipped file and the ui-gen source (file comparison shows no divergence beyond the fact that the shipped version uses `<Wordmark />` component import while the ui-gen source inlines the wordmark with `zIndex: 20`). Both routes are fully consistent with each other.

---

## Required fixes (blockers)

**B-1 — Z-index collision between Wordmark and sticky header.**
`apps/web/components/legal/LegalPage.tsx:258` has `z-10` on the sticky header. `apps/web/components/brand/Wordmark.tsx:32` also uses `z-10` on the fixed wordmark. Either bump the sticky header to `z-20` and wordmark to `z-30`, or bump the Wordmark's default left variant to `z-20` and the header to `z-10` (giving Wordmark clear stacking priority as the ui-gen source intended at `cova-plan/ui-gen/P01b/legal-page.tsx:259`).

**B-2 — Focus ring absent on "RETURN HOME" link.**
`apps/web/components/legal/LegalPage.tsx:394`. `focus-visible:outline-none` removes the browser default with no replacement ring. Add `focus-visible:outline focus-visible:outline-1 focus-visible:outline-cova-gold` or equivalent.

**B-3 — Prose link contrast at 85% alpha is sub-AA.**
`apps/web/components/legal/LegalPage.tsx:203`. Change `rgb(201 168 76 / 0.85)` to `rgb(201 168 76 / 1)` (i.e. `#C9A84C` directly or the `cova-gold` CSS variable). Also add a `focus-visible` rule here to address check 4.

---

## Suggested polish (nits)

- Touch target on "RETURN HOME" (line 394): add `py-3` to the anchor to reach a minimum 44px tap height on mobile.
- `cova.navy` in Tailwind config is `#091829`; CLAUDE.md specifies `#0A1628` for background. Reconcile in the next config pass.
- The `<Wordmark />` component does not render as a link to `/`. For a legal page that is a reasonable choice (user is already browsing, "RETURN HOME" covers the use case) — but consider whether clicking the wordmark should also navigate home for consistency with the rest of the app.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/privacy/page.tsx`
- `/Users/daksh/Desktop/cova/apps/web/app/terms/page.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/legal/LegalPage.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/legal-page.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/tailwind.config.ts`
