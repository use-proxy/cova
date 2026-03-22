# Product Seeding Pipeline — Complete Plan
**Goal**: Seed ≥5,000 real purchasable interior design products into the Cova Supabase `products` table, each with a CLIP embedding for visual matching after AI renders.

---

## Table of Contents
1. [Critical Pre-Flight Findings](#1-critical-pre-flight-findings)
2. [Schema Migration Required](#2-schema-migration-required)
3. [Environment Variables](#3-environment-variables)
4. [Packages to Install](#4-packages-to-install)
5. [File Structure](#5-file-structure)
6. [Apify Actors Per Retailer](#6-apify-actors-per-retailer)
7. [Complete Column Mapping](#7-complete-column-mapping)
8. [Inference Logic](#8-inference-logic)
9. [Validation Rules](#9-validation-rules)
10. [Affiliate URL Handling](#10-affiliate-url-handling)
11. [Pipeline Architecture](#11-pipeline-architecture)
12. [Progress & Resume Capability](#12-progress--resume-capability)
13. [Error Handling](#13-error-handling)
14. [Execution Order & Time Estimates](#14-execution-order--time-estimates)
15. [If Apify Rate Limits or Blocks](#15-if-apify-rate-limits-or-blocks)
16. [If CLIP Embedding Fails](#16-if-clip-embedding-fails)
17. [Embedding Dimension: Pre-Flight Auto-Detect](#17-embedding-dimension-pre-flight-auto-detect)
18. [Verification SQL](#18-verification-sql)
19. [Adding Affiliate Tags Later via SQL](#19-adding-affiliate-tags-later-via-sql)
20. [Post-Seeding: Enable Vector Index](#20-post-seeding-enable-vector-index)

---

## 1. Critical Pre-Flight Findings

### 1a. Schema Constraint Blocks 3 Retailers
The `retailer` column has a hard CHECK:
```sql
CHECK (retailer IN ('wayfair', 'amazon', 'ikea', 'cb2'))
```
Target, West Elm, and Article inserts **will fail** without a migration. → See §2.

### 1b. Schema Constraint Blocks 'luxury' Price Tier
The `price_tier` column only allows `'budget' | 'mid' | 'premium'`. Products >$1,500 need `'luxury'`. → See §2.

### 1c. clip-embed Edge Function Requires User JWT
`supabase/functions/clip-embed/index.ts` calls `supabase.auth.getUser(token)` and rejects service-role tokens. The seeding script **cannot** call it. Solution: call Replicate API directly with the same model and params.

### 1d. Embedding Dimension Must Be Verified
Migration 012 changed the column to `VECTOR(1024)` but the deployed `clip-embed` function still uses `andreasjansson/clip-features:75b33f25...` (likely 512-dim ViT-B/32). A mismatch crashes every insert. The pipeline runs a pre-flight dimension check and auto-corrects. → See §17.

### 1e. Existing 60 Placeholder Products
~60 rows already exist with Unsplash images and dummy affiliate URLs, no embeddings. They are kept as-is. The pipeline skips them via `external_id` deduplication.

---

## 2. Schema Migration Required

**File**: `supabase/migrations/20240018000000_expand_products_constraints.sql`

```sql
-- Expand retailer CHECK to add Target, West Elm, Article
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_retailer_check;
ALTER TABLE public.products ADD CONSTRAINT products_retailer_check
  CHECK (retailer IN ('wayfair', 'amazon', 'ikea', 'cb2', 'target', 'west_elm', 'article'));

-- Expand price_tier CHECK to add luxury (>$1,500)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_tier_check;
ALTER TABLE public.products ADD CONSTRAINT products_price_tier_check
  CHECK (price_tier IN ('budget', 'mid', 'premium', 'luxury'));
```

Apply via Supabase dashboard SQL editor or `supabase db push`.

---

## 3. Environment Variables

All must be present in `scripts/seed-products/.env` (symlink or copy from root `.env.local`):

```env
SUPABASE_URL=               # same as NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=  # sb_secret_... (already in .env.local)
REPLICATE_API_TOKEN=        # r8_... (already in .env.local)
APIFY_API_TOKEN=            # ADD THIS — from apify.com/account/integrations
AMAZON_ASSOCIATE_TAG=cova03-20  # already in .env.local (currently empty — fill before run)
```

The script hard-exits with a clear error message if any variable is missing.

---

## 4. Packages to Install

Run inside `scripts/seed-products/`:

```bash
pnpm init
pnpm add @supabase/supabase-js apify-client tsx dotenv p-limit
pnpm add -D typescript @types/node
```

This directory has its own isolated `package.json` — it does not touch the monorepo.

---

## 5. File Structure

```
supabase/migrations/
  20240018000000_expand_products_constraints.sql   ← NEW (apply first)

scripts/seed-products/
  package.json
  tsconfig.json
  .env                     ← symlink/copy from root .env.local
  config.ts                ← retailer targets, actor IDs, category URLs
  index.ts                 ← main orchestrator (entry point)
  progress.ts              ← load/save progress.json for resume capability
  report.ts                ← final summary by category/style/tier/retailer

  scrapers/
    base.ts                ← ScrapedProduct interface + shared field parsers
    wayfair.ts             ← actor: 123webdata/wayfair-scraper
    amazon.ts              ← actor: axesso_data/amazon-product-details-scraper
    ikea.ts                ← actor: shahidirfan/Ikea-Product-Scraper
    target.ts              ← actor: parseforge/target-scraper
    west-elm.ts            ← actor: apify/website-content-crawler (custom config)
    cb2.ts                 ← actor: apify/website-content-crawler (custom config)
    article.ts             ← actor: apify/website-content-crawler (custom config)

  processors/
    classify.ts            ← inferCategory() + inferStyleTags() + inferRoomTypes()
    validate.ts            ← keep/skip decision logic
    embed.ts               ← Replicate CLIP API call → number[]

  db/
    insert.ts              ← batch upsert to Supabase, 25 rows/batch
    dedupe.ts              ← pre-load existing external_ids from DB
```

**Total files to create**: 20 (+ 1 migration)

---

## 6. Apify Actors Per Retailer

### Wayfair — Target: 1,500 products
- **Actor**: `123webdata/wayfair-scraper`
  - Rating: 5.0★ | Success: 99.2% | Cost: $0.005/result
- **Input**: `{ categoryUrls: [...], usePagination: true, maxResultsPerScrape: 200 }`

| Category URL | Target |
|---|---|
| `https://www.wayfair.com/furniture/sb0/sofas-c413892.html` | 200 |
| `https://www.wayfair.com/furniture/sb0/accent-chairs-c1861617.html` | 150 |
| `https://www.wayfair.com/furniture/sb0/sectional-sofas-c414065.html` | 100 |
| `https://www.wayfair.com/furniture/sb0/dining-chairs-c413625.html` | 100 |
| `https://www.wayfair.com/furniture/sb0/coffee-tables-c414309.html` | 100 |
| `https://www.wayfair.com/furniture/sb0/dining-tables-c413617.html` | 100 |
| `https://www.wayfair.com/furniture/sb0/floor-lamps-c414610.html` | 100 |
| `https://www.wayfair.com/lighting/sb0/pendant-lights-c215416.html` | 100 |
| `https://www.wayfair.com/lighting/sb0/chandeliers-c215404.html` | 75 |
| `https://www.wayfair.com/furniture/sb0/bookcases-storage-c414626.html` | 100 |
| `https://www.wayfair.com/furniture/sb0/dressers-c414644.html` | 75 |
| `https://www.wayfair.com/furniture/sb0/tv-stands-media-consoles-c414636.html` | 75 |
| `https://www.wayfair.com/furniture/sb0/bed-frames-c414820.html` | 100 |
| `https://www.wayfair.com/rugs/sb0/area-rugs-c1781871.html` | 100 |
| `https://www.wayfair.com/decor-pillows/sb0/mirrors-c215303.html` | 75 |
| **Total** | **1,550** |

---

### Amazon — Target: 1,200 products
- **Actor (search)**: `apify/amazon-product-scraper` — collects ASINs from search results
- **Actor (details)**: `axesso_data/amazon-product-details-scraper`
  - Rating: 4.9★ | Success: 99.9% | Cost: $0.0015/result
- **Strategy**: Two-phase. Phase 1 collects product URLs from search pages. Phase 2 fetches full details by URL.

| Search Query | Category Filter | Target |
|---|---|---|
| `sectional sofa living room` | Furniture (n=1055398) | 100 |
| `accent chair living room` | Furniture | 100 |
| `coffee table modern` | Furniture | 100 |
| `floor lamp living room` | Lamps (n=6193684011) | 100 |
| `area rug 8x10` | Rugs (n=684541011) | 100 |
| `bookshelf storage` | Furniture | 100 |
| `platform bed frame queen` | Furniture | 100 |
| `dining table set` | Furniture | 100 |
| `throw pillow covers` | Home Décor | 100 |
| `indoor plant pot ceramic` | Garden | 75 |
| `pendant light kitchen` | Ceiling Lights | 75 |
| `dresser bedroom storage` | Furniture | 50 |
| **Total** | | **1,200** |

---

### IKEA — Target: 800 products
- **Actor**: `shahidirfan/Ikea-Product-Scraper`
  - Rating: unrated | Success: 100% | Cost: FREE

| Category URL | Target |
|---|---|
| `https://www.ikea.com/us/en/cat/sofas-fu003/` | 120 |
| `https://www.ikea.com/us/en/cat/armchairs-fu008/` | 80 |
| `https://www.ikea.com/us/en/cat/coffee-side-tables-fu004/` | 80 |
| `https://www.ikea.com/us/en/cat/dining-tables-fu002/` | 60 |
| `https://www.ikea.com/us/en/cat/pendant-lamps-10732/` | 80 |
| `https://www.ikea.com/us/en/cat/floor-lamps-10621/` | 60 |
| `https://www.ikea.com/us/en/cat/beds-bz001/` | 80 |
| `https://www.ikea.com/us/en/cat/wardrobes-19053/` | 60 |
| `https://www.ikea.com/us/en/cat/bookcases-shelving-units-10382/` | 80 |
| `https://www.ikea.com/us/en/cat/rugs-ru001/` | 60 |
| `https://www.ikea.com/us/en/cat/plant-pots-10647/` | 40 |
| **Total** | **800** |

---

### Target — Target: 600 products
- **Actor**: `parseforge/target-scraper`
  - Rating: 5.0★ | Success: 97.1% | Cost: $0.002–$0.004/result
- **Search queries** (75 products each):
  `sofas`, `accent chairs`, `coffee tables`, `floor lamps`, `area rugs`, `dining furniture`, `throw pillows`, `storage shelves`

---

### West Elm — Target: 400 products
- **Actor**: `apify/website-content-crawler`
- **Extract**: JSON-LD `Product` schema or Open Graph meta tags from product listing pages
- **Link selector**: `a[href*="/products/"]`

| URL | Target |
|---|---|
| `https://www.westelm.com/shop/furniture/sofas-sectionals/` | 100 |
| `https://www.westelm.com/shop/furniture/chairs/` | 80 |
| `https://www.westelm.com/shop/lighting/floor-lamps/` | 60 |
| `https://www.westelm.com/shop/rugs/` | 80 |
| `https://www.westelm.com/shop/furniture/beds-headboards/` | 80 |
| **Total** | **400** |

---

### CB2 — Target: 300 products
- **Actor**: `apify/website-content-crawler`

| URL | Target |
|---|---|
| `https://www.cb2.com/sofas` | 80 |
| `https://www.cb2.com/chairs` | 60 |
| `https://www.cb2.com/tables/coffee-tables` | 50 |
| `https://www.cb2.com/lighting` | 60 |
| `https://www.cb2.com/storage` | 50 |
| **Total** | **300** |

---

### Article — Target: 200 products
- **Actor**: `apify/website-content-crawler`

| URL | Target |
|---|---|
| `https://www.article.com/category/sofas` | 50 |
| `https://www.article.com/category/chairs` | 40 |
| `https://www.article.com/category/tables` | 40 |
| `https://www.article.com/category/beds` | 40 |
| `https://www.article.com/category/lighting` | 30 |
| **Total** | **200** |

---

### Retailer Summary

| Retailer | Actor | Cost/Product | Target |
|---|---|---|---|
| Wayfair | `123webdata/wayfair-scraper` | $0.005 | 1,500 |
| Amazon | `axesso_data/amazon-product-details-scraper` | $0.0015 | 1,200 |
| IKEA | `shahidirfan/Ikea-Product-Scraper` | FREE | 800 |
| Target | `parseforge/target-scraper` | $0.003 avg | 600 |
| West Elm | `apify/website-content-crawler` | ~$0.002 | 400 |
| CB2 | `apify/website-content-crawler` | ~$0.002 | 300 |
| Article | `apify/website-content-crawler` | ~$0.002 | 200 |
| **Total** | | **~$22–28 Apify cost** | **5,000** |

Replicate CLIP cost: ~$0.0023/prediction × 5,000 = **~$11.50**
**Estimated total data cost: ~$35–40**

---

## 7. Complete Column Mapping

Every scraped field → every Supabase column:

| DB Column | Type | Source | Transformation |
|---|---|---|---|
| `id` | UUID | — | `gen_random_uuid()` (auto) |
| `external_id` | TEXT | Product URL or SKU from scraper | Strip query params, max 500 chars |
| `name` | TEXT | Product title | Trim + collapse whitespace, max 500 chars |
| `retailer` | TEXT | Hardcoded per scraper | `'wayfair'` / `'amazon'` / `'ikea'` / `'target'` / `'west_elm'` / `'cb2'` / `'article'` |
| `price` | NUMERIC(10,2) | Scraped price string or number | `parseFloat(s.replace(/[^0-9.]/g, ''))` |
| `currency` | TEXT | — | Hardcoded `'USD'` |
| `category` | TEXT | Inferred | `inferCategory(name, scrapedCat)` |
| `subcategory` | TEXT | Scraped product type | First 100 chars, or null |
| `image_url` | TEXT | First CDN image from scraper | Must pass validation (§9) |
| `affiliate_url` | TEXT | Raw product page URL | `buildAffiliateUrl(url, retailer)` — raw now, tag added later |
| `affiliate_url_base` | TEXT | Same as affiliate_url | Identical at insertion time |
| `clip_embedding` | VECTOR | Replicate API on `image_url` | `number[]` — null on failure |
| `style_tags` | TEXT[] | Inferred | `inferStyleTags(name, desc, materials)` |
| `price_tier` | TEXT | Computed from price | `<100→'budget'`, `100-500→'mid'`, `500-1500→'premium'`, `>1500→'luxury'` |
| `in_stock` | BOOLEAN | Scraped availability | `true` default; skip if `outOfStock: true` |
| `price_last_checked` | TIMESTAMPTZ | Pipeline run time | `new Date().toISOString()` |
| `created_at` | TIMESTAMPTZ | — | `NOW()` (auto) |
| `room_types` | TEXT[] | Inferred | `inferRoomTypes(category, name)` |
| `width_inches` | FLOAT | Scraped dimensions | Parse `"84\"W"` → `84.0`; null if absent |
| `depth_inches` | FLOAT | Scraped dimensions | Parse `"38\"D"` → `38.0`; null if absent |
| `height_inches` | FLOAT | Scraped dimensions | Parse `"34\"H"` → `34.0`; null if absent |
| `active` | BOOLEAN | — | Always `true` |

---

## 8. Inference Logic

### `inferCategory(name, scrapedCat)` → canonical category string

Keyword matching is case-insensitive against `name + ' ' + scrapedCat`:

```
'seating'  → sofa, sectional, couch, loveseat, chair, ottoman, bench,
             stool, barstool, pouf, settee, chaise, futon
'tables'   → table, desk, console, credenza, sideboard, nightstand, buffet
'lighting' → lamp, light, chandelier, pendant, sconce, fixture, lantern
'storage'  → shelf, shelving, bookcase, dresser, wardrobe, cabinet, armoire,
             tv stand, media console, bar cart, coat rack, shoe rack
'beds'     → bed frame, headboard, platform bed, canopy bed, sleigh bed,
             daybed, bunk bed
'decor'    → rug, mirror, pillow, throw, blanket, vase, art, print, basket,
             curtain, drape, tray, candle, clock
'plants'   → plant, planter, pot, succulent, cactus, fern, tree, palm,
             fiddle, monstera, snake plant, pothos, rubber
```

Priority (highest to lowest): `plants` > `beds` > `lighting` > `storage` > `tables` > `seating` > `decor`
Default if no match: `'decor'`

---

### `inferStyleTags(name, description, materials)` → string[]

Multiple tags allowed. All matching tags are returned.

```
'coastal'     → linen, rattan, wicker, seagrass, jute, driftwood, rope,
                whitewash, white wash, coastal, nautical, sandy, beachy,
                natural fiber, shell, blue, white oak

'japandi'     → oak, walnut, teak, bamboo, minimal, minimalist, natural wood,
                scandinavian, japanese, zen, clean line, simple, functional,
                muted, neutral, birch, pine, beech, ash wood, washi

'bohemian'    → macrame, fringe, tassel, kilim, tribal, moroccan, global,
                vintage, eclectic, woven, colorful, patterned, boho, bohemian,
                maximalist, terracotta, clay, beaded, fringe

'mid_century' → walnut, teak, hairpin, tapered leg, tulip, eames, danish,
                retro, mid-century, mcm, sputnik, brass, organic shape,
                geometric, 1950, 1960

'minimalist'  → white, grey, gray, black, monochrome, sleek, streamlined,
                hidden storage, clean, pure, modern, contemporary, matte,
                flush, integrated
```

**Fallback** (no keywords matched):
- `seating` → `['mid_century', 'minimalist']`
- `decor` / `plants` → `['bohemian', 'coastal']`
- everything else → `['minimalist']`

---

### `inferRoomTypes(category, name)` → string[]

```
'seating'  → always: ['living_room']
             + 'dining_room'   if name contains: dining
             + 'home_office'   if name contains: office, desk
             + 'bedroom'       if name contains: bedroom, accent

'tables'   → always: ['living_room']
             override to ['dining_room']   if: dining
             + ['home_office']             if: desk, office
             + ['bedroom']                if: nightstand, bedside
             override to ['entryway']     if: console, entryway

'lighting' → always: ['living_room', 'bedroom']
             + 'dining_room'  if: kitchen, pendant, chandelier
             + 'home_office'  if: office, desk

'storage'  → always: ['living_room']
             + 'bedroom'      if: dresser, nightstand, wardrobe
             + 'home_office'  if: desk, bookcase
             override to ['entryway'] if: entryway, coat, shoe

'beds'     → always: ['bedroom']

'decor'    → always: ['living_room', 'bedroom']
             + 'dining_room'  if: rug
             override to ['bathroom'] if: bathroom in name

'plants'   → always: ['living_room', 'bedroom', 'home_office']
```

---

## 9. Validation Rules

**Skip a product if ANY of these are true:**

| # | Rule |
|---|---|
| 1 | `price` is null, NaN, ≤0, or unparseable |
| 2 | `name` is null, empty, or a bare SKU (matches `/^[A-Z0-9\-]{6,}$/` with no spaces) |
| 3 | `image_url` is null or empty |
| 4 | `image_url` contains: `watermark`, `placeholder`, `no-image`, `noimage` |
| 5 | `image_url` domain is `unsplash.com` (placeholder images already in DB) |
| 6 | `affiliate_url` (product page URL) is null or empty |
| 7 | Product is out of stock: `in_stock === false` OR availability string contains `discontinued` or `out of stock` |
| 8 | `name.length < 5` |
| 9 | Duplicate: same `name` (case-insensitive trim) + same `retailer` already exists in DB |

**Image resolution check** (when available from scraper):
- If the scraper returns image width/height AND both are < 800px → skip
- Do NOT fetch image to verify dimensions — only check if the scraper provides this data

---

## 10. Affiliate URL Handling

```typescript
// Affiliate tags added later via SQL update when accounts approved
// Amazon:   append ?tag=cova03-20
// Wayfair:  append ?refid=WAYFAIR_TAG (pending approval)
// Others:   pending CJ Affiliate approval

function buildAffiliateUrl(rawUrl: string, _retailer: string): string {
  return rawUrl; // Insert raw product URL now — no tracking tag yet
}
```

---

## 11. Pipeline Architecture

`index.ts` orchestration flow:

```
① Load .env + validate all required vars present (hard exit if missing)

② Pre-flight: call Replicate CLIP on a test image → measure embedding.length
   → auto-correct column if dimension mismatch (see §17)

③ Apply migration 018 if constraints not yet present (check via information_schema)

④ Load progress.json → Set<external_id> of already-processed products

⑤ Pre-load all existing external_ids from DB into memory Set (deduplication)

⑥ FOR EACH retailer [wayfair → amazon → ikea → target → west_elm → cb2 → article]:
     FOR EACH URL / query in config[retailer]:

       (a) Call Apify actor → receive raw product array

       (b) FOR EACH raw product:
             • Map raw fields → ScrapedProduct interface
             • validate() → skip if any rule fails (log reason)
             • inferCategory() + inferStyleTags() + inferRoomTypes()
             • Skip if external_id in progress Set (already inserted)
             • Call Replicate CLIP on image_url → embedding[]
               ↳ On failure: log [CLIP FAIL], set embedding = null, continue
             • Add to pendingBatch[]

       (c) WHEN pendingBatch.length === 25:
             • supabase.from('products').upsert(pendingBatch)
               ↳ On error: log each failed product, continue
             • Add batch external_ids to progress Set
             • Save progress.json to disk
             • Log: "[Wayfair 275/1500] batch inserted"
             • pendingBatch = []

       (d) Flush any remaining pendingBatch after URL finishes

⑦ Flush final partial batch

⑧ Run report() → print totals by retailer / category / style / price_tier

⑨ Print verification SQL queries to console
```

**Concurrency**: `p-limit(3)` for Replicate calls (3 simultaneous embeddings).
**Apify delay**: 200ms between actor invocations.

---

## 12. Progress & Resume Capability

**File**: `scripts/seed-products/progress.json` (auto-generated, add to `.gitignore`)

```json
{
  "processedIds": ["WF-SOFA-001", "AMZ-B0XXXXXXX", "..."],
  "counts": {
    "wayfair": 1247,
    "amazon": 891,
    "ikea": 0
  },
  "lastUpdated": "2026-03-20T14:30:00.000Z"
}
```

On restart: file is loaded at step ④. Any product whose `external_id` is in `processedIds` is skipped at step (b) — the Apify scrape runs fresh but each product is a fast no-op. The pipeline resumes exactly where it left off.

---

## 13. Error Handling

| Failure Scenario | Behavior |
|---|---|
| Apify HTTP 429 (rate limit) | Exponential backoff: 2s → 4s → 8s → skip this URL batch, continue |
| Apify actor returns error / empty | Log error, skip this URL, continue to next URL |
| Replicate CLIP returns error | Log `[CLIP FAIL] {name}`, insert product with `clip_embedding = null` |
| Replicate HTTP 429 | Wait 10s, retry once, then insert without embedding |
| Supabase upsert error | Log full error + product names in batch, skip batch, continue |
| Image URL 404 | Replicate reports failure → treat as CLIP FAIL (insert without embedding) |
| Network timeout | 30s timeout on all HTTP. Retry once. Then skip. |
| Missing required field after mapping | Validation catches it → skip with log `[SKIP] {reason}` |

**One failed product NEVER stops the pipeline.**

---

## 14. Execution Order & Time Estimates

```
Step 0   Apply migration 018                              1 min
Step 1   pnpm install in scripts/seed-products/           2 min
Step 2   Pre-flight embedding dimension test              2 min
Step 3   Wayfair scrape + embed + insert (1,500 items)   3–4 hours
Step 4   Amazon scrape + embed + insert (1,200 items)    2–3 hours
Step 5   IKEA scrape + embed + insert (800 items)        1.5–2 hours
Step 6   Target scrape + embed + insert (600 items)      1–1.5 hours
Step 7   West Elm scrape + embed + insert (400 items)    45 min
Step 8   CB2 scrape + embed + insert (300 items)         30 min
Step 9   Article scrape + embed + insert (200 items)     20 min
Step 10  Final report + verification SQL                  2 min
─────────────────────────────────────────────────────────────────
Total wall time: ~10–12 hours
```

Run overnight in `tmux` or `screen`. The script is fully resumable — restart with `npx tsx index.ts` at any point.

---

## 15. If Apify Rate Limits or Blocks

1. **First response**: exponential backoff is automatic (built into code)
2. **Wayfair blocked after 3 retries**: fall back to `sovereigntaylor/wayfair-scraper` (free, lower success rate)
3. **West Elm / CB2 / Article blocked**: switch from `apify/website-content-crawler` to `apify/cheerio-scraper` with manual CSS selectors targeting product cards
4. **Amazon ASIN collection fails**: extract ASIN directly from product URLs (`/dp/([A-Z0-9]{10})/`) and pass directly to `axesso_data/amazon-product-details-scraper`
5. **Never disable JS rendering for Wayfair** — it is a heavy React SPA; non-JS scrapes return empty pages

---

## 16. If CLIP Embedding Fails

Products inserted with `clip_embedding = null`:
- **Do NOT appear** in CLIP vector similarity results — `search_products_by_embedding` RPC filters `WHERE clip_embedding IS NOT NULL`
- **DO appear** in style-tag fallback results — the fallback path in `match-products` uses `contains('style_tags', [...])` which doesn't require embeddings
- **Can be backfilled** anytime:

```sql
-- Find all products needing embeddings
SELECT id, image_url FROM products
WHERE clip_embedding IS NULL AND active = true
ORDER BY created_at;
```

Run a separate backfill script against this list after the main pipeline finishes.

---

## 17. Embedding Dimension: Pre-Flight Auto-Detect

Step 2 calls Replicate with a known test image and checks `embedding.length`:

**If `embedding.length === 1024`** → column is already correct (`VECTOR(1024)`). Proceed.

**If `embedding.length === 512`** → auto-apply:

```sql
-- Migration: 20240019000000_revert_clip_vector_512.sql
ALTER TABLE public.products DROP COLUMN IF EXISTS clip_embedding;
ALTER TABLE public.products ADD COLUMN clip_embedding extensions.vector(512);

DROP FUNCTION IF EXISTS public.search_products_by_embedding(extensions.vector(1024), float, integer);

CREATE OR REPLACE FUNCTION public.search_products_by_embedding(
  query_embedding extensions.vector(512),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INTEGER DEFAULT 15
) RETURNS TABLE (
  id UUID, name TEXT, retailer TEXT, price NUMERIC, category TEXT,
  image_url TEXT, affiliate_url TEXT, style_tags TEXT[], room_types TEXT[],
  width_inches FLOAT, depth_inches FLOAT, height_inches FLOAT, similarity FLOAT
) LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT id, name, retailer, price, category, image_url, affiliate_url,
         style_tags, room_types, width_inches, depth_inches, height_inches,
         1 - (clip_embedding <=> query_embedding) AS similarity
  FROM public.products
  WHERE clip_embedding IS NOT NULL
    AND 1 - (clip_embedding <=> query_embedding) > match_threshold
    AND active = true
  ORDER BY clip_embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**If any other dimension** → hard exit:
```
ERROR: Unexpected CLIP embedding dimension: {N}
Expected 512 or 1024. Resolve the model/column mismatch manually before seeding.
```

---

## 18. Verification SQL

Run these after the pipeline completes to confirm data quality and coverage targets:

```sql
-- 1. Total active products
SELECT COUNT(*) AS total FROM products WHERE active = true;

-- 2. Count by retailer
SELECT retailer, COUNT(*) AS count
FROM products WHERE active = true
GROUP BY retailer ORDER BY count DESC;

-- 3. Count by category
SELECT category, COUNT(*) AS count
FROM products WHERE active = true
GROUP BY category ORDER BY count DESC;

-- 4. Price tier distribution with avg/min/max price
SELECT
  price_tier,
  COUNT(*) AS count,
  ROUND(AVG(price), 2) AS avg_price,
  MIN(price) AS min_price,
  MAX(price) AS max_price
FROM products WHERE active = true
GROUP BY price_tier ORDER BY count DESC;

-- 5. Style tag distribution (unnested)
SELECT tag, COUNT(*) AS count
FROM products, unnest(style_tags) AS tag
WHERE active = true
GROUP BY tag ORDER BY count DESC;

-- 6. Room type distribution (unnested)
SELECT room, COUNT(*) AS count
FROM products, unnest(room_types) AS room
WHERE active = true
GROUP BY room ORDER BY count DESC;

-- 7. Embedding coverage
SELECT
  COUNT(*) FILTER (WHERE clip_embedding IS NOT NULL) AS with_embedding,
  COUNT(*) FILTER (WHERE clip_embedding IS NULL)     AS missing_embedding,
  COUNT(*) AS total
FROM products WHERE active = true;

-- 8. Price tier by retailer (coverage matrix)
SELECT retailer, price_tier, COUNT(*) AS count
FROM products WHERE active = true
GROUP BY retailer, price_tier
ORDER BY retailer, price_tier;

-- 9. Budget coverage check (critical for user renders)
SELECT
  price_tier,
  COUNT(*) AS count,
  CASE
    WHEN price_tier = 'budget'  AND COUNT(*) >= 1000 THEN '✓ OK'
    WHEN price_tier = 'mid'     AND COUNT(*) >= 2000 THEN '✓ OK'
    WHEN price_tier = 'premium' AND COUNT(*) >= 1500 THEN '✓ OK'
    WHEN price_tier = 'luxury'  AND COUNT(*) >= 500  THEN '✓ OK'
    ELSE '✗ BELOW TARGET'
  END AS status
FROM products WHERE active = true
GROUP BY price_tier;

-- 10. Spot-check 5 random products with embeddings
SELECT
  name, retailer, price, price_tier, category,
  style_tags, room_types,
  LEFT(image_url, 70)     AS image_preview,
  LEFT(affiliate_url, 70) AS url_preview,
  array_length(clip_embedding::text::text[], 1) AS embed_dim
FROM products
WHERE active = true AND clip_embedding IS NOT NULL
ORDER BY RANDOM() LIMIT 5;
```

---

## 19. Adding Affiliate Tags Later via SQL

When affiliate program accounts are approved, run these one-time UPDATE statements:

```sql
-- Amazon Associates (tag: cova03-20)
UPDATE public.products
SET affiliate_url = affiliate_url || '?tag=cova03-20'
WHERE retailer = 'amazon'
  AND affiliate_url NOT LIKE '%tag=%';

-- Wayfair Partner Network (replace WAYFAIR_TAG with actual refid)
UPDATE public.products
SET affiliate_url = affiliate_url || '?refid=WAYFAIR_TAG'
WHERE retailer = 'wayfair'
  AND affiliate_url NOT LIKE '%refid=%';

-- West Elm via CJ Affiliate (replace CLICK_ID with actual CJ click ID)
-- UPDATE public.products
-- SET affiliate_url = 'https://www.anrdoezrs.net/click-CLICK_ID?url=' || affiliate_url
-- WHERE retailer = 'west_elm';

-- CB2 via CJ Affiliate
-- UPDATE public.products
-- SET affiliate_url = 'https://www.anrdoezrs.net/click-CLICK_ID?url=' || affiliate_url
-- WHERE retailer = 'cb2';

-- Article via Impact Radius (pending approval)
-- UPDATE public.products
-- SET affiliate_url = 'https://track.article.com/click?url=' || affiliate_url
-- WHERE retailer = 'article';
```

---

## 20. Post-Seeding: Enable Vector Index

The HNSW index was created in migration 012. After seeding 5,000+ products, test query speed. If cosine similarity searches are slow (>200ms), add the IVFFlat index:

```sql
-- Only run AFTER seeding is complete — needs rows to determine `lists` parameter
-- HNSW (from migration 012) is generally superior; use IVFFlat only if needed
CREATE INDEX IF NOT EXISTS products_clip_ivfflat
ON public.products
USING ivfflat (clip_embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- Verify index is being used:
EXPLAIN SELECT * FROM search_products_by_embedding(
  (SELECT clip_embedding FROM products LIMIT 1), 0.3, 15
);
```

---

## Product Coverage Targets Summary

| Dimension | Target | Minimum |
|---|---|---|
| **Total products** | 5,050+ | 5,000 |
| **Wayfair** | 1,500 | 1,400 |
| **Amazon** | 1,200 | 1,100 |
| **IKEA** | 800 | 700 |
| **Target** | 600 | 550 |
| **West Elm** | 400 | 350 |
| **CB2** | 300 | 270 |
| **Article** | 200 | 180 |
| **budget (<$100)** | 1,000 | 900 |
| **mid ($100–$500)** | 2,000 | 1,800 |
| **premium ($500–$1,500)** | 1,500 | 1,300 |
| **luxury (>$1,500)** | 500 | 400 |
| **coastal style** | 1,000 | 800 |
| **japandi style** | 1,000 | 800 |
| **bohemian style** | 1,000 | 800 |
| **mid_century style** | 1,000 | 800 |
| **minimalist style** | 1,000 | 800 |
| **living_room room type** | 1,200 | 1,000 |
| **bedroom room type** | 900 | 800 |
| **dining_room room type** | 700 | 600 |
| **home_office room type** | 500 | 400 |

---

*Generated: 2026-03-20 | Pipeline version: v1*
