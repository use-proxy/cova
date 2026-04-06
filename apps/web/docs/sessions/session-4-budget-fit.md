# Session 4 — Budget Allocation, Fit Scoring, Fit Labels on Product Cards

## Date
2026-04-05

## Summary
Five features that make product recommendations smarter and safer:
1. Per-item budget allocation — designer ratios per room type
2. Room-level budget optimizer — swap over-budget items, upgrade under-budget ones
3. Dimension extraction — regex parser for product titles
4. Fit scoring engine — hard reject too-wide items, soft scores for clearance
5. Fit labels on product cards — green/gold/orange indicator per product

## Files Created

### `lib/ai/budget.ts`
- `BUDGET_ALLOCATION` — professional designer ratios by room type (sofa=35% living room, bed=30% bedroom, etc.)
- `getItemBudgetTarget(itemLabel, roomType, totalBudgetRange): [number, number]` — fuzzy label→key match, returns [target*0.75, target*1.15]
- `optimizeRoomSelection(productsByItem, budgetRange)` — greedy over-budget swap + under-budget upgrade loop

### `lib/ai/fit.ts`
- `ProductDimensions` — `{widthInches, depthInches, heightInches, source, confidence}`
- `FitLabel` — `'Perfect Fit' | 'Good Fit' | 'Tight Fit' | 'Dimensions Unconfirmed'`
- `CLEARANCE_RULES` — per-category minimum clearances and maxWidthRatio
- `CATEGORY_DEFAULTS` — typical dimensions when no product data available
- `DIMENSION_PATTERNS` — 5 regex patterns ordered from specific to general
- `extractDimensionsFromText(text)` — tries patterns, returns first match
- `getDimensionsForCategory(itemLabel)` — fuzzy match to category defaults
- `scoreFit(itemLabel, dims, usableWallInches)` — hard reject if >maxWidthRatio; Perfect/Good/Tight scores

## Files Modified

### `app/api/match/route.ts`
- Added imports: `getItemBudgetTarget`, `extractDimensionsFromText`, `getDimensionsForCategory`, `scoreFit`, `FitScore`
- Added `primary_wall_usable_inches?: number` to `MatchRequestBody`
- Added `primary_wall_usable_inches` to body destructuring
- Compute `itemBudgetRange = getItemBudgetTarget(item_label, room_type, budget_range)` when budget_range non-null
- Serper queries now use `itemBudgetRange` instead of total `budget_range`
- `candidatesWithScores` gained `fitResult: FitScore`
- For each candidate: extract dims from title → scoreFit → hard reject if `!fitResult.passes`
- New score formula: `0.55 * visual + 0.25 * budget + 0.10 * fit + 0.10 * quality`
- All response paths include `fit_label` and `fit_reason`
- CLIP fallback and zero-detection fallback both return `fit_label: 'Dimensions Unconfirmed'`

### `app/design/step-10/page.tsx`
- Added `roomLength, roomWidth` to `useFingerprintStore()` destructuring
- Computed `primaryWallUsableInches = Math.max(roomLength, roomWidth) * 12` (undefined when missing)
- Added `primary_wall_usable_inches: primaryWallUsableInches` to zero-detection fetch body
- Added `primary_wall_usable_inches: primaryWallUsableInches` to per-item fetch body
- Added `primaryWallUsableInches` to `useEffect` deps array

### `components/cova/ShopRoom.tsx`
- Added `fit_label?: string` and `fit_reason?: string` to `MatchedProduct` interface
- In `ProductCard`, added fit indicator row after retailer+match dot row:
  - Only renders when `fit_label` is set AND is not `'Dimensions Unconfirmed'`
  - Green `#1A7A4A` for "Perfect Fit"
  - Gold `#C9A84C` for "Good Fit"
  - Orange `#D4801A` for "Tight Fit"

## Acceptance Criteria Check
- [x] `npx tsc --noEmit` passes, zero errors
- [x] `npm run build` passes
- [x] `getItemBudgetTarget` returns per-item range (not total room budget)
- [x] Serper queries use itemBudgetRange
- [x] Hard fit reject removes physically over-sized products before scoring
- [x] Score formula updated to 0.55/0.25/0.10/0.10 (visual/budget/fit/quality)
- [x] `fit_label` and `fit_reason` in every response path
- [x] `primary_wall_usable_inches` passed from step-10 to match API
- [x] Fit indicator dot visible on product cards (green/gold/orange)
- [x] "Dimensions Unconfirmed" never renders a fit dot (hidden)
