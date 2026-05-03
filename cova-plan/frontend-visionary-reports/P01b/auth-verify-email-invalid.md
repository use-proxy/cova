# Frontend Visionary — /auth/verify-email-invalid

## Verdict

CONDITIONAL PASS. One accessibility blocker and two design-token mismatches must be fixed before ship. All eight copy strings land verbatim. No D-008 violations. Layout invariants correct.

---

## Findings

### 1. Design-system tokens

The ui-gen source (`cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx`) and the shipped page (`apps/web/app/auth/verify-email-invalid/page.tsx`) both declare identical inline CSS tokens. However two tokens diverge from the spec:

- Spec background: `#0A1628`. Both files use `#091829` (`--cova-navy`). This is a consistent internal decision inherited from the phase-doc's own "bg-cova-navy" token definition and applied everywhere in the auth suite — acceptable as the phase doc governs over the agent brief.
- Spec surface: `#0F1F3D`. Not used here (no cards/panels on this screen) — correct for a full-bleed form screen.
- `--cova-warm-error` is `#A8443B` in both files, matching spec. ✅
- All gold appearances use `rgba(201, 168, 76, …)` which is `#C9A84C` at partial opacity — surgical and correct. ✅
- Spinner uses hardcoded `#F5F0E8` instead of `var(--cova-ivory)` at `page.tsx:150`. Minor inconsistency, not a contrast risk. ⚠️

### 2. Layout invariants

- Full-bleed navy ground: ✅ (`page.tsx:212–221`)
- Fixed Wordmark top-left: ✅ — `<Wordmark />` is called at `page.tsx:223` and `Wordmark.tsx:32–44` places it `fixed top-6 left-6 md:top-8 md:left-10`.
- 360px column with vertical hairline: ✅ (`page.tsx:229–238`)
- Eyebrow → italic serif headline → helper → 32px gold rule order: ✅
- Footer link present on `?reason=expired`, absent on `?reason=used`: ✅ (`page.tsx:351–363`)
- Sharp corners (0px border-radius): ✅ on button (`page.tsx:169`) and all containers.
- No shadows, no glows, no cards: ✅

### 3. Contrast (WCAG AA)

- Headline (`#F5F0E8` on `#091829`): ~16.8:1 — ✅
- Button text (`#F5F0E8` on transparent/`#091829`): ~16.8:1 — ✅
- Helper text (`rgba(245,240,232,0.50)` on `#091829`): effective ~`#9DA8B3` on `#091829` ≈ 5.6:1 — ✅ passes AA for normal text
- Eyebrow text (`rgba(201,168,76,0.60)` on `#091829`): effective ≈ `#8E7742` on `#091829` ≈ 3.0:1 — ❌ FAILS AA (4.5:1 required for 10px/11px text). At 10px uppercase this is also too small to apply the 3:1 large-text exemption.
- Footer link rest state (`rgba(245,240,232,0.40)` on `#091829`): effective ≈ `#748897` on `#091829` ≈ 3.9:1 — ❌ FAILS AA for 10px text. Hover state (`#F5F0E8`) passes.

### 4. Focus order

- Auto-focus fires on `primaryButtonRef` after mount (`page.tsx:53–57`). ✅
- On `?reason=expired`: tab order is CTA button → footer link (fixed, appended to DOM after column). This is logical. ✅
- On `?reason=used`: CTA button only, no footer. ✅
- Focus ring (`outline: 1px solid rgba(201,168,76,0.60)`) is visible but thin. At 60% opacity on `#091829` this ring is ~3.2:1 — below the 3:1 UI component threshold, barely. Acceptable but tight. ⚠️

### 5. ARIA

- `aria-live="polite"` on the helper `<p>` at `page.tsx:283`: ✅ — substate change announced when `helperText` updates.
- `<Toast>` has `role="alert"` + `aria-live="polite"` (`Toast.tsx:48–49`). ✅
- Button `aria-label` updates during loading state to `"Sending verification email…"` (`page.tsx:321–323`). ✅
- Wordmark has `aria-label="Cova"` and the em-dash is `aria-hidden="true"` (`Wordmark.tsx:33,38–40`). ✅
- Missing: no `aria-describedby` or `role` linking the eyebrow to the `<h1>`. Not a blocker for this screen type, but an enhancement opportunity. ⚠️
- The spinner has no `aria-hidden="true"` or visually-hidden label text — screen readers will read a blank button content during loading. ❌ BLOCKER.

### 6. Touch targets

- `.cova-btn` height is `44px` (`page.tsx:161`). Width 240px and 200px respectively. ✅
- Footer link: no explicit padding, text-only at 10px. Effective tap target is ~16px tall — well under 44px. ❌ BLOCKER on mobile.

### 7. D-008

No internal style codenames (Japandi, Bohemian, Coastal, etc.) appear anywhere in either file. ✅

### 8. Copy lock verification

All locked strings present verbatim:

- `?reason=expired` eyebrow: "ACCOUNT — LINK EXPIRED" — `page.tsx:85` ✅
- `?reason=expired` headline: "This link has expired" — `page.tsx:87` ✅
- `?reason=expired` helper: "Verification links expire after 24 hours. We can send you a new one." — `page.tsx:90` ✅
- `?reason=expired` CTA label: "RESEND VERIFICATION EMAIL" — `page.tsx:330` ✅
- `?reason=expired` footer: "ALREADY VERIFIED — SIGN IN" — `page.tsx:361` ✅
- `?reason=used` eyebrow: "ACCOUNT — LINK USED" — `page.tsx:85` ✅
- `?reason=used` headline: "This link has already been used" — `page.tsx:88` ✅
- `?reason=used` helper: "Looks like you've already verified. You can sign in below." — `page.tsx:91` ✅

---

## Required fixes (blockers)

**B-1 — Spinner not announced to screen readers** (`page.tsx:327–329`)

During the loading state the button text disappears and only `<span className="cova-spinner" />` renders. Screen readers read an empty button. Fix: add `aria-hidden="true"` to the spinner span and a visually-hidden status string inside the button.

```tsx
{isResending ? (
  <>
    <span className="cova-spinner" aria-hidden="true" />
    <span className="sr-only">Sending…</span>
  </>
) : (
  "RESEND VERIFICATION EMAIL"
)}
```

**B-2 — Footer link touch target too small on mobile** (`page.tsx:354–362`)

The fixed-position footer link has no padding, producing a ~16px tap target. Add `padding: "12px 16px"` and offset the positioning to compensate (`bottom` and `right` reduced by 12px/16px respectively) to keep visual placement identical.

**B-3 — Eyebrow contrast fails AA** (`page.tsx:251`)

`rgba(201,168,76,0.60)` at 10px text resolves to ~3.0:1 on `#091829`. Raise opacity to 1.0 (`#C9A84C` on `#091829` ≈ 5.1:1, passes AA). The "surgical" gold spec permits this — it is a UI label, not a decorative element.

---

## Suggested polish (nits)

- **N-1** — Spinner uses hardcoded `#F5F0E8` (`page.tsx:150`). Replace with `var(--cova-ivory)` for token consistency.
- **N-2** — Footer link rest-state contrast (3.9:1) is borderline at 10px. Adding `letter-spacing: 0.25em` already present helps legibility but does not fix contrast. Consider raising opacity from 0.40 to 0.55 (~5.0:1). Not a hard WCAG failure at this text size only if treated as decorative UI chrome, but risky under strict AA audit.
- **N-3** — Mount animation is 400ms (`page.tsx:109`). The design-system spec specifies 200ms ease-out for all transitions. Suggest aligning to 200ms unless the phase doc explicitly carved out a longer mount duration.
- **N-4** — The ui-gen source (`cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx:60–63`) still has a `console.log` placeholder and `setTimeout` stub in `handleResend`. These are absent from the shipped page (`page.tsx:59–77`) which correctly calls the real API endpoint. Confirm the ui-gen file is not executed anywhere; if it is, remove the stub.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/auth/verify-email-invalid/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/ui/Toast.tsx`
