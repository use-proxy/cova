# Frontend Visionary — /auth/verify-email-success

## Verdict

FAIL — one blocker (redirect destination mismatch) and one material a11y concern (screen reader timing with no fallback affordance). Everything else is in good shape.

---

## Findings

### 1. Design-system tokens ✅

Background `bg-cova-navy`, text `text-cova-ivory`, eyebrow `text-cova-gold/60`, gold rule `bg-cova-gold/40`, checkmark `text-cova-gold` — all correct. Gold is the sole saturated moment; no competing saturated accents. `font-serif italic` on headline and helper line matches the spec editorial register. Eyebrow uses `font-sans uppercase tracking-[0.3em]` per the DM Sans tracked spec.

### 2. Layout invariants ❌

Intentional breaks are correctly present in the implementation: no hairline rule on the left, no fixed footer, gold rule is centered (`items-center` on the flex column), Wordmark is fixed top-left via the shared `Wordmark` component.

**However, `page.tsx:17` redirects to `/design/step-1`, while the spec and ui-gen source both specify `/welcome`.** This is a route mismatch. The ui-gen source at `auth-verify-email-success.tsx:33` is the canonical source and reads `/welcome`. The page also does not apply the `min(360px, calc(100vw - 32px))` column-width constraint specified in the mobile scaling rule — the content block is unconstrained width, just `px-6`. This is a minor deviation (content is naturally narrow) but worth flagging.

### 3. Contrast ⚠️

- `text-cova-ivory` (#F5F0E8) on `bg-cova-navy` (#091829): ~14.5:1 — passes AAA.
- `text-cova-gold/60` eyebrow: #C9A84C at 60% opacity over #091829 resolves to approximately #6F5E34 effective on dark — this falls to roughly 3.8:1, below the 4.5:1 AA text requirement. The eyebrow is the only weak point; the rule is `aria-hidden` so contrast exemption applies there, but the eyebrow is visible copy.
- Helper line `text-cova-ivory/50` at 50% opacity: approximately #7B796F over navy — approximately 4.0:1. Borderline; passes AA at the 14px/italic weight (technically "large text" threshold is 18pt/24px, so this sits in normal-text territory at 14px and is marginal).

### 4. Focus order ✅

No interactive elements other than the Wordmark. The Wordmark at `page.tsx:28` renders the shared `Wordmark` component, which is `fixed z-10 top-6 left-6` but has no `tabIndex` and no `<a>` wrapper — it is not keyboard-focusable, which is correct for a purely decorative brand mark on a transient screen.

### 5. ARIA — screen reader timing ⚠️

`aria-live="polite"` is placed on the helper `<p>` at `page.tsx:43`. This is the right region attribute. However the live region holds `"Redirecting you to set up your style..."` — it will only announce after the `mounted` RAF fires, which is correct (content updates trigger the polite announcement). 

The concern is substantive: 3 seconds is tight for a screen reader user to hear both the page's content and the redirect announcement before being navigated away. VoiceOver/NVDA can take 1–2s to announce the focused document and begin reading. An SR user with speech rate on the slower side will miss the message entirely before the redirect fires. The spec notes this as a known consideration ("consider whether SR users get a longer window or an explicit 'continue' affordance") but the implementation provides no such affordance. There is no `role="status"` on the overall success region, and no `aria-label` or heading that a screen reader will encounter before the live region.

The checkmark wrapper at `page.tsx:30` carries `role="img" aria-label="Verified"`, but `AnimatedCheckmark` at `AnimatedCheckmark.tsx:50-53` also declares its own `role="img" aria-label="Verified"` on its inner div. The outer wrapper in `page.tsx:30` is thus a redundant nested `role="img"` — the outer role will be announced with label "Verified" and the inner SVG is `aria-hidden="true"` (correct), but the page's outer wrapper adds a duplicate announcement layer.

### 6. Touch targets ✅

Wordmark is fixed top-left but has no tap affordance (not a link). No interactive element requiring a 44px target exists on this screen. Acceptable given the transient, non-interactive nature of the screen.

### 7. D-008 ✅

Eyebrow reads "ACCOUNT — VERIFIED". Helper line reads "Redirecting you to set up your style..." Neither string exposes internal style codenames (Japandi, Bohemian, etc.). Clean.

---

## Required fixes (blockers)

**B-1 — Redirect destination mismatch (`page.tsx:17`)**
The page redirects to `/design/step-1` but the spec and ui-gen source specify `/welcome`. Change line 17:
```
window.location.href = "/design/step-1";
```
to:
```
window.location.href = "/welcome";
```
This is a hard routing bug — the screen title card says "set up your style" and the intent is the welcome/onboarding gate, not step-1 directly.

---

## Suggested polish (nits)

**P-1 — Redundant `role="img"` wrapper (`page.tsx:30`)**
The outer `<div role="img" aria-label="Verified">` duplicates the identical role already on `AnimatedCheckmark`'s root div. Remove `role="img"` and `aria-label` from the wrapper in `page.tsx:30`; the component is self-describing.

**P-2 — SR timing affordance**
Consider extending the redirect timer to 5s when `prefers-reduced-motion` is not the gating condition, or adding a visually-hidden but SR-accessible "Continue to setup" link that appears after the live region fires. Even `aria-atomic="true"` on a wrapping `role="status"` region would ensure the full success message is announced as a unit before the redirect fires.

**P-3 — Eyebrow contrast**
`text-cova-gold/60` on navy is ~3.8:1. Nudge to `text-cova-gold/70` to clear 4.5:1 AA for the 10px normal-weight text.

**P-4 — Mobile width constraint**
Spec calls for `width: min(360px, calc(100vw - 32px))` on the content column. The current `px-6` padding is loose but does not enforce max-width. Add `w-[min(360px,calc(100vw-32px))]` to the flex column div at `page.tsx:29`.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/verify-email-success/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/auth-verify-email-success.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/AnimatedCheckmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
