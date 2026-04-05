# Session 7 Progress — Step 7: Animated Loading

Date: 2026-04-05

---

## Files Created

### `apps/web/app/design/step-7/page.tsx`
Full implementation of the animated render loading screen.

---

## Architecture Notes

### API Contract Mismatch — Resolved

The spec described `/api/render` as returning `{ prediction_id }` immediately
(async pattern), followed by polling `/api/render/status?prediction_id=...`.

**Reality:** `/api/render` is synchronous — it calls `runFluxRender()` (Replicate FLUX),
waits for completion, then returns `{ render_url, render_session_id }`.

**Resolution:** Built the page to await the single long-running POST. The loading
animation plays during the `await fetch(...)`. A 90s `AbortController` timeout
replaces the 90s polling timeout from spec. The status polling loop is not needed
since the render result comes back in the same response.

This is the correct behavior. If the API is later made async, the page needs minimal
changes: swap the single `await fetch` for `fetch + poll` and extract the `prediction_id`.

### `modifiedPrompt` Field
Not yet in the fingerprint store (added by step-9 refine flow). Sent as `undefined`
in the render payload. No type changes needed — the render API ignores unknown fields.

---

## State Machine

| State | Trigger | Display |
|---|---|---|
| `idle` | Mount | Transitions immediately to `pending` |
| `pending` | `fireRender()` called | Loading UI (heading, depth visual, shimmer) |
| `complete` | `render_url` received | Calls `setRenderUrl`, navigates to step-8 |
| `failed` | HTTP error or API error | Error screen with "Try Again" + "Go Back" |
| `timeout` | AbortController fires at 90s | Error screen with timeout message |
| `invalid` | Null session fields | Invalid session screen, "Go Back" only |

---

## Key Implementation Details

**StrictMode guard:**
```ts
const firedRef = useRef(false)
useEffect(() => {
  if (firedRef.current) return
  firedRef.current = true
  void fireRender()
}, [])
```

**90s abort:**
```ts
const controller = new AbortController()
const timeoutHandle = setTimeout(() => controller.abort(), 90_000)
```

**Retry:** Resets `firedRef.current = false` then calls `fireRender()` again.

**Validation fields checked (null = show invalid screen):**
- `originalPhotoUrl`, `fingerprint`, `roomType`, `budgetRange`, `roomId`

**API payload:**
- `budget: budgetTier` — render API expects the tier string (`'budget'|'mid'|'premium'|'luxury'`)
- `budgetRange` is validated (non-null) but not sent directly to the API
- `depth_map_url` is optional in the payload (can be undefined)

---

## Animations

**Depth map scanline:**
- Framer Motion: `animate={{ top: ['0%', '100%'] }}`
- `transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}`
- Gold line (`var(--cova-gold)`), 2px height, opacity 0.6

**Shimmer progress bar:**
- Framer Motion: `animate={{ x: ['-100%', '250%'] }}`
- `transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}`
- `linear-gradient(90deg, transparent, var(--cova-gold), transparent)`

**Depth map fallback (no depthMapUrl):**
- SVG grid: horizontal + vertical lines every 20px
- `stroke: var(--cova-subtle)`, `opacity: 0.4`
- Same scanline plays over the SVG

---

## `CovaButton` — Not Built
Spec references `CovaButton variant="primary"` and `variant="ghost"`.
Component does not exist in the codebase. Used inline styled `<button>` elements
that match the COVA design system. Creating CovaButton is deferred to M9 UI pass.

---

## Build Status

- `npm run build` → **PASS** (58 pages, zero errors)
- `npx tsc --noEmit` → **PASS** (zero errors)
- One fix: `elapsed` state renamed `_elapsed` (read by timer only, not rendered)

---

## What's Next

- step-8: The render result screen — shows `render_url` from store, before/after toggle, CTA to start processing pipeline
- `/api/render` should eventually be made async (Modal job + polling) for Vercel timeout safety
