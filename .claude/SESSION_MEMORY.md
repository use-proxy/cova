# COVA V1 — Session Memory
# .claude/SESSION_MEMORY.md
# Update this file at the END of every Claude Code session.
# Read this file at the START of every Claude Code session.

---

## Current State

- **Current Milestone:** M5 — Processing + Viewer (NOT STARTED)
- **Last Updated:** March 30, 2026
- **Last Session:** M4 Quiz + Capture. Adaptive Bayesian quiz, mobile camera capture, QR desktop flow, processing page.

---

## What Is Complete

### Planning & Spec
- [x] Full V1 spec written and finalized (cova_v1_complete_spec_v7.docx)
- [x] AI pipeline finalized: AnySplat → gsplat 360° panorama → Lang-SAM → FLUX Fill → FLUX Kontext → Marble/SHARP
- [x] Product matching finalized: 6 cube face crops → Claude Vision → CLIP → pgvector
- [x] Milestone sequence finalized: M0–M14 in dependency order
- [x] UI/UX design system defined: navy/gold, v0 + Framer Motion
- [x] Retailer lineup finalized: 12 retailers replacing Wayfair (~18,150 products)
- [x] Scraping plan finalized with in-depth step-by-step instructions
- [x] CLAUDE.md written and updated with all decisions
- [x] SESSION_MEMORY.md written

### V0 iOS App (frozen)
- [x] Products table: 5,581 products with 768-dim CLIP embeddings
- [x] quiz_cards table: 950 cards
- [x] IVFFlat vector index on products
- [x] 6 Edge Functions deployed
- [x] Style quiz Bayesian algorithm working
- [x] Basic dashboard working

### M0 Progress (March 30, 2026)
- [x] CJ Affiliate account created + W-9 submitted (SSN, individual)
- [x] Wayfair confirmed closed to new publishers
- [x] Amazon cova03-20 confirmed active (tax info deferred until EIN)
- [x] Impact account created (pending domain verification)
- [x] covainterior.com registered on Namecheap ($11.28/year)
- [x] Namecheap MX records added (mx1/mx2.improvmx.com)
- [x] Modal account created + MODAL_TOKEN_ID + MODAL_TOKEN_SECRET in apps/web/.env.local
- [x] Repo cleanup: deleted redundant files (BUILDGUIDE.md, MASTER_STRATEGY.md, Cova_V1_Build_Guide.docx, TESTING.md, PRODUCT_TRUTH.md.archived, CLEANUP_REPORT.md, MVP_SPEC.md, root app.json, root .env, debug PNGs)
- [x] apps/mobile/.env.save removed from git tracking
- [x] Duplicate ANTHROPIC_API_KEY removed from root .env.local
- [x] CLAUDE.md created at root and apps/web/CLAUDE.md
- [x] .claude/SESSION_MEMORY.md created

### M1 Progress (March 30, 2026)
- [x] AnySplat pipeline deployed on Modal A10G (modal_pipeline/room_reconstruction.py)
- [x] AnySplat source code copied locally to modal_pipeline/anysplat/
- [x] Modal image: pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime base + all deps
- [x] 3.28M Gaussian reconstruction of real room
- [x] PLY compressed 223MB → 2.9MB via voxel downsampling (open3d)
- [x] Uploaded to Supabase room-videos bucket
- [x] SparkJS test viewer at /test-viewer with signed URL from server component
- [x] next.config.mjs webpack fix for SparkJS asset module compatibility
- [x] @sparkjsdev/spark + three.js installed in apps/web/

### M2 Progress (March 30, 2026)
- [x] pgvector search validated against existing 5,581 product catalog
- [x] buildAffiliateUrl() built for all 11 retailers in apps/web/lib/affiliates.ts
- [x] 15/15 affiliate URL tests passing (apps/web/lib/affiliates.test.ts)
- [x] Test script at modal_pipeline/test_catalog.py (CLIP via Replicate → pgvector search)
- [x] Target affiliate removed — program ended January 5, 2026
- Known issue: category mismatches and duplicate products in V0 catalog — fix during M6 quality filtering

### M3 Progress (March 30, 2026)
- [x] Supabase client setup: lib/supabase/client.ts (createBrowserClient) + server.ts (createServerSupabaseClient)
- [x] Middleware with route protection (/dashboard, /room, /quiz, /capture, /processing)
- [x] Auth callback route (app/auth/callback/route.ts) — OAuth code exchange working
- [x] Zustand stores: userStore (user, styleVector) + roomStore (roomId, splatUrl, processingStage)
- [x] All 3 auth methods configured: Google OAuth, Apple Sign In, email magic link
- [x] /auth page with sign in UI (functional, not styled with v0 yet)
- [x] /dashboard page — server component, session-protected, shows user email + sign out
- [x] SignOutButton client component
- [x] IMPORTANT: Supabase project uses NEW publishable key format (sb_publishable_ / sb_secret_). Legacy JWT keys (eyJ...) are disabled. Always use publishable keys from Settings → API keys → first section.

### M4 Progress (March 30, 2026)
- [x] Style quiz: 3-phase adaptive Bayesian algorithm (app/quiz/page.tsx)
  - Phase 1: 15 baseline cards (3 per style, shuffled)
  - Phase 2: 5 pure confirmation cards (top 2 styles, prefetched at card 14)
  - Phase 3: 5 refinement cards (style pair, prefetched at card 19)
- [x] Bayesian update: likelihood × discriminability_score, likes stronger than dislikes (0.5× penalty)
- [x] Smoothing: MIN_VALUE=0.02 prevents any style from reaching 0
- [x] style_blend saves to rooms table after EVERY swipe (partial profile survives early exit)
- [x] style_blend also saves to users table on quiz completion
- [x] Desktop capture: QR code with JWT token (jose) + 3s polling (app/capture/[roomId]/page.tsx)
- [x] Mobile capture: getUserMedia camera UI with guidance messages (app/capture/[roomId]/page.tsx)
- [x] Processing placeholder page with polling + retry (app/processing/[roomId]/page.tsx)
- [x] API routes: /api/pipeline/start, /api/capture/generate-token, /api/capture/validate-token
- [x] Framer Motion card animations (drag, rotate, spring)
- DEFERRED to M11: mobile video recording + upload test (requires HTTPS on covainterior.com)
- DEFERRED to M13: all v0 UI polish (build features functionally first)
- IMPORTANT: swipe_history table does NOT exist — V0 mobile app doesn't use it either. Swipes are not individually recorded, only the cumulative style_blend is saved.
- IMPORTANT: rooms.status CHECK constraint only allows 'active' and 'archived'. Do NOT set status to 'processing', 'video_uploaded', etc. — those will fail the CHECK constraint.

---

## What Is In Progress / Pending

### Come Back To (waiting on DNS propagation)
- [ ] ImprovMX — DNS needs to propagate for covainterior.com, then set up hello@covainterior.com → cova.interior@gmail.com
- [ ] Impact — once hello@covainterior.com works, verify domain, then apply to Target

### Still To Complete for M0
- [ ] Article — apply at article.com/affiliates
- [ ] Sovrn — create account, apply to Crate & Barrel + CB2
- [ ] ShareASale — create account, apply to West Elm + Pottery Barn
- [ ] CJ — apply to Ruggable, One Kings Lane, Overstock (existing CJ account)
- [ ] Awin — create account, apply to Etsy
- [ ] Replicate — confirm token active, add to apps/web/.env.local
- [ ] Anthropic — confirm key active, add to apps/web/.env.local
- [ ] Sentry — find DSN from V0 mobile .env, add to apps/web/.env.local
- [ ] PostHog — find key from V0 mobile .env, add to apps/web/.env.local
- [ ] Marble API — request access at worldlabs.ai
- [ ] Supabase — run 6 SQL ALTER TABLE statements in SQL editor
- [ ] Supabase — create room-videos storage bucket with RLS
- [ ] apps/mobile/ — confirm still builds untouched
- [ ] Amazon — submit tax info once EIN obtained

### Known Issues to Fix Before M5
- [ ] Voxel downsampling too aggressive: 3,284,492 → 60,796 points (1.8% retained). Room geometry present but sparse point cloud, not photorealistic. Fix: reduce voxel_size from 0.02 to 0.005, or use random subsampling to keep 500K-1M points. Better fix: upgrade Supabase to Pro ($25/mo) for 500MB uploads and skip downsampling entirely.
- [ ] PLY format used instead of SPZ (SparkJS native compressed splat format). SPZ will render significantly better — photorealistic Gaussian splatting vs point cloud. Fix in M5: convert PLY → SPZ using gsplat export.
- [ ] RoPE2D CUDA version not compiled — using slow PyTorch fallback. Fix: compile RoPE2D during image build for faster inference.
- [ ] HuggingFace unauthenticated requests — set HF_TOKEN in Modal secrets for higher rate limits and faster model weight downloads.

---

## Known Issues / Blockers

- **ImprovMX DNS propagation:** covainterior.com was just registered. DNS takes 15min-2hrs to propagate. Check again in an hour.
- **Impact pending:** Waiting on domain verification. Manual approval request submitted.
- **Marble API:** Not yet requested. worldlabs.ai — start today, may need approval.
- **EIN:** IRS online application failed (likely visa/SSN matching issue). Need to file Form SS-4 by fax to get EIN. Deferred — not blocking M0 or M1.
- **Wayfair:** Program closed to new publishers. Check cj.com quarterly.

---

## Tech Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Mar 2026 | AnySplat for reconstruction | Feed-forward, no COLMAP, indoor-trained |
| Mar 2026 | gsplat equirectangular panorama | Solves single-frame coverage problem |
| Mar 2026 | Lang-SAM for furniture segmentation | Text-prompted, no bounding boxes |
| Mar 2026 | Marble (primary) + SHARP (fallback) | Both maintained until M7 testing |
| Mar 2026 | 6 cube face crops for product detection | Eliminates equirectangular distortion |
| Mar 2026 | v0 + Framer Motion for UI | Real Next.js code, not separate platform |
| Mar 2026 | CLIP similarity threshold 0.65 | Maximizes hotspot coverage vs 0.70 |
| Mar 2026 | 12-retailer lineup (no Wayfair) | Wayfair closed, ~18,150 clean products |
| Mar 30 2026 | covainterior.com domain | Registered Namecheap, $11.28/year |
| Mar 30 2026 | W-9 with SSN | EIN application failed online |
| Mar 30 2026 | Amazon tax info deferred | Wait for EIN before submitting |
| Mar 30 2026 | Modal base image: pytorch/pytorch:2.2.0-cuda12.1 | Pre-built PyTorch+CUDA, avoids Modal PyPI mirror issues |
| Mar 30 2026 | AnySplat source copied locally (not cloned in build) | GitHub blocked in Modal image build containers |
| Mar 30 2026 | pytorch3d not needed for inference | Only used in training loss functions |
| Mar 30 2026 | SparkJS webpack fix: parser url:false | Fixes asset/inline generator incompatibility with Next.js |
| Mar 30 2026 | Target affiliate removed | Program ended January 5, 2026 — no longer available |
| Mar 30 2026 | Reuse V0 catalog for M2 validation | 5,581 products already have CLIP embeddings, no scraping needed |
| Mar 30 2026 | Supabase publishable key format (sb_publishable_) | New format, legacy JWT keys disabled — always use Settings → API keys |
| Mar 30 2026 | Auth callback writes cookies via cookieStore.set() | Writing to response.cookies broke PKCE flow — cookieStore is canonical |
| Mar 30 2026 | 3-phase adaptive quiz (baseline→pure→refinement) | Matches V0 iOS adaptive algorithm, uses discriminability_score |
| Mar 30 2026 | Bayesian style updating (not simple accumulation) | Likes 1× weight, dislikes 0.5× weight, MIN_VALUE=0.02 smoothing |
| Mar 30 2026 | swipe_history table does not exist | V0 mobile doesn't use it — only cumulative style_blend is saved |
| Mar 30 2026 | rooms.status CHECK: only 'active'/'archived' | Cannot set 'processing'/'video_uploaded' — will fail constraint |
| Mar 30 2026 | UI polish deferred to M13 | Build all features functionally first, v0 screen generation last |
| Mar 30 2026 | Mobile capture testing deferred to M11 | Requires HTTPS deployment on covainterior.com |

---

## Session Log

### Session March 30, 2026
**Milestone:** M0
**Goal:** Complete all pre-M0 affiliate, domain, and service account setup

**Completed:**
- CJ account + W-9 submitted
- Wayfair confirmed closed
- Amazon confirmed active
- Impact account created
- covainterior.com registered
- Namecheap MX records added
- Modal account + tokens in .env.local
- Repo cleanup (deleted 10+ redundant files)
- CLAUDE.md fully updated
- SESSION_MEMORY.md created

**Left for next session:**
- DNS propagation → ImprovMX → Impact verification
- All remaining API tokens in .env.local
- Supabase schema additions
- Next.js scaffold
- Remaining affiliate applications (Article, Sovrn, ShareASale, Awin)

**Issues encountered:**
- IRS EIN online application rejected (visa/SSN issue) — using SSN on W-9 instead
- Wayfair US closed to new publishers — replaced with 12-retailer lineup
- Impact requires domain verification — submitted manual approval request
- ImprovMX DNS not yet propagated — check in 1-2 hours

---

### Session March 30, 2026 — M1 Pipeline Proof
**Milestone:** M1 — Pipeline Proof
**Goal:** Deploy AnySplat on Modal, reconstruct real room, view in browser

**Completed:**
- AnySplat pipeline deployed on Modal A10G ✅
- 3.28M Gaussian reconstruction of real room ✅
- PLY compressed 223MB → 2.9MB via voxel downsampling ✅
- Uploaded to Supabase room-videos bucket ✅
- SparkJS rendering confirmed in browser at /test-viewer ✅
- M1 gate passed — 3D room visible in browser

**Known issues to fix before M5:**
- Voxel downsampling too aggressive: 3,284,492 → 60,796 points (only 1% retained).
  Room geometry is present but looks like a sparse point cloud, not photorealistic.
  Fix: use smarter compression — reduce voxel_size from 0.02 to 0.005, or use
  random subsampling to keep 500K-1M points while staying under 50MB.
  Better fix: upgrade Supabase to Pro ($25/mo) to allow 500MB uploads and skip
  downsampling entirely. Do this before M5.
- PLY format used instead of SPZ (SparkJS native compressed splat format).
  SPZ will render significantly better — photorealistic Gaussian splatting vs point cloud.
  Fix in M5 when the real viewer is built: convert PLY → SPZ using gsplat's export.
- RoPE2D CUDA version not compiled — using slow PyTorch fallback.
  Fix: compile RoPE2D during image build for faster inference.
- HuggingFace unauthenticated requests — set HF_TOKEN in Modal secrets for
  higher rate limits and faster model weight downloads.

**Files modified:**
- modal_pipeline/room_reconstruction.py (full AnySplat pipeline)
- modal_pipeline/anysplat/ (local copy of AnySplat repo)
- apps/web/app/test-viewer/page.tsx (test viewer page)
- apps/web/components/SplatViewer.tsx (SparkJS viewer component)
- apps/web/next.config.mjs (webpack fix for SparkJS)
- apps/web/package.json (@sparkjsdev/spark, three, @supabase/ssr, @supabase/supabase-js)

**Left for M2:**
- Pre-M2 conversation required before starting
- Upgrade Supabase to Pro before M5 to fix PLY size limit
- Add HF_TOKEN to Modal secrets
- Compile RoPE2D CUDA version in image build

---

### Session March 30, 2026 — M2 Seed Catalog Validation
**Milestone:** M2 — Seed Catalog Validation
**Goal:** Validate pgvector search returns relevant results, build affiliate URL builder

**Completed:**
- pgvector search validated against 5,581 existing products via modal_pipeline/test_catalog.py
- buildAffiliateUrl() implemented for all 11 retailers (Amazon, IKEA, Article, Crate & Barrel, CB2, West Elm, Pottery Barn, Ruggable, One Kings Lane, Overstock, Etsy)
- 15/15 affiliate URL tests passing
- Target affiliate removed from .env.local (program ended January 5, 2026)
- M2 gate passed — catalog search works, affiliate URLs generate correctly

**Known issues deferred to M6:**
- Category mismatches and duplicate products in V0 catalog — fix during M6 quality filtering

**Left for M3:**
- Pre-M3 conversation required before starting
- M3 scope: Next.js scaffold, auth (all 3 methods), routing

**Files modified:**
- modal_pipeline/test_catalog.py (pgvector search test script)
- apps/web/lib/affiliates.ts (affiliate URL builder)
- apps/web/lib/affiliates.test.ts (15 tests)
- apps/web/.env.local (removed TARGET_AFFILIATE_ID)

---

### Session March 30, 2026 — M3 Web Foundation
**Milestone:** M3 — Web Foundation
**Goal:** Build auth, routing, middleware, Zustand stores for apps/web/

**Completed:**
- Supabase client setup: lib/supabase/client.ts + server.ts
- Middleware with route protection (protected: /dashboard, /room, /quiz, /capture, /processing)
- Auth callback route with PKCE code exchange
- Zustand stores: userStore (user + styleVector) + roomStore (roomId + processingStage)
- All 3 auth methods: Google OAuth, Apple Sign In, email magic link
- /auth page with functional sign in UI
- /dashboard server component with session check + sign out
- Debugged auth flow: callback cookies must use cookieStore.set() not response.cookies
- Debugged API key: Supabase uses new sb_publishable_ format, not legacy JWT keys
- M3 gate passed — auth flow works end-to-end

**Issues encountered:**
- Auth callback initially failed — cookies were written to response object instead of cookieStore, breaking PKCE flow
- Supabase anon key was wrong format — project uses new publishable keys (sb_publishable_), not legacy JWT (eyJ...)
- Google OAuth button needed explicit type="button" to prevent default form submission

**Left for M4:**
- Pre-M4 conversation required before starting
- M4 scope: quiz ported, Path A+B capture, v0 generates quiz/capture screens

**Files modified:**
- apps/web/lib/supabase/client.ts (browser client)
- apps/web/lib/supabase/server.ts (server client)
- apps/web/middleware.ts (route protection + session refresh)
- apps/web/app/auth/page.tsx (sign in page)
- apps/web/app/auth/callback/route.ts (OAuth code exchange)
- apps/web/app/dashboard/page.tsx (protected dashboard)
- apps/web/app/dashboard/SignOutButton.tsx (client component)
- apps/web/lib/stores/userStore.ts (Zustand)
- apps/web/lib/stores/roomStore.ts (Zustand)
- apps/web/package.json (added zustand)

---

### Session March 30, 2026 — M4 Quiz + Capture
**Milestone:** M4 — Quiz + Capture + UI Pass 1
**Goal:** Build style quiz, room capture (mobile + desktop), processing page

**Completed:**
- 3-phase adaptive Bayesian style quiz with Framer Motion card animations
- Phase 1: 15 baseline cards (3 per style), Phase 2: 5 pure confirmation, Phase 3: 5 refinement
- Bayesian update with discriminability_score, likes stronger than dislikes
- style_blend saves after every swipe (partial profile survives early exit)
- Desktop capture: QR code with JWT token generation + 3s polling
- Mobile capture: getUserMedia camera UI with guidance messages
- Processing placeholder with status polling + retry button
- API routes: /api/pipeline/start, /api/capture/generate-token, /api/capture/validate-token
- Debugged: swipe_history table doesn't exist (removed insert), swipe_cards uses direction not swiped_right
- Debugged: rooms.status CHECK only allows 'active'/'archived'
- Removed mode=camera override (was temp testing only)

**Issues encountered:**
- swipe_history inserts failed — table doesn't exist in DB, V0 mobile doesn't use it either
- rooms.status CHECK constraint only allows 'active'/'archived' — cannot use 'processing'/'video_uploaded'
- Baseline card fetch needed per-style queries to ensure even distribution

**Deferred:**
- Mobile video recording test → M11 (requires HTTPS)
- All v0 UI polish → M13 (build features first)

**Left for M5:**
- Pre-M5 conversation required before starting
- M5 scope: processing UI, SparkJS viewer, real room loads

**Files modified:**
- apps/web/app/quiz/page.tsx (adaptive Bayesian quiz)
- apps/web/app/capture/[roomId]/page.tsx (mobile camera + desktop QR)
- apps/web/app/processing/[roomId]/page.tsx (polling + retry)
- apps/web/app/api/pipeline/start/route.ts (pipeline trigger)
- apps/web/app/api/capture/generate-token/route.ts (JWT signing)
- apps/web/app/api/capture/validate-token/route.ts (JWT verification)
- apps/web/package.json (framer-motion, react-qr-code, jose)

---

## Session Template (copy for each new session)

```
### Session [DATE]
**Milestone:** M[X]
**Goal:** [What this session builds]

**Completed:**
- item 1

**Left for next session:**
- item 1

**Issues encountered:**
- none

**Files modified:**
- apps/web/[...]
- modal_pipeline/[...]
```
