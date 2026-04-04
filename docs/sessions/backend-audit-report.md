# Cova — Backend Audit Report
**Date:** 2026-04-03  
**Auditor:** Claude Code (read-only; no files modified)  
**Branch:** main  
**Context documents read:** CLAUDE.md, COVA_CONTEXT.md, ARCHITECTURE.md, SESSION_PLAN.md, STATUS.md

---

## ⚠️ CRITICAL FINDING: SPEC MISMATCH

**The audit prompt contains "required" API routes, schema, and Zustand store paths that do NOT match COVA_CONTEXT.md or ARCHITECTURE.md — the authoritative project specs.**

The required contracts in the prompt describe what appears to be an intermediate/older product spec:

| Prompt says "required" | Actual COVA spec | Verdict |
|---|---|---|
| `POST /api/render` | `/api/pipeline/redesign` | Different product spec |
| `POST /api/detect` | `/api/pipeline/pre-detect` | Different product spec |
| `POST /api/match` | `/api/pipeline/furniture-match` | Different product spec |
| `POST /api/quiz/fingerprint` | `/api/quiz/confidence` | Different name, similar purpose |
| `POST /api/rooms/capture` | `/api/pipeline/start` | Different product spec |
| `POST /api/render/refine` | No equivalent — not in COVA spec | Different product spec |
| `POST /api/parse-constraints` | No equivalent — not in COVA spec | Different product spec |
| `GET /api/auth/callback` | `GET /auth/callback` (page route, not API) | Path difference only |
| Schema: `users` | `users` (old V0) + `profiles` (V1 app uses this) | V0 migration exists |
| Schema: `style_fingerprints` | `user_style_profiles` + `swipe_history` | Split in V1 |
| Schema: `render_sessions` | `renders` (V0) + V1 columns on `rooms` | Refactored |
| Schema: `interactions` | `redesign_feedback` | Different name |
| Store: `lib/store/session.ts` | `lib/stores/userStore.ts` | Renamed |
| Store: `lib/store/fingerprint.ts` | `lib/stores/userStore.ts` (styleVector field) | Merged |
| Store: `lib/store/room.ts` | `lib/stores/roomStore.ts` | Renamed |

**The authoritative required contracts are defined in COVA_CONTEXT.md and ARCHITECTURE.md, not in the audit prompt.**
This report evaluates against COVA_CONTEXT.md and SESSION_PLAN.md.

---

## SECTION 1 — File Tree

```
/Users/daksh/Desktop/cova/
├── CLAUDE.md                              (root rules, ~250 lines)
├── COVA_CONTEXT.md                        (project context, ~205 lines)
├── ARCHITECTURE.md                        (target architecture, ~249 lines)
├── CHAT_STARTER.md                        (session quick-start)
├── .gitignore                             (hardened in Session 0)
│
├── apps/
│   ├── web/                               ← All V1 work
│   │   ├── app/
│   │   │   ├── page.tsx                   (landing page, ~764 lines)
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   ├── auth/
│   │   │   │   ├── page.tsx               (auth: Google/Apple/magic link)
│   │   │   │   └── callback/
│   │   │   │       └── route.ts           (OAuth callback, 54 lines)
│   │   │   ├── budget/
│   │   │   │   └── page.tsx               (budget tier selection)
│   │   │   ├── quiz/
│   │   │   │   └── page.tsx               (style quiz — swipe cards)
│   │   │   ├── capture/
│   │   │   │   ├── new/                   (create room + redirect)
│   │   │   │   ├── [roomId]/              (multi-mode: QR/webcam/upload)
│   │   │   │   └── mobile/               (phone camera interface, ~612 lines)
│   │   │   ├── processing/
│   │   │   │   └── [roomId]/              (pipeline progress screen)
│   │   │   ├── room/
│   │   │   │   └── [roomId]/
│   │   │   │       ├── page.tsx           (room main view)
│   │   │   │       ├── 3d/page.tsx        (SparkJS viewer + hotspots, ~600 lines)
│   │   │   │       └── RoomOverlay.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx               (room list, style profile, ~340 lines)
│   │   │   ├── furniture-selection/
│   │   │   │   └── [roomId]/              (user furniture selection UI)
│   │   │   └── api/                       ← 22 route handlers
│   │   │       ├── capture/
│   │   │       │   ├── generate-token/route.ts   (JWT for QR capture)
│   │   │       │   └── validate-token/route.ts   (JWT validation)
│   │   │       ├── chat/
│   │   │       │   ├── route.ts           (Claude Sonnet streaming)
│   │   │       │   └── history/route.ts   (room chat history)
│   │   │       ├── quiz/
│   │   │       │   ├── next-card/route.ts (quiz card serving)
│   │   │       │   └── confidence/route.ts (style fingerprint from swipes)
│   │   │       ├── rooms/
│   │   │       │   ├── create/route.ts    (POST — new room)
│   │   │       │   ├── status/route.ts    (GET — polling, 150 lines)
│   │   │       │   └── [roomId]/route.ts  (PATCH room attributes)
│   │   │       ├── pipeline/
│   │   │       │   ├── start/route.ts     (orchestrateFullPipeline entry)
│   │   │       │   ├── resume/route.ts    (post furniture-selection resume)
│   │   │       │   ├── redesign/route.ts  (FLUX Kontext trigger)
│   │   │       │   ├── furniture-match/route.ts (Claude Vision + CLIP)
│   │   │       │   ├── depth-video/route.ts (flythrough video)
│   │   │       │   ├── marble-multi-image/route.ts (multi-image 3D)
│   │   │       │   ├── marble-plus/route.ts (Plus quality upgrade)
│   │   │       │   ├── marble-plus-background/route.ts (async Plus)
│   │   │       │   ├── marble-mini-final/route.ts (Mini legacy)
│   │   │       │   ├── marble-process/route.ts (process handler)
│   │   │       │   ├── plus-complete/route.ts (mark Plus done)
│   │   │       │   └── pre-detect/route.ts (pre-detection pipeline)
│   │   │       └── local-ip/route.ts      (dev helper)
│   │   │
│   │   ├── components/
│   │   │   ├── SplatViewer.tsx            (SparkJS 3D viewer, ssr:false)
│   │   │   ├── FurnitureHotspots.tsx      (hotspot overlay, 3D→2D projection)
│   │   │   ├── RoomChatbot.tsx            (Claude Sonnet, streaming, ~612 lines)
│   │   │   ├── auth/AuthModal.tsx         (OAuth + magic link, ~434 lines)
│   │   │   ├── capture/                   (6 capture components)
│   │   │   │   ├── WebcamMode.tsx, QRMode.tsx, UploadMode.tsx
│   │   │   │   ├── QualityChecker.tsx, ModeSwitcher.tsx
│   │   │   │   ├── CompletionScreen.tsx, ShotStrip.tsx, CompassRing.tsx
│   │   │   ├── chat/                      (7 chat components)
│   │   │   │   ├── ChatBubble.tsx, ChatPanel.tsx, ChatInput.tsx
│   │   │   │   ├── ChatMessage.tsx, TypingIndicator.tsx
│   │   │   │   ├── SuggestionChips.tsx, ProductSearchResult.tsx
│   │   │   ├── dashboard/                 (4 components)
│   │   │   │   ├── RoomCard.tsx, StatsRow.tsx, StyleProfile.tsx, NewRoomCTA.tsx
│   │   │   ├── product/                   ← CANONICAL location
│   │   │   │   ├── ProductPanel.tsx, ProductCard.tsx
│   │   │   │   ├── ProductImageGallery.tsx, SimilarItems.tsx
│   │   │   ├── quiz/                      (4 components)
│   │   │   │   ├── CardStack.tsx, SwipeCard.tsx
│   │   │   │   ├── ConfidenceBar.tsx, ReturningUserStrip.tsx
│   │   │   └── layout/AppShell.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts              (createBrowserClient wrapper)
│   │   │   │   ├── server.ts              (createServerSupabaseClient wrapper)
│   │   │   │   └── admin.ts              (createAdminClient — service role)
│   │   │   ├── stores/
│   │   │   │   ├── userStore.ts           (user + styleVector)
│   │   │   │   ├── roomStore.ts           (roomId + processingStage + splat URLs)
│   │   │   │   └── cameraStore.ts         (yaw/pitch/fov for hotspot projection)
│   │   │   ├── affiliates.ts              (11-retailer URL builder)
│   │   │   ├── affiliates.test.ts
│   │   │   ├── clipSearch.ts              (CLIP embedding + pgvector search)
│   │   │   ├── fluxKontext.ts             (FLUX Kontext Pro via Replicate)
│   │   │   ├── marble.ts                  (Marble API client)
│   │   │   ├── pipelineConfig.ts          (pipeline mode enum + config)
│   │   │   ├── pipelinePoller.ts          (exponential backoff poller)
│   │   │   ├── routes.ts                  (route constants)
│   │   │   ├── stylePrompt.ts             (FLUX style prompt generator, ~365 lines)
│   │   │   └── db/                        (local SQL migration references)
│   │   │
│   │   ├── middleware.ts                   (auth guard, @supabase/ssr, 83 lines)
│   │   ├── package.json
│   │   ├── tailwind.config.ts
│   │   └── .env.local                     (NEVER committed)
│   │
│   └── mobile/                            ← FROZEN (V0 iOS, never touch)
│
├── modal_pipeline/
│   ├── room_reconstruction.py             (AnySplat video→splat, ~588 lines)
│   ├── marble_pipeline.py                 (single-image 3D, legacy)
│   ├── marble_multi_image_pipeline.py     (multi-image 3D — primary)
│   ├── marble_mini_final_pipeline.py      (Mini variant)
│   ├── marble_plus_pipeline.py            (async Plus upgrade)
│   ├── redesign_pipeline.py               (FLUX redesign)
│   ├── furniture_matching_pipeline.py     (Claude Vision + CLIP, ~611 lines)
│   ├── depth_video_pipeline.py            (flythrough video, ~427 lines)
│   ├── pre_detection_pipeline.py          (pre-detect)
│   ├── clip_text_embed.py                 (CLIP text embedding endpoint)
│   ├── embed_fusion_gpu.py                (fusion embeddings)
│   ├── scrape_catalog.py                  (product scraping, ~887 lines)
│   ├── embed_catalog.py, embed_catalog_gpu.py (CLIP catalog embedding)
│   ├── insert_products.py                 (bulk DB insertion)
│   ├── test_*.py                          (20+ test scripts)
│   └── anysplat/                          ← AnySplat submodule (FROZEN)
│
├── supabase/
│   ├── config.toml                        (project ref: xdeacbmkdwqrwxonqaqh)
│   ├── functions/                         ← 9 Edge Functions
│   │   ├── chat-room/                     (Claude Sonnet, UPDATABLE)
│   │   ├── detect-furniture/              (FROZEN)
│   │   ├── match-products/                (FROZEN)
│   │   ├── clip-embed/                    (FROZEN)
│   │   ├── render-room/                   (FROZEN)
│   │   ├── get-render-status/             (FROZEN)
│   │   ├── extract-colors/                (FROZEN)
│   │   ├── aggregate-style-profiles/      (FROZEN)
│   │   ├── delete-account/                (FROZEN)
│   │   └── generate-depth-map/            (FROZEN)
│   └── migrations/                        ← 55 total (first 10 = V0 schema)
│
├── styles/
│   └── tokens.css                         (design tokens — created Session 0)
│
└── docs/
    ├── STATUS.md                          (current build status)
    ├── SESSION_PLAN.md                    (sessions 0–8)
    └── sessions/
        ├── session-0-migration-plan.md
        ├── session-0-progress.md
        └── backend-audit-report.md        ← this file
```

---

## SECTION 2 — API Routes: What Exists vs What COVA Spec Requires

### Authoritative COVA Required Routes (from ARCHITECTURE.md)

| Required Route | File | What It Does | COVA Contract Match |
|---|---|---|---|
| `POST /api/rooms/create` | `app/api/rooms/create/route.ts` | Creates room, returns roomId | ✅ MATCHES |
| `GET /api/rooms/status` | `app/api/rooms/status/route.ts` | Returns progress%, message, isComplete, all URLs | ✅ MATCHES |
| `PATCH /api/rooms/[roomId]` | `app/api/rooms/[roomId]/route.ts` | Update room attributes | ✅ MATCHES |
| `POST /api/pipeline/start` | `app/api/pipeline/start/route.ts` | Entry point — orchestrateFullPipeline | ✅ MATCHES |
| `POST /api/pipeline/resume` | `app/api/pipeline/resume/route.ts` | Resume after furniture selection | ✅ MATCHES |
| `POST /api/pipeline/redesign` | `app/api/pipeline/redesign/route.ts` | FLUX Kontext trigger | ✅ MATCHES |
| `POST /api/pipeline/furniture-match` | `app/api/pipeline/furniture-match/route.ts` | Claude Vision + CLIP | ✅ MATCHES |
| `POST /api/pipeline/depth-video` | `app/api/pipeline/depth-video/route.ts` | Flythrough video | ✅ MATCHES |
| `POST /api/pipeline/marble-multi-image` | `app/api/pipeline/marble-multi-image/route.ts` | Multi-image 3D | ✅ MATCHES |
| `POST /api/pipeline/marble-plus` | `app/api/pipeline/marble-plus/route.ts` | Plus quality upgrade | ✅ MATCHES |
| `POST /api/pipeline/pre-detect` | `app/api/pipeline/pre-detect/route.ts` | Pre-detection | ✅ MATCHES |
| `POST /api/chat` | `app/api/chat/route.ts` | Claude streaming chat | ✅ MATCHES |
| `GET /api/chat/history` | `app/api/chat/history/route.ts` | Room chat history | ✅ MATCHES |
| `POST /api/quiz/next-card` | `app/api/quiz/next-card/route.ts` | Quiz card serving | ✅ MATCHES |
| `POST /api/quiz/confidence` | `app/api/quiz/confidence/route.ts` | Style fingerprint from swipes | ✅ MATCHES |
| `POST /api/capture/generate-token` | `app/api/capture/generate-token/route.ts` | QR JWT generation | ✅ MATCHES |
| `POST /api/capture/validate-token` | `app/api/capture/validate-token/route.ts` | QR JWT validation | ✅ MATCHES |
| `GET /auth/callback` | `app/auth/callback/route.ts` | OAuth code exchange | ✅ MATCHES |

**All COVA-spec required routes exist. Zero missing.**

### Routes in the Audit Prompt vs COVA Spec

The audit prompt listed these as "required" — **they are not in COVA_CONTEXT.md or ARCHITECTURE.md** and appear to be from an older or different product spec:

| Prompt "Required" Route | Verdict | Closest COVA Equivalent |
|---|---|---|
| `POST /api/render` | NOT REQUIRED by COVA spec | `/api/pipeline/redesign` (different architecture) |
| `POST /api/detect` | NOT REQUIRED by COVA spec | `/api/pipeline/pre-detect` |
| `POST /api/match` | NOT REQUIRED by COVA spec | `/api/pipeline/furniture-match` |
| `POST /api/quiz/fingerprint` | NOT REQUIRED by COVA spec | `/api/quiz/confidence` |
| `POST /api/rooms/capture` | NOT REQUIRED by COVA spec | `/api/pipeline/start` |
| `POST /api/render/refine` | NOT REQUIRED by COVA spec | None |
| `POST /api/parse-constraints` | NOT REQUIRED by COVA spec | None |

**Recommendation:** Ignore the audit prompt's required routes. The codebase correctly follows COVA_CONTEXT.md.

---

## SECTION 3 — Supabase Schema

### Supabase Project
- **Project ref:** `xdeacbmkdwqrwxonqaqh`
- **Config:** `supabase/config.toml` confirms project
- **Migrations:** 55 total files (20240001 through present)

### Schema Situation: V0 vs V1

The migration files show a **two-era schema**:

**Early migrations (20240001–20240010) — V0 product schema (old):**
```
20240001000000_users.sql      → CREATE TABLE public.users (style_fingerprint JSONB, budget_dna JSONB, ...)
20240002000000_token_transactions.sql
20240003000000_rooms.sql      → CREATE TABLE public.rooms (original_image_url, depth_map_url, calibration_data, ...)
20240004000000_renders.sql
20240005000000_chat_sessions.sql
20240006000000_products.sql   → 768-dim CLIP products table (FROZEN, ~5,581 rows)
20240007000000_realtor_tables.sql
20240008000000_jobs.sql
20240009000000_rls_policies.sql
20240010000000_storage_rls.sql
```

**Later migrations (20240011–present) — V1 additions:**
These add the V1 columns that the API routes actually use: `redesign_status`, `marble_spz_url`, `marble_mini_spz_url`, `pipeline_mode`, `room_products`, `swipe_history`, `chat_messages`, etc.

### Active Tables Referenced by V1 API Routes

| Table | V1 Columns Used in Code | Match to COVA_CONTEXT.md |
|---|---|---|
| `rooms` | `id, user_id, status, redesign_status, pipeline_mode, marble_spz_url, marble_mini_spz_url, redesign_pano_url, flythrough_video_url, plus_upgrade_ready, hotspot_timing, pre_detection_result, fixed_furniture, capture_mode` | ✅ MATCHES V1 spec |
| `room_products` | `id, room_id, hotspot_x, hotspot_y, furniture_label, matches` | ✅ MATCHES |
| `products` | CLIP embeddings, metadata | ✅ FROZEN/MATCHES |
| `quiz_cards` | quiz card data | ✅ FROZEN/MATCHES |
| `chat_messages` | room_id, message, response | ✅ MATCHES |
| `swipe_history` | per-swipe style signal | ✅ MATCHES |
| `user_style_profiles` | aggregated fingerprint | ✅ MATCHES |
| `redesign_feedback` | viewer telemetry | ✅ MATCHES |
| `profiles` | user profile data | ✅ MATCHES |

### Audit Prompt "Required" Schema vs COVA Reality

| Prompt Schema | Status | COVA Reality |
|---|---|---|
| `users` | EXISTS (V0 migration, deployed) | V0 table; V1 uses `profiles` for most app reads |
| `style_fingerprints` | MISSING as named table | Split into `user_style_profiles` + `swipe_history` |
| `rooms` | EXISTS (V1 columns present) | ✅ Active |
| `render_sessions` | MISSING as named table | `renders` (V0) + V1 columns on `rooms` |
| `products` | EXISTS (5,581+ rows, FROZEN) | ✅ Active |
| `interactions` | MISSING as named table | Covered by `redesign_feedback` |

The audit prompt's schema is from an intermediate spec. The deployed schema follows COVA_CONTEXT.md.

---

## SECTION 4 — AI Pipeline Integrations

### Replicate
- **Found in:** `apps/web/lib/fluxKontext.ts`, `apps/web/lib/clipSearch.ts`, `modal_pipeline/furniture_matching_pipeline.py`, `modal_pipeline/redesign_pipeline.py`
- **Usage:** FLUX Kontext Pro (room redesign), CLIP ViT-Large-Patch14 (product embeddings)
- **Assessment:** Real working integrations — actual API calls with model IDs
- **⚠️ MISSING from package.json:** `replicate` npm package NOT in dependencies
- **Impact:** `clipSearch.ts` and `fluxKontext.ts` likely import replicate — **build may fail or use older version**

### Modal
- **Found in:** All `modal_pipeline/*.py` files, webhook URL references in API routes
- **Usage:** A10G GPU for AnySplat, Marble pipelines, depth video, CLIP embedding
- **Assessment:** Real working integration — Modal endpoints deployed, webhooks wired
- **Modal npm SDK:** Not needed (Python-only pipeline; Next.js fires webhooks)

### FLUX / Replicate Models
- **Found in:** `lib/fluxKontext.ts`, `modal_pipeline/redesign_pipeline.py`
- **Model:** `black-forest-labs/flux-kontext-pro`
- **Assessment:** Real integration — FLUX Kontext Pro for AI redesign

### Claude / Anthropic
- **Found in:** `app/api/chat/route.ts`, `components/RoomChatbot.tsx`, `modal_pipeline/furniture_matching_pipeline.py`, `supabase/functions/chat-room/index.ts`
- **Package:** `@anthropic-ai/sdk ^0.82.0` ✅ in package.json
- **Models used:** `claude-sonnet-4-20250514` (chat API), `claude-sonnet-4-5` (Edge Function)
- **Assessment:** Real working integration — streaming responses, tool use

### CLIP / Embeddings / pgvector
- **Found in:** `lib/clipSearch.ts`, `modal_pipeline/clip_text_embed.py`, `supabase/functions/clip-embed/`, `supabase/functions/match-products/`
- **Assessment:** Real working integration — 768-dim embeddings, pgvector cosine search, 0.65 threshold enforced

### Depth Anything
- **Search result:** Referenced in `modal_pipeline/` (depth_video_pipeline.py)
- **Not used in Next.js API routes** — pure Python pipeline

### GroundingDINO / Detection
- **Found in:** `modal_pipeline/pre_detection_pipeline.py`
- **Not in Next.js code** — Python pipeline only
- **Assessment:** Exists but server-side only (correct per Hard Rule #6)

### PostHog
- **⚠️ MISSING from package.json:** `posthog-js` NOT in dependencies
- **Referenced in:** CLAUDE.md spec and SESSION_PLAN.md Session 2
- **Assessment:** Not yet installed — Session 2 task

### Sentry
- **⚠️ MISSING from package.json:** `@sentry/nextjs` NOT in dependencies
- **Referenced in:** CLAUDE.md spec and SESSION_PLAN.md Session 2
- **Assessment:** Not yet installed — Session 2 task

---

## SECTION 5 — Zustand Stores

### Existing Stores (in `apps/web/lib/stores/`)

**`userStore.ts` — 19 lines**
```typescript
interface UserState {
  user: User | null           // Supabase User object
  styleVector: number[] | null  // 5-dim style fingerprint
  setUser, setStyleVector, clearUser
}
```
- Manages: auth user + style fingerprint
- Verdict: ✅ MATCHES COVA_CONTEXT.md (Zustand v5, correct pattern)

**`roomStore.ts` — 40 lines**
```typescript
interface RoomState {
  currentRoomId: string | null
  splatUrl: string | null
  redesignSplatUrl: string | null
  processingStage: 'idle' | 'uploading' | 'reconstructing' | 'redesigning' | 'matching' | 'complete' | 'error'
  setRoom, setSplatUrl, setRedesignSplatUrl, setProcessingStage, clearRoom
}
```
- Manages: active room + processing state + splat URLs
- Verdict: ✅ MATCHES COVA_CONTEXT.md

**`cameraStore.ts`**
```typescript
interface CameraState {
  yaw, pitch, fov, aspect: number
  setCameraState(yaw, pitch, fov, aspect)
}
```
- Manages: camera angles for FurnitureHotspots 3D→2D projection
- Verdict: ✅ MATCHES ARCHITECTURE.md (SplatViewer writes → FurnitureHotspots reads)

### Audit Prompt Required Stores vs Actual

| Prompt Required | Actual | Verdict |
|---|---|---|
| `lib/store/session.ts` | `lib/stores/userStore.ts` | RENAMED — same purpose |
| `lib/store/fingerprint.ts` | `lib/stores/userStore.ts` (styleVector) | MERGED into userStore |
| `lib/store/room.ts` | `lib/stores/roomStore.ts` | RENAMED — same purpose |

The stores serve the required functions; only the file paths differ from the old spec.

---

## SECTION 6 — Authentication

### Implementation
- **Pattern:** `@supabase/ssr` ✅ (not deprecated `@supabase/auth-helpers`)
- **Storage:** HTTP-only cookies ✅ (Hard Rule #1 enforced, zero localStorage)
- **OAuth providers:** Google ✅, Apple ✅, Magic Link ✅ (all in `app/auth/page.tsx`)
- **Callback handler:** `app/auth/callback/route.ts` (54 lines)
  - Exchanges code for session via `exchangeCodeForSession()`
  - Checks if user has existing rooms → routes to `/dashboard` or `/capture/new`
  - ✅ Correct implementation
- **Middleware:** `middleware.ts` (83 lines)
  - Uses `createServerClient` from `@supabase/ssr` ✅
  - Protects: `/capture`, `/quiz`, `/budget`, `/processing`, `/room`, `/dashboard`
  - ⚠️ **Minor issue:** Uses `getSession()` not `getUser()`. `getSession()` trusts the cookie without re-validating with Supabase. `getUser()` re-validates with the server. Low security risk in practice (Supabase handles token rotation), but `getUser()` is the more secure pattern.
  - ⚠️ **Fallback behavior:** If env vars missing, middleware logs a warning and lets requests through. This is acceptable for dev but could allow unauthenticated access if env vars are accidentally unset in production.

---

## SECTION 7 — Supabase Edge Functions

**9 Edge Functions found** (CLAUDE.md Rule #12 says only `chat-room` is updatable; 5 are frozen. 4 additional functions exist that aren't mentioned in CLAUDE.md.)

| Function | Lines | What It Does | COVA Relevance | Status |
|---|---|---|---|---|
| `chat-room` | ~314 | Claude Sonnet chat, ACTION triggers (REGENERATE, etc.), rate limiting | Core — powers chatbot | ✅ UPDATABLE (model updated Session 0) |
| `detect-furniture` | ~199 | Claude Vision furniture detection with smart layout fallback | Core — V0 detection | FROZEN |
| `match-products` | ~111 | pgvector cosine search, style re-ranking | Core — product matching | FROZEN |
| `clip-embed` | ~87 | HuggingFace CLIP-ViT endpoint (768-dim) | Core — embedding | FROZEN |
| `render-room` | ~650 | FLUX Kontext Pro redesign via Replicate | Core — redesign | FROZEN |
| `get-render-status` | ~454 | Room processing status | Core — status polling | FROZEN |
| `extract-colors` | — | Color extraction from images | Core — style analysis | FROZEN |
| `aggregate-style-profiles` | — | Aggregates swipe history into style vector | Core — quiz | FROZEN (not in CLAUDE.md list) |
| `delete-account` | — | User account deletion | Admin | FROZEN (not in CLAUDE.md list) |
| `generate-depth-map` | — | Depth map generation | V0 pipeline | FROZEN (not in CLAUDE.md list) |

**Note:** CLAUDE.md mentions 5 frozen functions + 1 updatable = 6. But 9 exist. The extra 3 (`aggregate-style-profiles`, `delete-account`, `generate-depth-map`) are also frozen per the "never modify Edge Functions" rule; they just weren't listed explicitly.

---

## SECTION 8 — Dependencies (package.json)

### Present and Needed for COVA ✅
| Package | Version | Purpose |
|---|---|---|
| `next` | 14.2.35 | Framework |
| `@anthropic-ai/sdk` | ^0.82.0 | Claude chat API |
| `@supabase/ssr` | ^0.10.0 | Auth (correct, not deprecated) |
| `@supabase/supabase-js` | ^2.101.0 | DB client |
| `@sparkjsdev/spark` | ^0.1.10 | 3D splat viewer |
| `three` | ^0.183.2 | Three.js for viewer |
| `zustand` | ^5.0.12 | State management (v5 ✅) |
| `framer-motion` | ^12.38.0 | Animation (v12 ✅) |
| `jose` | ^6.2.2 | JWT for QR tokens |
| `react-qr-code` | ^2.0.18 | QR code generation |
| `lucide-react` | ^1.7.0 | Icons |

### ⚠️ Missing — Needed for COVA but Not in package.json

| Package | Required For | Session to Add |
|---|---|---|
| `replicate` | `lib/fluxKontext.ts`, `lib/clipSearch.ts` | Immediate — may cause build failure |
| `posthog-js` | Analytics (M9) | Session 2 |
| `@sentry/nextjs` | Error monitoring (M9) | Session 2 |
| `zod` | Input validation | Verify if needed or already unused |
| `@react-three/fiber` | Possibly used in 3D viewer | Verify if actually imported |
| `sharp` | SHARP fallback pipeline | Python-only, likely not needed in Next.js |

**Critical:** `replicate` is the most urgent missing dependency. If `lib/fluxKontext.ts` or `lib/clipSearch.ts` import it at module level, `npm run build` will fail.

### Present but Possibly Not Needed
- `three-web: "npm:three@0.169.0"` — Duplicate of `three` at older version. Likely needed for SparkJS compatibility. Verify before removing.

---

## SECTION 9 — Session Completion Assessment

### Session 0 — Architecture Migration + Security Hardening
**Verdict: COMPLETE**  
Evidence:
- `docs/sessions/session-0-migration-plan.md` and `session-0-progress.md` confirm completion
- All Session 0 tasks from SESSION_PLAN.md are checked off
- Fixed supabase imports, chat-room model name, deleted orphaned ProductPanel
- COVA_CONTEXT.md, ARCHITECTURE.md, CHAT_STARTER.md, docs/STATUS.md, docs/SESSION_PLAN.md, styles/tokens.css all created
- .gitignore hardened

Gaps: None. Session 0 is fully done.

---

### Session 1 — TypeScript + Code Quality
**Verdict: NOT STARTED**  
Evidence: SESSION_PLAN.md shows "Planned" status. No `any` type fixes have been applied yet.  
Gaps:
- `RoomChatbot.tsx` — 7 `any` type instances (ChatMessage, ToolResult, ProductData interfaces missing)
- `app/api/chat/history/route.ts` — `error: any` (partially addressed in Session 0, per notes)
- `tsc --noEmit` not verified as passing clean
- `npm run lint` not verified as passing clean

Effort to complete: 2–3 hours

---

### Session 2 — Analytics + Error Monitoring
**Verdict: NOT STARTED**  
Evidence: `posthog-js` and `@sentry/nextjs` absent from package.json. No PostHog provider in layout.tsx.  
Gaps: Full build — install packages, wrap layout, fire all events, configure Sentry.  
Effort: 3–4 hours

---

### Session 3 — Commerce: Affiliate Links + Product Panel Polish
**Verdict: PARTIAL — ~60% done**  
Evidence:
- `lib/affiliates.ts` exists — 11-retailer URL builder ✅
- Amazon tag `cova03-20` active ✅
- `components/product/ProductPanel.tsx` exists ✅
- FurnitureHotspots component exists ✅
- `room_products` table being populated by pipeline ✅

Gaps:
- End-to-end hotspot UX test on real room not confirmed
- ProductPanel loading/error states not verified
- "Open in retailer" PostHog tracking event not added (requires Session 2 first)
- Retailer diversity enforcement in `furniture_matching_pipeline.py` not verified

Effort to complete: 2–3 hours (after Session 2 PostHog is set up)

---

### Sessions 4–8
**Verdict: NOT STARTED** — All future sessions per SESSION_PLAN.md.

---

## SECTION 10 — Recommended Build Order

### KEEP AS-IS (zero changes needed)
- All 22 API route files — correct auth pattern, correct client usage
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts` — wrappers are correct
- `lib/stores/` — all 3 stores correct
- `supabase/functions/` — all frozen; `chat-room` already updated
- `modal_pipeline/` Python pipelines — functional, correct
- `styles/tokens.css` — design tokens complete
- `lib/affiliates.ts`, `lib/fluxKontext.ts`, `lib/marble.ts`, `lib/clipSearch.ts`, `lib/stylePrompt.ts` — real integrations

### ADAPT (existing code, needs modification)

| File | What to Change | Effort |
|---|---|---|
| `middleware.ts:55` | Change `getSession()` → `getUser()` for better security | 10 min |
| `components/RoomChatbot.tsx` | Fix 7 `any` types — define ChatMessage, ToolResult, ProductData interfaces | 2 hours |
| `app/api/chat/history/route.ts` | Fix `error: any` | 15 min |
| `tailwind.config.ts` | Fix `navy.deep` value: `#0B1F3A` → `#0A1628` | 5 min |
| `app/auth/page.tsx` | Replace hardcoded hex → CSS variable references | 30 min |
| `app/capture/mobile/page.tsx` | Replace hardcoded hex → CSS variable references | 30 min |
| `app/room/[roomId]/3d/page.tsx` | Replace hardcoded hex → CSS variable references | 30 min |

### BUILD (no usable existing code, start fresh)

| What | Effort |
|---|---|
| PostHog integration (Session 2) — install + provider + events | 2 hours |
| Sentry integration (Session 2) — install + boundary + test | 1.5 hours |
| Processing page retry button (Session 4) | 1 hour |
| Viewer error state → dashboard redirect (Session 4) | 30 min |
| Dashboard room card loading skeletons (Session 4) | 1 hour |
| Vercel deployment config (Session 5) | 2 hours |

### INSTALL IMMEDIATELY (missing npm packages)

```bash
pnpm add --filter web replicate
pnpm add --filter web posthog-js @sentry/nextjs   # (in Session 2)
```

`replicate` is critical — without it, API routes that import `fluxKontext.ts` or `clipSearch.ts` may fail to build.

### DO NOT DELETE
The following exist from V0 era but may still be referenced by newer migrations or code:
- `supabase/migrations/20240001–20240010` — These define the base schema. Do not remove.
- `supabase/functions/generate-depth-map/` — Not in CLAUDE.md frozen list but treat as frozen.
- `three-web` package alias — Verify SparkJS dependency before removing.

---

## Revised Session Plan

| Session | Status | Notes |
|---|---|---|
| Session 0 | ✅ DONE | All tasks complete |
| Session 1 | Full build needed | 2–3 hours — fix `any` types, get `tsc --noEmit` clean |
| Session 2 | Full build needed | 3–4 hours — PostHog + Sentry |
| Session 3 | Reduced scope | 2–3 hours — verify end-to-end, add tracking event, test |
| Session 4 | Full build needed | 3–4 hours — CSS tokens, error states, skeletons |
| Session 5 | Full build needed | 2–3 hours — Vercel deploy, domain, smoke test |
| Sessions 6–8 | Future planning needed | Scope TBD in pre-milestone conversations |

**Realistic total remaining build time: 12–18 hours across Sessions 1–5**

---

## Summary of Critical Issues (Priority Order)

1. **`replicate` not in package.json** — Install immediately: `pnpm add --filter web replicate`. May cause build failure.
2. **`posthog-js`, `@sentry/nextjs` missing** — Install in Session 2.
3. **7 `any` types in `RoomChatbot.tsx`** — Session 1 work.
4. **`middleware.ts` uses `getSession()` not `getUser()`** — Low risk but fix in Session 1.
5. **Hardcoded hex colors** in 3 files — Session 4 work.
6. **Tailwind `navy.deep` color mismatch** — Session 4 work.
7. **CLAUDE.md lists only 6 Edge Functions** but 9 exist — Update CLAUDE.md to note all 9 are frozen.
