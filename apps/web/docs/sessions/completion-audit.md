# Cova V1 Web App — Complete State Audit
**Date:** April 7, 2026  
**Scope:** Baseline snapshot before Steps 7/8/9 rewrite  
**Target:** M8 Commerce implementation verification

---

## AI Pipeline Library Files

### lib/ai/depth.ts (83 lines)
- **Exports:** `estimateDepth()`, `assessDepthQuality()`
- **Flow:** Replicate `chenxwh/depth-anything-v2` (Large) → returns CDN URL via `.toString()` or `.url()?.href`
- **Quality Score:** 0–1 via HEAD request file size heuristic (>50KB=0.85, >20KB=0.75, <20KB=0.5)
- **Critical note:** Uses fallback extraction pattern for FileOutput objects; verified working April 2026

### lib/ai/flux.ts (240 lines)
- **Exports:** `buildFluxPrompt()`, `submitSchnellRender()`, `submitRender()`, `runFluxRender()`, `RoomPhysicalContext` type
- **Prompt template:** 8-section builder with DESCRIPTORS table (10 dimensions × lo/hi pairs), neutral band [-0.3, 0.3]
- **DESCRIPTORS keys:** luminosity, density, temperature, form, era, texture, scale, nature, saturation, materialOrigin
- **Models:** `black-forest-labs/flux-2-pro` (async), `black-forest-labs/flux-schnell` (fast)
- **Submission:** Async via Replicate predictions API; polling via 3-second intervals
- **Budget modifiers:** budget, mid, premium, luxury per tier
- **Hard constraint:** 400-word limit on final prompt

### lib/ai/grounding.ts (289 lines)
- **Exports:** `detectFurniture()`, `detectArchitecture()`, Detection interface with `mask_url` field
- **Flow:** GroundingDINO (3 focused queries) → SAM segmentation → IoU deduplication (0.85 threshold) → combined mask
- **Models:** `adirik/grounding-dino`, `schananas/grounded_sam`
- **Furniture queries:** PRIMARY (sofas, chairs, tables), ACCENT (lamps, plants, mirrors), TECH (TVs, speakers)
- **SAM mask:** Single combined mask for all furniture, returned as URL on first detection item
- **Post-process:** Binary threshold → 9×9 dilation → Gaussian blur → final threshold
- **Image dimensions:** Range request (first 64KB), falls back to 3024×4032 (iPhone portrait)

### lib/ai/modal.ts (76 lines)
- **Exports:** `submitRenderJob()`, `pollRenderJob()`, `waitForRenderJob()`
- **Endpoints:** `MODAL_RENDER_ENDPOINT`, `MODAL_STATUS_ENDPOINT` from env
- **Payload:** photo_url, depth_map_url, prompt, negative_prompt, style_strength, room_id, render_session_id
- **Polling:** 3-second interval, 90-second timeout
- **Status states:** pending, running, complete, failed

### lib/ai/clip.ts (95 lines)
- **Exports:** `embedImage()`, `cosineSimilarity()`, `fingerprintToStyleTags()`, `computeFingerprintAlignment()`, `computeBudgetFit()`
- **Batch entry point:** `embedImage()` calls `andreasjansson/clip-features` with single image URL
- **Output format:** Handles Array<{embedding}> or {embedding} variants
- **Batch support:** Replicate model accepts newline-separated URLs for multi-image embedding

### lib/ai/inpainting.ts (331 lines)
- **Exports:** `generateInpaintingMask()` → PNG binary, uploaded to Supabase `room-photos/inpainting-masks/`
- **Mask logic:** Black (0)=preserve (keep:true), White (255)=regenerate (keep:false or undecided)
- **SAM mask flow:** Download → resize with nearest → grayscale → post-process (threshold→dilate 9×9→blur 3×3→threshold)
- **Fallback:** If SAM decode fails, use bbox rectangles only
- **Keep item application:** Apply keep rectangles last (zeros out black regions)
- **PNG encoding:** Minimal custom encoder with CRC32, no external library dependency

### lib/ai/renderCrop.ts (118 lines)
- **Exports:** `cropAndUploadRenderRegion()` → public URL of cropped JPEG
- **10% padding:** Applied around bbox for visual context in CLIP matching
- **Sharp:** Dynamic import with fallback to full URL if unavailable
- **Dimensions:** Range request (first 64KB), falls back to 1024×1024
- **Upload:** Supabase `room-photos/render-crops/{roomId}/{itemId}-{timestamp}.jpg`

### lib/ai/serper.ts (133 lines)
- **Exports:** `searchProducts()`, `buildSearchQuery()`, `isTechItem()`, SerperProduct interface
- **Endpoint:** `https://google.serper.dev/shopping`
- **Query logic:** Item description + year (if tech) + budget range
- **Tech categories:** TV, television, monitor, soundbar, speaker, smart light, gaming, console, display, projector
- **Price parsing:** Regex strip non-digits, parseFloat
- **Retailer extraction:** URL hostname without `www.`
- **Filter:** price > 0 && imageUrl && productUrl required

---

## API Routes — Complete Inventory

### Detection & Depth
- **POST /api/detect** (300s timeout) — Furniture + architecture via GroundingDINO/SAM, depth via Replicate, updates room.keep_mask + depth_map_url
- **GET /api/detect/status** — Status only

### Product Matching
- **POST /api/match** — Rate-limited per user; crop item → Claude Vision describe → Serper 2-query parallel → CLIP batch embed (crop + 20 products) → scoring (55% visual, 25% budget, 10% fit, 10% quality) → top 5, fallback to budget if CLIP fails
- **Match scoring logic (CRITICAL):**
  - visualScore = cosineSimilarity(cropEmbedding, productEmbedding)
  - Hard filter: visualScore < 0.65 rejected
  - budgetScore = bell curve centered at midpoint (0.70 if under min, falls to 0 if over max, 1.0 at midpoint)
  - fitScore = category defaults or room_dimension based
  - finalScore = 0.55×visual + 0.25×budget + 0.10×fit + 0.10×quality (rating/5)
  - Top 5 by finalScore

### Rendering & Refinement
- **POST /api/render** — Accepts render inputs, returns prediction_id
- **GET /api/render/status** — Poll prediction status
- **POST /api/render/refine** — Sync render with feedback (polls until complete)

### Room Management
- **POST /api/rooms/create** — New room with user_id
- **POST /api/rooms/capture** — Attach photo to room
- **GET /api/rooms/[roomId]** — Fetch room details
- **GET /api/rooms/status** — Room processing status

### Quiz & Fingerprint
- **POST /api/quiz/fingerprint** — Compute fingerprint from Phase A/B responses
- **POST /api/quiz/next-card** — Next quiz card
- **POST /api/quiz/next-pair** — Next pairwise comparison
- **POST /api/quiz/mood-strip** — Mood strip question
- **POST /api/quiz/mood-board** — Mood board question

### Utilities
- **POST /api/parallax** — Generate depth-based parallax video (fire-and-forget)
- **POST /api/swap** — Furniture swap operation
- **GET /api/swap/status** — Swap job status
- **POST /api/parse-constraints** — Parse user constraints string

### Authentication & Capture
- **GET /api/auth/callback** — OAuth code exchange
- **POST /api/capture/generate-token** — QR token for mobile capture
- **POST /api/capture/validate-token** — Verify JWT before upload

### No interactions/route.ts
- `app/api/interactions/route.ts` does **NOT exist**

---

## UI Pages — Complete Manifest

### Landing & Auth
- **app/page.tsx** (285 lines) — Landing with hero, CTAs, hero video, auth integration
- **app/layout.tsx** (47 lines) — RootLayout with EB_Garamond, Inter, GeistMono fonts; Toaster
- **Fonts loaded:** `--font-serif` (EB Garamond), `--font-sans` (Inter), `--font-mono` (GeistMono)

### Design Flow Steps (1–11)
| Step | Lines | Current Behavior |
|------|-------|------------------|
| 1 | 200 | Room type + budget tier carousel selection |
| 2 | 338 | Style quiz (Phase A image selection) |
| 3 | 829 | Fingerprint reveal from Phase A/B responses |
| 4 | 502 | Space details capture (dimensions, inclusions) |
| 5 | 680 | Constraints + reference images |
| 6 | 420 | Photo capture hybrid (QR desktop, camera mobile, upload fallback) |
| 7 | 457 | **REWRITE TARGET** — Before/after comparison with parallax video, drag slider, Share button |
| 8 | 247 | **REWRITE TARGET** — Full-screen render with Before/After toggle, Share, CTAs to Step 9 |
| 9 | 365 | **REWRITE TARGET** — Refine panel with textarea, transformation slider (0–100%), version badges |
| 10 | 397 | Shopping shelf (product grid, hotspots, filters) |
| 11 | 17 | Placeholder |

---

## State Management

### lib/store/room.ts (191 lines)
**Zustand persistent store** (sessionStorage, key: `cova-room-v1`)

**Shape:**
```typescript
interface RoomState {
  roomId: string | null
  originalPhotoUrl: string | null
  depthMapUrl: string | null
  depthQuality: number | null
  roomAnalysis: RoomAnalysis | null
  detections: Detection[] | null
  renderUrl: string | null
  previewUrl: string | null
  parallaxVideoUrl: string | null
  keepMask: KeepMaskItem[] | null
  referenceImageUrls: string[]
  renderSessions: RenderSession[]
  currentRenderIteration: number
  swapRenderUrl: string | null
  predictionId: string | null
  schnellPredictionId: string | null
}
```

**Setters:** `setRoom`, `setPhotoUrl`, `setDepthMap`, `setRoomAnalysis`, `setDetections`, `setRenderUrl`, `setPreviewUrl`, `setParallaxVideoUrl`, `setKeepMask`, `toggleKeepItem`, `setReferenceImages`, `addRenderSession`, `setPredictionIds`, `setSwapRenderUrl`, `resetRoom`

### lib/store/fingerprint.ts (114 lines)
**Zustand persistent store** (sessionStorage, key: `cova-fingerprint-v1`)

**Shape:**
```typescript
interface FingerprintState {
  roomType: string | null
  budgetTier: 'budget' | 'mid' | 'premium' | 'luxury' | null
  budgetRange: [number, number] | null
  isGiftMode: boolean
  phaseASelections: string[]
  phaseBResponses: PairwiseResponse[]
  fingerprint: StyleFingerprint | null
  styleName: string | null
  styleTags: string[]
  showcasePredictionIds: ShowcasePrediction[]
  inclusions: string[]
  constraints: string[]
  roomDimension: 'small' | 'medium' | 'large' | null
}
```

### lib/store/session.ts (58 lines)
**Zustand persistent store** (sessionStorage, key: `cova-session`)

**Shape:**
```typescript
interface SessionState {
  currentStep: number  // 1–9
  isLoading: boolean
  error: string | null
  pendingPhotoUrl: string | null
  pendingRoomId: string | null
}
```

**Setters:** `setStep`, `nextStep`, `prevStep`, `setLoading`, `setError`, `setPendingCapture`, `clearPendingCapture`, `resetSession`

---

## Types

### types/fingerprint.ts (23 lines)
```typescript
interface StyleFingerprint {
  dimensions: {
    luminosity: number     // [-1, 1]
    density: number        // [-1, 1]
    temperature: number    // [-1, 1]
    form: number           // [-1, 1]
    era: number            // [-1, 1]
    texture: number        // [-1, 1]
    scale: number          // [-1, 1]
    nature: number         // [-1, 1]
    saturation: number     // [-1, 1]
    materialOrigin: number // [-1, 1]
  }
  covariance: number[][]
  confidence: number
}
```

### types/supabase.ts (382 lines)
**rooms table columns (live):**
- id, user_id, fingerprint_id, original_photo_url, depth_map_url, render_url, keep_mask, room_analysis, room_type, dimensions, constraints, inclusions, pipeline_cost_log, preview_url, parallax_video_url, created_at

**No current columns:** splat_url, redesign_splat_url, style_vector, is_public, modal_job_id, marble_operation_id (pending migrations)

---

## Configuration

### middleware.ts (98 lines)
**Protected page routes (require auth):**
- /design/step-4, step-5, step-6, step-7, step-8, step-9, step-10, /dashboard

**Public API routes (no auth):**
- /api/auth/callback, /api/quiz/*, /api/style-references/match

**Redirects:** Authenticated user at "/" → /dashboard; Unauthenticated user at protected page → "/" with ?next param

### next.config.mjs (74 lines)
**Image remotePatterns:** Supabase, Replicate, Amazon, Serper/Google Shopping, Target, West Elm, CB2, Pottery Barn, Walmart, Unsplash

**Experimental:** serverComponentsExternalPackages: ['sharp']

**Webpack alias:** three → three-web (0.169.0) for SparkJS compatibility

### app/globals.css (251 lines)
**Root CSS variables:**
```
--navy-deep: #0a1628
--navy-darker: #091829
--navy-card: #0d1f3c
--gold: #C9A84C
--gold-primary: #C9A84C
--gold-light: #D4B460
--gold-dim: rgba(201,168,76,0.3)
--ivory: #F5F0E8
--background: #091829
--foreground: #F5F0E8
```

**30+ keyframe animations:** slideUp, fadeIn, scaleIn, flash, sonarPing, shimmer, cardShimmer, cardBounce, ctaPulse, archDraw, archBreathe, dotPulse, panelFadeUp, matchFill, bubblePulse, etc.

### tailwind.config.ts (54 lines)
**Theme extends:**
- Legacy colors: navy, gold, ivory
- COVA V1 tokens: cova-bg, cova-surface, cova-surface-2/3, cova-gold, cova-gold-light/dim, cova-ivory, cova-ivory-dim, cova-muted, cova-subtle, cova-border, cova-border-gold/dim, cova-success, cova-error, cova-warning
- Font families: serif (--font-serif), sans (--font-sans), mono (--font-mono)

---

## Hex Color Audit

**Total hardcoded hex colors in app/ + components/:** 521 occurrences

**Top 10 offending files:**
1. app/design/step-3/page.tsx — 59 refs
2. components/RoomChatbot.tsx — 49 refs
3. components/cova/ShopRoom.tsx — 46 refs
4. app/room/[roomId]/3d/page.tsx — 31 refs
5. app/design/step-9/page.tsx — 29 refs
6. components/auth/AuthModal.tsx — 27 refs
7. app/furniture-selection/[roomId]/page.tsx — 24 refs
8. app/processing/[roomId]/page.tsx — 19 refs
9. components/capture/MobileCapture.tsx — 18 refs
10. app/capture/mobile/[token]/page.tsx — 17 refs

**Note:** Most are intentional inline styles (rgb, rgba wrapper values). Migration to CSS variables recommended but not blocking.

---

## Modal Pipeline

**modal_functions/ contents:**
- `depthflow_render.py` (5298 bytes) — Single production function

**Note:** Modal CLI not in PATH; check with `modal app list` if needed.

---

## Key Findings — Pre-Rewrite Snapshot

### ✅ Working & Verified
1. **Depth pipeline:** Replicate integration stable; quality heuristic active (>50KB=0.85)
2. **Grounding + SAM:** Combined furniture mask generation working; 3-query deduplication active
3. **FLUX prompt:** 10D descriptor system with neutral band [-0.3, 0.3]; 400-word limit enforced
4. **Store state:** All three Zustand stores using sessionStorage correctly
5. **Match route:** Complete scoring pipeline (55/25/10/10 weights); CLIP 0.65 threshold; budget fallback active
6. **Step 7 (current):** Before/after with parallax video + drag slider + Share; stores parallaxVideoUrl
7. **Step 8 (current):** Full-screen render + Before/After toggle + Share + CTAs
8. **Step 9 (current):** Refine textarea + transformation slider (0–100%) + version badges + Try Again/Start Over buttons

### ⚠️ Critical for Rewrite
1. **Step 7 to Step 8 flow:** Step 8 expects renderUrl; if not present, redirects to step-7
2. **Step 8 to Step 9 flow:** Step 9 expects renderUrl; must sync keepMask + fingerprint data
3. **Refinement store:** `lib/store/refine.ts` (15 lines) — used by Step 9; tracks refinement text + strength
4. **Video generation:** `/api/parallax` returns `video_url` nullable; Step 7 skips if unavailable
5. **renderSessions tracking:** Step 9 increments iteration counter on archive; versions persist across refines

### ❌ Not Implemented Yet
- `app/api/interactions/route.ts` does not exist
- Product matching hotspots (Step 10 code exists but match route incomplete)
- Affiliate URL construction per retailer
- Parallax video generation (API stub exists, modal function not wired)

---

## Build & Dependency Status

- **Next.js:** 14.2.35
- **TypeScript:** 5.x
- **Zustand:** 5.0.12 (with persist middleware)
- **Framer Motion:** 12.38.0
- **Replicate:** 1.x
- **Supabase SSR:** 0.10.0
- **SparkJS:** 0.1.10 (dynamic import with ssr: false)
- **Sharp:** Server-side only, optional fallback

**Build readiness:** All dependencies present; no missing imports detected in audit scope.

