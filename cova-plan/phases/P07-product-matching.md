# Phase 7 — Product Matching

**Cova V1 implementation · Phase 7 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 7 of 12 |
| **Goal** | Turn rendered hotspots into shoppable products. User clicks a hotspot, sees product card with affiliate link to a real retailer. Lazy on-click matching via SearchApi.io Google Lens. Direct-link path for user-picked products from Phase 4. Top-3 already preloaded in Phase 5. |
| **Executor session estimate** | 1–2 sessions |
| **Calendar estimate** | 1–1.5 weeks |
| **Predicted Claude credits** | ~$25–40 |
| **Predicted infra spend** | ~$10 (Lens test queries, CLIP re-rank if used, 50-render hotspot bake-off) |
| **Depends on** | Phase 5 closed (hotspots manifest exists); Phase 0 affiliate accounts approved |
| **Blocks** | Phase 9 dashboard ("Shop the room" CTA on per-design view) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phase 5 closed and `renders.hotspots` jsonb populated for test renders. Confirms top-3 preload running (background Lens calls in render_cost_log with category 'lens_preload'). Uses Context7 MCP for: current SearchApi.io Google Lens endpoint, current Sharp crop API, current Cloudflare Workers Lens proxying patterns. Uses EXA MCP for: pHash perceptual hashing libraries (sharp.phash vs imghash vs image-hash), affiliate URL signing (HMAC-signed redirect routes), FTC affiliate disclosure templates. Uses web search for current affiliate URL formats per retailer. Writes executor prompt to `cova-plan/planner-output/P7-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers M13 acceptance criteria.
5. **Executor fires.** 1–2 sessions.
6. **Verifier session 1 fires.** Reviews Lens client correctness, retailer filter, affiliate URL appender accuracy per retailer, direct-link path for user-picked, pHash cache, FTC disclosure, shop screen UI. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: cross-user pHash cache leak, affiliate tag drift, retailer URL malformation, "buy entire room" parallel call rate-limiting, hotspot click race conditions.
8. **50-render hotspot bake-off (mandatory gate).** Daksh + Pranav click ~5 hotspots per render. Verify ≥80% return a match. All 4 affiliate URLs verified correct (Amazon cova03-20, Wayfair, Target, IKEA direct).
9. **Manual screenshot review.** §15 click-script. ~15 screenshots covering hotspot click → product card → affiliate redirect.
10. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (Lens match rate, affiliate URL conversion verification, pHash cache hit rate).

---

## 2. Prereq verification

### Phase 5 closure + Phase 0 dependencies
- `PHASE_STATUS.md` shows P5 → CLOSED
- 50-render quality test gate passed
- `renders.hotspots` jsonb populated with `{id, label, description, bbox, direct_link, product?}` shape
- Top-3 preload running on Stage 8 delivery (verify render_cost_log has rows with category 'lens_preload')
- SearchApi.io API key in `apps/web/.env.local` (Phase 0 confirmed)
- Amazon Associates account active (Phase 0)
- Wayfair affiliate program approved (Phase 0)
- Target Partners approved (Phase 0)
- IKEA: no affiliate program; direct links only
- Hive Visual Moderation account configured (for cropped region pre-Lens moderation)
- PhotoDNA program onboarding complete (CSAM scan on uploaded artwork — already exists from Phase 4 but verify)

### Halt conditions
- Phase 5 hotspots not populated → halt, escalate
- SearchApi.io key missing → halt, get key
- Amazon/Wayfair/Target affiliate IDs not finalized → halt, finalize
- Top-3 preload not running → halt, fix in Phase 5 remediation

---

## 3. Pre-decisions

**G1. SearchApi.io confirmed as Lens provider** (NOT SerpApi which is in Google litigation, NOT Serper which lacks Lens). *Resolution locked:* SearchApi.io. ~$0.005 per query. Same response schema as SerpApi. Has $2M legal shield. ~50% cheaper.

**G2. CLIP re-rank scope.** Plan mentioned CLIP re-rank to compensate for Lens's weakness on AI-generated source images. *Resolution for V1:* DEFER. Lens raw results are good enough for V1. CLIP re-rank becomes Phase 11 M7 bake-off candidate (4 detector+API combos tested). Saves complexity in Phase 7.

**G3. Affiliate retailer whitelist.** *Resolution locked:* Amazon (cova03-20 tag), Wayfair, Target Partners, IKEA (direct, no affiliate). Future expansions in V1.5: Crate&Barrel, West Elm, Pottery Barn, CB2.

**G4. Affiliate URL append patterns:**
- Amazon: `?tag=cova03-20` (or `&tag=` if URL has params)
- Wayfair: `?clickid=cova-wayfair` (or `&clickid=`)
- Target: format TBD until program approved (placeholder `?afid=cova-target`)
- IKEA: no append (no affiliate program)

If a retailer URL doesn't match any whitelist domain: skip; show top match anyway with warning "Direct purchase link only" (no affiliate).

**G5. Lazy match policy locked.** Stage 7 (Phase 5) does region detection + Sonnet labeling at render time. Lens calls happen at hotspot click. EXCEPT top-3 largest hotspots (non-direct-link), which preload in background after delivery. First clicks on those 3 are instant.

**G6. pHash cache.** *Resolution locked:* 30-day TTL. Cache key = pHash of cropped region image (not raw bbox coords; same visual region across renders gets cache hit). pHash via `imghash` lib (chosen over sharp.phash for perceptual hashing accuracy). Cache stored in `product_match_cache` table.

**G7. "Buy entire room" parallel calls.** *Resolution locked:* fires Lens calls for ALL non-direct-link hotspots in parallel (max 12). User-perceived wait time ~3-5s. Cost per "buy entire room" click: ~$0.06 (12 × $0.005). Rate-limited via Bottleneck queue to 8 concurrent (avoid SearchApi rate limit).

**G8. Hive Visual Moderation pre-Lens.** *Resolution locked:* before each Lens call, send cropped region to Hive (~$0.0015/image, $1.50/1000) for NSFW/violence classification. If flagged, skip Lens call, mark hotspot as `unmatched`. Protects against AI-rendered weird artifacts triggering inappropriate Lens results.

**G9. PhotoDNA scope.** *Resolution locked:* PhotoDNA scans uploaded artwork in Phase 4 (art slot mode 3 upload). Phase 7 doesn't directly call PhotoDNA. Mentioned for completeness.

**G10. FTC affiliate disclosure.** *Resolution locked:* embedded in /privacy page already (Phase 1 M2). Phase 7 verifies disclosure language is current per FTC guidelines. Also surfaced as small footer text on shop screen: "Cova may earn a commission on purchases made through our links."

**G11. Hotspot click → product card UX.** *Resolution locked:* zoom-in modal pattern. Click hotspot → modal expands from click position to centered modal (~400ms motion). Product card inside. Close X returns to render with hotspots. Buy CTA opens retailer in new tab via signed redirect URL.

**G12. Signed redirect URLs (HMAC).** *Resolution:* `/r/{hash}` route at `apps/web/app/r/[hash]/route.ts`. Hash = HMAC(SHA256, retailer_url + product_clicks.id) signed with secret. Prevents URL tampering. Logs the click in product_clicks. Redirects to retailer.

---

## 4. Background context (self-contained)

### 4.1 What product matching delivers

After hotspot click, Cova has:
- `product_clicks` row recording the interaction
- Modal showing matched product card
- Affiliate-tagged URL (HMAC-signed redirect) to retailer
- pHash cache entry for future clicks on similar regions

### 4.2 The 2 paths at hotspot click

**Path 1: Direct-link product** (user picked in Phase 4 Slot 2/3)
- Hotspot manifest has `direct_link: true` + `product: {brand, name, retail_url, affiliate_url, price_usd, image_url}`
- Click → product card opens INSTANTLY with exact product user picked
- No Lens query. No latency. Free per click.

**Path 2: AI-rendered furniture/decor** (everything else)
- Hotspot manifest has `direct_link: false` + `bbox: {x, y, w, h}` + `label` + `description`
- Click → spinner ~2-3s (or instant if top-3 preload hit)
- Backend:
  1. Compute pHash of cropped region; lookup in product_match_cache
  2. If hit: return cached match
  3. Else: Hive Visual Moderation pre-check on cropped region
  4. If safe: SearchApi.io Lens query
  5. Filter results to whitelisted retailers
  6. Append affiliate tag per retailer
  7. Pick top match by Lens score
  8. Cache result in product_match_cache (30d TTL)
  9. Return product card data
- Cost per matched click: ~$0.005 Lens + ~$0.0015 Hive = ~$0.0065

### 4.3 Hotspot manifest shape (already populated by Phase 5)

```json
{
  "hotspots": [
    {
      "id": "h1",
      "label": "boucle_sofa_cream",
      "description": "low cream boucle three-cushion sofa against back wall",
      "bbox": {"x": 0.12, "y": 0.45, "w": 0.38, "h": 0.30},
      "direct_link": false,
      "preloaded": true
    },
    {
      "id": "h2",
      "label": "smart_soundbar",
      "description": "sleek black soundbar mounted below TV",
      "bbox": {"x": 0.55, "y": 0.32, "w": 0.18, "h": 0.04},
      "direct_link": true,
      "product": {
        "brand": "Sonos",
        "name": "Arc Ultra",
        "retail_url": "https://www.sonos.com/en-us/shop/arc-ultra",
        "affiliate_url": "https://www.amazon.com/dp/B0DK3VWXNF/?tag=cova03-20",
        "price_usd": 999,
        "image_url": "https://m.media-amazon.com/images/I/61abc..."
      }
    }
  ],
  "preloaded_at": "2026-05-15T14:46:30Z"
}
```

Up to 15 hotspots per render.

### 4.4 Affiliate URL appender per retailer

```typescript
function appendAffiliateTag(url: string, retailer: string): string {
  const sep = url.includes('?') ? '&' : '?';
  
  switch (retailer) {
    case 'amazon': return `${url}${sep}tag=cova03-20`;
    case 'wayfair': return `${url}${sep}clickid=cova-wayfair`;
    case 'target': return `${url}${sep}afid=cova-target`;
    case 'ikea': return url;  // no affiliate
    default: return url;       // unsupported retailer, return raw
  }
}
```

### 4.5 Cost projections at scale

Per render, avg 10 hotspots, ~3.5 user-clicked, ~3 of those non-direct-link → 3 Lens queries × $0.005 = $0.015 per render in product matching cost. Top-3 preload happens regardless (~$0.075/render).

| Users/month | Renders | Match clicks | Cost (Lens + Hive) |
|---|---|---|---|
| 100 | 800 | 2,400 | ~$15 |
| 1,000 | 8,000 | 24,000 | ~$155 |
| 10,000 | 80,000 | 240,000 | ~$1,560 |

Affiliate revenue offset: ~$2-5 per converted purchase. Even 1% conversion rate covers Lens cost 10× over.

### 4.6 Edge cases

- **Lens API down:** show fallback message "Couldn't find a match — try a similar product on [Wayfair link]" with generic search-like URL. Log failure_category='lens_api_fail'.
- **No supported retailer in Lens results:** show top match with warning "Direct purchase link only" (no affiliate tag). Better than blocking.
- **Crop too small (<50×50):** server returns 400. Client shows "We couldn't recognize that area. Try a different spot."
- **User clicks rapidly on same hotspot:** debounce 500ms. Cache result in browser for 5min so re-clicks don't re-query.
- **pHash collision (different regions, same hash):** rare; cached result may be wrong. User-flagged via "Wrong product?" link → admin review queue.
- **Hive flags region as inappropriate:** mark hotspot as `unmatched`, hide from "buy entire room" results, show modal "We couldn't match this item. Try another?"
- **Affiliate URL malformed:** sanitize; if still invalid, fall back to direct retail_url without tag.
- **"Buy entire room" with all hotspots being direct-link:** instant return of all 12 cards. No Lens calls.

---

## 5. Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Lens API | SearchApi.io Google Lens | $0.005/query |
| Image cropping | Sharp | Server-side bbox crop |
| Pre-Lens moderation | Hive Visual Moderation | $1.50/1000 |
| pHash | imghash npm lib | Perceptual hash |
| Cache | Postgres `product_match_cache` table | 30-day TTL |
| Concurrency | Bottleneck npm lib | "Buy entire room" rate limiting (8 concurrent) |
| Click logging | Postgres `product_clicks` table | RLS user-self-read |
| Signed redirect | Next.js route `/r/[hash]` with HMAC | Click attribution |
| FTC disclosure | Static text in /privacy + footer of shop screen | Phase 1 + Phase 7 |

---

## 6. Scope

### 7A — Backend (M13)

1. **Schema migrations:**
```sql
CREATE TABLE product_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  render_id uuid REFERENCES renders(id) ON DELETE SET NULL,
  hotspot_id text NOT NULL,
  product_url text NOT NULL,
  affiliate_url text,
  retailer text,
  matched_via text NOT NULL CHECK (matched_via IN ('direct','lens','cache_hit','preloaded')),
  match_score numeric(3,2),
  click_at timestamptz DEFAULT now()
);
CREATE INDEX product_clicks_user_idx ON product_clicks(user_id);
CREATE INDEX product_clicks_render_idx ON product_clicks(render_id);
CREATE INDEX product_clicks_at_idx ON product_clicks(click_at DESC);
ALTER TABLE product_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_clicks_self_read ON product_clicks FOR SELECT USING (auth.uid() = user_id);
-- Inserts via server only (service role)

CREATE TABLE product_match_cache (
  phash text PRIMARY KEY,
  matches jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  hit_count int NOT NULL DEFAULT 0,
  retailer_breakdown jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX product_match_cache_age_idx ON product_match_cache(fetched_at);
ALTER TABLE product_match_cache ENABLE ROW LEVEL SECURITY;
-- Service-role-only
```

2. **Lens client** at `apps/web/lib/products/lens.ts`:
```typescript
import sharp from 'sharp';
import imghash from 'imghash';
import { TIMEOUTS } from '@/lib/config/timeouts';
import { logCost } from '@/lib/cost/log';
import { redactLogPayload } from '@/lib/log/redact';

const SUPPORTED_RETAILERS = ['amazon.com', 'wayfair.com', 'target.com', 'ikea.com'];

export async function lensQueryFromCrop(params: {
  renderUrl: string;
  bbox: { x: number; y: number; w: number; h: number };
  userId: string;
  hotspotId: string;
}): Promise<LensMatchResult[]> {
  const startMs = Date.now();
  
  try {
    // 1. Download render
    const resp = await fetch(params.renderUrl);
    const buf = Buffer.from(await resp.arrayBuffer());
    
    // 2. Compute crop coords with 12% padding
    const meta = await sharp(buf).metadata();
    const padding = 0.12;
    const cropX = Math.max(0, Math.floor((params.bbox.x - padding * params.bbox.w) * meta.width!));
    const cropY = Math.max(0, Math.floor((params.bbox.y - padding * params.bbox.h) * meta.height!));
    const cropW = Math.min(meta.width! - cropX, Math.floor((params.bbox.w + 2 * padding * params.bbox.w) * meta.width!));
    const cropH = Math.min(meta.height! - cropY, Math.floor((params.bbox.h + 2 * padding * params.bbox.h) * meta.height!));
    
    if (cropW < 50 || cropH < 50) throw new Error('crop_too_small');
    
    // 3. Crop via Sharp
    const crop = await sharp(buf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // 4. pHash for cache lookup
    const phash = await imghash.hash(crop, 16, 'hex');
    
    // 5. Cache lookup
    const cached = await supabaseService
      .from('product_match_cache')
      .select('*')
      .eq('phash', phash)
      .single();
    
    if (cached.data && cached.data.fetched_at > Date.now() - 30 * 86400 * 1000) {
      // Cache hit
      await supabaseService
        .from('product_match_cache')
        .update({ hit_count: cached.data.hit_count + 1 })
        .eq('phash', phash);
      
      await logCost({
        userId: params.userId, category: 'lens_query',
        costUsd: 0, model: 'cache-hit', durationMs: Date.now() - startMs,
      });
      
      return cached.data.matches;
    }
    
    // 6. Hive Visual Moderation pre-Lens
    const moderationResult = await checkHiveModeration(crop, params.userId);
    if (moderationResult.flagged) {
      throw new Error('hive_moderation_flagged');
    }
    
    // 7. Upload crop to temp signed URL (Lens needs URL not bytes)
    const tempPath = `temp-crops/${params.userId}/${Date.now()}-${params.hotspotId}.jpg`;
    await supabaseService.storage.from('temp-crops').upload(tempPath, crop, { contentType: 'image/jpeg' });
    const { data: signed } = await supabaseService.storage
      .from('temp-crops')
      .createSignedUrl(tempPath, 600); // 10 min TTL (Lens fetches once)
    
    // 8. SearchApi.io Lens call
    const lensResp = await fetch('https://www.searchapi.io/api/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SEARCHAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ engine: 'google_lens', url: signed!.signedUrl }),
      signal: AbortSignal.timeout(TIMEOUTS.lensQuery),  // 30s
    });
    
    if (!lensResp.ok) throw new Error('lens_api_fail');
    const lensData = await lensResp.json();
    
    // 9. Filter to supported retailers
    const filtered = (lensData.visual_matches || [])
      .filter((m: any) => SUPPORTED_RETAILERS.some(d => m.link?.includes(d)))
      .slice(0, 5);
    
    if (filtered.length === 0) throw new Error('no_supported_retailer');
    
    // 10. Append affiliate tags
    const tagged = filtered.map((m: any) => ({
      ...m,
      retailer: detectRetailer(m.link),
      affiliate_url: appendAffiliateTag(m.link, detectRetailer(m.link)),
    }));
    
    // 11. Cache the result
    await supabaseService.from('product_match_cache').upsert({
      phash,
      matches: tagged,
      fetched_at: new Date().toISOString(),
      hit_count: 0,
    });
    
    // 12. Cleanup temp crop (background)
    supabaseService.storage.from('temp-crops').remove([tempPath]).catch(() => {});
    
    await logCost({
      userId: params.userId, category: 'lens_query',
      costUsd: 0.005, model: 'searchapi-google-lens',
      durationMs: Date.now() - startMs,
    });
    
    return tagged;
  } catch (e: any) {
    await logCost({
      userId: params.userId, category: 'lens_query',
      costUsd: 0, model: 'searchapi-google-lens',
      durationMs: Date.now() - startMs,
      failureCategory: e.message || 'lens_unknown',
    });
    throw e;
  }
}

function detectRetailer(url: string): string {
  if (url.includes('amazon.com')) return 'amazon';
  if (url.includes('wayfair.com')) return 'wayfair';
  if (url.includes('target.com')) return 'target';
  if (url.includes('ikea.com')) return 'ikea';
  return 'other';
}

function appendAffiliateTag(url: string, retailer: string): string {
  const sep = url.includes('?') ? '&' : '?';
  switch (retailer) {
    case 'amazon': return `${url}${sep}tag=cova03-20`;
    case 'wayfair': return `${url}${sep}clickid=cova-wayfair`;
    case 'target': return `${url}${sep}afid=cova-target`;
    case 'ikea': return url;
    default: return url;
  }
}
```

3. **Hive moderation** at `apps/web/lib/products/hive-moderation.ts`:
```typescript
export async function checkHiveModeration(imageBuf: Buffer, userId: string): Promise<{ flagged: bool; reason?: string }> {
  const startMs = Date.now();
  // POST to Hive Visual Moderation API with imageBuf
  // Categories: nsfw, violence, drugs, weapons
  // Threshold: confidence > 0.7 = flagged
  // Cost ~$0.0015 per call
  // logCost with category 'moderation_nsfw' or 'moderation_borderline'
  // Returns { flagged: bool, reason: string | null }
}
```

4. **HMAC-signed redirect** at `apps/web/app/r/[hash]/route.ts`:
```typescript
export async function GET(req: Request, { params }: { params: { hash: string } }) {
  // 1. Validate hash signature via HMAC SHA256
  // 2. Decode payload: retailer_url + product_clicks.id
  // 3. Verify product_clicks row exists
  // 4. Update product_clicks.click_at = now()
  // 5. 302 redirect to affiliate-tagged retailer URL
}
```

5. **API routes:**

**POST /api/products/match-hotspot**
```
Auth: required
Body: { render_id: string, hotspot_id: string }
Validation: render belongs to user, hotspot_id exists in render.hotspots
Logic:
  - If hotspot.direct_link=true: return product directly (no Lens)
  - Else:
    - Fetch hotspot.bbox
    - Call lensQueryFromCrop
    - Pick top match
    - Insert product_clicks row with matched_via='lens' or 'cache_hit' or 'preloaded'
    - Generate HMAC-signed redirect URL
    - Return { product, redirect_url }
Returns: 
  { ok: true, product: { name, brand, price_usd, image_url, retailer, redirect_url }, matched_via }
  | { ok: false, failure_category, user_message }
Side effects: writes product_clicks row, possibly inserts product_match_cache
```

**POST /api/products/buy-entire-room**
```
Auth: required
Body: { render_id: string }
Validation: render belongs to user
Logic:
  - Fetch all hotspots from render
  - Fire parallel Lens calls for non-direct-link hotspots (Bottleneck: 8 concurrent)
  - Direct-link hotspots resolve instantly
  - Aggregate all results into list
  - Each gets HMAC redirect URL
Returns: { ok: true, products: [{ hotspot_id, product, redirect_url }, ...] }
Cost: up to 12 × $0.005 = $0.06 + 12 × $0.0015 Hive = $0.078
```

**POST /api/products/log-click**
```
Auth: required
Body: { render_id, hotspot_id, retailer, product_url }
Side effect: insert product_clicks row (called separately if user clicks "View on Wayfair" without going through redirect)
Returns: { ok: true, click_id }
```

### 7B — UI

#### Shop screen (/render/[id]/shop)

**Tool:** Frontend Visionary

**Layout:**
- Full-bleed dark backdrop
- Top: Cova logo gold left, "Shop this room" tracking 0.18em uppercase ivory 60% center, X close (returns to /dashboard) right
- Centered: rendered image with hotspot overlays, max 1024×768
- Hotspots:
  - Gold dot 16px (24px on hover) at bbox center
  - Pulse animation on hover (1.0→1.2 scale)
  - Tap target 44×44 (mobile a11y)
- Below image: "Buy entire room →" gold pill CTA
- Below CTA: small footer text DM Sans 11px ivory 50%: *"Cova may earn a commission on purchases made through our links."*

**Hotspot click → product card modal:**
- Modal expands from click position to centered 480×640 modal (~400ms motion)
- Backdrop dims to navy 70%
- Modal content (ivory bg, 4px radius, 32px padding):
  - Loading state (~2-3s for Lens, instant for direct-link or preloaded): spinner + caption "Finding a match…"
  - Loaded state:
    - Product image (top, 480×280 cropped fit)
    - Brand DM Sans 12px medium tracking 0.05em uppercase navy 60%
    - Product name DM Sans 18px medium navy
    - Price DM Sans 16px gold
    - Description italic 14px navy 70% (1-2 lines)
    - "View on {Retailer} →" gold pill CTA → opens HMAC redirect in new tab
    - "Wrong product?" link DM Sans 13px navy 50% bottom (admin review queue)
    - Close X top-right
  - Failure state: "Couldn't find a match. Try a similar product on Wayfair." with generic search link

**Buy entire room modal:**
- Backdrop darkens, slide-up panel from bottom with all matched products
- Each product: 240×320 card with image, brand, name, price, "View →" CTA
- Bottom: "Total estimated: $X,XXX" + "Open all in tabs" CTA (opens 12 redirect URLs in new tabs)

**Behavior:**
- Hotspot click triggers POST /api/products/match-hotspot
- For direct-link products: instant card render (no spinner)
- For top-3 preloaded: instant card render
- For others: spinner ~2-3s
- "View on {Retailer}" click: navigates to /r/[hash] which 302s to retailer with affiliate tag
- "Wrong product?" click: opens lightweight feedback modal with comment field; submission writes to admin queue at `cova-plan/manual-evidence/wrong-product-flags/`

**Mobile UX:**
- Hotspot dots stay 16px but tap target 44×44
- Modal fullscreen (100vh) on mobile, slides up from bottom
- Buy-entire-room modal: vertical scroll list of cards

**Reduced motion:**
- Hotspot pulse disabled
- Modal appears via fade (no zoom-in motion)
- Buy-entire-room slides without easing

**Edge cases:**
- All hotspots direct-link: instant page (no spinners anywhere)
- 0 hotspots: empty state "We couldn't find shoppable items in this render. Try refining."
- Hotspot bbox tiny (<50×50): show "Try a different spot" toast
- Network drop mid-Lens: spinner caption changes to "Slow connection… still trying"
- User leaves shop screen mid-Lens: cancel pending requests; preserve pHash cache writes that already finished

**Analytics:**
- shop_screen_viewed {render_id, hotspot_count, direct_link_count}
- hotspot_clicked {hotspot_id, matched_via}
- product_card_viewed {product_url, retailer}
- product_card_cta_clicked {retailer}
- buy_entire_room_clicked
- product_card_wrong_flag {hotspot_id, reason}

### 7C — Integration + review

- Wire shop screen to render results
- Hotspot manifest from Phase 5 displayed correctly
- Direct-link products show instantly (no Lens query)
- Top-3 preloaded products show instantly
- Lens calls trigger for non-preloaded hotspots
- pHash cache hits skip Lens call
- HMAC redirect verifies signature, logs click, redirects
- Buy-entire-room parallel Lens calls work (Bottleneck 8 concurrent)
- All 4 affiliate URL formats verified correct on real retailer pages
- FTC disclosure footer present
- 50-render hotspot bake-off ≥80% match rate
- Verifier 7-phase covers happy + Lens-down + no-supported-retailer + crop-too-small + rapid-clicks + Hive-flagged

---

## 7. Out of scope

- CLIP re-rank (deferred to Phase 11 M7 bake-off)
- Catalog (NEVER, hard rule D-002)
- Additional retailers beyond Amazon/Wayfair/Target/IKEA (V1.5)
- Save-for-later / wishlist (V1.5)
- Price tracking / stock alerts (V1.5)
- iOS app shop (never V1)
- B2B / designer marketplace (V2)

---

## 8. Files touched

### Created
- `apps/web/app/render/[id]/shop/page.tsx`
- `apps/web/app/api/products/match-hotspot/route.ts`
- `apps/web/app/api/products/buy-entire-room/route.ts`
- `apps/web/app/api/products/log-click/route.ts`
- `apps/web/app/r/[hash]/route.ts` (HMAC redirect handler)
- `apps/web/lib/products/lens.ts`
- `apps/web/lib/products/hive-moderation.ts`
- `apps/web/lib/products/affiliate-urls.ts`
- `apps/web/lib/products/phash.ts`
- `apps/web/lib/products/hmac-redirect.ts`
- `apps/web/components/shop/HotspotOverlay.tsx`
- `apps/web/components/shop/ProductCardModal.tsx`
- `apps/web/components/shop/BuyEntireRoomPanel.tsx`
- `apps/web/components/shop/WrongProductModal.tsx`
- `tests/products/lens-client.test.ts`
- `tests/products/affiliate-urls.test.ts`
- `tests/products/hmac-redirect.test.ts`
- `tests/products/phash-cache.test.ts`
- `tests/products/hive-moderation.test.ts`

### Migrations
- `supabase/migrations/{ts}-product-clicks-table.sql` + `_down.sql`
- `supabase/migrations/{ts}-product-match-cache-table.sql` + `_down.sql`

### Modified
- `apps/web/components/render/SelectCta.tsx` (wire Shop CTA to /render/[id]/shop)
- `apps/web/app/privacy/page.tsx` (verify FTC disclosure language current)
- `apps/web/lib/analytics/events.ts` (shop events)
- `apps/web/lib/errors/categories.ts` (ProductMatchFailure union)

---

## 9. API contracts

### POST /api/products/match-hotspot
```
Auth: required
Body: { render_id: string, hotspot_id: string }
Returns:
  { ok: true, product: { name, brand, price_usd, image_url, retailer, redirect_url }, matched_via }
  | { ok: false, failure_category, user_message }
Cost log: 'lens_query' (or 0 cost if cache hit / direct-link)
```

### POST /api/products/buy-entire-room
```
Auth: required
Body: { render_id: string }
Returns: { ok: true, products: [...] }
Cost: up to 12 × ($0.005 Lens + $0.0015 Hive)
```

### POST /api/products/log-click
```
Auth: required
Body: { render_id, hotspot_id, retailer, product_url }
Returns: { ok: true, click_id }
```

### GET /r/[hash]
```
No body
Validation: HMAC signature valid, product_clicks row exists
Returns: 302 redirect to affiliate-tagged retailer URL
Side effect: updates product_clicks.click_at
```

---

## 10. Schema migrations

(Full DDL in §6 #1.)

`temp-crops` Supabase Storage bucket created with policies:
- INSERT: server (service role)
- SELECT: anyone (signed URLs)
- DELETE: server (cleanup cron)
- Lifecycle: auto-delete after 24h

---

## 11. Failure handling

```typescript
export type ProductMatchFailure =
  | 'render_not_owned'
  | 'hotspot_not_found'
  | 'crop_too_small'
  | 'crop_extract_fail'
  | 'phash_compute_fail'
  | 'hive_moderation_flagged'
  | 'hive_api_fail'                   // graceful: skip moderation, proceed (logged)
  | 'lens_api_fail'
  | 'lens_timeout'
  | 'lens_rate_limit'
  | 'no_supported_retailer'
  | 'temp_crop_upload_fail'
  | 'product_clicks_insert_fail'
  | 'hmac_redirect_invalid_hash'
  | 'hmac_redirect_expired'
  | 'buy_entire_room_partial_fail';   // some hotspots failed, some succeeded
```

| Category | Recovery |
|---|---|
| crop_too_small | "Try a different spot" toast |
| hive_moderation_flagged | Hide hotspot from "buy entire room", modal "Couldn't match this item" |
| hive_api_fail | Graceful: skip moderation, proceed with Lens (logged) |
| lens_api_fail | Show "Couldn't find a match" with generic Wayfair search link |
| lens_rate_limit | Wait 30s + retry once; if still fails, fallback message |
| no_supported_retailer | Show top match with "Direct purchase link only" warning |
| hmac_redirect_invalid_hash | 403 Forbidden + redirect to homepage |
| buy_entire_room_partial_fail | Show successful matches + count of failed |

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $25–40 |
| Lens test queries (~200 during dev) | ~$1 |
| Hive moderation test (~200) | ~$0.30 |
| 50-render hotspot bake-off (250 hotspots × $0.0065) | ~$2 |
| **Total** | **~$28–43** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| Shop screen renders | /render/[id]/shop returns 200 with hotspot overlays |
| Hotspot click → modal | Click triggers product card modal with correct loading state |
| Direct-link products instant | Modal shows immediately, no spinner, no Lens cost |
| Top-3 preloaded products instant | Modal shows immediately, matched_via='preloaded' |
| Other hotspots Lens query | Spinner ~2-3s, then product card |
| pHash cache hit | Second click on same region: matched_via='cache_hit', cost=0 |
| Affiliate URL Amazon | Click → 302 to amazon.com/...?tag=cova03-20 |
| Affiliate URL Wayfair | Click → 302 to wayfair.com/...?clickid=cova-wayfair |
| Affiliate URL Target | Click → 302 to target.com/...?afid=cova-target |
| Affiliate URL IKEA | Click → 302 to ikea.com/... (no append) |
| HMAC signature validation | Tampered hash → 403 |
| product_clicks row | Each click writes row with correct retailer + matched_via |
| Buy-entire-room parallel | 12 Lens calls fire with Bottleneck queue, all return |
| Hive moderation pre-Lens | Crop sent to Hive before Lens; flagged crops skipped |
| FTC disclosure | /privacy page contains current FTC language; shop screen footer present |
| 50-render hotspot bake-off | ≥80% match rate (gating closure) |
| Cost log per Lens call | render_cost_log row with category 'lens_query' (or 'cache_hit'/'preloaded') |
| All 16 ProductMatchFailure codes used | Grep confirms |

---

## 14. Adversarial code review checklist

- [ ] HMAC redirect uses `crypto.timingSafeEqual` for signature comparison (not ===)
- [ ] HMAC secret in env var, NOT hardcoded
- [ ] HMAC payload includes timestamp; reject if older than 7 days
- [ ] HMAC redirect URL doesn't leak retailer URL in query params (only hash)
- [ ] product_clicks RLS allows user-self-read but server-only writes
- [ ] product_match_cache RLS service-role only (cross-user pHash leak prevented at API layer, not DB)
- [ ] Crop bbox padding 12% capped to image bounds
- [ ] Crop too small (<50×50) → 400 not 500
- [ ] Sharp crop has try/catch; failure doesn't crash route
- [ ] pHash uses imghash with 16-char hex (not 8 — collision risk too high)
- [ ] Cache lookup uses indexed phash column (PRIMARY KEY)
- [ ] 30-day TTL enforced via fetched_at timestamp check (not just cron)
- [ ] Temp crop bucket files cleaned up after Lens call (background promise, errors ignored)
- [ ] temp-crops lifecycle policy auto-deletes after 24h (defense in depth)
- [ ] Lens API timeout 30s from lib/config/timeouts (lensQuery)
- [ ] Lens API rate limit handled (429 → wait 30s + retry once)
- [ ] Hive moderation timeout 5s
- [ ] Hive failure → graceful (skip moderation, log warning, proceed)
- [ ] Hive flagged result → mark unmatched, do NOT log raw image content
- [ ] Affiliate URL appender handles existing query strings (`?` vs `&`)
- [ ] Affiliate URL appender doesn't double-append if URL already has tag
- [ ] Affiliate tag from env var (not hardcoded — easier to update)
- [ ] Buy-entire-room uses Bottleneck queue (8 concurrent) to respect SearchApi rate limit
- [ ] Buy-entire-room partial failure: returns successful matches + count of failed (degraded experience)
- [ ] No console.log of retail_url, product info (PII via redactLogPayload — though not strictly PII, leaks user shopping intent)
- [ ] FTC disclosure language reviewed against current FTC guidelines (2026)
- [ ] FTC disclosure visible in shop screen footer (not buried)
- [ ] Wrong-product flag writes to admin queue with hotspot_id + render_id + reason
- [ ] Modal close on Escape key
- [ ] Modal backdrop click closes modal
- [ ] Mobile modal fullscreen-on-small-viewport not desktop-styled
- [ ] Mobile hotspot tap target 44×44 (a11y)
- [ ] Hotspot pulse animation respects reduced-motion CSS query
- [ ] Cost log per Lens call has correct category and model strings
- [ ] Cost log per cache hit has cost_usd=0 (not $0.005)
- [ ] product_clicks insert is atomic with HMAC redirect generation (transaction)

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P7/`.

### Shop happy path
1. Sign in test user with completed render (Warm Japandi, hotspots populated)
2. Navigate to /render/select-cta?render_id={id} → click "Shop this room →"
3. /render/[id]/shop loads with hotspot overlays (gold dots) **[G1: shop-screen.png]**
4. Hover hotspot → dot pulses to 1.2 scale **[G2: hotspot-hover.png]**
5. Click hotspot on the SOFA → modal opens with spinner ~2-3s **[G3: lens-loading.png]**
6. Modal shows matched product card: Wayfair sofa, image, brand, name, price **[G4: product-card.png]**
7. Click "View on Wayfair →" → opens new tab with 302 redirect to wayfair.com/...?clickid=cova-wayfair **[G5: wayfair-tab.png]** (capture Wayfair page with affiliate URL visible in URL bar)
8. Verify product_clicks row in Supabase MCP: retailer='wayfair', matched_via='lens'

### Direct-link product (instant)
9. Click hotspot on SONOS SOUNDBAR (user picked in Phase 4 Slot 2)
10. Modal opens INSTANTLY with Sonos Arc Ultra card, no spinner **[G6: direct-link-instant.png]**
11. Click "View on Amazon →" → 302 to amazon.com/...?tag=cova03-20 **[G7: amazon-tab.png]**

### Top-3 preloaded
12. Click any of the 3 largest hotspots (preloaded in Phase 5 background)
13. Modal opens INSTANTLY with matched_via='preloaded' **[G8: preloaded-instant.png]**

### Cache hit
14. Click same hotspot from step 5 again
15. Modal opens INSTANTLY (cache hit) **[G9: cache-hit-instant.png]**
16. Verify in render_cost_log: cost_usd=0 for second click

### All 4 retailers
17. Find hotspots that match products at each retailer (may take multiple renders)
18. Verify affiliate URLs:
    - Amazon: `?tag=cova03-20` ✓
    - Wayfair: `?clickid=cova-wayfair` ✓
    - Target: `?afid=cova-target` ✓
    - IKEA: no append ✓
    **[G10: affiliate-urls-table.png]** (compose: 4 URL bars side-by-side)

### Buy entire room
19. Click "Buy entire room →" CTA
20. Loading state with caption "Finding all the pieces…" ~3-5s
21. Modal slides up from bottom with all 12 product cards **[G11: buy-entire-room.png]**
22. Total estimated price displayed
23. Click "Open all in tabs" → 12 tabs open with redirect URLs

### Wrong product flag
24. Click hotspot, see product card
25. Click "Wrong product?" link → feedback modal **[G12: wrong-product-modal.png]**
26. Submit reason; verify admin queue file at `cova-plan/manual-evidence/wrong-product-flags/`

### Hive flagged (forced test)
27. Force a hotspot with crop that triggers Hive (e.g., test fixture image with NSFW signal)
28. Click hotspot → modal "Couldn't match this item. Try another?" **[G13: hive-flagged.png]**

### Lens API down (mock)
29. Stub Lens to return 5xx
30. Click hotspot → modal "Couldn't find a match" with generic Wayfair search link **[G14: lens-down.png]**

### HMAC tampered URL
31. Manually construct /r/{tampered-hash} → returns 403 **[G15: hmac-tampered.png]**

### FTC disclosure
32. View shop screen footer: small text about commission **[G16: ftc-footer.png]**
33. View /privacy page: full FTC affiliate disclosure section **[G17: ftc-privacy.png]**

### 50-render hotspot bake-off
34. Run 50 renders (or use existing from Phase 5 quality test)
35. Click ~5 hotspots per render = 250 clicks
36. Tally: ≥80% return a match (200/250 minimum)
37. Bundle into report at `cova-plan/render/hotspot-bake-off-50/INDEX.md`

### Mobile responsive
38. iPhone Safari: shop screen, hotspot taps work, modal fullscreen on tap **[G18: mobile-shop.png]**

### Reduced motion
39. Enable OS reduced motion → hotspot pulse disabled, modal fade-in only **[G19: reduced-motion.png]**

---

## 16. Manual evidence bundle

- 19+ screenshots from §15
- 50-render hotspot bake-off report
- Sample product_clicks SQL dump
- Sample render_cost_log dump (Lens + Hive + cache_hit + preloaded entries)
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P7.md`

If 50-render hotspot bake-off match rate <80%: escalation = consider CLIP re-rank pull-forward from Phase 11, OR widen retailer whitelist, OR loosen pHash similarity threshold.

---

## 18. Closing checklist

- [ ] All screenshots in `cova-plan/manual-evidence/P7/`
- [ ] 50-render hotspot bake-off report archived
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 7 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: SearchApi.io confirmed, 4 retailer whitelist, affiliate URL formats per retailer, pHash 30d TTL, Hive pre-Lens scope, HMAC redirect rules, "buy entire room" parallel cap 8, FTC disclosure language locked
- [ ] `EMPIRICAL_FINDINGS.md` updated: Lens match rate on 50 renders, pHash cache hit rate at scale, mean Lens latency p50/p95, mean Hive latency, click-through rate per retailer (initial sample)
- [ ] Phase 8 prereq section reviewed (no real dependency, but completeness check)
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

- Revert merge commit on main
- Run paired _down.sql in reverse:
  1. product_match_cache down
  2. product_clicks down
- temp-crops bucket cleared via dashboard
- If shop screen broken: feature flag `shop_enabled=false` hides Shop CTA, shows "Shop coming soon" placeholder

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `shop_enabled` | Master switch | true |
| `lens_enabled` | Lens API calls (false = direct-link only) | true |
| `hive_moderation_enabled` | Pre-Lens Hive check | true |
| `phash_cache_enabled` | Cache lookup (false = always Lens) | true |
| `buy_entire_room_enabled` | Parallel Lens for all hotspots | true |
| `clip_rerank_enabled` | Phase 11 candidate (deferred) | false |

---

## End of Phase 7 doc.

Next: Phase 8 (Tokens & Billing).
