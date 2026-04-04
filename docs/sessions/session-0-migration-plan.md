# Session 0 — Migration Plan
Generated: 2026-04-03
Repo: github.com/p-g-o-e-l/813

---

## Preliminary Note: Missing Reference Documents

The task brief asked me to read three files that **do not exist** in this repository:

| File | Status |
|------|--------|
| `ARCHITECTURE.md` | **DOES NOT EXIST** |
| `COVA_CONTEXT.md` | **DOES NOT EXIST** |
| `docs/STATUS.md` | **DOES NOT EXIST** |

This audit is therefore conducted against `CLAUDE.md`, `apps/web/CLAUDE.md`, and `COVA_MVP_SPEC_v1.1.md` as the baseline specification documents. Step 6 (Gap Analysis vs ARCHITECTURE.md) is answered against the CLAUDE.md milestone descriptions and known architecture instead.

**Decision Point 0 (required founder input before anything else):**
Should ARCHITECTURE.md, COVA_CONTEXT.md, and docs/STATUS.md be created? If yes, what should they contain? These documents are referenced as canonical sources by the task brief but are missing from the repo. If founders want these created, they should provide the content — Claude Code can scaffold them. If they are simply not planned, the task brief should be updated.

---

## Existing Structure Assessment

The repo is a **pnpm monorepo** (turbo build system) with three workspaces:
- `apps/web/` — Next.js 14 App Router (all V1 web work)
- `apps/mobile/` — FROZEN Expo React Native app (V0, never touch)
- `modal_pipeline/` — Python Modal GPU pipelines

The web app is **substantially built and actively working**. It is not a scaffold — it has a live pipeline, a working UI flow, deployed Supabase Edge Functions, ~50 database migrations, and webhook endpoints on Modal. The current state is somewhere between M5 and M9 in the milestone sequence: rooms can be created, captured, processed through the full pipeline (video → 3D → redesign → furniture matching → hotspots → chat).

**What's working:**
- Full auth flow (Google OAuth, Apple OAuth, magic link email)
- Room creation → capture → processing → viewer pipeline
- Supabase client wrapper pattern (`lib/supabase/client.ts` + `lib/supabase/server.ts`)
- Middleware auth guard using `@supabase/ssr`
- SparkJS 3D splat viewer (dynamic import with `ssr: false` — correct)
- Quiz + card swipe system
- Budget selection
- AI redesign pipeline (FLUX Kontext via Replicate + Marble)
- Furniture matching (Claude Vision + CLIP + pgvector)
- Product panel + hotspots
- Chatbot (Claude API streaming)
- Style prompt generation
- Affiliate URL builder
- Zustand stores (user, room, camera)
- 50+ Supabase migrations with full schema

**What needs fixing (code quality, not architecture):**
Three files import `@supabase/supabase-js` directly instead of via the lib wrapper. Several components and API routes have TypeScript `any` types. Hardcoded hex colors are widespread (CSS variables exist but are not always used). The chat-room Edge Function uses the old model name.

**Overall state:** The codebase is further along than CLAUDE.md's M0 status section suggests. The CLAUDE.md `M0 Status` section has not been updated to reflect actual build progress. The true milestone state appears to be M7–M8 (pipeline running, furniture matching live) with UI polish remaining.

---

## Codebase Inventory

### Root Level

| Current Path | Status | Notes |
|---|---|---|
| `CLAUDE.md` | KEEP_AS_IS | Project constraints, read every session |
| `COVA_MVP_SPEC_v1.1.md` | KEEP_AS_IS | Spec document reference |
| `README.md` | KEEP_AS_IS | Repo overview |
| `SCRAPING_LOG.md` | KEEP_AS_IS | Reference log |
| `SPRINT_LOG.md` | KEEP_AS_IS | Reference log |
| `package.json` | KEEP_AS_IS | Workspace root config |
| `pnpm-workspace.yaml` | KEEP_AS_IS | Defines apps/web, scripts workspaces |
| `turbo.json` | KEEP_AS_IS | Turborepo pipeline config |
| `tsconfig.json` | KEEP_AS_IS | Root TS config |
| `vercel.json` | KEEP_AS_IS | Vercel deployment config |
| `eas.json` | KEEP_AS_IS | Expo Application Services (mobile) |
| `test_*.py` (root level) | KEEP_AS_IS | Pipeline integration test scripts |
| `marble_comparison_results*.json` | KEEP_AS_IS | Pipeline evaluation artifacts |
| `diagnostic_report.json` | KEEP_AS_IS | Diagnostic artifact |
| `.env.local` | KEEP_AS_IS | Root env file (Expo/mobile vars + some overlap). Has `AMAZON_ASSOCIATE_TAG` (wrong name — see Env section). |
| `.gitignore`, `.npmrc`, etc. | KEEP_AS_IS | Standard tooling config |

### apps/web/ — Infrastructure

| Current Path | Status | Notes |
|---|---|---|
| `apps/web/middleware.ts` | KEEP_AS_IS | Auth guard using `@supabase/ssr` createServerClient. Minor: `cookie as any` on line 64 (acceptable iOS cookie type workaround). |
| `apps/web/next.config.mjs` | KEEP_AS_IS | SparkJS webpack alias + three@0.169 alias for web |
| `apps/web/tailwind.config.ts` | REFACTOR | Colors `navy.deep: #0B1F3A` and `navy.darker: #091829` differ from CLAUDE.md spec (`#0A1628` background). Decision point — see below. |
| `apps/web/app/globals.css` | KEEP_AS_IS | CSS variables defined: `--navy-deep: #0a1628`, `--gold: #C9A84C`, etc. |
| `apps/web/app/layout.tsx` | REFACTOR | Uses `EB_Garamond` as serif font variable. CLAUDE.md specifies `Playfair Display` for headings. Decision point — see below. |
| `apps/web/package.json` | REFACTOR | Missing deps per CLAUDE.md. See Dependency Audit. |
| `apps/web/lib/supabase/client.ts` | KEEP_AS_IS | Correct `createBrowserClient` from `@supabase/ssr` |
| `apps/web/lib/supabase/server.ts` | KEEP_AS_IS | Correct `createServerSupabaseClient` using `@supabase/ssr` |
| `apps/web/.eslintrc.json` | KEEP_AS_IS | Standard Next.js ESLint config |
| `apps/web/tsconfig.json` | KEEP_AS_IS | Standard Next.js TS config with path aliases |
| `apps/web/postcss.config.mjs` | KEEP_AS_IS | Standard PostCSS/Tailwind config |

### apps/web/ — Pages

| Current Path | Status | Notes |
|---|---|---|
| `apps/web/app/page.tsx` | KEEP_AS_IS | Landing page with scroll animations, auth modal trigger, hero stats |
| `apps/web/app/auth/page.tsx` | KEEP_AS_IS | Auth page (Google, Apple, magic link). Uses `createBrowserClient` correctly. All inline styles — hardcoded hex. Not a CLAUDE.md rule violation (inline styles aren't imports). |
| `apps/web/app/auth/callback/route.ts` | KEEP_AS_IS | OAuth code exchange, redirects to dashboard or capture |
| `apps/web/app/dashboard/page.tsx` | KEEP_AS_IS | Dashboard with room list, style profile, CTA. Uses `createBrowserClient`. |
| `apps/web/app/dashboard/SignOutButton.tsx` | KEEP_AS_IS | Sign out button component |
| `apps/web/app/quiz/page.tsx` | KEEP_AS_IS | Quiz flow with confidence bar, card swipe, style session |
| `apps/web/app/budget/page.tsx` | KEEP_AS_IS | Budget tier selection (5 tiers, carousel cards) |
| `apps/web/app/capture/new/page.tsx` | KEEP_AS_IS | Creates room via API, redirects to capture/[roomId] |
| `apps/web/app/capture/[roomId]/page.tsx` | KEEP_AS_IS | Multi-mode capture page (QR, webcam, upload). Hardcoded hex in inline styles (non-blocking). |
| `apps/web/app/capture/mobile/page.tsx` | KEEP_AS_IS | Mobile-optimized camera capture with compass and shot strip |
| `apps/web/app/processing/[roomId]/page.tsx` | KEEP_AS_IS | Processing status page with progress polling |
| `apps/web/app/processing/page.tsx` | KEEP_AS_IS | Legacy processing redirect page |
| `apps/web/app/room/[roomId]/page.tsx` | **REFACTOR** | **RULE VIOLATION**: Imports `createClient` from `@supabase/supabase-js` directly (line 2). Uses `SUPABASE_SERVICE_ROLE_KEY` correctly server-side, but must use lib wrapper. Fix: replace with `createServerSupabaseClient()`. |
| `apps/web/app/room/[roomId]/RoomOverlay.tsx` | KEEP_AS_IS | Overlay UI for room viewer |
| `apps/web/app/room/[roomId]/3d/page.tsx` | KEEP_AS_IS | 3D viewer subpage with hardcoded hex (non-blocking) |
| `apps/web/app/chatbot/page.tsx` | KEEP_AS_IS | Standalone chatbot test page |
| `apps/web/app/furniture-selection/[roomId]/page.tsx` | KEEP_AS_IS | Furniture selection UI |
| `apps/web/app/product-panel/page.tsx` | KEEP_AS_IS | Product panel test page |
| `apps/web/app/test-viewer/page.tsx` | **REFACTOR** | **RULE VIOLATION**: Imports `createClient` from `@supabase/supabase-js` directly (line 4). Fix same as above. |
| `apps/web/app/viewer/[sessionId]/page.tsx` | UNKNOWN | Not read during audit — verify uses correct Supabase pattern. |

### apps/web/ — API Routes

| Current Path | Status | Notes |
|---|---|---|
| `apps/web/app/api/capture/generate-token/route.ts` | KEEP_AS_IS | JWT token generation for QR capture flow |
| `apps/web/app/api/capture/validate-token/route.ts` | KEEP_AS_IS | Token validation per Rule 10 |
| `apps/web/app/api/chat/route.ts` | REFACTOR | Creates Supabase client inline (not via lib wrapper). Has no `any` types. Should use `createServerSupabaseClient()`. Minor — inline pattern is functionally correct but inconsistent. |
| `apps/web/app/api/chat/history/route.ts` | **REFACTOR** | **RULE VIOLATIONS**: (1) Imports `createClient` from `@supabase/supabase-js` line 4, (2) `error: any` catch on line 51. Fix: use lib wrapper, add typed error. |
| `apps/web/app/api/local-ip/route.ts` | KEEP_AS_IS | Returns local IP for development |
| `apps/web/app/api/pipeline/depth-video/route.ts` | KEEP_AS_IS | Depth video pipeline webhook trigger |
| `apps/web/app/api/pipeline/furniture-match/route.ts` | KEEP_AS_IS | Furniture matching pipeline trigger |
| `apps/web/app/api/pipeline/marble-mini-final/route.ts` | KEEP_AS_IS | Marble mini final pipeline trigger |
| `apps/web/app/api/pipeline/marble-multi-image/route.ts` | KEEP_AS_IS | Multi-image Marble pipeline trigger |
| `apps/web/app/api/pipeline/marble-plus-background/route.ts` | KEEP_AS_IS | Marble Plus background pipeline trigger |
| `apps/web/app/api/pipeline/marble-plus/route.ts` | KEEP_AS_IS | Marble Plus pipeline trigger |
| `apps/web/app/api/pipeline/marble-process/route.ts` | KEEP_AS_IS | Marble processing webhook handler |
| `apps/web/app/api/pipeline/plus-complete/route.ts` | KEEP_AS_IS | Plus upgrade completion handler |
| `apps/web/app/api/pipeline/pre-detect/route.ts` | KEEP_AS_IS | Pre-detection pipeline trigger |
| `apps/web/app/api/pipeline/redesign/route.ts` | KEEP_AS_IS | AI redesign pipeline trigger |
| `apps/web/app/api/pipeline/resume/route.ts` | KEEP_AS_IS | Pipeline resume handler |
| `apps/web/app/api/pipeline/start/route.ts` | KEEP_AS_IS | Pipeline orchestration start |
| `apps/web/app/api/quiz/confidence/route.ts` | KEEP_AS_IS | Quiz confidence score API |
| `apps/web/app/api/quiz/next-card/route.ts` | KEEP_AS_IS | Next quiz card selection API |
| `apps/web/app/api/rooms/[roomId]/route.ts` | KEEP_AS_IS | Room PATCH endpoint (update room fields) |
| `apps/web/app/api/rooms/create/route.ts` | KEEP_AS_IS | Room creation endpoint |
| `apps/web/app/api/rooms/status/route.ts` | KEEP_AS_IS | Room status polling endpoint |

### apps/web/ — Components

| Current Path | Status | Notes |
|---|---|---|
| `apps/web/components/SplatViewer.tsx` | KEEP_AS_IS | Dynamically imported with `ssr: false` — correct per Rule 2. Imports SparkJS from `@sparkjsdev/spark` — correct per Rule 9. |
| `apps/web/components/FurnitureHotspots.tsx` | KEEP_AS_IS | Hotspot projection from spherical coords to screen coords |
| `apps/web/components/ProductPanel.tsx` | KEEP_AS_IS | Root-level product panel (may be superseded by components/product/ProductPanel.tsx — see Decision Points) |
| `apps/web/components/RoomChatbot.tsx` | REFACTOR | Heavy use of `any` types: `data: any`, `product: any`, `item: any` etc. at lines 9, 25, 87, 117, 132, 170, 252. Not a build blocker today but violates Rule: no TypeScript `any`. |
| `apps/web/components/layout/AppShell.tsx` | KEEP_AS_IS | App shell layout wrapper |
| `apps/web/components/auth/AuthModal.tsx` | KEEP_AS_IS | Auth modal with Google/email, uses `createBrowserClient` correctly |
| `apps/web/components/capture/CompassRing.tsx` | KEEP_AS_IS | Camera compass ring UI |
| `apps/web/components/capture/CompletionScreen.tsx` | KEEP_AS_IS | Capture completion screen |
| `apps/web/components/capture/ModeSwitcher.tsx` | KEEP_AS_IS | Capture mode switcher (QR/webcam/upload) |
| `apps/web/components/capture/QRMode.tsx` | KEEP_AS_IS | QR code capture mode |
| `apps/web/components/capture/QualityChecker.tsx` | KEEP_AS_IS | Photo quality checker |
| `apps/web/components/capture/ShotStrip.tsx` | KEEP_AS_IS | Shot strip UI for multi-image capture |
| `apps/web/components/capture/UploadMode.tsx` | KEEP_AS_IS | Image upload mode |
| `apps/web/components/capture/WebcamMode.tsx` | KEEP_AS_IS | Webcam capture. Has `DeviceOrientationEvent as any` (acceptable — iOS API is not in TypeScript DOM types). |
| `apps/web/components/chat/ChatBubble.tsx` | KEEP_AS_IS | Floating chat bubble |
| `apps/web/components/chat/ChatInput.tsx` | KEEP_AS_IS | Chat input component |
| `apps/web/components/chat/ChatMessage.tsx` | KEEP_AS_IS | Chat message bubble |
| `apps/web/components/chat/ChatPanel.tsx` | KEEP_AS_IS | Chat panel container |
| `apps/web/components/chat/ProductSearchResult.tsx` | KEEP_AS_IS | Product search result card in chat |
| `apps/web/components/chat/SuggestionChips.tsx` | KEEP_AS_IS | Chat suggestion chips |
| `apps/web/components/chat/TypingIndicator.tsx` | KEEP_AS_IS | Chat typing indicator |
| `apps/web/components/dashboard/NewRoomCTA.tsx` | KEEP_AS_IS | New room call-to-action |
| `apps/web/components/dashboard/RoomCard.tsx` | KEEP_AS_IS | Room card with parallax scroll |
| `apps/web/components/dashboard/StatsRow.tsx` | KEEP_AS_IS | Stats row for dashboard |
| `apps/web/components/dashboard/StyleProfile.tsx` | KEEP_AS_IS | User style profile display |
| `apps/web/components/product/ProductCard.tsx` | KEEP_AS_IS | Product card component |
| `apps/web/components/product/ProductImageGallery.tsx` | KEEP_AS_IS | Product image gallery |
| `apps/web/components/product/ProductPanel.tsx` | KEEP_AS_IS | Product panel (refactored version) |
| `apps/web/components/product/SimilarItems.tsx` | KEEP_AS_IS | Similar items carousel |
| `apps/web/components/quiz/CardStack.tsx` | KEEP_AS_IS | Quiz card stack with swipe |
| `apps/web/components/quiz/ConfidenceBar.tsx` | KEEP_AS_IS | Style confidence bar |
| `apps/web/components/quiz/ReturningUserStrip.tsx` | KEEP_AS_IS | Returning user shortcut strip |
| `apps/web/components/quiz/SwipeCard.tsx` | KEEP_AS_IS | Individual swipe card |

### apps/web/ — Libraries

| Current Path | Status | Notes |
|---|---|---|
| `apps/web/lib/affiliates.ts` | KEEP_AS_IS | Reads `AMAZON_AFFILIATE_TAG` correctly. Handles 11 retailers. |
| `apps/web/lib/affiliates.test.ts` | KEEP_AS_IS | Unit tests for affiliate URL builder |
| `apps/web/lib/clipSearch.ts` | KEEP_AS_IS | CLIP text embed + pgvector search (server-side, no client imports) |
| `apps/web/lib/fluxKontext.ts` | KEEP_AS_IS | FLUX Kontext API client |
| `apps/web/lib/marble.ts` | KEEP_AS_IS | Marble API client |
| `apps/web/lib/pipelineConfig.ts` | KEEP_AS_IS | Pipeline mode config (5 modes) |
| `apps/web/lib/pipelinePoller.ts` | KEEP_AS_IS | Server-side pipeline status poller using service role key (correct — server-only) |
| `apps/web/lib/routes.ts` | KEEP_AS_IS | App route definitions |
| `apps/web/lib/stylePrompt.ts` | KEEP_AS_IS | Style prompt generator for FLUX. Note: async variant uses direct fetch to Anthropic API instead of `@anthropic-ai/sdk`. Both work. Decision point — see below. |
| `apps/web/lib/stores/cameraStore.ts` | KEEP_AS_IS | Zustand camera state (yaw, pitch, FOV) |
| `apps/web/lib/stores/roomStore.ts` | KEEP_AS_IS | Zustand room state |
| `apps/web/lib/stores/userStore.ts` | KEEP_AS_IS | Zustand user state. Only imports `type { User }` from supabase-js — type-only imports are acceptable. |
| `apps/web/lib/db/migrations/001_style_data_moat.sql` | KEEP_AS_IS | Style data moat schema (run once against Supabase) |

### Supabase

| Current Path | Status | Notes |
|---|---|---|
| `supabase/config.toml` | KEEP_AS_IS | Supabase CLI config. Project ref: xdeacbmkdwqrwxonqaqh |
| `supabase/functions/chat-room/index.ts` | **REFACTOR** | **PERMITTED CHANGE** per Rule 12: change model name from `claude-haiku-4-5-20251001` to `claude-sonnet-4-5`. This is the one allowed Edge Function change. |
| `supabase/functions/detect-furniture/` | **FROZEN** | Do not touch per Rule 12 |
| `supabase/functions/extract-colors/` | **FROZEN** | Do not touch per Rule 12 |
| `supabase/functions/get-render-status/` | **FROZEN** | Do not touch per Rule 12 |
| `supabase/functions/match-products/` | **FROZEN** | Do not touch per Rule 12 |
| `supabase/functions/render-room/` | **FROZEN** | Do not touch per Rule 12 |
| `supabase/functions/aggregate-style-profiles/` | KEEP_AS_IS | Style profile aggregation function |
| `supabase/functions/clip-embed/` | KEEP_AS_IS | CLIP embedding Edge Function |
| `supabase/functions/delete-account/` | KEEP_AS_IS | Account deletion Edge Function |
| `supabase/functions/generate-depth-map/` | KEEP_AS_IS | Depth map generation |
| `supabase/functions/tests/` | KEEP_AS_IS | Edge Function test suite |
| `supabase/migrations/` (62 files) | KEEP_AS_IS | Complete migration history — never alter |

### Modal Pipeline

| Current Path | Status | Notes |
|---|---|---|
| `modal_pipeline/room_reconstruction.py` | KEEP_AS_IS | AnySplat on Modal A10G |
| `modal_pipeline/marble_pipeline.py` | KEEP_AS_IS | Marble v0.1 3D pipeline |
| `modal_pipeline/marble_plus_pipeline.py` | KEEP_AS_IS | Marble Plus pipeline |
| `modal_pipeline/marble_multi_image_pipeline.py` | KEEP_AS_IS | Multi-image Marble pipeline |
| `modal_pipeline/marble_mini_final_pipeline.py` | KEEP_AS_IS | Marble Mini Final pipeline |
| `modal_pipeline/redesign_pipeline.py` | KEEP_AS_IS | AI redesign pipeline (FLUX + lang-SAM) |
| `modal_pipeline/furniture_matching_pipeline.py` | KEEP_AS_IS | Furniture detection + CLIP matching |
| `modal_pipeline/depth_video_pipeline.py` | KEEP_AS_IS | Depth video processing |
| `modal_pipeline/pre_detection_pipeline.py` | KEEP_AS_IS | Pre-detection pipeline |
| `modal_pipeline/clip_text_embed.py` | KEEP_AS_IS | CLIP text embedding endpoint |
| `modal_pipeline/embed_catalog.py` | KEEP_AS_IS | Catalog CLIP embedding |
| `modal_pipeline/embed_catalog_gpu.py` | KEEP_AS_IS | GPU-accelerated catalog embedding |
| `modal_pipeline/embed_fusion_gpu.py` | KEEP_AS_IS | Fusion embedding (new) |
| `modal_pipeline/insert_products.py` | KEEP_AS_IS | Product insertion script |
| `modal_pipeline/scrape_catalog.py` | KEEP_AS_IS | Catalog scraping |
| `modal_pipeline/anysplat/` | KEEP_AS_IS | AnySplat model source code (large, ~100 files) |
| `modal_pipeline/catalog_data/` | KEEP_AS_IS | Scraped catalog JSON artifacts |
| `modal_pipeline/test_*.py` | KEEP_AS_IS | Pipeline test scripts |

---

## Environment Variables

### Present in `apps/web/.env.local`

| Variable Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (project: xdeacbmkdwqrwxonqaqh) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Claude API for chat + style prompts |
| `REPLICATE_API_TOKEN` | Replicate API for FLUX Kontext / FLUX Fill |
| `SENTRY_DSN` | Sentry error monitoring DSN |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host (app.posthog.com) |
| `NEXT_PUBLIC_APP_URL` | App URL (http://localhost:3000) — update for production |
| `SUPABASE_JWT_SECRET` | JWT secret for QR capture token signing |
| `MODAL_TOKEN_ID` | Modal authentication token ID |
| `MODAL_TOKEN_SECRET` | Modal authentication token secret |
| `AMAZON_AFFILIATE_TAG` | Amazon affiliate tag (cova03-20, ACTIVE) |
| `MARBLE_API_KEY` | Marble worldlabs.ai API key |
| `MODAL_WEBHOOK_URL` | Room reconstruction Modal endpoint |
| `CLIP_TEXT_EMBED_URL` | CLIP text embedding Modal endpoint |
| `MARBLE_PIPELINE_WEBHOOK_URL` | Marble pipeline Modal endpoint |
| `REDESIGN_PIPELINE_WEBHOOK_URL` | Redesign pipeline Modal endpoint |
| `MARBLE_PLUS_WEBHOOK_URL` | Marble Plus Modal endpoint |
| `FURNITURE_MATCHING_WEBHOOK_URL` | Furniture matching Modal endpoint |
| `PIPELINE_MODE` | Active pipeline mode (currently: full) |
| `DEPTH_VIDEO_WEBHOOK_URL` | Depth video Modal endpoint |
| `PRE_DETECTION_WEBHOOK_URL` | Pre-detection Modal endpoint |
| `MARBLE_MULTI_IMAGE_WEBHOOK_URL` | Multi-image Marble Modal endpoint |
| `OPENAI_API_KEY` | OpenAI key (not in CLAUDE.md requirements — likely legacy) |
| `APIFY_API_TOKEN` | Apify web scraping (catalog building) |

### Missing (from CLAUDE.md requirements — affiliate IDs all pending program approval)

| Variable Name | Purpose | Blocking Which Milestone |
|---|---|---|
| `TARGET_AFFILIATE_ID` | Target affiliate via Impact network | M6 catalog completion |
| `ARTICLE_AFFILIATE_ID` | Article.com affiliate | M6 catalog completion |
| `CRATE_BARREL_AFFILIATE_ID` | Crate & Barrel via Sovrn | M6 catalog completion |
| `CB2_AFFILIATE_ID` | CB2 via Sovrn | M6 catalog completion |
| `WEST_ELM_AFFILIATE_ID` | West Elm via ShareASale | M6 catalog completion |
| `RUGGABLE_AFFILIATE_ID` | Ruggable via CJ | M6 catalog completion |
| `ONE_KINGS_LANE_AFFILIATE_ID` | One Kings Lane via CJ | M6 catalog completion |
| `POTTERY_BARN_AFFILIATE_ID` | Pottery Barn via ShareASale | M6 catalog completion |
| `OVERSTOCK_AFFILIATE_ID` | Overstock via CJ | M6 catalog completion |
| `ETSY_AFFILIATE_ID` | Etsy via Awin | M6 catalog completion |
| `MARBLE_MINI_FINAL_WEBHOOK_URL` | Marble Mini Final endpoint | M7 (commented "deploy first") |

### Wrong Name or Pattern

| Variable Name | Issue | Correct Name |
|---|---|---|
| `AMAZON_ASSOCIATE_TAG` (in root `.env.local`) | Wrong name — root env has old name from mobile era | `AMAZON_AFFILIATE_TAG` — already correct in `apps/web/.env.local`, only wrong in root env |

**Note:** Root `.env.local` and `apps/web/.env.local` are separate files. The web app reads from `apps/web/.env.local` which has the correct `AMAZON_AFFILIATE_TAG`. The root `.env.local` is used by mobile/scripts and has the legacy name. No code change needed — this is just a documentation note.

---

## Supabase Configuration

**Project reference:** xdeacbmkdwqrwxonqaqh (from URL in env var — key values not reproduced)

**Current client pattern:**
- `lib/supabase/client.ts` — `createBrowserClient` from `@supabase/ssr` ✓ CORRECT per Rule 4
- `lib/supabase/server.ts` — `createServerClient` from `@supabase/ssr` with cookie handler ✓ CORRECT per Rule 5
- `middleware.ts` — `createServerClient` from `@supabase/ssr` with request/response cookies ✓ CORRECT per Rule 5

**Violations (direct `@supabase/supabase-js` imports — Rule 4/5 violations):**
- `app/room/[roomId]/page.tsx:2` — `createClient` imported directly, uses `SUPABASE_SERVICE_ROLE_KEY`
- `app/test-viewer/page.tsx:4` — `createClient` imported directly
- `app/api/chat/history/route.ts:4` — `createClient` imported directly, uses `SUPABASE_SERVICE_ROLE_KEY`

**RLS:** Defined and enforced in Supabase migrations. Policies exist for: products, rooms, quiz_cards, chat_messages, room_products, swipe_history, redesign_feedback, product_impressions, product_interactions, style_purchase_signals, user_style_profiles, etc.

**Schema status:** 62 migrations applied. Tables confirmed in code: rooms, products, room_products, quiz_cards, swipe_history, chat_messages, redesign_feedback, profiles. All frozen columns preserved.

**Permitted ALTER TABLE statements (from CLAUDE.md):** These may or may not have been run. Migrations in `supabase/migrations/20240036000000_marble_pipeline_columns.sql` and `20240050000000_marble_plus_columns.sql` likely cover these, but should be verified against the dashboard before running them again.

---

## Code Quality Issues

### Direct Supabase Imports (must fix — Rule 4/5 violations)

| File | Line | Issue |
|---|---|---|
| `apps/web/app/room/[roomId]/page.tsx` | 2 | `import { createClient } from '@supabase/supabase-js'` — replace with `createServerSupabaseClient()` from lib wrapper |
| `apps/web/app/test-viewer/page.tsx` | 4 | `import { createClient } from '@supabase/supabase-js'` — replace with `createServerSupabaseClient()` from lib wrapper |
| `apps/web/app/api/chat/history/route.ts` | 4 | `import { createClient } from '@supabase/supabase-js'` — replace with service-role-key pattern via lib wrapper or a separate service client |

**Note on service role key pattern:** `room/[roomId]/page.tsx` and `chat/history/route.ts` need the service role key for admin-level queries (bypassing RLS to verify ownership). The lib wrapper at `lib/supabase/server.ts` uses the anon key. The fix should create a separate `lib/supabase/admin.ts` helper that wraps the service role key, so it still goes through the lib layer but is server-only.

### TypeScript `any` Types (must fix — CLAUDE.md rule: no TypeScript `any`)

| File | Location | Type of `any` |
|---|---|---|
| `apps/web/middleware.ts` | Line 64 | `cookie as any` — necessary workaround for cookie type incompatibility. Acceptable with eslint-disable comment. |
| `apps/web/components/RoomChatbot.tsx` | Lines 9, 25, 87, 117, 132, 170, 252 | Untyped data from chat API responses. Should define proper interfaces. |
| `apps/web/app/api/chat/history/route.ts` | Line 51 | `error: any` in catch block — replace with `unknown` + type guard |
| `apps/web/app/capture/mobile/page.tsx` | Lines 275, 294, 316 | `DeviceOrientationEvent as any` — iOS API not in DOM types. Acceptable with eslint-disable-next-line. |
| `apps/web/components/capture/WebcamMode.tsx` | Lines 87, 104, 131 | Same `DeviceOrientationEvent as any` — same acceptable iOS workaround. |

### Hardcoded Hex Colors (must fix before UI sessions, per design system)

These files use hardcoded hex values instead of CSS variables (`var(--gold)`, `var(--navy-deep)`, etc.) or Tailwind classes. CSS variables ARE defined in `globals.css`. This is widespread and non-blocking for functionality, but creates maintenance risk.

**Most impactful files:**
| File | Notes |
|---|---|
| `apps/web/app/auth/page.tsx` | Entire file uses inline `style={{...}}` with hex values. No Tailwind, no CSS vars. |
| `apps/web/app/capture/mobile/page.tsx` | Extensive inline SVG and style references to `#C9A84C` |
| `apps/web/app/room/[roomId]/3d/page.tsx` | Inline style hex for loading spinner and buttons |
| `apps/web/components/ProductPanel.tsx` | `RETAILER_COLORS` record with hardcoded hex for retailer badges |
| `apps/web/app/capture/new/page.tsx` | `bg-[#0A1628]` Tailwind JIT classes (these ARE acceptable — JIT classes reference the design system values) |

**Assessment:** The Tailwind JIT classes (`bg-[#0A1628]`, `text-[#C9A84C]`) are acceptable since the values are correct per spec. The inline `style={{background: '#0A1628'}}` pattern is the one to clean up. Not blocking any pipeline functionality — schedule for UI polish sessions (M10/M13).

### Security Issues

| File | Issue | Severity |
|---|---|---|
| `apps/web/.env.local` | Contains actual API key values. **This is an `.env.local` file and should be in `.gitignore` — verify it is not committed to the repo.** If these values appear in git history, they should be rotated immediately. | CRITICAL (if in git) / EXPECTED (if only local) |
| `apps/web/app/room/[roomId]/page.tsx` | Uses `SUPABASE_SERVICE_ROLE_KEY` in what is a Server Component — technically safe (server-only), but uses direct `createClient` instead of lib wrapper. | LOW (correct env, wrong import) |
| `apps/web/app/api/chat/history/route.ts` | Uses `SUPABASE_SERVICE_ROLE_KEY` via direct `createClient` — server-side only, technically safe. | LOW (correct env, wrong import) |

**Verify immediately:** Run `git log --all --full-history -- apps/web/.env.local` to confirm `.env.local` has never been committed. If it has appeared in git history at any point, rotate all key values.

---

## Dependency Audit (`apps/web/package.json`)

### Present and Correct

| Package | Installed Version | Required Version | Status |
|---|---|---|---|
| `next` | 14.2.35 | 14.2.x | ✓ |
| `typescript` | ^5 | 5.x | ✓ |
| `tailwindcss` | ^3.4.1 | 3.4.x | ✓ |
| `@supabase/ssr` | ^0.10.0 | latest | ✓ |
| `@supabase/supabase-js` | ^2.101.0 | 2.x | ✓ |
| `@sparkjsdev/spark` | ^0.1.10 | latest | ✓ |
| `three` | ^0.183.2 | latest | ✓ (aliased to three-web for SparkJS compat) |
| `jose` | ^6.2.2 | latest | ✓ |
| `react-qr-code` | ^2.0.18 | latest | ✓ |
| `lucide-react` | ^1.7.0 | — | ✓ (not in spec but standard) |
| `@anthropic-ai/sdk` | ^0.82.0 | — | ✓ (present, needed for chat API) |

### Present but Version Concern

| Package | Installed | CLAUDE.md Requires | Risk |
|---|---|---|---|
| `framer-motion` | ^12.38.0 | 11.x | API changes between v11 and v12 may affect some animations. Monitor if animations break. |
| `zustand` | ^5.0.12 | 4.x | v5 has breaking API changes. Code currently uses v5 `create` API. If CLAUDE.md is the authority, this is a version violation. If "currently working" is the baseline, v5 is fine. **Decision point.** |

### Missing (required by CLAUDE.md tech stack)

| Package | Purpose | Blocking |
|---|---|---|
| `sharp` | Image processing server-side | M8 (product image processing) |
| `replicate` | Replicate API client | M7 (FLUX Fill/Kontext). Note: code currently uses direct `fetch` to Replicate API, so this SDK is not strictly blocking yet |
| `posthog-js` | PostHog analytics | M9 (analytics) |
| `@sentry/nextjs` | Error monitoring | M10 (polish) |
| `zod` | Schema validation | M9+ (API validation) |
| `@react-three/fiber` | React Three.js renderer | M8 (hotspot rendering). Note: SplatViewer uses Three.js directly, not R3F |

### Present but Unnecessary

| Package | Notes |
|---|---|
| `three-web` (npm alias) | Necessary for SparkJS compatibility — keep |

---

## Files to Create (Gaps)

### Missing Reference Documents (founder decision required)

| Required Path | Purpose | Source | Priority |
|---|---|---|---|
| `ARCHITECTURE.md` | Target architecture reference for future sessions | Must be authored by founders | BLOCKING (referenced in task brief as canonical) |
| `COVA_CONTEXT.md` | Project context reference | Must be authored by founders | BLOCKING (referenced in task brief as canonical) |
| `docs/STATUS.md` | Current build state per milestone | Can be derived from current code state | NEEDED |

### Missing Admin Supabase Wrapper

| Required Path | Purpose | Source | Priority |
|---|---|---|---|
| `apps/web/lib/supabase/admin.ts` | Wrapper for service-role-key Supabase client (server-only) | Derive from existing lib/supabase/server.ts + direct clients in 3 files | BLOCKING (needed to fix the 3 direct import violations) |

### Confirmed Missing from CLAUDE.md Spec

| Required Path | Purpose | Source | Priority |
|---|---|---|---|
| `apps/web/app/api/capture/validate-token/route.ts` | Already exists | — | — |
| `apps/web/lib/db/migrations/` (6 ALTER TABLE statements) | Run against Supabase — may be covered by migration 20240036 | Run idempotently | NEEDED |

---

## Migration Sequence

Each group is independently executable without breaking existing working functionality.

### Group 0 — Verification First (no file changes)

1. Verify `.env.local` is not in git history: `git log --all --full-history -- apps/web/.env.local`
2. Verify all 6 ALTER TABLE statements from CLAUDE.md have been applied (check Supabase dashboard for `splat_url`, `redesign_splat_url`, `style_vector`, `is_public`, `modal_job_id`, `marble_operation_id` columns on `renders` table)
3. Verify `room-videos` storage bucket exists in Supabase dashboard with RLS

**Checkpoint: No files changed. Verification only.**

### Group 1 — Create Admin Supabase Wrapper (unblocks Groups 2 and 3)

Create `apps/web/lib/supabase/admin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

// Server-only: uses service role key, bypasses RLS
// Never import this in client components or expose to browser
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

**Checkpoint: Build passes. No existing behavior changed.**

### Group 2 — Fix Direct Supabase Imports (3 files, Rule 4/5)

Fix each file to use the lib wrapper:

**File 1:** `apps/web/app/room/[roomId]/page.tsx`
- Remove: `import { createClient } from '@supabase/supabase-js'`
- Add: `import { createAdminClient } from '@/lib/supabase/admin'`
- Replace: `const supabase = createClient(...)` with `const supabase = createAdminClient()`

**File 2:** `apps/web/app/test-viewer/page.tsx`
- Same pattern as File 1

**File 3:** `apps/web/app/api/chat/history/route.ts`
- Remove: `import { createClient } from '@supabase/supabase-js'`
- Add: `import { createAdminClient } from '@/lib/supabase/admin'`
- Replace: `const db = createClient(...)` with `const db = createAdminClient()`
- Also fix: `error: any` → `error: unknown` + type guard

**Checkpoint: Build passes. `next lint` should report no `@supabase/supabase-js` import violations.**

### Group 3 — Fix chat-room Edge Function Model Name (Rule 12 permitted change)

In `supabase/functions/chat-room/index.ts`:
- Change model name from `claude-haiku-4-5-20251001` to `claude-sonnet-4-5`
- Deploy: `supabase functions deploy chat-room`

**Checkpoint: Edge Function deployed. Chat quality improves.**

### Group 4 — Fix TypeScript `any` in RoomChatbot (non-blocking but Rule violation)

Define proper interfaces in `apps/web/components/RoomChatbot.tsx` to replace 7 `any` usages. This component handles chat messages and product cards — type the response shape from `/api/chat`.

**Checkpoint: `npx tsc --noEmit` passes. Build passes.**

### Group 5 — Install Missing Dependencies (as needed per milestone)

Run as each milestone requires:
```bash
# M7:
pnpm add --filter web replicate
# M9:
pnpm add --filter web posthog-js @sentry/nextjs zod
# M10:
pnpm add --filter web sharp
```

**Checkpoint: Each install: `pnpm build` passes.**

### Group 6 — UI Polish: Replace Hardcoded Hex (schedule for M10/M13)

This is not blocking any pipeline functionality. Schedule for the UI polish milestones.
Priority order:
1. `app/auth/page.tsx` — full rewrite with Tailwind classes
2. `components/RoomChatbot.tsx` — inline style → Tailwind
3. `app/room/[roomId]/3d/page.tsx`
4. All remaining components

**Checkpoint: All pages use CSS variables or Tailwind classes for brand colors.**

---

## Decision Points

The following items are places where the existing working code diverges from CLAUDE.md or the task brief. Founders must choose KEEP EXISTING or MIGRATE TO TARGET.

### DP-1: Zustand v5 vs v4

| | |
|---|---|
| **What exists** | `zustand@^5.0.12` — working, all 3 stores use v5 API |
| **CLAUDE.md specifies** | `zustand@4.x` |
| **Impact** | v5 has breaking changes vs v4. v5 is newer and working. Downgrading would break the existing stores. |
| **Recommendation** | KEEP EXISTING (v5). Update CLAUDE.md to reflect v5. |
| **Options** | A) KEEP EXISTING — update CLAUDE.md spec to v5. B) MIGRATE — downgrade to v4, rewrite stores. |

### DP-2: Framer Motion v12 vs v11

| | |
|---|---|
| **What exists** | `framer-motion@^12.38.0` — working |
| **CLAUDE.md specifies** | `framer-motion@11.x` |
| **Impact** | v12 is newer with minor API differences. Currently working. |
| **Recommendation** | KEEP EXISTING (v12). Update CLAUDE.md. |
| **Options** | A) KEEP EXISTING. B) MIGRATE to v11. |

### DP-3: Font — EB Garamond vs Playfair Display

| | |
|---|---|
| **What exists** | `layout.tsx` loads `EB_Garamond` as the heading/serif font. `globals.css` loads Playfair Display via Google Fonts import. Both are present. |
| **CLAUDE.md specifies** | Playfair Display for headings. |
| **Impact** | `layout.tsx` sets `--font-serif` variable to EB Garamond. Components that use `font-serif` class get EB Garamond, not Playfair Display. The CSS `@import` in globals.css loads Playfair Display but it's only available when explicitly referenced as `fontFamily: 'Playfair Display, serif'`. |
| **Recommendation** | MIGRATE to Playfair Display as the layout.tsx variable. The spec is clear. |
| **Options** | A) MIGRATE — update layout.tsx to load Playfair Display via `next/font/google`, update font variable. B) KEEP EXISTING — EB Garamond is a higher-quality alternative, update CLAUDE.md. |

### DP-4: Tailwind Color Palette — Slight Value Mismatch

| | |
|---|---|
| **What exists** | `tailwind.config.ts` has `navy.deep: #0B1F3A`. `globals.css` has `--navy-deep: #0a1628`. These differ by one digit. |
| **CLAUDE.md specifies** | Background: `#0A1628` |
| **Impact** | Minor visual difference. The CSS variable (`#0a1628`) is correct. Tailwind config is slightly off. |
| **Recommendation** | Fix the tailwind.config.ts value to `#0A1628` to match spec. |
| **Options** | A) MIGRATE (fix typo) — update tailwind.config.ts. B) KEEP EXISTING — negligible visual difference. |

### DP-5: `lib/stylePrompt.ts` — SDK vs direct fetch for Anthropic API

| | |
|---|---|
| **What exists** | Async `generateStylePrompt` function uses `fetch('https://api.anthropic.com/...')` directly. The rest of the app uses `@anthropic-ai/sdk` (in `app/api/chat/route.ts`). |
| **Impact** | Both work. Direct fetch is more brittle (API version headers must be maintained manually). |
| **Recommendation** | MIGRATE to `@anthropic-ai/sdk` for consistency. Low priority. |
| **Options** | A) MIGRATE — refactor to use `@anthropic-ai/sdk`. B) KEEP EXISTING — currently working. |

### DP-6: Duplicate ProductPanel Components

| | |
|---|---|
| **What exists** | Two ProductPanel files: `components/ProductPanel.tsx` (root) and `components/product/ProductPanel.tsx` (subfolder). |
| **Impact** | Unclear which is authoritative. The newer `components/product/` directory likely supersedes the root-level component. |
| **Recommendation** | UNKNOWN — verify which pages import which file. If `components/product/ProductPanel.tsx` is the current version, remove the root `ProductPanel.tsx`. |
| **Options** | A) KEEP EXISTING (both) — they serve different contexts. B) CONSOLIDATE — remove root version. |

### DP-7: Inline Supabase Client Creation in API Routes

| | |
|---|---|
| **What exists** | Most API routes create their Supabase client inline using `createServerClient` from `@supabase/ssr` directly (not via `lib/supabase/server.ts` wrapper). The 3 files that import from `@supabase/supabase-js` are rule violations, but many other routes create `createServerClient` inline rather than calling `createServerSupabaseClient()`. |
| **CLAUDE.md says** | Always use `createServerClient` from `@supabase/ssr` (which they do). The wrapper in lib/supabase/server.ts just packages this. |
| **Impact** | Technically compliant (using correct import from `@supabase/ssr`). Just not DRY. |
| **Recommendation** | KEEP EXISTING. The inline pattern is correct per Rule 5. Enforcing the wrapper is optional code quality improvement, not a rule violation. |
| **Options** | A) KEEP EXISTING — inline `createServerClient` is correct. B) REFACTOR — use lib wrapper everywhere for DRY code. |

---

## UNKNOWN Items Requiring Founder Input

| File/Area | Question | Options |
|---|---|---|
| `apps/web/app/viewer/[sessionId]/page.tsx` | Not audited — does it use direct `@supabase/supabase-js` imports? | Audit this file before declaring Group 2 complete |
| `ARCHITECTURE.md` | Does this document exist somewhere (Notion, Figma, etc.) and needs to be brought into the repo? Or does it need to be created from scratch? | A) Import from external source B) Create fresh C) Not needed |
| `COVA_CONTEXT.md` | Same question — is this a planned document or an error in the task brief? | A) Create B) Not needed |
| `supabase/migrations/` — renders table | Have the 6 ALTER TABLE statements from CLAUDE.md been applied? Check for columns: `splat_url`, `redesign_splat_url`, `style_vector`, `is_public`, `modal_job_id`, `marble_operation_id` on the `renders` table in Supabase dashboard. | Verify in dashboard, run if missing |
| `components/ProductPanel.tsx` vs `components/product/ProductPanel.tsx` | Which is authoritative? Which pages currently import each? | Trace imports to determine which to keep |
| `OPENAI_API_KEY` in `apps/web/.env.local` | This is not in CLAUDE.md requirements. Is it used anywhere? Is it needed going forward? | Search codebase for usage, remove if unused |
| True milestone status | The M0 Status in CLAUDE.md says "pending — create Next.js 14 scaffold" but the scaffold clearly exists and is substantially built. What is the actual current milestone? | Founders clarify, update CLAUDE.md M0 status section |

---

## Session Plan Impact

Since `docs/STATUS.md` does not exist, no session plan file exists to update. However:

1. **CLAUDE.md M0 Status section is stale.** It lists scaffold creation and env population as pending, but these are done. Update the M0 status section to reflect actual state before next session.

2. **Actual progress appears to be M7-M8 level**, not M0. The pipeline runs end-to-end, furniture matching works, the viewer loads, chat is live. The remaining work is UI polish (M10), deployment (M11), and VC prep (M13-M14).

3. **Priority sessions implied by this audit:**
   - Session 1: Complete Groups 1-3 (fix rule violations, fix Edge Function model name) — ~1 hour
   - Session 2: Complete Group 4 (TypeScript fixes) — ~2 hours  
   - Sessions 3+: Continue with actual milestone work per the milestone sequence

---

## Summary: What Must Be Done Before Any New Feature Work

**Non-negotiable (rule violations):**
1. Create `lib/supabase/admin.ts` wrapper
2. Fix 3 direct `@supabase/supabase-js` imports
3. Change chat-room Edge Function model name to `claude-sonnet-4-5`

**Should be done soon (quality):**
4. Fix `any` types in RoomChatbot.tsx and chat/history route
5. Verify `.env.local` is not in git history

**Decision points requiring founder answer before work proceeds:**
- DP-1: Zustand v5 or v4?
- DP-3: Font — Playfair Display or EB Garamond?
- DP-6: Which ProductPanel is authoritative?
- Missing documents: ARCHITECTURE.md and COVA_CONTEXT.md needed?
