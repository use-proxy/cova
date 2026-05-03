# Frontend Visionary — /account-deleted

## Verdict

CONDITIONAL PASS. The implementation is faithful to the ui-gen artifact and the design language in all structural respects. Three blockers require fixes before shipping: the Wordmark is inert for screen readers, the "RETURN HOME" link has no visible focus ring and its touch target is critically undersized at 10px text, and `aria-live="polite"` is misused on a static paragraph. One contrast value (body text at 50% ivory) is borderline and should be verified.

---

## Findings

### 1. Design-system tokens

The production file (`page.tsx`) imports and renders the shared `Wordmark` component correctly. `bg-cova-navy`, `text-cova-ivory`, `text-cova-gold`, and the `/[0.12]`, `/40`, `/50`, `/60` opacity variants are all present and match the spec. Gold appears exactly 3 times (eyebrow label, hairline rule, Wordmark em-dash inside the component). No design-system token violations.

### 2. Layout invariants

Intentional break confirmed: no fixed footer, single inline "RETURN HOME" link, Wordmark rendered top-left via the shared component at `page.tsx:16`. Mobile width `calc(100vw - 48px)` deviates slightly from the spec's `calc(100vw - 32px)` — the artifact uses `-48px` (24px gutter each side), the phase doc specifies `-32px`. Minor, but flag it.

`page.tsx:19`: `w-[calc(100%-48px)]` vs spec `min(360px, calc(100vw - 32px))`.

### 3. Contrast — WCAG AA

- Eyebrow `text-cova-gold/60`: #C9A84C at 60% opacity over #091829 navy yields approximately 3.1:1. This is below 4.5:1 for 10px text (which is far below the 18pt / 14pt bold threshold for large text). **Borderline fail at this size — verify with exact hex.**
- Body copy `text-cova-ivory/50`: #F5F0E8 at 50% opacity over #091829 is approximately 5.4:1. Passes AA.
- "RETURN HOME" `text-cova-ivory/40`: approximately 4.3:1 at rest. Just under AA. On hover it upgrades to full ivory (fine). The resting state is the public-facing state that matters for compliance.

### 4. Focus order

Tab order is: Wordmark (fixed, `aria-label="Cova"`, focusable) → "RETURN HOME" link. Logical. However, `focus:outline-none` on the link at `page.tsx:49` removes the browser default ring, and `focus-visible:text-cova-ivory` only changes text color — no visible ring, underline, or outline is added. This is a keyboard accessibility failure.

`page.tsx:49`: `focus:outline-none` with no compensating focus ring.

### 5. ARIA

The `Wordmark` component at `Wordmark.tsx:32` carries `aria-label="Cova"` on the left-aligned variant — correct, it is navigable. The eyebrow "Account — Removed" at `page.tsx:28` is not wrapped in a landmark or given a role; it reads fine in flow order so this is acceptable.

`aria-live="polite"` at `page.tsx:37` is applied to a static paragraph that is already present in the DOM on render. `aria-live` is meaningful only when content changes dynamically. On this confirmation screen the paragraph is not injected after load — it mounts with the component. A screen reader will announce the full page on load without the live region. Remove it; add `role="status"` to the `<section>` or `<main>` instead if you want the page announced as a status confirmation.

### 6. Touch targets

The "RETURN HOME" link is `text-[10px]` microtype with no explicit `min-h`, `py`, or `px` padding. Rendered height will be approximately 12–14px, well below the 44px minimum. The `<div class="text-center">` wrapper adds no padding.

`page.tsx:47–53`: no padding on the anchor; touch target fails the 44px floor.

### 7. D-008

No internal style codenames (Japandi, Bohemian, etc.) appear anywhere in the component. Copy is entirely generic. Pass.

### 8. Brand-tone

Copy is matter-of-fact and final: "Your account has been deleted. All your data has been permanently removed." No apology, no retention ask, no celebration. The eyebrow "Account — Removed" is clipped and neutral. "You're free to start a new account at any time" is one sentence of practical information, not a win-back pitch. Pass.

---

## Required fixes (blockers)

**B-1. Focus ring missing** (`page.tsx:49`)
Replace `focus:outline-none` with a visible focus-visible indicator. A 1px `outline` in `cova-gold` or `cova-ivory` at `focus-visible:` satisfies WCAG 2.4.7 without breaking the aesthetic. Example addition: `focus-visible:outline focus-visible:outline-1 focus-visible:outline-cova-ivory focus-visible:outline-offset-4`.

**B-2. Touch target undersized** (`page.tsx:47–53`)
The "RETURN HOME" anchor must be tappable at 44px minimum. Add `py-[16px] px-[12px]` to the anchor, or wrap it in a `min-h-[44px]` flex container. The visual text can remain 10px — only the interactive hit area needs to grow.

**B-3. Misused `aria-live`** (`page.tsx:37`)
Remove `aria-live="polite"` from the static body paragraph. Add `role="status"` to the `<section>` element at `page.tsx:17` so the confirmation region is announced correctly on page load.

---

## Suggested polish (nits)

- **N-1. Mobile gutter** (`page.tsx:19`): `calc(100%-48px)` vs spec `calc(100vw-32px)`. Align to the spec or lock the deviation as intentional in a comment.
- **N-2. Eyebrow contrast**: consider bumping `text-cova-gold/60` to `/70` or `/75` for the 10px eyebrow label. At 10px the 4.5:1 threshold applies and /60 is marginal depending on the rendered monitor gamma.
- **N-3. "RETURN HOME" resting contrast**: `text-cova-ivory/40` at rest is approximately 4.3:1, just under AA. `/50` would clear it comfortably and still read as subdued.
- **N-4. Motion budget**: the single mount fade is 400ms. The spec states 200ms ease-out for all state transitions. This is the only transition on the page so a deliberate 400ms entrance could be justified as editorial, but it should be documented or reduced to 200ms for system consistency.

---

## Files reviewed

- `/Users/daksh/Desktop/cova/apps/web/app/account-deleted/page.tsx`
- `/Users/daksh/Desktop/cova/cova-plan/ui-gen/P01b/account-deleted.tsx`
- `/Users/daksh/Desktop/cova/apps/web/components/brand/Wordmark.tsx`
