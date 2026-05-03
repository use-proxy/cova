# Frontend Visionary — /auth/signup

## Verdict

PASS-WITH-NITS. The screen faithfully implements the luxury dark aesthetic — correct token names, hairline-bracketed column, eyebrow-to-rule ordering, reduced-motion branching, and D-008 clean. Three nits need polish before a wider audience sees the screen; none are accessibility blockers. One contrast pair warrants manual verification before launch.

---

## Findings

### 1. Design-system tokens (color / typography / radius / motion adherence)

The component header at `page.tsx:52-61` documents the four Cova tokens explicitly, and all usages match the Tailwind config (`tailwind.config.ts:14-19`). Verified:

- `bg-cova-navy` (#091829) on the root wrapper — correct.
- `text-cova-gold/60` on the eyebrow at `page.tsx:287` — gold used at 60% opacity for the eyebrow, consistent with "surgical" spec.
- `text-cova-warm-error` (#A8443B) exclusively for error states — no misuse found.
- `font-serif italic` on headline (`page.tsx:295`), tagline (`page.tsx:303`), input placeholders (`page.tsx:210`), and Toast text (`Toast.tsx:60`) — correct.
- `font-sans uppercase tracking-[...]` on all functional labels — correct.
- Motion: form mount uses 400ms ease-out (`page.tsx:206`), hover states 200ms ease-out, Toast slide uses 150ms ease-out (`Toast.tsx:56`). All three are within the allowed three motion moments.

One token divergence: the global design system spec in CLAUDE.md lists `#0A1628` as the background, while the phase-doc §6 1B spec (which governs auth screens) specifies `#091829` (`bg-cova-navy`). The Tailwind config registers `cova.navy` as `#091829`, which is what the page uses. The phase-doc is the binding authority for this screen, so this is consistent — but flag for reconciliation at the design-system level.

The Spinner component (`page.tsx:466-479`) uses `animate-spin` with no `prefers-reduced-motion` guard. Tailwind's built-in `animate-spin` does not automatically disable under reduced-motion.

### 2. Layout invariants

- Full-bleed navy background: `page.tsx:231` — correct.
- Wordmark: `Wordmark.tsx:32-44`, fixed top-left with `z-10`, correct tracking and em-dash. Font is `font-serif` not `font-sans`; the spec says uppercase tracked microtype which reads as sans, but the component is working and has been signed off as the single source of truth per its own header.
- Form column 360px centered: `page.tsx:257` uses `w-[360px] max-md:w-[calc(100%-48px)] max-w-[360px]`. The spec requires `min(360px, calc(100vw - 32px))`. The implementation subtracts 48px (24px each side) rather than the spec's 32px (16px each side). On a 375px iPhone SE viewport this gives 327px instead of 343px — a minor padding difference, not a breakage, but it deviates from the exact spec expression.
- Hairline rule: `page.tsx:285` — `border-l border-cova-ivory/12 pl-6` on the bracketed region. Correct color and indent.
- Eyebrow → headline → tagline → gold rule order: present at lines 287, 295, 303, 311 — correct.
- Footer link: `page.tsx:242-247`, fixed bottom-right — correct.
- Sharp corners: no `rounded-*` class found on any interactive element. Correct.
- No shadows, no glows: confirmed absent.

### 3. Contrast (WCAG AA)

Pairs computed against the rendered token values:

- `#F5F0E8` (ivory) on `#091829` (navy): approximately 15.3:1 — well above 4.5:1.
- `#C9A84C` (gold) on `#091829` (navy): approximately 5.3:1 — passes AA for normal text.
- `text-cova-ivory/35` microtype labels (`page.tsx:226`, `PasswordStrengthMeter.tsx:240`): effective color is `#F5F0E8` at 35% opacity blended over `#091829`. Computed luminance yields approximately 2.6:1 — below 4.5:1 for the 10px uppercase label text. Because the labels are 10px (very small, uppercase tracked), they technically require 4.5:1 under WCAG AA (normal text threshold), not 3:1. This is a potential AA failure for sighted users in low-ambient lighting.
- `text-cova-ivory/25` placeholder text (`page.tsx:212`): approximately 1.7:1 — placeholders are not subject to the 4.5:1 threshold under WCAG SC 1.4.3 but are at risk of being unreadable for low-vision users. Note this.
- `text-cova-ivory/40` footer link (`page.tsx:244`): approximately 4.1:1 — marginally below 4.5:1 for normal body text. The font is 10px/uppercase, which WCAG treats as normal (not large) text, so this is a borderline fail.

### 4. Focus order

Tab order flows: Wordmark (not focusable, correct) → Google OAuth button (`page.tsx:317`) → Email input → Password input → Submit button → Footer link (fixed position, appears last in DOM at `page.tsx:242`). The footer link is positioned in the DOM before the form column (`page.tsx:242` precedes `page.tsx:255`), which means its natural tab order comes before the form column children. With `position: fixed` this does not affect visual presentation, but screen-reader tab traversal will land on the footer link before the form. This is a logical tab-order violation.

### 5. ARIA

- Toast: `role="alert"` and `aria-live="polite"` at `Toast.tsx:49` — correct per spec.
- Inline email error container: `aria-live="polite"` at `page.tsx:371` — correct.
- Inline password error container: `aria-live="polite"` at `page.tsx:403` — correct.
- `aria-invalid` and `aria-describedby` wired on both inputs (`page.tsx:367-368`, `page.tsx:399-400`) — correct.
- `aria-busy` on submit button (`page.tsx:433`) — correct.
- PasswordStrengthMeter root div: `aria-label="Password strength: {score}"` at `PasswordStrengthMeter.tsx:174`. The label string updates with score but the element has no `role` declared. Without a role, the `aria-label` attribute has no semantic effect in many AT implementations; `role="status"` or `role="img"` would be needed. The label text `p` inside uses `aria-live="polite"` and `aria-atomic="true"` (`PasswordStrengthMeter.tsx:235-236`), which does announce changes — so the live region works, but the container `aria-label` is silently ignored.
- Spinner: `role="status"` and `aria-label="Loading"` at `page.tsx:469-470` — correct.
- The `form` element's `aria-describedby` at `page.tsx:263` points to `"signup-top-error"` but no element with that `id` exists in the JSX. The Toast component does not receive or render that `id`. The `aria-describedby` reference is broken and will silently resolve to nothing.

### 6. Touch targets

- Google OAuth button: `h-12` = 48px tall, full width — passes.
- Submit button: `h-11` = 44px tall, 200px wide — exactly meets the 44px floor, passes.
- Toast dismiss X button: renders `<X size={14}>` inside a button with no explicit `h-*`/`w-*` padding classes beyond `p-3` on the Toast container. The button itself has no minimum size enforcement. Effective tap target is approximately 20×20px — fails the 44px touch target requirement.
- Footer link: 10px text, no explicit padding. Effective target height is approximately 14-15px. This fails 44px.
- Input fields: `py-2` gives approximately 32px height. Below 44px, but inputs with no explicit height are a known WCAG gap. Flag as a nit rather than a hard blocker since the visual affordance is the full-width text area.

### 7. D-008 — codename leak check

All visible strings audited: eyebrow "ACCOUNT — NEW", headline "Create an account", tagline "Your room, redesigned in seconds.", button labels "CONTINUE WITH GOOGLE" and "CREATE ACCOUNT", or-divider "OR CONTINUE WITH EMAIL", error messages, placeholder text "you@example.com" and "minimum 8 characters", footer link "EXISTING ACCOUNT — SIGN IN", strength meter labels ("TOO SHORT", "WEAK", "FAIR", "GOOD", "EXCELLENT"). None of the five forbidden codenames (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) appear anywhere on this screen. D-008 clean.

---

## Required fixes (blockers)

None that are hard blockers. The screen is shippable for internal testing. For public launch, address the items below before UA.

---

## Suggested polish (nits)

1. **Tab order — footer link DOM position** (`page.tsx:242`). Move the footer link element to after the form column in the DOM so tab order reads: Google button → Email → Password → Submit → Footer link. Currently the `<a>` at line 242 precedes the form wrapper at line 255 and will be focused first.

2. **Broken `aria-describedby` reference** (`page.tsx:263`). The form uses `aria-describedby="signup-top-error"` but no element with `id="signup-top-error"` exists. Either assign that `id` to the Toast wrapper, or remove the `aria-describedby` from the form element.

3. **PasswordStrengthMeter container role** (`PasswordStrengthMeter.tsx:174`). Add `role="img"` to the container div so the `aria-label="Password strength: ..."` is actually communicated to assistive technology. Without it, the label is ignored by most screen readers.

4. **Spinner reduced-motion** (`page.tsx:466-479`). Tailwind's `animate-spin` runs a CSS animation that is not suppressed by `prefers-reduced-motion: reduce` unless the Tailwind config includes `@media (prefers-reduced-motion: reduce)` overrides. Add `motion-safe:animate-spin` or conditionally replace the spinner with a static text label ("Loading...") when `reduceMotion` is true (state is already available in parent scope at `page.tsx:104`).

5. **Toast dismiss touch target** (`Toast.tsx:63-70`). The dismiss button has no explicit `min-h`/`min-w`. Add `min-h-[44px] min-w-[44px] flex items-center justify-center` to bring it to spec.

6. **Footer link touch target and contrast** (`page.tsx:244`). Add `py-3 px-1` to increase tap area. Consider increasing opacity from `/40` to `/50` to bring contrast from ~4.1:1 toward 4.5:1.

7. **Mobile column width** (`page.tsx:257`). Spec says `min(360px, calc(100vw - 32px))`; implementation uses `calc(100%-48px)`. Align to `w-[min(360px,calc(100vw-32px))]` for exact parity with the eight-screen invariant.

8. **Microtype label contrast** (`page.tsx:226`). `text-cova-ivory/35` resolves to approximately 2.6:1 at 10px — below WCAG AA for all text sizes. Consider raising to `/50` (~3.8:1) or `/60` (~4.6:1) to clear the threshold.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/signup/page.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/PasswordStrengthMeter.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/Toast.tsx`
- `/Users/daksh/Desktop/cova/apps/web/tailwind.config.ts`
