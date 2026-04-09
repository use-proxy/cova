# COVA — MASTER CONTEXT FILE

# Version: 2.0 | April 2026 | Upgraded Stack

# AI interior design platform. Photo → personalized render → shoppable products.

# Founders: Pranav Goel (strategy + frontend) | Daksh (backend + AI pipeline)

# Web-first (Next.js 14 App Router). 2-week MVP deadline.

---

## WHAT COVA IS

Cova takes a photo of your actual room, learns your precise style through a
three-phase Bayesian quiz, generates a photorealistic AI render redesigned to
your taste and budget using FLUX.2 [pro] with multi-reference images, and lets
you shop every item in that render via a pixel-accurate SAM mask shelf interface
with Google Lens-powered product discovery and DINOv3/SigLIP2 re-ranking.

Core differentiators:

1. Style Fingerprint — 10-dimensional Bayesian taste vector with covariance matrix
2. Keep/Remove — pixel-accurate SAM masks show exactly what stays (unique in market)
3. Budget-constrained render pipeline — every product shown is within stated budget
4. Shoppable shelf + SAM highlight — tap item in shelf, exact pixel mask glows on render
5. Three-layer matching — SearchApi Google Lens + DINOv3/SigLIP2 ensemble + Serper text

---

## THE 9-STEP USER PIPELINE

Step 1 — What Are We Designing Today?
Room type (9 options) + budget tier. Gift mode toggle. Scopes everything downstream.
Data: room_type, budget_tier, budget_range, is_gift_mode.

Step 2 — Room Capture (fires BEFORE quiz)
Photo upload → Supabase Storage. Detection + Gemini analysis fire immediately in
background. User moves to quiz — detection runs silently for 3-5 minutes.
This guarantees zero wait at Keep/Remove (Step 5).
Device: photo only (LiDAR post-MVP).

Step 3 — Style Quiz (3 phases, runs during detection)
Phase A: 3 rounds x 9-image grid. User picks 2-3 favorites per round.
Each image has a pre-assigned 10D style vector. Selections warm-start the GP.
Phase B: 12-15 Bayesian pairwise comparisons using BoTorch PairwiseGP + qEUBO.
Active pair selection targets highest-variance dimension each round.
Response time recorded per pair (faster RT = higher weighting via lambda = 1 + 500/RT).
Runs on Modal (Python/PyTorch) — NOT Vercel (500MB+ dependency, serverless incompatible).
Phase C: 3 functional questions — household composition, budget confirm, free text.
Output: StyleFingerprint — 10 named dims in [-1,1], 10x10 covariance, confidence score.

Step 4 — Fingerprint Reveal + Auth + Mood Board
Full-screen style identity reveal: style name (EB Garamond), color swatches,
descriptor chips, mood strip thumbnails.
Account creation HERE: Apple Sign In + Google Sign In only.
Style validation mood board: 3x3 grid of matching room photos.
"Love it — Design My Room" or "Refine My Style" back to Phase B.

Step 5 — Keep/Remove + Space Details
Detection results are ready (ran during 3-5 min quiz). Zero wait.
Confidence threshold: 0.75 (show in shelf and overlay).
UI: Photo fills top 65%. Horizontal scrollable shelf below.
Shelf cards: render crop thumbnail + item label + confidence badge.
Tap shelf card → SAM pixel mask composited over photo in gold tint at pixel level.
Keep/Remove toggle appears over highlighted item.
Bidirectional: shelf card tap / photo overlay / list toggle all stay in sync.
Space details below list: dimensions chips, constraint chips, inclusion chips, free text.

Step 6 — Progressive Render Loading
Stage 1 (0s): Blurred original photo shown immediately.
Stage 2 (~3-4s): FLUX Schnell preview crossfades in (512px, 4 steps, ~$0.003).
Stage 3 (~12-18s): FLUX.2 [pro] full render crossfades in.
Single static heading: "Designing your room..." No theatrical phase text.
Gold indeterminate shimmer bar. Real polling state, not fake progress.
On render complete: trigger DepthFlow parallax async. Navigate to Step 7.

Step 7 — Render Reveal + Parallax
DepthFlow v0.9.1 dolly-zoom parallax video plays first (3s MP4, generated async).
After video: interactive before/after drag comparison (CSS clip-path).
CSS/JS parallax on render using depth map for mouse/gyroscope effect.
Share button (Web Share API). "Shop This Look" goes to Step 9. "Refine" goes to Step 8.

Step 8 — Style Refinement
Current render full-screen behind bottom panel (shadcn Sheet, 55% height).
5 visual sliders: Warmth, Minimalism, Color, Modernity, Texture.
Debounced 500ms fires FLUX Schnell preview on slider change (~4s).
NLP input: Gemini 2.5 Flash maps text to dimension deltas, updates sliders.
"Apply Changes" fires full FLUX.2 [pro] re-render, navigates to Step 6.

Step 9 — Shoppable Render + Shelf + Swap
Full-screen render, no chrome.
Shelf below render: ALL detected items at 0.75+ confidence as scrollable cards.
Render crop thumbnail + item label + match badge per card.
Tap shelf card:

1. Crop render to item bbox, upload to Supabase Storage, get crop_url
2. Fire SearchApi Google Lens (engine=google_lens, search_type=products)
3. Fire Serper Shopping text search in parallel (Gemini generates query text)
4. DINOv3 + SigLIP2 So400M re-ranking on Modal (65/35 geometric/semantic)
5. SAM pixel mask composited over render in gold tint at pixel level
6. Bottom sheet slides up with ranked products
   Top 2 highest-confidence items prefetched on render load.
   "Buy": inject affiliate tag, log interaction, open retailer in new tab.
   "Try in Room": FLUX Fill Pro inpainting swap (enabled when confidence >0.75
   AND depth_quality >0.70). Shows side-by-side before committing.

---

## DASHBOARD (/dashboard)

Authenticated users redirected here from / via middleware.
Unauthenticated users hitting /dashboard redirected to /.

Sections:

1. My Rooms — grid of room cards (render image, room type, date, action buttons)
   Actions per card: "Shop This Look" to Step 9 | "Redesign" to Step 6 | "Edit Style" to Step 8
   Three-dot menu: Download render | Share | Delete
   Empty state: centered illustration + "Design your first room" gold CTA

2. Design DNA — compact fingerprint card
   Style name (EB Garamond), 5 color swatches, 4 descriptor chips
   "Retake Quiz" | "Share my Design DNA" (Web Share API)

3. Saved Items — horizontal scroll of saved products (name, price, retailer, Buy button)
   "View all saved items" link to /dashboard/saved

4. Room Replay (if more than 1 render) — timeline strip + "Generate Time-Lapse" button

Sub-pages:
/dashboard/saved — full saved products, filterable by room type + price
/dashboard/profile — name, email, fingerprint summary, retake quiz, delete account
/dashboard/settings — notification prefs, budget default, default room type

After first render: "View in Dashboard" button on Step 7 + Step 9.
If guest at that point: prompt auth first, then redirect to dashboard.

---

## TECH STACK (April 2026)

Frontend: Next.js 14 App Router, React 18, TypeScript strict, Tailwind CSS, shadcn/ui
Zustand (sessionStorage persistence), Framer Motion, EB Garamond + Inter fonts
Backend: Supabase (auth + PostgreSQL + storage + pgvector)
Render: FLUX.2 [pro] (black-forest-labs/flux-2-pro on Replicate)
Preview: FLUX Schnell (black-forest-labs/flux-schnell on Replicate, 4 steps, 512px)
Inpainting: FLUX Fill Pro (black-forest-labs/flux-fill-pro on Replicate)
Depth: Depth Anything V2 (chenxwh/depth-anything-v2 on Replicate)
Upgrade to Depth Anything V3 when Replicate model becomes available
Detection: GroundingDINO (adirik/grounding-dino on Replicate, box_threshold=0.28)
Segmentation: SAM 2.1 (meta/sam-2 on Replicate)
Generates pixel mask PNG for every detection >= 0.28 confidence
Stored in Supabase Storage immediately after detection
Parallax: DepthFlow v0.9.1 on Modal A10G (dolly-zoom preset, 3s 1080p MP4, ~$0.003)
Room Analysis: Gemini 2.5 Flash (Google AI SDK)
Style Quiz Backend: BoTorch PairwiseGP + qEUBO on Modal CPU (~$0.005/session)
Embeddings: DINOv3 ViT-L/16 (facebook/dinov3-vitl16-pretrain-lvd1689m)

- SigLIP2 So400M (google/siglip2-so400m-patch14-384)
  Both self-hosted on Modal T4 ($0.000164/sec)
  65% DINOv3 (geometric) + 35% SigLIP2 (semantic) ensemble
  Visual Search: SearchApi.io Google Lens (engine=google_lens, search_type=products)
  $40/month base, ~$0.004-0.008/query, drop-in compatible with SerpApi
  Text Search: Serper Shopping API (supplementary, text-based, ~$0.001/query)
  Intelligence: Claude API claude-sonnet-4-6 (constraint parsing, prompt construction)
  Deployment: Vercel (web), Modal (GPU — DepthFlow, PairwiseGP, DINOv3, SigLIP2)
  Monitoring: Sentry (already installed)

---

## STYLE FINGERPRINT — 10 DIMENSIONS

Type: StyleFingerprint (defined in types/fingerprint.ts)
Range: [-1, 1] for all dimensions
Structure: { dimensions: {...}, covariance: number[][], confidence: number }

FLUX prompt descriptors (only append if |value| > 0.3 — skip neutral band entirely):

luminosity:
< -0.3 -> "very dark, moody, dramatic, candlelit, cave-like atmosphere"

> 0.3 -> "bright airy space, flooded with natural light, sun-drenched"

density:
< -0.3 -> "stark, near-empty, intentional void, almost no objects"

> 0.3 -> "richly layered, curated objects, maximalist, every surface considered"

temperature:
< -0.3 -> "icy cool, concrete grey, slate, steel blue, cold whites"

> 0.3 -> "warm amber tones, honey wood, terracotta, beeswax"

form:
< -0.3 -> "hyper-geometric, hard right angles, razor-sharp lines, zero curves"

> 0.3 -> "organic curves, soft rounded forms, natural shapes, no hard edges"

era:
< -0.3 -> "ultra-modern, futuristic, cutting-edge contemporary, no historical reference"

> 0.3 -> "classic heritage, antique references, traditional craft, heirloom quality"

texture:
< -0.3 -> "mirror-smooth, lacquered, polished stone, glass, zero tactile variation"

> 0.3 -> "tactile richness, chunky knits, rough linen, natural stone, woven rattan"

scale:
< -0.3 -> "petite furnishings, delicate proportions, small-scale pieces"

> 0.3 -> "oversized statement pieces, large-scale furnishings, grand proportions"

nature:
< -0.3 -> "synthetic materials, industrial, man-made surfaces, no plants"

> 0.3 -> "abundant natural materials, wood grain, stone, live plants, rattan, linen"

saturation:
< -0.3 -> "achromatic palette, near-neutral, greige, white, grey, black"

> 0.3 -> "rich saturated color, bold hues, high-contrast palette, vivid accents"

materialOrigin:
< -0.3 -> "industrial materials, concrete, steel, factory-made, precision-manufactured"

> 0.3 -> "artisanal craft, hand-thrown ceramics, hand-woven textiles, bespoke joinery"

---

## FLUX.2 [pro] PROMPT STRUCTURE

Use JSON-structured prompts. FLUX.2 [pro] natively parses them for precise control.
NO negative prompts — they backfire in FLUX.2 [pro]. Only describe what you want.
Enable prompt_upsampling parameter. Use camera terminology extensively.
Final prompt must be under 400 words. Throw error at runtime if exceeded.

Template:
{
"scene": "A [room_type]",
"style_descriptors": ["[active dimension descriptors — skip neutral band]"],
"budget_modifier": "[budget text]",
"inclusions": ["include a [item]"],
"preserved_items": ["preserving existing [item]"],
"camera": {"angle": "eye level", "lens": "35mm", "style": "architectural photography"},
"lighting": {"type": "natural", "quality": "soft directional"}
}

Budget modifiers:
budget -> "affordable accessible pieces, high-street furniture"
mid -> "quality mid-range furniture, well-made everyday pieces"
premium -> "elevated materials, considered investment pieces"
luxury -> "designer furniture, investment pieces, bespoke details"

---

## DETECTION PIPELINE PARAMETERS

GroundingDINO:
box_threshold: 0.28 (detect everything meaningful)
text_threshold: 0.22
User-facing threshold: 0.75 (show in shelf and Keep/Remove)
Internal use: 0.28-0.75 (render context only, never shown)

SAM 2.1:
Runs on every detection >= 0.28 confidence
Generates pixel mask PNG for each item — stored in Supabase Storage
Mask dimensions: always match input photo exactly using sharp().metadata()
Mask post-processing: dilate 3px, blur sigma 1.5, threshold 128

Gemini 2.5 Flash room analysis (parallel with detection):
Returns: room_type, dimensions_estimate, existing_style, architectural_features,
lighting_conditions, floor_type, wall_finish, natural_light_level

Depth Anything V2:
Model: chenxwh/depth-anything-v2 on Replicate (~$0.0012/run)
Depth quality: mean gradient magnitude > 0.70 = sufficient for swap

Re-detection on render (Step 9):
After render completes, run GroundingDINO + SAM on the render image
Use original item labels as prompts for mask accuracy on AI image
Cost: ~$0.02-0.03 — necessary because render repositions items

---

## PRODUCT MATCHING PIPELINE

Per hotspot tap (lazy load — fire on tap, not all at once):
Pre-fetch: top 2 highest-confidence items on render load
On tap: remaining items fire SearchApi query

Layer 1 — Visual search (SearchApi.io):
engine=google_lens, search_type=products
Pass render crop URL (cropped to detection bbox)
Returns: title, link, price, retailer, image_url, in_stock, rating
Filter: price within budget_range
Cache: 24h by crop image hash

Layer 2 — Text search (parallel with Layer 1):
Gemini 2.5 Flash generates structured item description from render crop
Serper Shopping API text search (~$0.001/query)
Filter: price within budget_range

Layer 3 — Re-ranking (Modal T4, self-hosted):
DINOv3 ViT-L/16: 1024-dim geometric embeddings
SigLIP2 So400M: 1152-dim semantic embeddings
Ensemble: 0.65 x dinov3_sim + 0.35 x siglip2_sim
Final score: 0.50*visual_ensemble + 0.25*budget_fit + 0.15*fingerprint_align + 0.10*availability
Return top 8
Labels: "Perfect Match" (>0.85) | "Very Similar" (0.70-0.85) | "Inspired By" (<0.70)

---

## UI INTERACTION MODEL — SHELF + SAM MASKS

Both Keep/Remove (Step 5) and Shoppable (Step 9) use identical shelf pattern:

Layout:
Top: room photo or render (fills ~60% of viewport)
Bottom: horizontal scrollable shelf (~40%)

Shelf cards per detected item (confidence >= 0.75):
Thumbnail: cropped region from photo/render at item bbox (120px wide, 140px tall)
Label: cleaned item type ("Sofa", not "a sofa 0.82")
Confidence badge: colored dot (green >=0.85, amber 0.75-0.85)
Style: rounded-xl, bg-cova-surface, border-cova-border, gap-3

On shelf card tap:

1. Gold ring appears around tapped card (border-cova-border-gold)
2. Fetch pre-generated SAM mask PNG from Supabase Storage (maskUrl from detection)
3. Canvas API: composite mask over photo/render as gold tint overlay
   rgba(201, 168, 76, 0.35) multiply blend mode
4. Pixel-accurate — follows exact object contour, not bbox rectangle
5. Step 5: Keep/Remove toggle slides up over highlighted area
6. Step 9: bottom sheet slides up with product matches

Canvas compositing pattern:
ctx.drawImage(photoOrRender, 0, 0)
ctx.globalCompositeOperation = 'multiply'
ctx.fillStyle = 'rgba(201, 168, 76, 0.35)'
ctx.drawImage(maskImage, 0, 0)
ctx.globalCompositeOperation = 'source-over'

Tap outside: deselect, remove overlay.

---

## SUPABASE SCHEMA (7 tables)

users:
id uuid PK | email text | auth_provider text | created_at timestamptz | last_active timestamptz

style_fingerprints:
id uuid PK | user_id uuid FK | dimensions jsonb | covariance jsonb | confidence float8
style_name text | room_type text | budget_tier text | entry_path text
quiz_responses jsonb | phase_a_selections jsonb | created_at timestamptz

rooms:
id uuid PK | user_id uuid FK | fingerprint_id uuid FK (ON DELETE SET NULL)
original_photo_url text | depth_map_url text | render_url text | preview_url text
parallax_video_url text | keep_mask jsonb | room_type text | dimensions text
constraints text[] | inclusions text[] | room_analysis jsonb
pipeline_cost_log jsonb | created_at timestamptz

render_sessions:
id uuid PK | room_id uuid FK | render_url text | preview_url text
parallax_video_url text | prompt text | style_strength float8
iteration integer default 1 | created_at timestamptz

products:
id uuid PK | name text | retailer text | price numeric | affiliate_url text
image_url text | dinov3_embedding jsonb | siglip2_embedding jsonb
style_tags text[] | room_types text[] | in_stock boolean default true
commission_rate numeric | source text | created_at timestamptz

interactions:
id uuid PK | user_id uuid FK | room_id uuid FK | product_id uuid FK
action text CHECK (action IN (
'hotspot_tap','product_view','affiliate_click','swap_initiated',
'swap_completed','purchase_confirmed','regenerate','refine',
'add_item','quiz_response','shelf_tap','mask_viewed'
))
fingerprint_id uuid FK | metadata jsonb | created_at timestamptz

style_references:
id uuid PK | image_url text not null | room_type text not null
dimension_labels jsonb | style_name text | source text | created_at timestamptz

All tables: RLS enabled. user_id FK indexes. created_at indexes. room_type indexes.

---

## API CONTRACTS

POST /api/render
Input: { room_id, photo_url, depth_map_url, keep_mask, fingerprint,
reference_image_urls, room_type, budget, inclusions, constraints, room_analysis }
Output: { prediction_id, schnell_prediction_id }

GET /api/render/status?prediction_id=&schnell_prediction_id=&room_id=
Output: { status, render_url, preview_url, render_session_id }

POST /api/detect
Input: { photo_url, room_id }
Output: { detections: Detection[], depth_map_url, depth_quality, room_analysis }

GET /api/detect/status?room_id=
Output: { status, detections, depth_map_url, depth_quality, room_analysis }

POST /api/match
Input: { render_crop_url, fingerprint, budget_range, room_type, item_label }
Output: { products: RankedProduct[], query_description }

POST /api/swap
Input: { room_id, render_url, item_bbox, item_mask_url, replacement_product_id, fingerprint }
Output: { prediction_id }

GET /api/swap/status?prediction_id=&room_id=
Output: { status, swap_render_url }

POST /api/quiz/fingerprint
Input: { phase_a_selections, phase_b_responses, room_type, household_composition }
Output: { fingerprint: StyleFingerprint, style_name, style_tags }

POST /api/quiz/next-pair
Input: { fingerprint: StyleFingerprint, answered_pairs: string[] }
Output: { pair: { imageA: QuizImage, imageB: QuizImage } }

POST /api/rooms/create
Input: { room_type }
Output: { id: string }

POST /api/rooms/capture
Input: multipart { photo, room_id }
Output: { room_id, photo_url }

PATCH /api/rooms/[roomId]
Input: { keep_mask?, dimensions?, constraints?, inclusions?,
fingerprint_id?, render_url?, depth_map_url? }
Output: { success: boolean }

POST /api/parallax
Input: { render_url, depth_map_url, room_id }
Output: { video_url }

POST /api/render/refine
Input: { room_id, current_render_url, refinement_text?, slider_deltas? }
Output: { schnell_prediction_id, updated_fingerprint }

---

## COST ENVELOPE (~$0.50/session target)

Component Cost/session
FLUX Schnell preview ~$0.003
FLUX.2 [pro] full render (1MP) ~$0.030
Depth Anything V2 ~$0.001
GroundingDINO + SAM 2.1 ~$0.020
Gemini 2.5 Flash room analysis ~$0.010
Re-detection on render (DINO+SAM) ~$0.025
DepthFlow parallax on Modal ~$0.003
PairwiseGP quiz on Modal ~$0.005
Fixed pipeline subtotal ~$0.097

Per tapped hotspot:
SearchApi Google Lens ~$0.006
DINOv3 + SigLIP2 Modal ~$0.001
Per hotspot subtotal ~$0.007

At 5 tapped hotspots: ~$0.132 total
At 8 tapped hotspots: ~$0.153 total
Well within $0.50 envelope.

---

## DESIGN SYSTEM

Background: #091829 (--cova-bg)
Surface: #0D2035 (--cova-surface)
Surface-2: #112540 (--cova-surface-2)
Surface-3: #163050 (--cova-surface-3)
Gold: #C9A84C (--cova-gold)
Gold hover: #D4B460 (--cova-gold-light)
Gold dim: #8A6E2E (--cova-gold-dim)
Ivory: #F5F0E8 (--cova-ivory)
Ivory dim: #C8C0B0 (--cova-ivory-dim)
Muted: #8A9BB5 (--cova-muted)
Subtle: #4A5E7A (--cova-subtle)
Border: rgba(201,168,76,0.20) (--cova-border)
Border gold: rgba(201,168,76,0.60) (--cova-border-gold)
Border dim: rgba(138,155,181,0.15) (--cova-border-dim)

Headings: EB Garamond serif (--font-serif), letter-spacing wide
Body: Inter sans-serif (--font-sans)
Dark theme ONLY. No light mode.
NEVER hardcode hex values. ALWAYS use CSS variables from styles/tokens.css.
Components: shadcn/ui with Cova token overrides in /components/cova/ only.
Animation: Framer Motion, spring animations preferred.

UI AESTHETIC: Luxury editorial. Architectural Digest meets dark-mode SaaS.
Generous negative space. Gold as punctuation, not decoration.
EB Garamond creates warmth against deep navy. Micro-interactions feel inevitable.
Restrained maximalism — every element earns its place.

---

## ENVIRONMENT VARIABLES

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (server-side only, NEVER expose to client)
REPLICATE_API_TOKEN
ANTHROPIC_API_KEY
GEMINI_API_KEY
SEARCHAPI_KEY (SearchApi.io — replaces old SERPAPI_KEY)
SERPER_API_KEY
MODAL_TOKEN_ID
MODAL_TOKEN_SECRET
SENTRY_DSN
E2E_TEST_EMAIL
E2E_TEST_PASSWORD
E2E_PORT (default 3001)

---

## KEY DECISIONS — ALL LOCKED

Pipeline order: room capture (Step 2) BEFORE quiz (Step 3) — detection during quiz
Detection threshold: 0.75 for user-facing (shelf + Keep/Remove)
No artificial hotspot cap — show all detections >=0.75 in shelf
SAM pixel masks on BOTH Keep/Remove and Shoppable screens
Re-run GroundingDINO + SAM on final render for accurate mask positioning on Step 9
Shelf + SAM highlight replaces pulsing dots on image
FLUX.2 [pro] only — no ControlNet, no 3D in V1
Async render always — POST returns prediction_id, client polls
No negative prompts in FLUX.2 [pro] — they backfire
JSON-structured prompts for FLUX.2 [pro]
BoTorch PairwiseGP + qEUBO on Modal (NOT Vercel — 500MB+ PyTorch dependencies)
Phase B: 12-15 pairs (not 10 — needed for 10D coverage)
DINOv3 + SigLIP2 So400M ensemble (not C-RADIOv4 — insufficient production validation)
SearchApi.io for Google Lens (not SerpApi — identical quality, $40/mo vs $150/mo)
Embeddings self-hosted on Modal T4 (not Replicate — neither DINOv3 nor SigLIP2 So400M available)
Account creation at Step 4 after fingerprint reveal, not app start
Swap enabled only: object_confidence >0.75 AND depth_quality >0.70
Playwright tests run against npm run start (production build), NEVER npm run dev
Depth Anything V2 now, upgrade to DA3 when Replicate model available
DepthFlow v0.9.1 dolly-zoom preset — cost ~$0.003 (not $0.05-0.10 as old estimate)
Dashboard at /dashboard — authenticated users redirected here from /
Token economy launches post-MVP after PMF validation

---

## COMPETITIVE POSITIONING

Interior AI (Pieter Levels): $38-45K MRR, no commerce, no personalization
Onton: $7.5M funded, 2M MAU, no fingerprint, no keep/remove
Wayfair Muse / IKEA Kreativ: locked to own catalogs

Cova wins on: Bayesian fingerprint personalization, pixel-accurate keep/remove,
progressive render (Schnell preview + FLUX.2 [pro]), shelf + SAM shopping UX.
Cova moat: taste-to-purchase behavioral dataset compounds with every interaction.

---

## SESSION PLAN SUMMARY (April 2026)

| Session | What                                     | Owner  | Status  |
| ------- | ---------------------------------------- | ------ | ------- |
| Pre     | FLUX.2 + 10-dim fingerprint migration    | Daksh  | Done    |
| 2       | Design system components                 | Pranav | Done    |
| 3       | Supabase schema + auth                   | Daksh  | Done    |
| 4       | Zustand stores (10-dim)                  | Either | Done    |
| 5       | Step 1 UI: room type + budget            | Pranav | Done    |
| 6       | Step 2: Room capture UI                  | Pranav | Next    |
| 6B      | Dashboard /dashboard                     | Pranav | Pending |
| 7       | Step 3: Phase A image grid quiz          | Both   | Pending |
| 8       | Step 3: Phase B Bayesian pairwise        | Daksh  | Pending |
| 9       | Step 4: Fingerprint reveal + auth        | Pranav | Pending |
| 10      | Step 5: Keep/Remove + SAM masks          | Pranav | Pending |
| 11      | Style references + FLUX.2 prompt builder | Daksh  | Pending |
| 12      | Step 6: Progressive render pipeline      | Both   | Pending |
| 13      | Step 7: Render reveal + DepthFlow        | Both   | Pending |
| 14      | Step 8: Style refinement sliders + NLP   | Both   | Pending |
| 15      | Product matching: SearchApi + Modal      | Daksh  | Pending |
| 16      | Step 9: Shoppable shelf + SAM + swap     | Both   | Pending |
| 17      | Integration testing + bug fixes          | Both   | Pending |
| 18      | Error handling + security hardening      | Daksh  | Pending |
| 19      | Deployment                               | Either | Pending |
