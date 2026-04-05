# Session: Step 10 Shoppable Render Wiring
Date: 2026-04-05

## What was built

### New files
- `apps/web/components/cova/ShopRoom.tsx` — Full shoppable render component
- `apps/web/app/design/step-10/page.tsx` — Page orchestrating data fetching + ShopRoom

### Modified files
- `apps/web/app/api/match/route.ts` — Added `item_label?: string` to request body + Claude Vision focus prompt

---

## ShopRoom.tsx feature summary

| Feature | Notes |
|---|---|
| Fixed inset-0 layout with background render image | ✅ |
| Hotspot dots at (left%, top%) positions | ✅ Appear after 1.5s with spring animation |
| `your-room` synthetic item suppresses dot | ✅ |
| Bottom sheet: collapse/expand with spring animation | ✅ `calc(100% - 130px)` collapsed |
| Item pills in collapsed header | ✅ Horizontal scroll |
| Tab bar in expanded section | ✅ Mirrors pills |
| Product cards horizontal scroll (168px each) | ✅ |
| Skeleton cards (3× ivory shimmer) while loading | ✅ Framer Motion animated gradient |
| "X items found" vs "Tap items to explore" | ✅ Dynamic based on detection count |
| Match label badge: Perfect Match / Very Similar / Inspired By | ✅ Color-coded |
| Price formatted via Intl.NumberFormat | ✅ |
| `onBuyClick` callback wired through ProductCard | ✅ |
| No hardcoded data | ✅ All driven by props |

## Step-10 page feature summary

| Feature | Notes |
|---|---|
| Guard: redirect to step-8 if no renderUrl | ✅ |
| KeepMask → DetectedItems conversion (0.75 confidence threshold) | ✅ |
| Zero-detection fallback: single general match, "Your Room" tab | ✅ |
| Parallel match API calls on mount (hasFiredRef prevents double-fire) | ✅ |
| `item_label` passed per detection for focused Claude Vision | ✅ |
| handleBuyClick: fire-and-forget Supabase interaction log | ✅ |
| handleBuyClick: injects cova03-20 tag, opens in new tab | ✅ |

## API changes

- `/api/match` accepts `item_label?: string`
- When present, Claude Vision prompt becomes: "Focus specifically on the {item_label} in this room render. Describe it for product matching."
- Backward-compatible — existing calls without item_label work unchanged

## Decisions

- `shop-room.tsx` v0 component not found in repo; built ShopRoom.tsx from scratch matching Cova design system
- Skeleton cards use Framer Motion animated gradient (no CSS keyframe needed)
- `.catch()` not available on Supabase PromiseLike — used two-arg `.then(ok, err)` pattern
- `hasFiredRef` prevents React StrictMode double-invocation of match API

## Build
- `npm run build` passes with zero TypeScript errors
