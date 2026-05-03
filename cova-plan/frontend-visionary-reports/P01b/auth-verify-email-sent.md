# Frontend Visionary — /auth/verify-email-sent

## Verdict

CONDITIONAL PASS. Three blockers require fixes before this screen ships: the spinner during the resending state violates the motion budget and the loading-state spec, the `aria-live` on the helper `<p>` will misfire on mount in some SR configurations, and the confirmation slot's `aria-live` container emits an empty string when hidden which can cause spurious SR announcements. One contrast issue on the eyebrow and "WRONG EMAIL" link is borderline. Everything else is clean.

---

## Findings

### 1. Design-system tokens

`page.tsx:155` — Eyebrow is `text-cova-gold/60` (40% opacity gold). Gold primary at the phase-doc spec is `#C9A84C`. At 60% opacity over `#091829` the computed contrast against the navy ground is approximately 2.8:1, below the 3:1 UI-component threshold. See finding 3 for the combined contrast+color call.

`page.tsx:176-181` — Email address renders as `text-cova-ivory` (full opacity). Spec-compliant. Surrounding helper text at `text-cova-ivory/50` is intentional contrast reduction on the secondary prose. No issue.

`page.tsx:197` — Gold hairline rule at `bg-cova-gold/40`. Decorative; `aria-hidden="true"` present. Compliant.

`page.tsx:222` — Button uses `rounded-none`. Sharp corners per spec. Compliant.

### 2. Layout invariants

`page.tsx:149` — Hairline rule is `border-l border-cova-ivory/12`. The opacity fraction `12` is non-standard Tailwind; most configs treat this as `border-opacity-12` which rounds to about 5% — visually correct but depends on Tailwind config including a `12` stop. If the token is missing it silently collapses. Verify `tailwind.config.ts` has `/12` in the opacity scale or replace with `border-cova-ivory/[0.12]`.

`page.tsx:139-268` — Column width uses `w-[calc(100%-48px)] max-w-[360px]` at `px-6` (24px each side). Computes to `min(360px, 100vw-48px)` which matches the spec invariant `min(360px, calc(100vw-32px))` — there is a 16px discrepancy (spec says 32px total margin, implementation uses 48px). On a 360px viewport the column becomes 312px, not 328px. Minor but deviates from the spec literal.

### 3. Contrast (WCAG AA)

`page.tsx:155` — Eyebrow `text-cova-gold/60`: `#C9A84C` at 60% alpha over `#091829` computes to approximately `#7A6A35` effective. Contrast ratio ~2.7:1. Fails 3:1 for UI text. BLOCKER if eyebrow is considered informative text (it is — "INBOX — VERIFY YOUR EMAIL" provides context).

`page.tsx:257-266` — "WRONG EMAIL — START OVER" link at `text-cova-ivory/40`: approximately 2.2:1. Fails 4.5:1 for small text and 3:1 for interactive controls. The hover state corrects to full ivory but the resting state fails. BLOCKER.

`page.tsx:163` — Headline `text-cova-ivory` over `#091829`: ~17:1. Pass.
`page.tsx:176-181` — Email address `text-cova-ivory`: pass. Helper text `text-cova-ivory/50`: ~6:1. Pass (secondary text, non-interactive).

### 4. Focus order

`page.tsx:55-58` — `resendButtonRef.current.focus()` fires inside the `useEffect` but runs before `mounted` flips to `true`. Because `setMounted(true)` is deferred via `requestAnimationFrame` on line 53, the focus call on line 56 fires first in the same tick. The button is rendered (not `display:none`) so focus lands correctly. No reorder issue.

Tab sequence: Wordmark has no `tabIndex` (decorative, correct). Resend button is the first tab stop. "WRONG EMAIL" link follows. Footer "ALREADY VERIFIED" link is last. Logical. Compliant.

### 5. ARIA

`page.tsx:172` — `aria-live="polite"` on the helper `<p>`. This element renders on mount with the initial email string. Some SR/browser combos will announce it as a live-region change on mount. For a confirmation screen where the content does not change after mount this is benign, but it risks double-announcement. Remove `aria-live` from the helper `<p>`; it should be static prose. Move live-region behavior to a dedicated off-screen `<span aria-live="polite">` that only fires when the email address is actually updated dynamically.

`page.tsx:239` — Confirmation div has `aria-live="polite"`. When `showResendConfirmation` is false the inner text is an empty string (line 249 — `{showResendConfirmation ? "EMAIL SENT — CHECK YOUR INBOX" : ""}`). On SR, flipping from content to empty string can be announced as a blank update. Replace with: always render the string but conditionally mount the element, or use `aria-atomic="true"` with a stable container and only set text when shown.

`page.tsx:204-229` — `disabled` + `aria-disabled` both present. `aria-label` updates dynamically with countdown seconds. This is correct; SR users hear the remaining time without needing to watch the button. Compliant.

`page.tsx:151` — `<Toast>` component. `Toast.tsx:48-49` — has `role="alert"` and `aria-live="polite"`. Per the check matrix, success toast needs `role="alert"` and `aria-live="polite"`. Toast is currently only wired to the error path (`topBannerError`). The resend success path uses the inline confirmation div at line 239, not the Toast. That div has `aria-live="polite"` but not `role="alert"`. This is acceptable for a confirmation (polite is correct; alert would interrupt), but the review matrix specifies `role="alert"` on the resend success toast. The confirmation div should add `role="status"` at minimum.

### 6. Touch targets

`page.tsx:204` — Resend button: `h-11 w-[200px]`. `h-11` = 44px. Width 200px. Meets 44x44 minimum.

`page.tsx:256-266` — "WRONG EMAIL" link: `h-4` container (16px tall). This is the clickable hit area. At 16px height this fails the 44px touch target minimum. The link sits inside a `relative flex h-4` wrapper. Even though the link itself uses `absolute inset-0`, the parent constrains the hit area to 16px tall. BLOCKER on mobile.

`page.tsx:273-283` — Footer link: no explicit height. Rendered as an inline `<a>` with 10px text. Effective tap target is approximately 20px tall. Fails 44px minimum. Wrap in a `min-h-[44px]` container or add `py-3` padding to the anchor.

### 7. D-008

`page.tsx` — full scan. No internal style codenames (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) appear anywhere in this file. Compliant.

`Wordmark.tsx`, `Toast.tsx` — same check. Clean.

### 8. Motion budget

`page.tsx:121-128` — During `isResending` state the button renders a spinning `animate-spin` element (`border-t-cova-ivory` spinner). The phase doc spec states: "loading state α: italic-serif label change, no spinner." This is a direct spec violation. The spinner is also a continuous CSS animation, not a discrete state change. Replace with a text label change such as "SENDING…" in the same DM Sans uppercase tracked style. BLOCKER.

`page.tsx:141-147` — Mount transition is `duration-[400ms]`. The design-language lock specifies 200ms for all transitions. 400ms exceeds budget. Reduce to `duration-200`. Note: `motion-reduce:transition-none` is present. Good.

`page.tsx:265` — Confirmation fade: `duration-150` and `duration-200`. Both within 200ms budget. Compliant.

---

## Required fixes (blockers)

1. **Spinner violation** (`page.tsx:121-128`): Remove `animate-spin` element. Replace with a plain text label (e.g. `"SENDING…"`) matching the DM Sans uppercase style already used in other states. Spec: loading state = label change, no spinner.

2. **"WRONG EMAIL" touch target** (`page.tsx:256`): The `h-4` parent constrains the tap target to 16px. Change the wrapper from `h-4` to `min-h-[44px]` and adjust vertical alignment. The crossfade behavior can be preserved by keeping `absolute inset-0` on both children while the parent provides the minimum height.

3. **Footer link touch target** (`page.tsx:273`): Add `min-h-[44px] flex items-center` or `py-3` to the footer `<a>` to meet 44px minimum.

4. **Eyebrow contrast** (`page.tsx:155`): `text-cova-gold/60` fails ~2.7:1. Raise to `text-cova-gold/80` (approximately 3.5:1) or full `text-cova-gold`.

5. **"WRONG EMAIL" resting contrast** (`page.tsx:257`): `text-cova-ivory/40` is approximately 2.2:1 at rest. Raise to `text-cova-ivory/60` (approximately 3.3:1) to pass the 3:1 interactive control threshold.

---

## Suggested polish (nits)

- `page.tsx:149`: Use `border-cova-ivory/[0.12]` instead of `border-cova-ivory/12` to guarantee the opacity resolves correctly regardless of Tailwind opacity scale configuration.
- `page.tsx:139`: Column margin totals 48px (`px-6`). Spec says 32px total. Change `px-6` to `px-4` to align with spec.
- `page.tsx:172`: Remove `aria-live="polite"` from the static helper `<p>`. Add a dedicated off-screen live region for any future dynamic email updates.
- `page.tsx:239,249`: Add `role="status"` to the confirmation `aria-live` div. Replace the empty-string conditional with conditional rendering of the element itself to prevent blank SR updates.
- `page.tsx:141`: Mount transition `duration-[400ms]` should be `duration-200` to match the 200ms design-language lock.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/verify-email-sent/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/auth-verify-email-sent.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/Toast.tsx`
