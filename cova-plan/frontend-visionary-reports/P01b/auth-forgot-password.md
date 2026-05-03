# Frontend Visionary — /auth/forgot-password

## Verdict

**Conditional pass.** No D-008 violations, no forbidden style codenames, and the component logic is solid. There are two blockers: a divergence between the canonical `page.tsx` and the ui-gen source on the error-banner component (production file uses a shared `Toast`, source bundles its own `ErrorBanner` with an inline `<style>` block that fires a CSS animation outside the motion budget), and a contrast failure on the email label and footer link. Three lower-priority nits follow.

---

## Findings

### 1. Design-system tokens ⚠️

The phase doc specifies background `#0A1628`. The Tailwind config resolves `bg-cova-navy` to `#091829` (page.tsx:213, tailwind.config.ts:15). The delta is one stop darker than spec. The current registered value is what the codebase uses consistently across all auth screens, so the token itself is the source of truth — but note that `#091829` is not spec-identical to the phase-doc value `#0A1628`. This is a pre-existing token drift, not introduced by this screen. Flag for future token audit; no action required here.

All other token usages — `cova-gold`, `cova-ivory`, `cova-warm-error` — resolve correctly (tailwind.config.ts:14–20).

### 2. Layout invariants ✅

Full-bleed navy background, Wordmark fixed top-left via shared `Wordmark` component, 360px form column (`max-w-[360px]`), vertical hairline rule (`border-l border-cova-ivory/12`), eyebrow → italic serif headline → helper → gold hairline rule sequence, footer link fixed bottom-right. All invariants satisfied (page.tsx:213–291).

Mobile column scaling at page.tsx:218 reads `w-[calc(100%-48px)]` (24px each side), which matches the spec formula `min(360px, calc(100vw - 32px))` only approximately — 48px gutters vs the spec's 32px gutters. On a 360px viewport this renders the column at 312px rather than the spec-intended 328px. Low visual impact but not spec-identical.

### 3. Contrast (WCAG AA) ❌

Two failures at computed opacity:

- **Email label** `text-cova-ivory/35` (page.tsx:381): `#F5F0E8` at 35% opacity over `#091829` background computes to approximately `#6B6660`, yielding a contrast ratio near 3.2:1 against the navy — below the 4.5:1 text threshold. Minimum required opacity for this pairing to pass at 10px/tracking-heavy uppercase is approximately 55%.
- **Footer link** `text-cova-ivory/40` (page.tsx:285): same background, 40% opacity resolves to approximately 3.7:1 — below 4.5:1. The hover state `text-cova-ivory` passes (≈16:1), but the resting state fails. The link also has no visible focus indicator beyond `focus-visible:text-cova-ivory`, which is a color-only change with no geometric focus ring.

### 4. Focus order ✅

PRE: email input → submit button → footer link. POST: resend button receives programmatic focus via `resendButtonRef` immediately after the crossfade completes (page.tsx:96–99). Footer link is always reachable. Order is logical.

### 5. ARIA ⚠️

**`aria-live` placement issue in POST state.** The anti-enumeration helper `<p aria-live="polite">` appears inside `PostSubmit` (page.tsx:518). Because `PostSubmit` does not mount until after the crossfade, the live region is added to the DOM at the same moment its text content is set. NVDA/JAWS frequently miss announcements when a live region is injected with content already present — the mutation must happen after the region exists. Fix: mount an empty `aria-live="polite"` region in the PRE state and populate it on transition, or place the live region outside the conditional render block.

Toast component has `role="alert"` and `aria-live="polite"` (Toast.tsx:48–49). Correct.

The `Spinner` uses `role="status"` with `aria-label="Loading"` (page.tsx:559–563). Acceptable. However, the submit button itself has no `aria-busy` toggle during loading, so screen readers relying on button state alone will not know a request is in flight.

### 6. Touch targets ✅

Primary button: `h-[44px]` with `w-[240px]` — meets 44×44 minimum (page.tsx:433–448). Resend button: same height spec (page.tsx:533–546). Toast dismiss `X`: the button wraps a 14px icon with `p-1` padding giving approximately 22×22px — below 44px. This is the same in both `Toast.tsx:63` and the ui-gen `ErrorBanner`. Flag but shared component, not introduced by this screen alone.

### 7. D-008 ✅

No internal style codenames (Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) appear anywhere in either file. No cv-trigger strings exposed. Clean.

---

## Required fixes (blockers)

**B-1 — Component mismatch between ui-gen source and production file.**
`cova-plan/ui-gen/P01b/auth-forgot-password.tsx` uses a self-contained `ErrorBanner` with an inline `<style>` block and a keyframe animation (`cova-banner-in 150ms ease-out`) that (a) is not guarded by `prefers-reduced-motion` at the keyframe level in a way that respects the 200ms motion budget and (b) duplicates banner logic that now lives in `Toast.tsx`. The production `page.tsx` correctly imports `Toast` instead. Confirm the ui-gen source is treated as a design artifact only and is not re-imported anywhere in the build. If the ui-gen source is ever used as a code template going forward, replace `ErrorBanner` with the shared `Toast`.

**B-2 — Contrast failures on email label and footer link.**
Raise `text-cova-ivory/35` on the email label to at minimum `/55` (page.tsx:381). Raise `text-cova-ivory/40` on the footer link to `/55` in its resting state (page.tsx:285), or add a geometric focus indicator (e.g., `focus-visible:ring-1 focus-visible:ring-cova-gold/60 focus-visible:outline-none`) to supplement the color-only focus state.

**B-3 — `aria-live` region injection race.**
Move the `aria-live="polite"` region for the POST helper text outside the `renderPostSubmit` conditional, so the region exists in the DOM before its content changes. Recommended: a single persistent `<div aria-live="polite" className="sr-only">` in the page root, updated with the helper string on state transition.

---

## Suggested polish (nits)

- **N-1** — Add `aria-busy="true"` to the submit and resend buttons while `isLoading` is true (page.tsx:433, 533). One attribute, meaningful for screen-reader users.
- **N-2** — Mobile column gutter: change `w-[calc(100%-48px)]` to `w-[calc(100%-32px)]` (page.tsx:218) to match the spec's stated 16px/side gutters. Current 24px/side is visually fine but spec-inconsistent.
- **N-3** — The mount animation uses `duration-[400ms]` (page.tsx:196) — double the 200ms motion budget ceiling. Consider reducing to `duration-200` or document this as a deliberate exception in a code comment.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/forgot-password/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/auth-forgot-password.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/Toast.tsx`
- `/Users/daksh/Desktop/cova/apps/web/tailwind.config.ts`
