# Session 3 — Coherence Check, Kept Furniture Context, Accessory Pass

## Date
2026-04-05

## Summary
Three features that complete the product matching system:
1. Multi-item coherence check — Claude evaluates the combined product set and swaps outliers
2. Kept furniture context — `keep === true` items passed as style context to both APIs
3. Accessory secondary pass — 3–4 "Complete the Look" items in a separate sheet section

## Files Created

### `app/api/match/coherence/route.ts`
- Auth-gated POST endpoint
- Skips evaluation if fewer than 2 items (returns score=8, wasAdjusted=false)
- Builds top-recommendation-per-item summary, prompts Claude Haiku for coherence scoring
- Returns `{ productsByItem, coherenceScore, wasAdjusted, adjustmentReason }`
- Outlier swap: promotes second recommendation to top, demotes first to end
- Falls back gracefully on JSON parse failure (returns unchanged products, score=7)

### `app/api/match/accessories/route.ts`
- Auth-gated POST endpoint
- Computes accessory budget: 10% of total budget / 3 items
- Maps fingerprint dimensions (temperature, texture, nature, era, saturation) → style terms
- Picks 3 accessory categories from room-type map, excludes already-matched primary items
- Searches Serper per category with fingerprint terms + kept context
- Returns top-1 result per category as `accessories[]` with `category` field

## Files Modified

### `app/design/step-10/page.tsx`
- Added `styleName` to `useFingerprintStore()` destructuring
- Added `accessories: Accessory[]` state (typed locally as `MatchedProduct & { category }`)
- Changed `const byItem` → `let byItem` to allow coherence reassignment
- Added `keptItemLabels` derived from `keepMask.filter(keep === true).map(label)`
- Per-item path: after Promise.allSettled → coherence check → setProductsByItem → setIsLoadingProducts(false) → accessories call → setAccessories
- Zero-detection path: accessories call added after fallback match
- `accessories` passed to `<ShopRoom>` as prop

### `components/cova/ShopRoom.tsx`
- Defined `AccessoryProduct = MatchedProduct & { category: string }` type alias
- Added `accessories?: AccessoryProduct[]` to `ShopRoomProps`
- Expanded state: product grid extracted from `flex-1`, wrapped in `flex-1 overflow-y-auto` div
  - Allows vertical scrolling to reveal accessories below the product row
- "Complete the Look" section after product grid: gold uppercase label, subtitle, horizontal scroll of `ProductCard` components with explicit field mapping (no excess property issues)
- Section only renders when `accessories.length > 0`

## Acceptance Criteria Check
- [x] `npm run build` passes, zero TypeScript errors
- [x] `npx tsc --noEmit` passes, zero errors
- [x] `/api/match/coherence` accepts POST, returns adjusted productsByItem
- [x] `/api/match/accessories` accepts POST, returns 3–4 accessory products
- [x] step-10 calls coherence after all items matched
- [x] step-10 calls accessories after coherence
- [x] Both calls non-blocking (try/catch, continue on failure)
- [x] `accessories` prop passed to ShopRoom and rendered in expanded sheet
- [x] "Complete the Look" only appears when accessories.length > 0
- [x] Kept item labels correctly derived from keepMask where keep === true
