# Frontend Visionary — /auth/reset-password

## Verdict

CONDITIONAL PASS. The implementation is structurally sound and the design language is applied correctly across all four states. Three issues require fixes before ship: the strength meter is not wired into the form (it is a reserved div), the VALIDATING spinner violates the "no spinner, label-change only" spec, and the footer link has insufficient touch-target height on mobile. One D-008 deviation and a focus-ring gap round out the blockers.

---

## Findings

### 1. Design-system tokens ✅

`cova-navy` resolves to `#091829` (tailwind.config.ts:15), `cova-ivory` to `#F5F0E8` (line 18), `cova-gold` to `#C9A84C` (line 16), `cova-warm-error` to `#A8443B` (line 19). All match the P01b palette lock. EB Garamond is wired via `var(--font-serif)` on every `Headline` and `Helper` atom (page.tsx:371, 383, 392). DM Sans via `var(--font-sans)` on `Eyebrow`, `MicroLabel`, and button labels. Token alignment is clean.

### 2. Layout invariants across all four states ✅

All four `StateBlock` sub-trees share the same `border-l border-cova-ivory/12 pl-6` hairline wrapper (page.tsx:318). Each state renders `Eyebrow → Headline → [Helper] → GoldHairline` in the correct order. SUBMITTED state places `GoldHairline` after the redirect copy rather than before (page.tsx:679) — this is intentional per the spec's "editorial trailing accent" pattern and is correct. Sharp corners (borderRadius 0) enforced on all interactive elements. No shadows or glows present. PASS.

### 3. Contrast (WCAG AA) — partial pass ⚠️

- `text-cova-ivory` (#F5F0E8) on `bg-cova-navy` (#091829): ~14.4:1. PASS.
- `text-cova-gold/60` (eyebrow, ~#C9A84C at 60% on navy): resolves to approximately #6B6140 effective, giving ~3.2:1 against #091829. This fails AA for normal text (requires 4.5:1). The eyebrow text is 10px uppercase tracked — it would need to be 14px bold minimum to qualify as "large text" (3:1). FAIL.
- `text-cova-ivory/35` (MicroLabel labels, page.tsx:405): #F5F0E8 at 35% opacity on #091829 = approximately #5E5A56 effective, giving ~2.8:1. FAIL for a functional label. Labels are 10px uppercase so this is not large text.
- `text-cova-ivory/50` (Helper text): ~5.5:1 effective. PASS.
- Strength meter: `bg-cova-warm-error` (#A8443B, 2px bar segment) against `bg-transparent` (navy ground) — non-text UI component, 3:1 required. #A8443B vs #091829 = ~4.1:1. PASS. `bg-cova-gold/60` (#C9A84C at 60%) = ~2.3:1. FAIL for the "GOOD / EXCELLENT" state segments (non-text UI ≥ 3:1 required). `text-cova-gold/60` label in the meter (PasswordStrengthMeter.tsx:63) carries the same failing ratio.

### 4. Focus order ⚠️

Tab order in VALID state follows DOM source: new-password input → confirm-password input → submit button → footer link. Correct per spec. Auto-focus fires at `displayedState === "valid" && !isOutgoing` (page.tsx:109) with a 50ms defer. This is correct. However the submit button uses `focus:outline-none focus-visible:border-cova-gold/60` (page.tsx:579). The `border-cova-gold/60` focus indicator on a 200×44px button with an existing border is a color-only change that is indistinguishable at low contrast — the gold border at 60% opacity against the existing ivory/30 border does not meet the 3:1 non-text contrast requirement for focus indicators (WCAG 2.1 §1.4.11). Same applies to the invalid-state "REQUEST NEW LINK" button (page.tsx:638) and the footer `<a>` (page.tsx:262, which has no visible focus style at all).

### 5. ARIA ⚠️

- VALIDATING: The spinner div carries `role="status"` and `aria-label="Verifying"` (page.tsx:427). This is announced on mount. Adequate. But the outgoing `StateBlock` is wrapped in `aria-hidden="true"` (page.tsx:212) which correctly silences the fading layer.
- State transitions: There is no `aria-live` region on the outer container announcing that the screen has changed state (e.g., from VALIDATING to VALID). Screen readers with virtual cursor will re-read the page but programmatic announcement of "your link is valid, please set a password" is absent. The SUBMITTED block's redirect paragraph has `aria-live="polite"` (page.tsx:663) — correct.
- PasswordStrengthMeter: The container `div` carries `aria-label="Password strength: {LABEL_ARIA[score]}"` (PasswordStrengthMeter.tsx:174) and the label `<p>` has `aria-live="polite" aria-atomic="true"` (line 234). Score changes are announced. PASS — but this component is NOT currently mounted inside the page. See Finding 7.
- Error fields: `aria-invalid` + `aria-describedby` pointing to the live error div are correctly set on both inputs (page.tsx:495, 541). The error divs have `aria-live="polite"` (page.tsx:515, 564). PASS.
- The top-banner Toast uses `role="alert"` + `aria-live="polite"` (Toast.tsx:48-49). PASS, though `role="alert"` implies `aria-live="assertive"` by default — using `aria-live="polite"` alongside it is redundant but harmless.

### 6. Touch targets ⚠️

- Submit button: `width:200, height:44` (page.tsx:585). Meets 44px height minimum. PASS.
- Footer `<a>` link: `text-[10px]` with no explicit height or padding (page.tsx:262). Natural height will be ~14-16px. Fails the 44px touch target requirement on mobile. FAIL.
- Dismiss X button in Toast.tsx: 14px icon with no padding (Toast.tsx:63-69). Effective tap target is approximately 20×20px. FAIL.

### 7. PasswordStrengthMeter wiring — CRITICAL ❌

The VALID form reserves `<div id="password-strength-meter-mount" className="h-12" />` (page.tsx:524) but does NOT import or render `<PasswordStrengthMeter>`. The component file exists at `apps/web/components/ui/PasswordStrengthMeter.tsx` and is production-quality, but the page.tsx uses a bare placeholder div. There is no `score` prop computed from `passwordValue`. The meter is entirely absent from the user's experience. This is a blocker — the feature is specced and built but not connected.

### 8. D-008 compliance ✅

No style codenames (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) appear in any user-visible string across all four state blocks. PASS.

### 9. VALIDATING state violates loading-state spec ❌

The phase doc §6 1B loading-state rule reads: "italic-serif label change, no spinner." The VALIDATING block renders a CSS `animate-spin` circle (page.tsx:424-430). A spinner is explicitly prohibited. The correct treatment is a label-only change — e.g., changing the headline text to italic serif, with no animated indicator. The spec deviation is present in both the production file and the ui-gen source identically, suggesting it was a deliberate ui-gen decision, but it contradicts the binding spec.

### 10. Crossfade `cova-state-enter` class undefined ⚠️

The entering state block applies `className="cova-state-enter"` (page.tsx:233). This class is not defined in globals.css, not in any `@layer utilities` block, and not present in the Tailwind config. The enter animation for state transitions is therefore a no-op — the incoming content appears instantly regardless of `prefers-reduced-motion`. The outgoing fade (duration-150 opacity-0) works, but the incoming reveal has no animation. The crossfade is one-sided.

---

## Required fixes (blockers)

1. **Wire PasswordStrengthMeter** (page.tsx:524). Replace the mount div with `<PasswordStrengthMeter score={computedScore} isVisible={passwordValue.length > 0} />`. Derive `computedScore` from `passwordValue.length` or from a zxcvbn call. The component is complete and accessible — it just needs to be imported and rendered.

2. **Remove the VALIDATING spinner.** Replace the `animate-spin` div (page.tsx:424-430) with an italic serif label-state change per spec. Example: change the Headline to `"Verifying…"` with no animated element. If a progress indicator is deemed necessary, use an opacity pulse on a static element, not a rotating spinner.

3. **Fix footer link touch target.** Add `py-3 px-2` to the footer `<a>` (page.tsx:262) so the tap surface reaches 44px. Alternatively wrap in a `<div style={{minHeight:44,display:'flex',alignItems:'center'}}`.

4. **Define `cova-state-enter`** in globals.css as a proper enter keyframe, e.g. `@keyframes cova-state-enter { from { opacity:0 } to { opacity:1 } }` with a `.cova-state-enter { animation: cova-state-enter 200ms ease-out both; }` utility, and suppress it under `@media (prefers-reduced-motion: reduce)`.

---

## Suggested polish (nits)

- Eyebrow and MicroLabel contrast: raise opacity from `/60` and `/35` to `/80` and `/55` respectively. This brings both comfortably above 4.5:1 without altering the design character.
- Strength meter GOOD/EXCELLENT segments at `bg-cova-gold/60` fail non-text 3:1. Use `bg-cova-gold/80` (gives ~3.6:1) for score 3 and 4 in PasswordStrengthMeter.tsx:53-54 and line 63-64.
- Add `focus-visible:ring-1 focus-visible:ring-offset-2 focus-visible:ring-cova-gold/60` to the footer `<a>` (page.tsx:262) — currently has zero focus style.
- Toast dismiss button (Toast.tsx:63): add `p-2` to inflate tap target to ~32px; with the surrounding `items-start` layout this is close enough to 44px in context.
- The `topBannerError` in VALID state uses the shared `<Toast>` (page.tsx:321) but the ui-gen source inlines an equivalent banner directly (ui-gen:312-331). The production implementation correctly delegates to the shared component — this is a positive divergence from the ui-gen source.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/reset-password/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/auth-reset-password.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/PasswordStrengthMeter.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/Toast.tsx`
- `/Users/daksh/Desktop/cova/apps/web/tailwind.config.ts`
- `/Users/daksh/Desktop/cova/apps/web/app/globals.css`
