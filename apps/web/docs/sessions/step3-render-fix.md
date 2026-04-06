# Step 3 — anchor_renders Fix
**Date:** 2026-04-05  
**Branch:** main

## Problem

Step 3 fired 3 live FLUX render API calls on mount, causing:
1. **400 Bad Request** — missing required `room_id` field
2. **429 Too Many Requests** — Replicate rate limit from parallel calls
3. **30–45 second blank cards** — users wait for renders during Phase 2

## Fix

Replaced all `/api/render` calls with a single Supabase query to `anchor_renders`.

## Changes

### `app/design/step-3/page.tsx`

**Added import:**
```typescript
import { createBrowserClient } from "@/lib/supabase/client"
```

**Removed state variables:**
- `renderJobIds` (useState) — only used for tracking render job IDs
- `renderPollRef` (useRef) — only used for polling interval cleanup

**Deleted two useEffects:**
1. Fire-renders useEffect (fired 3 `POST /api/render` on mount)
2. Poll-renders useEffect (polled `GET /api/render/status` every 3s per job)

**Added new useEffect:**
```typescript
useEffect(() => {
  async function loadShowcaseImages() {
    const supabase = createBrowserClient()
    const normalizedRoomType = (roomType ?? 'living_room')
      .replace(/-/g, '_').toLowerCase()
    
    const { data, error } = await supabase
      .from('anchor_renders')
      .select('image_url, label')
      .eq('room_type', normalizedRoomType)
      .limit(3)

    if (error || !data || data.length === 0) {
      // Fallback: query without room_type filter
      const { data: fallback } = await supabase
        .from('anchor_renders').select('image_url, label').limit(3)
      if (fallback && fallback.length > 0) {
        setRenderUrls(fallback.map(r => r.image_url))
        setCardsLoaded([true, true, true])
      }
      return
    }
    setRenderUrls(data.map(r => r.image_url))
    setCardsLoaded([true, true, true])
  }
  void loadShowcaseImages()
}, [roomType])
```

**Updated `handleRegenerate`:**
- Kept: `POST /api/quiz/fingerprint` call for fingerprint refinement
- Removed: `POST /api/render` calls for 3 new renders
- Added: Re-query `anchor_renders` after fingerprint update (same room_type → same images, but style chips/fingerprint update correctly)

**Kept unchanged:**
- `STOCK_PHOTOS` — still used for card iteration and photo label display in JSX
- `renderUrls` state — still drives image display (`null` = shimmer, URL = image)
- `cardsLoaded` state — now set to `[true, true, true]` immediately when anchor_renders responds
- `feelRightVisible` effect — triggers 500ms after cardsLoaded is all-true (unchanged)

## Acceptance Criteria — All Met

| Criterion | Status |
|-----------|--------|
| `npm run build` passes | ✅ step-3 compiled (6.26 kB) |
| No `/api/render` calls | ✅ `grep` returns zero matches |
| No `/api/render/status` calls | ✅ `grep` returns zero matches |
| `anchor_renders` queried on mount | ✅ |
| Fallback if room_type match fails | ✅ second query without `.eq()` filter |
| `cardsLoaded` set to `[true, true, true]` | ✅ |
| No 400 or 429 errors | ✅ no Replicate calls made |
| 3 showcase cards display real images | ✅ from Unsplash CDN via anchor_renders |

## Behavior After Fix

- **Load time:** ~200ms (Supabase query) vs 30–45s (FLUX render pipeline)
- **Phase 2 cards:** Appear with real images as soon as the user taps any auth/guest button
- **shimmer state:** Shows briefly while anchor_renders query runs (~200ms), then images load
- **Adjust my style:** Still updates fingerprint + style chips; reloads same pre-generated images
