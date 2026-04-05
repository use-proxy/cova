# Session 8 Progress — Step 8: Render Reveal

Date: 2026-04-05

---

## Files Created / Modified

### `apps/web/app/design/step-8/page.tsx`
Full implementation of the render reveal screen, replacing the stub.

---

## Architecture Notes

### Source component
v0 component `render-reveal.tsx` imported from Downloads. Converted entirely from
Tailwind classes to inline `style` objects to match the rest of the design/step-* pages.

### `styleName` — Not Displayed
`useFingerprintStore` is not imported in step-8. The v0 component showed a
hardcoded "Warm Japandi" style label. Rule 8 prohibits showing style names
(Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist) in any user-facing
string. The label was removed entirely.

---

## Before / After Toggle

Two `<img>` elements, both always in the DOM (`position: absolute, inset: 0`):
- Layer 1 (render/after): `opacity: showingBefore ? 0 : 1`
- Layer 2 (original/before): `opacity: showingBefore && canToggle ? 1 : 0`, `filter: grayscale(1)`
- Both: `transition: opacity 400ms ease`

No conditional rendering on the image layers — avoids layout shift and preserves
the crossfade transition.

`canToggle = Boolean(originalPhotoUrl)` — if no original photo in store, the
Before/After pill is disabled (opacity 0.4, cursor default).

---

## State

| State var | Type | Purpose |
|---|---|---|
| `showingBefore` | `boolean` | Controls opacity crossfade between after/before |
| `showCopied` | `boolean` | 2s "Link copied" toast after clipboard fallback |

---

## Button Labels

| State | Pill label |
|---|---|
| `showingBefore === false` (default) | `Before / After` |
| `showingBefore === true` | `See Redesign` |

"Before" label (bottom-left, above bottom bar, opacity-animated):
- `position: absolute`, `bottom: 148`, `left: 20`
- `fontSize: var(--text-xs)`, `color: rgba(245,240,232,0.6)`
- `opacity: showingBefore ? 1 : 0`, `transition: opacity 400ms ease`

---

## Navigation

| Button | Destination |
|---|---|
| "Shop This Look →" | `/design/step-10` |
| "Not quite right?" | `/design/step-9` |

---

## Share

```ts
if (navigator.share) {
  await navigator.share({ title: 'My room redesigned by Cova', url: window.location.href })
} else {
  await navigator.clipboard.writeText(window.location.href)
  setShowCopied(true)           // shows "Link copied" toast for 2s
  setTimeout(() => setShowCopied(false), 2000)
}
```

User cancel / API unavailable: caught silently.

---

## Button Sizing

- Primary "Shop This Look →": `padding: 12px 20px` (py-3 equiv), `fontSize: var(--text-sm)`, `fontWeight: 500`, `borderRadius: 12`
- Ghost "Not quite right?": `padding: 12px 20px`, `fontSize: var(--text-sm)`, `borderRadius: 12`
- Bottom bar: `padding: 20px 20px 40px` (pb-10 equiv), `gap: 8px` between buttons
- Total bottom bar height: ~148px

---

## Color Compliance

Zero hardcoded hex values.
All colors use `var(--cova-*)` CSS variables or `rgba(...)` for overlay gradients.
Verified: `grep -r "#[0-9A-Fa-f]{6}" app/design/step-8/ --include="*.tsx"` → 0 matches

---

## Redirect Guard

```ts
useEffect(() => {
  if (!renderUrl) router.replace('/design/step-7')
}, [renderUrl, router])
if (!renderUrl) return null
```

---

## Build Status

- `npm run build` → **PASS** (58 pages, zero errors)
- `npx tsc --noEmit` → **PASS** (zero errors)

---

## What's Next

- step-9: Refine flow — user can describe changes, sends `modified_prompt` to render API
- step-10: Product matching + shop panel (hotspots from cube face detection)
