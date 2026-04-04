# COVA V1 — Session Memory
# .claude/SESSION_MEMORY.md
# Update this file at the END of every Claude Code session.
# Read this file at the START of every Claude Code session.

---

## Current State

- **Current Milestone:** M8 IN PROGRESS — Backend infrastructure complete, UI next
- **Last Updated:** April 4, 2026
- **Last Session:** Overnight optimization — 133→166 tests, schema fixed, 15 new modules
- **Diagnostic Run:** April 4, 2026 — 166/166 PASS, tsc clean

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
- [x] Marble API — access granted, MARBLE_API_KEY in .env.local
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

### Session March 31, 2026 — M6 CLIP Embedding Pipeline
**Milestone:** M6 — Full Catalog Completion (embedding portion)
**Goal:** Fix broken CLIP embedder, embed all 14,000 products, rebuild IVFFlat index

**Completed:**
- Fixed embed_catalog_gpu.py — root cause was numpy 2.x incompatible with torch 2.2.0
- Pinned numpy<2, switched to image_processor (bypasses text tokenizer), single-image processing
- Test: 5/5 products embedded successfully (768-dim verified)
- Full run: 12,940/12,941 embedded in 13.6 minutes on 5x A10G GPUs
- Total coverage: 13,999/14,000 (99.99%) — 1 Amazon CDN timeout
- IVFFlat index rebuilt: lists=50 (Supabase free-tier 32MB maintenance_work_mem limit)
- 3 verification searches passed: sofa→sofas (0.92+), curtain→curtains (0.93+), mirror→mirrors (0.88+)
- Final report saved to modal_pipeline/catalog_data/m6_final_report.json

**Issues encountered:**
- numpy 2.x caused "padding" error even with single images — misleading error from torch tensor creation failure
- Supabase 32MB maintenance_work_mem too small for lists=150 — reduced to lists=50
- No exec_sql RPC available — used supabase CLI db push for DDL

**Files modified:**
- modal_pipeline/embed_catalog_gpu.py (complete rewrite — fixed CLIP pipeline)
- modal_pipeline/catalog_data/embedding_failures.json (1 failure logged)
- modal_pipeline/catalog_data/m6_final_report.json (final verification report)
- supabase/migrations/20240034000000_rebuild_ivfflat_index.sql (IVFFlat rebuild)

---

### Session March 31, 2026 — Comprehensive Diagnostic
**Milestone:** Post-M6
**Goal:** Full diagnostic across all completed milestones (M0-M6, M9)

**Completed:**
- Ran 45+ checks across 8 blocks (Environment, Database, Next.js, Modal, Catalog, Integration, Code Quality, Security)
- Fixed: chat_messages missing tool_calls/tool_results columns (migration 20240035)
- Fixed: @types/three missing — caused TypeScript build error
- Fixed: Code referenced product_url but actual DB column is affiliate_url (3 locations in chat route)
- Fixed: SplatViewer had no error handling for PLY load failures — added error state
- Overall status: PASS

**Issues remaining:**
- Text-to-image semantic search similarity low (~0.23) — Replicate text CLIP encoder may be different model than HuggingFace image encoder used for product embeddings. Text fallback search works.

**Files modified:**
- supabase/migrations/20240035000000_add_chat_tool_columns.sql (new)
- apps/web/package.json (@types/three added)
- apps/web/app/api/chat/route.ts (product_url → affiliate_url)
- apps/web/components/SplatViewer.tsx (error handling added)
- diagnostic_report.json (new — full diagnostic results)

---

### Session March 31, 2026 — M7 Session 1 Marble Integration
**Milestone:** M7 — AI Redesign Pipeline (Session 1 of 5)
**Goal:** Process room video through Marble Mini to extract equirectangular panorama

**Completed:**
- Marble API integration fully working — upload, generate, poll, fetch pano
- DB schema: 6 new columns on rooms table (marble_world_id, marble_pano_url, marble_spz_url, marble_mini_world_id, redesign_pano_url, redesign_status)
- apps/web/lib/marble.ts — TypeScript Marble API client (upload, generate, poll, fetch)
- modal_pipeline/marble_pipeline.py — Modal pipeline: download video → ffmpeg compress → Marble upload → generate Mini world → poll → fetch pano → store in Supabase
- Modal deployment: cova-marble-pipeline with webhook endpoint
- modal_pipeline/test_marble_session1.py — end-to-end test script
- API route: /api/pipeline/marble-process (auth + room ownership + webhook trigger)
- Capture UI: 60-second auto-stop timer, countdown display, recording guidance text
- Modal secret: marble-credentials created
- MARBLE_PIPELINE_WEBHOOK_URL added to .env.local
- TypeScript compiles clean, Next.js build passes
- End-to-end test PASSED: world_id=99204f84-05d0-4276-acae-d48d7f2c509d

**Test results (M7S1):**
- World ID: 99204f84-05d0-4276-acae-d48d7f2c509d
- Marble URL: https://marble.worldlabs.ai/world/99204f84-05d0-4276-acae-d48d7f2c509d
- pano_url: obtained on first fetch attempt
- SPZ URLs: 100k, 500k, full_res all present
- Processing time: ~102 seconds
- Video: 20.4MB trimmed test video
- Cost: 250 credits = $0.20 per video

**Key learnings:**
- Marble Mini video processing takes ~100s (not 30-90s as docs suggest)
- pano_url available on first world fetch (no retries needed for this test)
- GCS upload: ONLY send x-goog-content-length-range header, no Content-Type
- Modal deploy: requests library must be imported inside functions (not at module level)
- Modal FastAPI endpoint requires fastapi[standard] in image pip_install
- Video constraints: 60s max duration, 100MB max file size
- ffmpeg compress: -crf 28 -preset fast -an (no audio) — 20MB output from iPhone video

**Webhook URL:** https://cova-interior--cova-marble-pipeline-marble-process-webhook.modal.run

**Left for M7 Session 2:**
- FLUX Kontext integration for furniture redesign
- Use pano_url from Session 1 as input to redesign pipeline

**Files created/modified:**
- apps/web/lib/marble.ts (new — Marble API client)
- apps/web/app/api/pipeline/marble-process/route.ts (new — API route)
- modal_pipeline/marble_pipeline.py (new — Modal pipeline)
- modal_pipeline/test_marble_session1.py (new — test script)
- modal_pipeline/test_session1_results.json (new — test results)
- supabase/migrations/20240036000000_marble_pipeline_columns.sql (new)
- apps/web/app/capture/[roomId]/page.tsx (updated — 60s timer + guidance)

---

### Session April 1, 2026 — M7 Session 2 FLUX Kontext Redesign
**Milestone:** M7 — AI Redesign Pipeline (Session 2 of 5)
**Goal:** Generate redesigned panorama from Session 1 pano_url using FLUX Kontext Pro

**Completed:**
- Style prompt generator: apps/web/lib/stylePrompt.ts (Claude API + fallback)
- FLUX Kontext client: apps/web/lib/fluxKontext.ts
- Modal redesign pipeline: modal_pipeline/redesign_pipeline.py (deployed)
- API route: /api/pipeline/redesign (auth + room ownership + webhook)
- Modal secret: anthropic-credentials created
- End-to-end test PASSED: 1.45MB redesigned panorama generated
- Visual quality gate PASSED: architecture preserved, furniture replaced with japandi pieces

**Test results (M7S2):**
- Redesigned pano URL: https://replicate.delivery/xezq/kyeJiLsa6dTPD6Tnoi5bUBSvXlCyIfYESSvshIvvsLFkulWWA/tmpp32g36om.png
- Input: 2304x1152 equirectangular panorama of dorm room
- Output: 1456x720 redesigned panorama (FLUX Kontext downscaled)
- FLUX Kontext returned synchronously (< 60s)
- Cost: $0.04 per image
- Prompt: japandi/minimalist fallback (Claude API key was invalid — 401)

**Key learnings:**
- FLUX Kontext Pro returns synchronously with Prefer: wait header
- Output resolution is ~63% of input — FLUX Kontext downscales (1456x720 vs 2304x1152)
- If higher resolution needed, consider FLUX Kontext Max ($0.08) or upscaling step
- Anthropic API key (sk-ant-REDACTED) is invalid — needs to be refreshed
- Fallback prompt produces good results without Claude API
- Style vocabulary approach works well for furniture specification
- Guidance 2.5 gives good balance of preservation vs redesign

**Visual quality assessment:**
- Architecture preserved: walls, ceiling, doors, window, floor all intact
- Furniture replaced: low sofa, round coffee table, clean shelving — matches japandi
- Photorealistic: looks like real interior design photo
- Equirectangular format maintained: barrel distortion visible at edges
- Clutter removed: dramatic improvement from messy dorm to clean design

**Webhook URL:** https://cova-interior--cova-redesign-pipeline-redesign-webhook.modal.run

**Left for M7 Session 3:**
- Marble Plus 3D lift: send redesigned_pano_url to Marble Plus
- Get navigable 3D splat of the redesigned room

**Issue to fix before Session 3:**
- ANTHROPIC_API_KEY is invalid (401 error). Refresh the key at console.anthropic.com
- Once refreshed: update apps/web/.env.local AND modal secret anthropic-credentials

**Files created/modified:**
- apps/web/lib/stylePrompt.ts (new — style prompt generator)
- apps/web/lib/fluxKontext.ts (new — FLUX Kontext client)
- apps/web/app/api/pipeline/redesign/route.ts (new — API route)
- modal_pipeline/redesign_pipeline.py (new — Modal pipeline)
- modal_pipeline/test_redesign_session2.py (new — test script)
- modal_pipeline/test_session2_results.json (new — test results)

---

### Session April 1, 2026 — M7 Session 3 Marble Plus 3D Lift
**Milestone:** M7 — AI Redesign Pipeline (Session 3 of 5)
**Goal:** Lift redesigned panorama to navigable 3D world via Marble Plus

**Completed:**
- Marble Plus pipeline: upload redesigned pano → is_pano: true → 3D world
- DB schema: 5 new columns (marble_plus_world_id, marble_spz_url_500k, marble_spz_url_100k, marble_plus_pano_url, marble_plus_thumbnail_url)
- marble.ts updated: added processRedesignedPanoToWorld convenience function
- modal_pipeline/marble_plus_pipeline.py deployed with webhook
- API route: /api/pipeline/marble-plus (auth + ownership + webhook)
- End-to-end test PASSED
- Visual quality gate PASSED

**Test results (M7S3):**
- World ID: 7f3d51a8-a61d-4e87-a4c0-fcaf96593780
- Marble URL: https://marble.worldlabs.ai/world/7f3d51a8-a61d-4e87-a4c0-fcaf96593780
- SPZ full_res: 30.1MB (within Supabase limits)
- SPZ 100k, 500k, full_res all present and accessible
- Plus pano: 2560x1280 (upscaled from FLUX Kontext's 1456x720)
- Processing time: 333s (~5.5 min)
- Cost: 1,500 credits = $1.20 (is_pano: true, 0 pano gen credits)

**Visual quality assessment:**
- Japandi redesign clearly visible in 3D world
- Room architecture preserved (walls, ceiling, window, door, floor)
- Furniture: grey sofas, round oak coffee table, floating shelves, area rug
- 360° navigation works — all four walls visible and stable
- Thumbnail quality excellent (720x480)
- Marble Plus upscaled the pano from 1456x720 to 2560x1280

**Total M7 pipeline cost so far:**
- Session 1 (Marble Mini video→pano): $0.20
- Session 2 (FLUX Kontext redesign): $0.04
- Session 3 (Marble Plus pano→3D): $1.20
- **Total: $1.44 per room redesign**

**Webhook URL:** https://cova-interior--cova-marble-plus-pipeline-marble-plus-webhook.modal.run

**Left for M7 Session 4:**
- Furniture detection on cube face crops
- CLIP matching to product catalog
- Hotspot placement in 3D space

**Files created/modified:**
- apps/web/lib/marble.ts (updated — processRedesignedPanoToWorld)
- apps/web/app/api/pipeline/marble-plus/route.ts (new — API route)
- modal_pipeline/marble_plus_pipeline.py (new — Modal pipeline)
- modal_pipeline/test_marble_plus_session3.py (new — test script)
- modal_pipeline/test_session3_results.json (new — test results)
- supabase/migrations/20240050000000_marble_plus_columns.sql (new)

---

### Session April 1, 2026 — M7 Session 4 Furniture Detection + CLIP Matching
**Milestone:** M7 — AI Redesign Pipeline (Session 4 of 5)
**Goal:** Detect furniture in redesigned panorama, match to catalog products via CLIP

**Completed:**
- room_products table created (id, room_id, product_id, furniture_label, furniture_description, similarity_score, rank, azimuth_degrees, is_unlocked)
- RLS policies on room_products (user can view own, service role manages)
- furniture_matches_count column added to rooms table
- clipSearch.ts: CLIP text embed + pgvector product search module
- furniture_matching_pipeline.py: Modal pipeline with Claude Vision + fallback detection
- API route: /api/pipeline/furniture-match (POST trigger + GET results)
- End-to-end test PASSED: 8/8 furniture pieces matched

**Test results (M7S4):**
- Detection: 8 furniture pieces (fallback — Claude Vision had no credits)
- All 8 matched to real products from catalog
- Similarity range: 0.211 - 0.339 (mean 0.293)
- Top matches by piece:
  - sofa → BALKARP Sleeper sofa (IKEA, $349, sim=0.283)
  - sofa → HOLMSUND 3-seat sleeper sofa (IKEA, $1249, sim=0.280)
  - coffee table → Setawix Round Ottoman (Amazon, $70, sim=0.339)
  - accent chair → Accent Chair Mid Century Modern (Amazon, $90, sim=0.300)
  - floor lamp → NYFORS Floor lamp (IKEA, $130, sim=0.328)
  - area rug → Nourison Alice Rug (Overstock, $40, sim=0.211)
  - shelving unit → Marsmiles Floating Shelves (Amazon, $80, sim=0.324)
  - side table → Plank+Beam Console Table (Amazon, $129, sim=0.280)
- Retailer diversity: Amazon (4), IKEA (3), Overstock (1)

**Key learnings:**
- Existing search_products_by_embedding RPC uses match_threshold (not min_similarity)
- Must pass match_threshold: 0.0 to get results (default is too restrictive)
- CLIP text-to-image similarity 0.2-0.35 is normal and acceptable
- Category-filtered search needs client-side filtering (RPC doesn't support match_category)
- CLIP embed cold start ~0.6s, subsequent calls ~0.3s
- Anthropic API credit balance is $0 — Claude Vision will work once credits added
- Fallback detection works well for known room styles

**Issues:**
- ANTHROPIC_API_KEY has no credit balance — Claude Vision detection not testable
- When credits are added, update anthropic-credentials Modal secret
- The existing search_products_by_embedding RPC doesn't filter by category — filter client-side

**Webhook URL:** https://cova-interior--cova-furniture-matching-furniture-matchin-f34071.modal.run

**Left for M7 Session 5:**
- Wire SplatViewer to show redesigned room SPZ
- Add furniture hotspot overlays at azimuth positions
- Product panel showing matched products
- Toggle between original room and redesigned room

**Files created/modified:**
- apps/web/lib/clipSearch.ts (new — CLIP search module)
- apps/web/app/api/pipeline/furniture-match/route.ts (new — API route)
- modal_pipeline/furniture_matching_pipeline.py (new — Modal pipeline)
- modal_pipeline/test_furniture_session4.py (new — test script)
- modal_pipeline/test_session4_results.json (new — test results)
- supabase/migrations/20240051000000_room_products_and_rpc.sql (new — table)

---

### Session April 1, 2026 — M7 Session 5 Frontend Wiring
**Milestone:** M7 — AI Redesign Pipeline (Session 5 of 5) — FINAL
**Goal:** Wire all pipeline outputs to frontend, make M7 shippable

**Completed:**
- SplatViewer updated: SPZ support, progressive loading (500k→full_res)
- FurnitureHotspots component: renders gold-bordered dots at azimuth positions
- ProductPanel component: slides in from right, shows product image/name/price/retailer
- RoomOverlay: client component wrapper connecting hotspots to product panel
- Room page: loads Marble SPZ URLs, shows hotspots + products + chatbot
- Processing page: polls /api/rooms/status for live progress with progress bar
- Pipeline orchestrator: /api/pipeline/start triggers all 4 stages sequentially
- Status API: /api/rooms/status returns progress %, message, thumbnailUrl
- Test room created with 17 product matches across 6 furniture pieces
- All 22 end-to-end checks PASS

**Test room:**
- ID: 97da4464-ae41-4836-927c-442b5fb24037
- URL: http://localhost:3000/room/97da4464-ae41-4836-927c-442b5fb24037
- SPZ: Marble Plus full_res (30MB)
- Furniture: 6 pieces, 17 product matches
- Top matches: BALKARP sofa, Setawix ottoman, NYFORS lamp, floating shelves

**M7 Complete Pipeline Summary:**
- Session 1: Marble Mini video→pano ($0.20, ~100s)
- Session 2: FLUX Kontext redesign ($0.04, ~30s)
- Session 3: Marble Plus pano→3D ($1.20, ~330s)
- Session 4: Claude Vision + CLIP matching (~$0.02, ~10s)
- Session 5: Frontend wiring (no API cost)
- **Total cost per room: ~$1.46**
- **Total pipeline time: ~8 minutes**

**Architecture:**
- 4 Modal deployments: marble-pipeline, redesign-pipeline, marble-plus-pipeline, furniture-matching
- 6 API routes: /api/pipeline/{start, marble-process, redesign, marble-plus, furniture-match}, /api/rooms/status
- 3 new components: FurnitureHotspots, ProductPanel, RoomOverlay
- 1 updated component: SplatViewer (SPZ + progressive loading)
- 1 updated page: processing/[roomId] (progress bar + status polling)
- 1 updated page: room/[roomId] (SPZ viewer + hotspots + product panel)

**Files created/modified:**
- apps/web/components/SplatViewer.tsx (updated — SPZ support, progressive loading)
- apps/web/components/FurnitureHotspots.tsx (new)
- apps/web/components/ProductPanel.tsx (new)
- apps/web/app/room/[roomId]/page.tsx (updated — Marble SPZ + hotspots)
- apps/web/app/room/[roomId]/RoomOverlay.tsx (new)
- apps/web/app/processing/[roomId]/page.tsx (updated — progress bar)
- apps/web/app/api/pipeline/start/route.ts (updated — 4-stage orchestrator)
- apps/web/app/api/rooms/status/route.ts (new)
- modal_pipeline/test_full_pipeline_session5.py (new)
- supabase/migrations/20240053000000_recreate_room_products.sql (new)

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
