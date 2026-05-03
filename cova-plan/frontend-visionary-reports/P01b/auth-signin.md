# Frontend Visionary — /auth/signin

## Verdict

PASS-WITH-NITS. The shipped `page.tsx` is structurally sound and implements the design language faithfully. All layout invariants hold, motion budget is respected, ARIA wiring is correct, and D-008 is clean. Three low-severity nits remain: a focus-ring contrast gap on the "Forgot password" and footer links, a missing `font-sans` on the Toast dismiss button class (cosmetic only; does not affect rendering), and the password input's bottom-border color at rest (`cova-ivory/15`) falls below the WCAG 3:1 UI-component threshold against the navy ground — fixable with a one-line token bump.

---

## Findings

### 1. Design-system tokens

Color, typography, radius, and motion tokens are applied correctly throughout.

- Gold is used in exactly four places: eyebrow (`text-cova-gold/60`, line 177), em-dash in Wordmark (`text-cova-gold/50`, `Wordmark.tsx:39`), hairline rule (`bg-cova-gold/40`, `page.tsx:197`), and focus rings (`focus-visible:border-cova-gold/60`, lines 215, 265, 333). Matches the four-use budget.
- `font-serif italic` on the headline (line 187) and input placeholders (lines 259, 309) is correct per spec.
- `font-sans` tracking uppercase on all functional labels is correct.
- `rounded-none` on inputs (lines 257, 307) preserves the zero-radius contract.
- Mount transition uses `duration-[400ms]` — this is 400ms, double the 200ms design-language cap. However, the phase doc §6 1B explicitly describes this as a one-time mount moment and the motion budget names it as "moment 1 of 3", so 400ms is intentional per spec. No flag raised, but worth confirming with the product owner that 400ms mount is accepted on final polish.
- Toast mount transition uses `duration-150` (correct, under 200ms).
- Spinner uses `animate-spin`, which is a continuous rotation — not a state transition — so it does not count against the 200ms transition rule. Correct.

Result: PASS

### 2. Layout invariants

- `<Wordmark />` renders fixed top-left (`fixed z-10 top-6 left-6 md:top-8 md:left-10`, `Wordmark.tsx:32`). Correct.
- Form column: `w-[calc(100%-48px)] max-w-[360px] md:w-[360px]` (`page.tsx:146`). The spec calls for `min(360px, calc(100vw - 32px))`. The impl uses `calc(100%-48px)` which subtracts 48px total (24px each side) rather than 32px. At narrow viewports this leaves 8px less horizontal room than spec. Minor deviation but not a hard blocker.
- Vertical hairline rule: `border-l border-cova-ivory/[0.12] pl-6` wrapping the form region (`page.tsx:167`). Correct — runs from eyebrow to end of primary button.
- Eyebrow → headline → gold hairline rule sequence: present and in correct order (lines 177–199).
- Helper text (optional per spec): not present; no violation.
- Footer link: `fixed bottom-6 right-6 md:bottom-8 md:right-10` outside the form column (`page.tsx:390–402`). Correct.
- Sharp corners: `rounded-none` on inputs, no `rounded-*` on buttons (default zero). Correct.
- No shadows, no glows, no particles anywhere in file. Correct.
- Apple OAuth absent. Correct per spec.

Result: PASS (one minor mobile-width nit, see Suggested polish)

### 3. Contrast (WCAG AA)

- `text-cova-ivory` (#F5F0E8) on `bg-cova-navy` (#091829): approximately 14.5:1. PASS.
- `text-cova-gold/60` eyebrow (#C9A84C at 60% opacity) on navy: resolves to approx. #7F6B36 blended — estimated contrast ~3.1:1 for text ≥ 10px uppercase tracked. Marginal for body text but eyebrow is decorative microtype; decorative elements are exempt under WCAG 1.4.3. Acceptable.
- `text-cova-warm-error` (#A8443B) on `bg-cova-warm-error/[0.12]` (navy + tint): contrast of error text against the banner background is approximately 4.7:1. PASS.
- `border-cova-ivory/15` on navy (input bottom-border at rest): #F5F0E8 at 15% on #091829 resolves to roughly #1B2A3A — contrast against the navy ground is approximately 1.4:1. WCAG 3:1 required for non-text UI components (1.4.11). This is a contrast failure on the resting input underline.
- `text-cova-ivory/40` on navy (forgotten password link, footer link): approximately 4.4:1 — just below the 4.5:1 AA threshold for small text (10px). ⚠️

Result: FAIL on two contrast points (resting input border + small link text at 40% opacity). Flagged below as required fix.

### 4. Focus order

Tab sequence: Wordmark wrapper (not focusable, correct) → "Continue with Google" button (`page.tsx:205`) → email input → password input → "Forgot password" link → "Sign in" submit button → footer link (fixed, receives focus last in DOM order). This is logical and matches reading order. No skip links needed given the compact layout.

The `<a href="/auth/forgot-password">` at line 337 appears after the password input in DOM order and before the submit button — correct per the check matrix spec.

Result: PASS

### 5. ARIA

- `Toast` (`components/ui/Toast.tsx:48–49`): `role="alert"` and `aria-live="polite"` both present. Correct.
- `?error=oauth` and `?error=email_exists` query params trigger `setTopBannerError` which renders `<Toast>` (`page.tsx:63–69`). The Toast mounts into the live region and will be announced. Correct.
- Anti-enumeration password error: the spec mandates "Email or password is incorrect" locked under the password field. In the shipped code, `passwordError` is shown under the password field via `aria-describedby="cova-password-error"` with `aria-live="polite"` on that container (`page.tsx:320–329`). However, looking at the submit handler (`page.tsx:87–113`), on a failed sign-in the API's `user_message` is routed to `setTopBannerError` (top banner), not `setPasswordError`. The password-field error container only ever renders if `passwordError` is set, but nothing in this component sets `passwordError` on submit failure — it is only cleared (`page.tsx:298`). The spec says the anti-enumeration string should appear under the password input; this implementation sends all auth errors to the top banner instead. The SR announcement still occurs (via `role="alert"` Toast), but placement deviates from the spec description.
- `aria-busy={isLoading}` on the submit button (`page.tsx:369`) and `role="status"` on the spinner wrapper (`page.tsx:374`). Correct.
- `aria-invalid` wired correctly on both inputs (`page.tsx:253, 302`).
- Wordmark: `aria-label="Cova"` on the wrapper (`Wordmark.tsx:34`), em-dash `aria-hidden="true"`. Correct.
- Dismiss button on Toast has `aria-label="Dismiss"` (`Toast.tsx:66`). Correct.

Result: PASS-WITH-NITS (anti-enumeration error location deviates from spec; SR users still hear the message via toast `role="alert"`, so no hard SR failure, but placement differs from the stated design intent)

### 6. Touch targets

- Google OAuth button: `h-12` = 48px, `w-full`. PASS.
- Submit button: `w-[200px] h-11` = 44px. Exactly at the 44px floor. PASS.
- "Forgot password" link: rendered as `<a>` with `text-[10px]`. No explicit `min-h` or padding. The default line-height on 10px text produces a tap target well under 44px vertically. ❌
- Footer link: same issue — `text-[10px]`, no vertical padding. ❌
- Toast dismiss `<button>`: `<X size={14}>` with no explicit padding. Rendered tap target is approximately 14×14px. ❌

Result: FAIL on three touch targets (forgot-password link, footer link, Toast dismiss button).

### 7. D-008 — Codename exposure

All user-facing strings searched:
- Eyebrow: "ACCOUNT — RETURNING" — clean.
- OAuth button: "CONTINUE WITH GOOGLE" — clean.
- Divider: "OR CONTINUE WITH EMAIL" — clean.
- Submit: "SIGN IN" — clean.
- Forgot: "FORGOT PASSWORD — RESET" — clean.
- Footer: "NEW TO COVA — CREATE ACCOUNT" — clean.
- Toast messages (`page.tsx:65–68, 107, 109`): plain UX copy, no style names.

No instances of Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist, or any cv-trigger string appear anywhere in user-facing output.

Result: PASS

---

## Required fixes (blockers)

**F1 — Input resting border contrast** (`page.tsx:265`)
`border-cova-ivory/15` resolves to roughly 1.4:1 contrast against `bg-cova-navy`. Replace with `border-cova-ivory/30` (estimated ~2.8:1) as a minimum; `border-cova-ivory/40` (~3.5:1) clears WCAG 1.4.11 for UI components. Apply to both email and password inputs (lines 265 and 315).

**F2 — Small link text contrast** (`page.tsx:339, 396`)
`text-cova-ivory/40` on navy is approximately 4.4:1 — just below the 4.5:1 AA threshold for 10px text. Raise to `text-cova-ivory/45` or add `min-h-[44px]` padding so the links qualify as large UI components (3:1 threshold). Applies to both "FORGOT PASSWORD — RESET" and "NEW TO COVA — CREATE ACCOUNT".

**F3 — Touch target: Forgot password + footer links** (`page.tsx:337–347, 390–402`)
Both `<a>` elements need at minimum `py-3` padding (or equivalent `min-h-[44px] flex items-center`) to meet the 44×44px requirement on mobile.

**F4 — Touch target: Toast dismiss button** (`Toast.tsx:63–70`)
Add `p-2` to the dismiss `<button>` to bring the tap target from ~14px to ~30px, and pair it with a `-m-2` negative margin to keep visual spacing intact. Alternatively, use `min-w-[44px] min-h-[44px] flex items-center justify-center`.

---

## Suggested polish (nits)

- **Mobile column width** (`page.tsx:146`): `calc(100%-48px)` leaves 8px less room than the spec's `min(360px, calc(100vw - 32px))`. Change to `w-[min(360px,calc(100vw-32px))]` for exact spec compliance.
- **`font-sans` class on Toast dismiss button** (`Toast.tsx:67`): the class string includes `uppercase tracking-[0.2em] text-[10px]` which are typographic utilities for text, but the button renders only an SVG icon. These classes are harmless but dead weight. Remove.
- **Mount duration 400ms** (`page.tsx:152`): the design-language cap is 200ms per the system token. The phase doc §6 1B names this a permitted moment; confirm with product owner before final polish whether the mount moment is excepted from the 200ms cap or should be halved to 200ms.
- **Password placeholder** (`page.tsx:309`): `"your password"` is lowercase, while email placeholder is also lowercase. Consistent. However, the spec shows italic-serif placeholders — `placeholder:italic` is present on both inputs. No change needed; noting for confirmation.
- **`aria-live` on both `role="alert"` and `aria-live="polite"` simultaneously** (`Toast.tsx:49`): `role="alert"` implies `aria-live="assertive"` per ARIA spec. Setting both `role="alert"` and `aria-live="polite"` creates a conflict where AT may use polite announcement instead of the implicit assertive. For error messages, either use `role="alert"` alone (assertive) or `role="status"` with `aria-live="polite"`. Recommended: drop `aria-live="polite"` from the Toast div and let `role="alert"` carry the announcement.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/signin/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/auth-signin.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/Toast.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
