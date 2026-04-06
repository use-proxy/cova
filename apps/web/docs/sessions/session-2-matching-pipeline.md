# Session 2 — Serper Integration, Per-Item Crops, Visual Similarity Re-ranking

## Date
2026-04-05

## Summary
Complete replacement of the `/api/match` product matching pipeline.
Old approach: Supabase pgvector CLIP search against static product catalog (~5,581 rows).
New approach: Live Serper.dev Google Shopping → per-item render crop → CLIP visual re-ranking.

## Files Created

### `lib/ai/serper.ts`
- `searchProducts(query, maxResults)` — calls Serper Shopping API
- `buildSearchQuery(description, budgetRange, isTech)` — appends year for tech items
- `isTechItem(label)` — detects TVs, speakers, monitors, etc.
- `SerperProduct` and `SerperSearchResult` types
- Price parser, retailer extractor

### `lib/ai/renderCrop.ts`
- `cropAndUploadRenderRegion(renderUrl, bbox, roomId, itemId)` — uses sharp to crop render to item bbox with 10% padding, uploads to `room-photos/render-crops/` via admin Supabase client
- JPEG dimension detection from image header bytes (JPEG + PNG, 64KB partial fetch)
- Graceful fallback to full render URL if sharp unavailable or upload fails

## Files Modified

### `app/api/match/route.ts` — full rewrite
New request shape:
```typescript
{
  render_url, item_id, item_label, item_bbox, item_keep,
  fingerprint_vector, budget_range, room_type, room_id
}
```
Pipeline:
1. Auth + rate limit check
2. Hard 400 if `item_keep === true`
3. `cropAndUploadRenderRegion` → crop URL
4. Claude Haiku Vision → 15-word item description for search
5. Serper: 2 queries in parallel (specific description + broad label)
6. Deduplicate by productUrl
7. CLIP embed crop + up to 20 candidate product images
8. Hard filter at 0.70 visual similarity
9. Final score: 60% visual + 30% budget + 10% quality rating
10. Return top 5

Fallback: if CLIP embedding fails, skip visual filtering; if Serper returns nothing, return empty products.

### `components/cova/ShopRoom.tsx`
- `DetectedItem` gains optional `bbox` and `keep` fields (passed through to match API)
- `MatchedProduct` gains optional `is_sale`, `rating`, `rating_count`
- `ShopRoomProps` gains `roomTotal?: number` and `savings?: number | null`
- Collapsed and expanded sheet headers display room total + savings vs budget (gold text)

### `app/design/step-10/page.tsx`
- `toDetectedItems()` now includes `bbox` and `keep` on each `DetectedItem`
- Per-item match fetch uses new request shape (render_url, item_id, item_label, item_bbox, item_keep)
- Zero-detection fallback updated to new shape (item_bbox: [0,0,1,1], item_id: 'your-room')
- `roomTotal` and `savings` state computed from `productsByItem` via `useEffect`
- Both passed as props to `ShopRoom`

## Packages Installed
- `sharp@0.34.x` — native Node.js image processing (server-side crop without canvas)

## Acceptance Criteria Check
- [x] sharp installed without errors
- [x] `npm run build` passes, zero TypeScript errors
- [x] `/api/match` validates new request shape
- [x] Per-item render crops generated and uploaded to Supabase Storage
- [x] Serper Shopping called with specific + broad queries per item
- [x] CLIP embedding runs on crop (not full render) for re-ranking
- [x] Products below 0.70 visual similarity filtered out
- [x] Kept items (keep === true) return 400
- [x] step-10 sends new request shape
- [x] Room total and savings computed and displayed in ShopRoom UI
- [x] `npx tsc --noEmit` passes with zero errors
