# Cova Codebase Audit — 2026-04-21

**Repo:** github.com/pgoel813/cova
**Scope:** apps/web, modal_pipeline, supabase, scripts
**Supabase project:** xdeacbmkdwqrwxonqaqh
**Author:** Autonomous audit (7 parallel Explore agents + synthesis)
**CLAUDE.md spec version:** v7 (April 1, 2026)

---

## Executive Summary

### Total files audited
- **apps/web**: 58 API route files, 31 page files, 51 components, ~40 lib files
- **modal_pipeline**: 28 Python files + 2 package sub-dirs (lib/, style_rules/, catalog_data/, luts/)
- **supabase**: 78 migration files (62 applied + 10 .bak + 1 _deferred), 11 Edge Functions
- **scripts**: 40+ TypeScript + Python scripts in scripts/; 54 `.mjs` one-shot fix scripts at repo root
- **Estimated total source files inspected**: ~400

### Current working features (genuinely end-to-end)
1. **Auth — Google OAuth + email/password**. Forgot-password and email sign-up are stubs.
2. **Style quiz (steps 1→3)** — Bayesian 12-dim fingerprint computed, persisted to `style_fingerprints` and `users.style_fingerprint`.
3. **Style blend reveal + tweak (steps 3b, 4)** — full UI with live preview, Claude Haiku free-text tweak.
4. **Budget + photo capture (steps 5, 6)** — upload path, QR-to-mobile handoff, server-side sharp EXIF fix, mobile `[token]` page.
5. **Constraints + keep/remove (steps 7, 7b, 7c)** — Modal pre-detect + EVF-SAM2 mask overlay, per-item decisions.
6. **Personalization chain (7e→7f→7g→7h→7d)** — smart tech, art, lifestyle, required object, tabbed chat.
7. **v9 Redesign render** — `cova-redesign` Modal app deployed and callable via `/api/pipeline/redesign`; 14/15 rooms beat Collov at Phase 5 closeout.
8. **v9 Empty-room render (Gemini V3)** — `cova-empty-room-v3` (`empty_room_gemini.py`) deployed; **gated by missing `COVA_EMPTY_ROOM_V3_URL` env var — will runtime-error** until set.
9. **Cache-aware empty-room endpoint** — `/api/render/empty-room` with SHA-256 input hash + `empty_room_cache` table + cost logging.
10. **Render reveal + refinement (8a, 8b)** — polling + before/after slider; refinement capped at 3; vibe sliders partially wired (TODO).
11. **Shoppable hotspots (9)** — reads `rooms.room_products` populated by `/api/pipeline/furniture-match` (Serper + Google Lens).
12. **Dashboard/profile** — live Supabase for profile; **dashboard and saved views run on hardcoded mock data**.

### Biggest gaps between current state and target product
1. **Token system is an in-memory stub** (`lib/tokens.ts`). DB schema exists (`token_transactions` + `deduct_tokens_atomic` RPC) but application code never calls it. Cold starts reset balances to 100. Any billing/paid-retry feature is load-bearing on this stub.
2. **Empty-room V3 is not wired in production**: `COVA_EMPTY_ROOM_V3_URL` is absent from env; `/api/render/empty-room` will throw on first call until the env var is populated.
3. **Two parallel redesign pipelines** coexist: V8 orchestrator (`cova-redesign-pipeline` → `generation.py`) is still the active `REDESIGN_PIPELINE_WEBHOOK_URL`; V9 `cova-redesign` is deployed but its env var is unset.
4. **`/api/rooms/[roomId]` PATCH accepts arbitrary body** — authenticated users can overwrite any column on their own rooms row, including `render_url`, `redesign_status`, potentially `user_id`. Critical security gap.
5. **`/api/quiz/validation-renders` has no auth check** — unauthenticated callers can trigger 3 Replicate FLUX 1.1 Pro renders.
6. **Style names leaking into user-facing UI**: step-3b/step-4/step-9 explicitly or via chip suggestions reference hardcoded style vocabulary — CLAUDE.md Rule 8 forbids exposing names (Japandi, Bohemian, Coastal, Mid-Century, Minimalist).
7. **Dashboard + Saved + Budget + Chatbot + Product Panel pages** use hardcoded mock data or are test harnesses.
8. **Admin dashboard does not exist** — `/api/admin/render-costs` route built but zero UI consumers.
9. **15-room benchmark runner is script-only** — `bench/scripts/run_phase_5_redesign_bench.py` + `run_phase_5_judge.py` are CLI tools with no UI surface.
10. **5 Supabase Edge Functions using deprecated Replicate** are still wired via environment for the legacy render path.
11. **Database has 78 migrations with messy renames**: `products` → `products_v1` was done outside migration history; HNSW migration (20260419000003) is marked file-only and may not be applied; 5 tables (`style_fingerprints`, `swipe_history`, `interactions`, `render_sessions`, `style_sessions`) exist in the live DB without CREATE TABLE migrations.

### Highest priority issues to fix before building new features
| # | Issue | Impact | File(s) |
|---|---|---|---|
| 1 | **PATCH `/api/rooms/[roomId]` accepts arbitrary body** | Any authenticated user can tamper with any column on their rooms. | `app/api/rooms/[roomId]/route.ts` |
| 2 | **`/api/quiz/validation-renders` has no auth** | Anonymous Replicate abuse vector. | `app/api/quiz/validation-renders/route.ts` |
| 3 | **`COVA_EMPTY_ROOM_V3_URL` unset** | `/api/render/empty-room` + `/api/render/retry` throw at runtime. | `.env.local` |
| 4 | **Tokens system is in-memory stub** | Paid retries silently unbilled across cold starts. | `lib/tokens.ts` |
| 5 | **Two parallel redesign pipelines** | V9 `cova-redesign` is ready but `COVA_REDESIGN_URL` isn't set; V8 still active via `REDESIGN_PIPELINE_WEBHOOK_URL`. | `.env.local`, `lib/ai/redesign-client.ts` |
| 6 | **LoRA registry mismatches documentation** | CLAUDE.md lists triggers `cvlux, cvmax` that don't exist in the actual registry; `COVAMINIMAL` collides onto `cvscn` (Scandinavian's trigger). | `lib/styles/lora-registry.ts` |
| 7 | **HNSW index migration file-only** | `products_v1` pgvector search may not have a functional index in prod. | `supabase/migrations/20260419000003_fix_hnsw_targeting.sql` |
| 8 | **54 `fix_*.mjs` scripts at repo root** | Repo hygiene — noise, risk of accidental execution. | repo root |
| 9 | **Service-role bypass uses `===` plain string comparison** in 3 routes | Timing-safe comparison needed. | `detect/render`, `pipeline/furniture-match`, `test-pipeline` |
| 10 | **289 `console.log/warn/error` in production paths** | Observability leak; logger abstraction exists but unused. | 30+ files |

### Estimated scope of UI rebuild
The current UI is a patchwork of real working flows (quiz → capture → render → hotspots) and placeholder/mock pages (dashboard, saved products, budget, chatbot, product panel, 3D viewer, AuthModal). Steps 1–9 of the design flow are genuinely working but have accumulated technical debt in the form of step-7d/e/f/g/h undocumented deviation from CLAUDE.md, partial wiring of refinement sliders, mixed Replicate/fal.ai usage, and hardcoded mock data in auxiliary screens.

**Rebuild scope estimate:**
- **Keep as-is (major rework inadvisable):** landing page, auth, steps 1–3b (quiz), steps 5–7c (capture + constraints), step-8a render reveal
- **Partial rework:** step-4 (tweak), step-7d (chatbot), step-7e/f/g/h (personalization — reorder/simplify per target spec's "6 slots" model), step-8b (refinement sliders), step-9 (hotspots — real product data wiring, not CDN fallbacks)
- **Full rebuild:** /dashboard, /dashboard/saved, /dashboard/settings (mocked), /budget (test page), /chatbot (test harness), /product-panel (test harness), admin cost dashboard (doesn't exist)
- **Delete:** /room/[roomId]/3d (disabled per CLAUDE.md), AuthModal, RoomMeasure, CardStack, ConfidenceBar, ReturningUserStrip, StepIndicator, ShopRoom (unused)
- **Total UI rebuild surface**: ~15 pages touched, ~20 components rebuilt or deleted, ~2 new admin pages.

---

## Section 1 — App Architecture

### 1.1 Framework + versions
- **Next.js**: 14.2.35 (exact, frozen per CLAUDE.md)
- **React / React DOM**: 18.3.1 (pinned via pnpm overrides at root)
- **TypeScript**: ^5.3.0 at root; ^5 in apps/web; strict, noImplicitAny, strictNullChecks, noUnusedLocals/Parameters all enabled; `target: esnext`, `moduleResolution: bundler`
- **Package manager**: pnpm 10.33.0
- **Build orchestrator**: Turbo (latest)
- **Mobile (frozen)**: Expo 52.0.49, RN 0.76.9

#### Key apps/web deps (from package.json)
| Package | Version | Purpose |
|---|---|---|
| `next` | 14.2.35 | Framework |
| `react` / `react-dom` | ^18 | UI |
| `@supabase/ssr` | ^0.10.0 | SSR/cookie auth |
| `@supabase/supabase-js` | ^2.101.0 | DB client |
| `@anthropic-ai/sdk` | ^0.82.0 | Claude API |
| `@fal-ai/client` | ^1.9.5 | fal.ai FLUX |
| `@fal-ai/server-proxy` | ^1.2.1 | fal proxy route |
| `@google/generative-ai` | ^0.24.1 | Gemini room analysis |
| `@sparkjsdev/spark` | ^0.1.10 | 3D splat viewer |
| `@sentry/nextjs` | ^9.0.0 | Errors |
| `@radix-ui/react-{alert-dialog,dropdown-menu,switch}` | latest | UI primitives |
| `three` | ^0.183.2 | THREE.js (CLAUDE.md disagrees, says 0.155.0 — discrepancy) |
| `zustand` | ^5.0.12 | Client state |
| `zod` | ^3.25.28 | Schema validation |
| `framer-motion` | ^12.38.0 | Animations |
| `jose` | ^6.2.2 | JWT for QR capture |
| `lucide-react` | ^1.7.0 | Icons |
| `posthog-js` | ^1.257.2 | Analytics |
| `react-qr-code` | ^2.0.18 | QR codes |
| `replicate` | ^1.0.1 | Replicate (legacy/deprecating) |
| `sharp` | ^0.34.5 | Server image processing |
| `sonner` | ^2.0.7 | Toast notifications |
| `tailwindcss` | ^3.4.1 | CSS |
| `tailwind-merge` | ^3.5.0 | class-name utility |
| `clsx` | ^2.1.1 | class-name utility |

#### Dev deps
Playwright 1.59.1, Vitest 4.1.2, Testing Library 16/6, MSW 2.13.2, fast-check 4.6.0, ESLint 8, jsdom 29, supertest 7.2.2, @vitejs/plugin-react 6.

### 1.2 Monorepo structure
```
/Users/daksh/Desktop/cova/
├── apps/
│   ├── web/                       [ACTIVE — Next.js 14 App Router]
│   │   ├── app/, components/, lib/, types/, public/
│   │   ├── scripts/, tests/, __tests__/, docs/, fixtures/
│   │   ├── middleware.ts, next.config.mjs, tailwind.config.ts
│   │   ├── playwright.config.ts, vitest.config.ts, sentry.*.config.ts
│   │   └── CLAUDE.md (mirror)
│   └── mobile/                    [FROZEN — V0 iOS Expo app, never modify]
├── packages/shared/
├── modal_pipeline/                [Python GPU pipeline — 28 files]
├── scripts/                       [TS + Python utility scripts]
├── supabase/                      [migrations/ (78), functions/ (11), tests/]
├── docs/, bench/, experiments/, data/, training-data/
├── lora-training/, lora-backups/, styles/, anchor-images/
├── swipe-pairs/, tests/, ios/, eas.json
├── CLAUDE.md, turbo.json, pnpm-workspace.yaml, vercel.json, tsconfig.json
├── 54 × fix_*.mjs                 [REPO CRUFT — one-shot patch scripts, should be deleted]
├── generate_quiz_images.py, resume_quiz_images.py (experiments)
├── diagnostic_report.json, test_flythrough_verify.json (debug artifacts)
├── FINAL_AUDIT_REPORT.md (stale audit — move to docs/ or delete)
└── .env.local [root-level — harmless to runtime but risky for tool scanners]
```

### 1.3 Deployment (Vercel)
**`vercel.json`**:
- `buildCommand`: `pnpm --filter web run build`
- `outputDirectory`: `.next`
- `installCommand`: `pnpm install`
- `framework`: `nextjs`
- `regions`: `["sfo1"]`

### 1.4 Middleware (`apps/web/middleware.ts`)
- Uses Supabase SSR client with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; cookie session refresh on every matched request
- **Protected page routes** (redirect to `/auth?next=<path>`): `/design/step-2` through `/design/step-9`, `/dashboard`
- **Public API routes** (no auth): `/api/quiz/fingerprint`, `/api/quiz/next-pair`, `/api/quiz/next-card`, `/api/quiz/mood-strip`, `/api/quiz/mood-board`, `/api/quiz/validation-renders`, `/api/style-references/match`, `/api/rooms/public-count`, `/api/test-pipeline`, `/api/pipeline` (pipeline routes enforce own auth + dev bypass)
- **Protected API routes**: all other `/api/*` → 401 if unauthenticated
- **Authenticated user at `/`** → redirect to `/dashboard`
- Matcher excludes: `_next/static`, `_next/image`, `favicon.ico`, `api/dev`, static asset extensions
- **Side effect**: Because `api/dev` is excluded from the matcher, `/api/dev/rerun` and `/api/dev-log` bypass all auth (dev-only intent, but they ship to prod).

### 1.5 Environment variables (complete enumeration)

**Required at runtime (apps/web):**
| Var | Read in | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 30+ files | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 30+ files | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | admin.ts, pipeline routes | Server-only service role |
| `SUPABASE_JWT_SECRET` | capture token routes | Signs/validates QR JWTs |
| `FAL_KEY` | lib/fal.ts, pipeline routes | fal.ai auth |
| `ANTHROPIC_API_KEY` | 15+ files | Claude API |
| `REDESIGN_PIPELINE_WEBHOOK_URL` | pipeline/redesign, test-pipeline | V8 Modal orchestrator webhook |

**Optional (with defaults in code):**
`REPLICATE_API_TOKEN`, `SERPER_API_KEY`, `SEARCHAPI_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `GEMINI_API_KEY` (code) / `GOOGLE_GENERATIVE_AI_API_KEY` (CLAUDE.md — mismatch), `UNSPLASH_ACCESS_KEY`, `AMAZON_AFFILIATE_TAG`

**Affiliate IDs (all optional, degrade silently):**
`ARTICLE_AFFILIATE_ID`, `CRATE_BARREL_AFFILIATE_ID`, `CB2_AFFILIATE_ID`, `WEST_ELM_AFFILIATE_ID`, `POTTERY_BARN_AFFILIATE_ID`, `RUGGABLE_AFFILIATE_ID`, `ONE_KINGS_LANE_AFFILIATE_ID`, `OVERSTOCK_AFFILIATE_ID`, `ETSY_AFFILIATE_ID`, `TARGET_AFFILIATE_ID`

**Modal service URLs (optional overrides):**
`COVA_PERCEPTION_URL`, `COVA_EMPTY_ROOM_URL`, `COVA_REDESIGN_URL`, `COVA_EMPTY_ROOM_V3_URL` (required, no default), `GROUNDED_SAM2_URL`, `LAYERED_SEGMENTATION_URL`, `PRE_DETECTION_WEBHOOK_URL`, `FURNITURE_MATCHING_WEBHOOK_URL`, `DEPTHFLOW_WEBHOOK_URL`, `DEPTH_VIDEO_WEBHOOK_URL`

**Feature flag + pipeline control:**
`COVA_RENDER_PIPELINE`, `COVA_V3_ROLLOUT_PERCENTAGE`, `ADMIN_TEST_USER_IDS`, `PIPELINE_MODE`

**Infrastructure + test:**
`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `MARBLE_API_KEY`, `APIFY_API_TOKEN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VERCEL_URL`, `NODE_ENV`, `E2E_PORT`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `E2E_BASE_URL`, `TEST_EMAIL`, `TEST_PASSWORD`, `CI`, `PORT`, `NEXT_PUBLIC_TEST_USER_ID`

**Stripe (declared in .env.example, not wired):**
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**Checklist-only:**
`FINGERPRINT_SAVE_VERIFIED`

**Modal pipeline (Python `os.environ`):**
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY` (legacy alias), `NEXT_PUBLIC_SUPABASE_URL` (alias), `ANTHROPIC_API_KEY`, `FAL_KEY`, `APIFY_TOKEN`, `MODAL_TASK_ID`, `ENVIRONMENT`, `COVA_MASK2FORMER_V3_URL`

**Supabase Edge Functions (Deno):**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REPLICATE_API_TOKEN`, `REPLICATE_LORA_MODEL_ID`, `REPLICATE_LORA_VERSION`, `ANTHROPIC_API_KEY`, `HUGGINGFACE_API_TOKEN`

**scripts/ additional:**
`SKETCHFAB_API_KEY`, `POLY_PIZZA_API_KEY`, `PEXELS_API_KEY`, `FLICKR_API_KEY`, `AMAZON_PARTNER_TAG`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SEGMENTATION_URL`, `API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL` (plain)

### 1.6 Feature flags

**`lib/features.ts` — Render pipeline version flag** (only formal flag module):
`getRenderPipelineVersion(userId?): "v2" | "v3"` evaluates in order:
1. `COVA_RENDER_PIPELINE` hard pin
2. `ADMIN_TEST_USER_IDS` allowlist → always v3
3. `COVA_V3_ROLLOUT_PERCENTAGE` FNV-1a hash bucket (default 0)
4. Default `"v2"`

**`lib/pipelineConfig.ts` — Pipeline mode config**:
`PIPELINE_MODE` env var (default `full`). Variants: `full`, `mini_both`, `mini_async_plus`, `multi_image`, `pansplat` — affects cost, time, capture mode, 3D model choice.

**Other flag-like patterns**: none. No `FEATURE_*`, `FLAG_*`, `enableXxx` patterns in runtime code.

**`MARBLE_DISABLED`** — inline code marker in `lib/marble.ts`; all Marble functions throw unconditionally.

---

## Section 2 — Complete UI Inventory

### 2.1 Pages (31 pages + 2 layouts + 1 auth callback route)

#### Layouts
| Path | File | Notes |
|---|---|---|
| (root) | `app/layout.tsx` | Loads 5 fonts (EB Garamond, Inter, Playfair Display, DM Sans, Geist mono); wraps in AnalyticsProvider + Sonner Toaster. Working. |
| `/dashboard` | `app/dashboard/layout.tsx` | Server component; redirects to `/` if unauth'd; top nav (logo, "Design New Room", AvatarDropdown). Working. |

#### Routes
| Route | File | Renders | State | Key calls |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Marketing landing (hero scroll, before/after slider, stat counters, hotspot preview) | Working | none |
| `/auth` | `app/auth/page.tsx` | Sign-in (email/password + Google OAuth) | Partial — forgot-password + sign-up stubs | `supabase.auth.signIn*` |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth code exchange + pre-auth fingerprint persist | Working | admin client write |
| `/dashboard` | `app/dashboard/page.tsx` | Rooms gallery + style DNA radar | **Mocked data** (roomData/productData/activityData hardcoded) | none |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | Server component; swatches + StyleProfile + RoomsGrid | Working | Supabase |
| `/dashboard/saved` | `app/dashboard/saved/page.tsx` | Grid/list + filter + sort | **Mocked `ProductTemplate` array** | none |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Notifications, privacy, style prefs | Working UI | — |
| `/design/step-1` | `app/design/step-1/page.tsx` | Welcome (65-particle canvas, room frame, steps grid) | Working | none |
| `/design/step-2` | `app/design/step-2/page.tsx` | Room type + 3-anchor quiz | Working | `POST /api/quiz/fingerprint` (anchor_prior) |
| `/design/step-3` | `app/design/step-3/page.tsx` | Bayesian pairwise quiz (up to 24 pairs) | Working | `POST /api/quiz/next-pair`, `POST /api/quiz/fingerprint` |
| `/design/step-3b` | `app/design/step-3b/page.tsx` | Style blend reveal + slider adjust | Working | Supabase update |
| `/design/step-4` | `app/design/step-4/page.tsx` | Fingerprint reveal + explanation + tweak | Working | `GET /api/render/status?showcase_mode=true`, `POST /api/fingerprint/explain`, `POST /api/quiz/tweak` |
| `/design/step-5` | `app/design/step-5/page.tsx` | Budget tier carousel (5 tiers) | Working | Supabase update |
| `/design/step-6` | `app/design/step-6/page.tsx` | Photo capture (Upload + QR) | Working | `POST /api/rooms/capture`, `POST /api/pipeline/pre-detect` |
| `/design/step-7` | `app/design/step-7/page.tsx` | 3D wireframe loader; polls pre_detection_result | Working | Supabase poll |
| `/design/step-7b` | `app/design/step-7b/page.tsx` | Room constraints (5 cards: structural, flooring, light, protected, requirements) | Working | Supabase write |
| `/design/step-7c` | `app/design/step-7c/page.tsx` | Keep/remove decisions + EVF-SAM2 mask overlay | Working | `POST /api/pipeline/segment-masks` |
| `/design/step-7e` | `app/design/step-7e/page.tsx` | Smart tech personalization (fal.ai live preview per selection) | Working | fal.ai via proxy |
| `/design/step-7f` | `app/design/step-7f/page.tsx` | Art layout (5 options) | Working (uses deprecated Replicate) | `POST /api/generate-art` |
| `/design/step-7g` | `app/design/step-7g/page.tsx` | Lifestyle questions | Working | Supabase write |
| `/design/step-7h` | `app/design/step-7h/page.tsx` | Required-object free-text | Working | Supabase write |
| `/design/step-7d` | `app/design/step-7d/page.tsx` | Tabbed chatbot (All/Products/Tech/Art) | Working | `POST /api/design-chat`, `POST /api/pipeline/redesign` |
| `/design/step-8a` | `app/design/step-8a/page.tsx` | Render reveal + before/after slider | Working | Supabase poll (3s, 3-min timeout) |
| `/design/step-8b` | `app/design/step-8b/page.tsx` | Refinement (specific / vibe / layout / direction) | **Partial** — vibe sliders not wired (`STYLE_STRENGTH_DEFAULT` TODO) | `POST /api/render/refine` |
| `/design/step-9` | `app/design/step-9/page.tsx` | Shoppable hotspots + product panel | Working UI; some CDN fallback images | Supabase read |
| `/budget` | `app/budget/page.tsx` | Test/stub bottom-sheet budget calculator | **Dead code**, hardcoded arrays | none |
| `/chatbot` | `app/chatbot/page.tsx` | Chatbot test harness | **Dead code** | none |
| `/product-panel` | `app/product-panel/page.tsx` | Product panel test harness | **Dead code** | none |
| `/capture/new` | `app/capture/new/page.tsx` | Creates capture room, redirects | Working | `POST /api/rooms/create` |
| `/capture/[roomId]` | `app/capture/[roomId]/page.tsx` | Desktop capture hub (QR/Upload) | Working | Supabase |
| `/capture/mobile/[token]` | `app/capture/mobile/[token]/page.tsx` | Mobile camera capture flow | Working | `POST /api/capture/validate-token`, `POST /api/rooms/capture` |
| `/room/[roomId]/3d` | `app/room/[roomId]/3d/page.tsx` | 3D splat viewer + hotspots | Partial (3D disabled per CLAUDE.md but reachable; mocked products) | THREE.js + SparkJS |

### 2.2 Components (51 files across 10 subdirs)

**auth/** — `AuthModal.tsx` (stub — orphan, not imported).
**capture/** — `CaptureResult`, `CompletionScreen`, `MobileCapture`, `ModeSwitcher`, `QRCapture`, `QRMode`, `QualityChecker`, `RoomMeasure` (dead — WebXR experiment), `UploadFallback`, `UploadMode`. All working except RoomMeasure.
**chat/** — `ChatBubble`, `ChatInput` (TODO marker on attach), `ChatMessage`, `ChatPanel`, `ProductSearchResult`, `SuggestionChips` (8 hardcoded suggestions), `TypingIndicator`. All working.
**cova/** — `CovaButton`, `CovaCard`, `CovaInput`, `GoldDivider`, `ShopRoom` (unused — possibly dead), `StepIndicator` (unused — steps use inline progress). Design-system primitives.
**dashboard/** — `AvatarDropdown`, `DeleteAccountButton` (stub, calls `alert()`), `DesignDnaShare`, `NewRoomCTA`, `RoomCard`, `RoomsGrid`, `SavedProductCard`, `StatsRow`, `StyleProfile`. Mostly working; DeleteAccountButton is non-functional.
**layout/** — `AppShell.tsx` (unused in current flow; wraps with ChatBubble + ChatPanel).
**product/** — `ProductCard`, `ProductImageGallery`, `ProductPanel`, `SimilarItems`. Working.
**providers/** — `AnalyticsProvider` (PostHog page tracking), `GlobalErrorCapture`. Working.
**quiz/** — `CardStack` (unused), `ConfidenceBar` (unused), `ReturningUserStrip` (unused), `SwipeCard` (used only by dead CardStack). Mostly dead — step-2/3 have inline quiz UIs.
**render/** — `RetryButton` (full empty-room retry logic; **not wired to any page**).
**Top-level** — `FurnitureHotspots`, `RoomChatbot`, `SplatViewer`. Working but depend on disabled 3D feature.
**ui/** — `alert-dialog.tsx`, `dropdown-menu.tsx`, `switch.tsx` (Radix wrappers; switch.tsx unused).

### 2.3 Design system

**CSS approach:** Tailwind 3.4 + CSS custom properties via `/Users/daksh/Desktop/cova/styles/tokens.css` (imported by `apps/web/app/globals.css`).

**Color palette (from tokens.css):**
| Token | Value | Purpose |
|---|---|---|
| `--cova-bg` | `#0A1628` | Page background |
| `--cova-surface` | `#0F1F3D` | Cards/panels |
| `--cova-surface-2` / `-3` | `#132847` / `#1A3258` | Elevated surfaces |
| `--cova-border` | `#1E3A5F` | Borders |
| `--cova-border-gold` | `rgba(201,168,76,0.20)` | Gold-tinted borders |
| `--cova-gold` | `#C9A84C` | Primary CTA |
| `--cova-gold-light` | `#F0D080` | Subtle gold |
| `--cova-gold-dim` | `rgba(201,168,76,0.30)` | Dim gold backgrounds |
| `--cova-ivory` | `#F8F6F1` | Primary text |
| `--cova-muted` | `#8BA3C0` | Secondary text |
| `--cova-success` | `#4A9B7F` | |
| `--cova-error` | `#C0504A` | |
| `--cova-warning` | `#D4A017` | |
| `--cova-keep` / `-bright` | `#1A7A4A` / `#2ECC71` | Keep (step-7c) |
| `--cova-remove` | `#E74C3C` | Remove (step-7c) |

**Typography:**
- Heading: EB Garamond (serif)
- UI: Inter (sans-serif)
- Mono: JetBrains Mono
- Additional Next.js-loaded: Playfair Display (400/500/600/700, italic), DM Sans (400/500/600), Geist mono (local .woff)

**Font-size scale:** `--text-xs` 12px → `--text-5xl` 48px (8 steps).
**Spacing scale:** `--space-xs` 4px → `--space-2xl` 48px (6 semantic + 12-step numeric).
**Radius:** 12px card, 8px input, 24px pill, 6px sm.
**Motion:** 150 / 200 / 350 / 500ms tokens.

**Component library:** shadcn/ui (`components.json`: default style, slate base color, RSC enabled, CSS variables true, TSX enabled). Only 3 Radix primitives in use: AlertDialog, DropdownMenu, Switch.

### 2.4 User flow trace (as implemented)

```
/  →  /auth  →  /design/step-1  →  step-2  →  step-3  →  step-3b
  →  step-4  →  step-5  →  step-6  →  step-7 (loading)
  →  step-7b (constraints)  →  step-7c (keep/remove)
  →  step-7e (smart tech)  →  step-7f (art)  →  step-7g (lifestyle)
  →  step-7h (required object)  →  step-7d (chatbot)
  →  "Design My Room" → POST /api/pipeline/redesign
  →  step-8a (reveal)  →  step-8b (refine)  →  step-9 (hotspots)
```

**Deviations from CLAUDE.md:**
1. CLAUDE.md describes `step-7b → step-7c → step-7d` but actual flow inserts 7e/7f/7g/7h in between.
2. CLAUDE.md lists 7d personalization as "All / Tech / Products / Art" but UI currently renders "All / Products / Tech / Art" with step-7e/f separately handling most tech/art work before the chatbot.
3. `/room/[roomId]/3d` is reachable despite CLAUDE.md listing 3D/panorama as disabled.
4. `/api/generate-art` (fired at step-7f) uses Replicate — CLAUDE.md says Replicate is being deprecated, only fal.ai allowed.
5. THREE.js frozen version mismatch (package.json ^0.183.2 vs CLAUDE.md 0.155.0).
6. Dashboard + Saved are fully mocked.

---

## Section 3 — Complete API Routes Inventory

**58 route files across 23 top-level directories.**

### `/api/admin`
| Route | File | Method | Auth | State | Issues |
|---|---|---|---|---|---|
| `/api/admin/render-costs` | `app/api/admin/render-costs/route.ts` | GET | Yes + `isAdmin()` env allowlist | Working — zero UI consumers | Env-var RBAC; no rate limit |

### `/api/capture`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/capture/generate-token` | POST | No (open) | Working | `SUPABASE_JWT_SECRET!` unchecked; `NEXT_PUBLIC_APP_URL` falls back to localhost; no rate limit |
| `/api/capture/validate-token` | POST | No | Working | Token payload's `userId` is always undefined (generate never sets it); no rate limit |

### `/api/chat`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/chat` | POST | Yes | Working — streaming | Uses `claude-sonnet-4-20250514` (inconsistent with rest of codebase); inline Unsplash placeholder URLs in system prompt; no rate limit |
| `/api/chat/history` | GET | Yes | Working | Uses admin client after user check (bypasses RLS); no rate limit |

### `/api/design-chat`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/design-chat` | POST | Yes | Working | Fire-and-forget to `/api/generate-art` forwards cookie header; `maxDuration=90`; no per-user rate limit |

### `/api/design-dna`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/design-dna/card` | POST | Yes | Working — zero UI consumers | Unused import `RENDER_CONFIG` |

### `/api/detect`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/detect/material` | POST | Yes | Working — no UI caller | `maxDuration=60`; no rate limit |
| `/api/detect/render` | POST | Yes + service-role bypass | Working | Non-constant-time string compare on service key; no rate limit |
| `/api/detect` | POST | Yes | Working | Returns `{success:false}` with HTTP 200 on pipeline fail |
| `/api/detect/status` | GET | Yes | Working | 401 body is `{ready:false}` (inconsistent); polled endpoint with no rate limit |

### `/api/dev`, `/api/dev-log`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/dev/rerun` | POST | None (NODE_ENV guard) | Dev-only; bypasses middleware via matcher exclusion | Hardcoded localhost:3001; service-role bypass path |
| `/api/dev-log` | POST | None | Dev-only | User-supplied `sessionId.slice(0,8)` in file path (path-traversal surface in 8 chars) |

### `/api/fal`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/fal/proxy` | GET+POST | No (fal proxy pattern) | Working | Standard fal proxy — no per-IP rate limit, exposes account to abuse |

### `/api/fingerprint`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/fingerprint/explain` | POST | Yes | Working | Model `claude-haiku-4-5-20251001` non-standard name; no rate limit |

### `/api/generate-art`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/generate-art` | GET+POST | Yes | Working | **Uses Replicate (deprecated per CLAUDE.md)**; fires 4 parallel FLUX Schnell; silent empty-array fallback |

### `/api/interactions`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/interactions` | POST | Yes | Working | Always returns `{success:true}` regardless of DB write; `product_id` always null |

### `/api/local-ip`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/local-ip` | GET | No | Working (dev utility; exposes container IP in prod) | Information leak |

### `/api/match`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/match/accessories` | POST | Yes | Working | No guard if `SERPER_API_KEY` absent; no rate limit |
| `/api/match/coherence` | POST | Yes | Working | `new Anthropic()` no explicit key; silent fallback |
| `/api/match/complete-room` | POST | Yes + rate limit | Working | Uses `claude-sonnet-4-5`; `host` header used for internal URL (spoofable) |
| `/api/match/room-budget` | POST | Yes + rate limit | Working | Accepts `budget_range` then voids it |
| `/api/match` | POST | Yes + rate limit | Working | **Uses Replicate CLIP (deprecated)**; `console.warn` exposes env presence |

### `/api/parallax`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/parallax` | POST | Yes | Working if DEPTHFLOW_WEBHOOK_URL set; returns null gracefully otherwise | Uses deprecated `getSession()`; 170s timeout; feature listed disabled |

### `/api/parse-constraints`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/parse-constraints` | POST | Yes + rate limit | Working | Non-standard model name; silent empty-array on parse fail |

### `/api/pipeline`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/pipeline/furniture-match` | POST | Yes + service-role bypass | Working | 10s blocking `setTimeout`; data-loss path on delete-succeeded-insert-failed; plain-string service-key compare |
| `/api/pipeline/pre-detect` | POST | Yes | Working | Backfill write failure warned-only; no rate limit |
| `/api/pipeline/redesign` | POST | Yes + dev service-role bypass | Working — longest route | Fire-and-forget `void` DB writes without error surface; no rate limit |
| `/api/pipeline/segment-masks` | POST | Yes | Working | 4-strategy fallback waterfall; no rate limit |

### `/api/quiz`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/quiz/fingerprint` | POST | Optional (session-token pre-auth) | Working | Multiple `as any` casts; `?debug=true` exposes algorithm state; no rate limit |
| `/api/quiz/mood-board` | POST | No | Working | Admin client for public-read; no auth |
| `/api/quiz/mood-strip` | POST | No | Working | Admin client for public-read |
| `/api/quiz/next-card` | GET+POST | No | Working | Admin client; hardcoded project-ID URL |
| `/api/quiz/next-pair` | POST | No | Working | Admin client; extensive `console.log` debug output left in prod |
| `/api/quiz/style-preview` | POST | Yes | Working | Hardcoded base room URLs; inline style descriptors |
| `/api/quiz/tweak` | POST | Yes | Working | 2 sequential Claude calls per req; non-type-safe V1→V2 mapping |
| `/api/quiz/update-fingerprint` | POST | Yes | Working | Multiple `as any` casts |
| `/api/quiz/validation-renders` | POST | **NONE** | Working but **critical auth gap** | Anonymous callers trigger 3 Replicate FLUX 1.1 Pro renders; 120s blocking poll |

### `/api/render`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/render/empty-room` | POST | Yes | Working (v3 only; 409 for v2 users) | Token race (pre-flight vs post-charge); depends on unset `COVA_EMPTY_ROOM_V3_URL` |
| `/api/render/from-context` | POST | Yes + rate limit | Working | Schnell preview failure non-fatal |
| `/api/render/previews` | POST | Yes | Working | `roomType` hardcoded to `"living room"` |
| `/api/render/previews/status` | GET | Yes | Working (uses Replicate) | |
| `/api/render/refine` | POST | Yes | Working | Refinement count from `render_sessions.count-1`; 403 on max (should be 429) |
| `/api/render/retry` | POST | Yes | Working | Hour-bucket rate-limit via upsert — stale on DB failure |
| `/api/render` | POST | Yes + rate limit | Working — legacy Area1 path | Uses Replicate for Schnell preview |
| `/api/render/status` | GET | Yes | Working — highly stateful | Hardcoded `covainterior.com` swap; 20s setTimeout blocks serverless |
| `/api/render/tweak` | POST | Yes | Working | Duplicated `generateBboxMask` with `/api/swap`; hardcoded cost estimates |
| `/api/render/tweak/status` | GET | Yes | Working (uses Replicate) | Ownership check happens after Replicate poll |

### `/api/rooms`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/rooms/[roomId]` | PATCH+DELETE | Yes | Working | **CRITICAL: PATCH accepts any body — user can overwrite any column** |
| `/api/rooms/capture` | POST | Yes | Working | No MIME validation; sharp output may exceed 10MB cap |
| `/api/rooms/create` | POST | Yes | Working | No rate limit — unlimited room creation |
| `/api/rooms/public-count` | GET | No (public) | Working | Admin client for a public count query |
| `/api/rooms/status` | GET | Yes | Working | Inline `createServerClient`; heavily polled, no rate limit |

### `/api/style-references`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/style-references/match` | POST | No | Working | No auth; admin client for public-facing op |

### `/api/swap`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/swap` | POST | Yes | Working (uses Replicate) | Duplicated `generateBboxMask` |
| `/api/swap/status` | GET | Yes | Working (uses Replicate) | Same ownership-check-after-poll issue |

### `/api/test-pipeline`
| Route | Method | Auth | State | Issues |
|---|---|---|---|---|
| `/api/test-pipeline` | POST | Service-role header (404 in prod) | Dev/test-only | Uses `buildAnchorFallbackPrompt` (not Design Director); plain-string header compare |

### Cross-cutting API issues
1. **Uses Replicate (deprecated)**: `generate-art`, `match` (CLIP batch), `quiz/validation-renders`, `render/previews/status`, `render/status`, `render/tweak/status`, `swap`, `swap/status`
2. **No auth check**: `quiz/validation-renders` (critical), `style-references/match`, `quiz/mood-*`, `quiz/next-*`, `capture/generate-token`, `capture/validate-token`, `rooms/public-count`, `local-ip`, `dev-log`, `fal/proxy`
3. **Service-key bypass with plain `===`**: `detect/render`, `pipeline/furniture-match`, `test-pipeline`
4. **PATCH body unrestricted**: `rooms/[roomId]`
5. **Inline `createServerClient` (inconsistent)**: `rooms/[roomId]`, `rooms/create`, `rooms/status`, `chat`
6. **Rate-limited only**: `match*`, `render/from-context`, `render`, `parse-constraints`. Everything else unlimited.
7. **Hardcoded `covainterior.com`**: `render/status`
8. **Unchecked `!` env assertions**: `capture/generate-token`, `capture/validate-token` on `SUPABASE_JWT_SECRET`

---

## Section 4 — Modal Pipeline + Scripts Inventory

### 4.1 Modal files grouped by status

#### DEPLOYED PRODUCTION

| File | Modal app | GPU | Entry points | Notes |
|---|---|---|---|---|
| `perception.py` | `cova-perception` | A10G | 3 endpoints: `/v1/detect_preservation_spec`, `/v1/encode_sam2_for_cache`, `/v1/depth_anything_v2` | Phase 1 complete 2026-04-20. Loads SAM 2 hiera-large, PaddleOCR, MediaPipe face. Calls fal SAM-3 + depth. `COVA_PERCEPTION_URL` absent from `.env.local`. |
| `empty_room.py` | `cova-empty-room` | A10G | `/v1/generate_empty_room` | Phase 2 done 2026-04-20, latency fix 2026-04-21. Pipeline: SAM-3 22 furniture + 5 architecture prompts → Depth-Anything Sobel edges → morph dilate → LaMa / Bria / FLUX Fill chain → Supabase rehost + SSIM quality gate. `COVA_EMPTY_ROOM_URL` absent. Doc drift: healthz says FLUX Fill primary, code says LaMa primary. |
| `redesign.py` | `cova-redesign` | A10G | `/v1/generate_redesign` | Phase 5 done 2026-04-21. LoRA stack (up to 3 style + add-details), depth ControlNet, flux-general with strength=0.55 steps=32, NB-Pro fallback. LORA_REGISTRY mirrors `apps/web/lib/styles/lora-registry.ts`. `COVA_REDESIGN_URL` absent. `FLUX_STRENGTH=0.55` contradicts inline narrative (0.65/0.78). `_generate_edge_url` deprecated-in-place. |
| `empty_room_gemini.py` | `cova-empty-room-v3` | CPU (no GPU) | `generate_empty_room_v3` | Bakeoff winner 2026-04-21 (15/15 rooms after retry). 6-step: Claude occlusion router → contextual pre-pass → nano-banana-pro edit → Claude emptiness audit → retry → verdict. **Consumed by `/api/render/empty-room` + `/api/render/retry` via `COVA_EMPTY_ROOM_V3_URL` — env var has no default and is unset → runtime error.** |
| `mask2former_service.py` | `cova-mask2former-v3` | A10G | `/v1/segment` | Architecture mask (13 ADE20K classes) via `facebook/mask2former-swin-large-ade-semantic`. Consumed only by dormant `empty_room_v3.py` + Phase A bench. |

#### EXPERIMENTAL / BAKEOFF

| File | Modal app | Notes |
|---|---|---|
| `empty_room_v2.py` | `cova-empty-room-v2` | Staging variant with Claude verify-loop; bench only. Hardcoded model name `claude-sonnet-4-5-20250929`. |
| `redesign_v2.py` | `cova-redesign-v2` | 2-pass staging redesign with axis-aware decor inpainting. Bench only. |
| `empty_room_v3.py` | **Not a Modal service** — local orchestration library | Phase A SAM3+LaMa scaffold; deprecated after Gemini won bakeoff. Still used by bench harness. Hardcodes `/Users/daksh/Desktop/cova/` paths. |
| `generation.py` | `cova-generation` (fal_image function family) | V8 generation stage, consumed by `redesign_pipeline.py`. Actively wired as the production render pipeline via V8 orchestrator webhook (`REDESIGN_PIPELINE_WEBHOOK_URL`). Uses `fal-ai/flux-pro/v1/fill`, IC-Light V2 (disabled list), AuraSR. |
| `redesign_pipeline.py` | `cova-redesign-pipeline` | V8 orchestrator, actively wired via `REDESIGN_PIPELINE_WEBHOOK_URL`. Runs preprocessing → professionalization → structural extraction → generation sequentially with idempotency. |

#### LEGACY / DORMANT

| File | Modal app | Status |
|---|---|---|
| `embed_catalog.py` | `cova-catalog-embedder` | DORMANT (header). Replicate CLIP embedding. |
| `embed_catalog_gpu.py` | `cova-clip-embedder-gpu` | DORMANT. |
| `embed_fusion_gpu.py` | `cova-fusion-embedder` | DORMANT. Fusion embeddings. |
| `clip_text_embed.py` | `cova-clip-text-embed` | Borderline dormant — referenced in `.env.local` as `CLIP_TEXT_EMBED_URL`. |
| `insert_products.py` | N/A | DORMANT. One-shot migration. |
| `scrape_catalog.py` | N/A | DORMANT. M6 Apify scraper. |
| `segmentation.py` | `cova-segmentation` | Legacy V3/V4 (OneFormer + SAM-3 + Depth). Wired via `LAYERED_SEGMENTATION_URL` but superseded. |
| `grounded_sam2_pipeline.py` | `cova-grounded-sam2` | DORMANT per header. Still in `.env.local` as `GROUNDED_SAM2_URL`. |
| `pre_detection_pipeline.py` | `cova-pre-detection` | Legacy V3/V4. Still wired as `PRE_DETECTION_WEBHOOK_URL`. |
| `preprocessing.py`, `professionalization.py`, `postprocess.py`, `mask_build.py`, `structural_extraction.py`, `scoring.py`, `spatial_templates.py`, `utils.py` | — | V8 orchestrator subroutines. |
| `restoration.py` | `cova-restoration-pipeline` | DORMANT per header. CPU crop+resize. |
| `depthflow_render.py` | `cova-depthflow` | DORMANT per header. Listed in disabled features. |
| `furniture_matching_pipeline.py` | `cova-furniture-matching` | M7 legacy. File header says "DEPRECATED — catalog-based CLIP/pgvector matching removed." |

### 4.2 scripts/ inventory

**Recent Phase A / V3 bench scripts (recent per git status):**
- `diag_phase_a.py` — single-room Phase A diagnostic (Maybe)
- `empty_room_bakeoff.py` — 10-combo bakeoff scaffold (Yes — library)
- `gemini_bench.py`, `gemini_antihallucinate.py`, `gemini_conditional.py`, `gemini_retry_experiment.py` — one-shot bakeoff experiments (Maybe — logic promoted)
- `kontext_bench.py`, `kontext_v2.py`, `kontext_v3.py` — Kontext iterations (No — lost bakeoff)
- `render_v2_single_test.py` — Phase 3 gate test (Yes — active staging harness)
- `run_phase_a_bench.py` — 16-room Phase A bench runner (Maybe)

**Catalog / scraping (mostly one-shot):**
- `scrape-all.ts`, `scrape-amazon.ts`, `scrape-ikea.ts`, `scrape-target.ts`, `scrape-wayfair.ts`, `scrape-westelm-cb2.ts`, `wayfair-only.ts`, `test-scraper.ts`, `overnight.ts`
- `backfill-embeddings.ts`, `backfill-style-tags.ts`, `backfill-affiliate-urls.ts`, `sync-loras-to-db.ts`
- `generate-all-images.ts`, `generate-swipe-cards.ts`, `generate-furniture-catalog.ts`, `generate-stock-photos.ts`, `generate-landing-assets.ts`, `generate-masks-for-room.mjs`
- `sprint4-final.ts`, `sprint10-tag-models.ts`, `close-catalog-gaps.ts`, `expand-quiz-cards.ts`, `retry-failed-cards.ts`, `fix-prices.ts`, `update-furniture-prices.ts`
- `process-and-seed-products.ts`, `seed-quiz-database.ts`, `add-affiliate-tags.sql`, `create-vector-index.sql`

**Still-relevant utilities:**
- `deploy-all.sh`, `verify-before-commit.sh`, `ci-test-loop.sh`
- `train_loras.py` (needed for retraining), `check-room-status.py`

**Python quiz/bench:**
- `generate_base_rooms.py`, `generate_quiz_pairs.py`, `generate_remaining_pairs.py`, `optimise_glb.py`, `lora_training/`, `lora-training/`

**Tests/miscellaneous:**
- `test_quiz_confidence.ts`, `test-amazon.ts`, `test-fal-controlnet.py`, `test-hf-token.ts`, `test-render-e2e.ts`

### 4.3 Key cross-cutting findings
1. **3 v9 URL env vars unset**: `COVA_PERCEPTION_URL`, `COVA_EMPTY_ROOM_URL`, `COVA_REDESIGN_URL` absent from `.env.local`; clients fall back to hardcoded defaults. `COVA_EMPTY_ROOM_V3_URL` has no fallback → guaranteed runtime error.
2. **Two parallel redesign pipelines**: V8 orchestrator is the active production webhook; V9 `cova-redesign` deployed but env var not set → V8 is the one actually called.
3. **`empty_room_gemini.py` = `cova-empty-room-v3` Modal app**; `empty_room_v3.py` = local library, not a Modal service (confusing naming).
4. **Dormant code still in `.env.local`**: `GROUNDED_SAM2_URL`, `LAYERED_SEGMENTATION_URL`, `PRE_DETECTION_WEBHOOK_URL`, `FURNITURE_MATCHING_WEBHOOK_URL`, `DEPTHFLOW_WEBHOOK_URL`, `CLIP_TEXT_EMBED_URL` all point to dormant / legacy services.

---

## Section 5 — Database Schema

**78 migration files** (62 applied + 10 `.bak` + 1 `_deferred`). Ground truth is migrations + `apps/web/lib/types/supabase.ts` generated types. Live SQL queries not possible from this context.

### 5.1 Tables (post-migrations snapshot)

#### Core tables (from migration history)
- **`public.users`** — id (FK auth.users), email, full_name, account_type (consumer|realtor), style_fingerprint JSONB, budget_dna JSONB, token_balance (default 5, CHECK ≥0), stripe_customer_id, onboarding_completed, last_active_at, created_at, tokens_enabled, plus live-DB extras: auth_provider, avatar_url, interactions_count, last_active, primary_style/weight, secondary_style/weight, style_blend, style_blend_v3. RLS: per-user SELECT/INSERT/UPDATE/DELETE all `auth.uid() = id`.
- **`public.token_transactions`** — append-only ledger: id, user_id FK, delta, reason, render_id, created_at. Plus live extras: amount, description, type. RLS: per-user.
- **`public.rooms`** — 78+ columns (largest table). Core: id, user_id FK, original_image_url, room_type (default 'living_room'), created_at. Plus: calibration_data JSONB, room_dimensions JSONB, scene_state JSONB, name, style_blend JSONB, budget, latest_render_url, render_count, status (active|archived), wall_color_extracted, redesign_status (pending default), redesign_pano_url, pre_detection_result JSONB, fixed_furniture JSONB, inpainting_mask_url, capture_photo_urls JSONB, capture_mode (multi_image default), pipeline_version (v3 default), room_analysis, room_context, room_constraints, personalization, detection_metadata, render_context, detection_status (pending|running|complete|failed), design_step, depth_map_url, canny_map_url, design_chat_history, render_detection_result, redesign_error, matched_products, generation_seed, preprocessed_image_url, professionalized_image_url, design_brief, flux_prompt, negative_prompt, aesthetic_score, unsplash_references, keep_remove_decisions, change_map_url, wall_change_requested, floor_change_requested, required_objects, personalization_context, depth_map_url_v2, flythrough_video_url/ready/duration, plus_eligible, engagement_seconds, perspective_render_url, render_ready, hotspot_timing. **DROPPED**: marble_pano_url, marble_spz_url, marble_world_id, marble_plus_pano_url, marble_plus_world_id (Marble disabled). Plus live-DB extras: constraints TEXT[], inclusions TEXT[], keep_mask, dimensions_json, fingerprint_id, splat_path, video_url, modal_job_id, preview_url, render_url, parallax_video_url, pipeline_cost_log JSONB, pipeline_mode. RLS: per-user.
- **`public.renders`** — id, room_id FK, user_id FK, style_applied, quality_tier (draft default), image_url, replicate_prediction_id, prompt_used, denoising_strength, guidance_scale, seed, status (pending|processing|complete|completed|failed|quality_rejected), brisque_score, clip_style_score, tokens_charged, created_at, laion_score, hps_score, composite_score, was_selected, loras_used, empty_room_url, stage, pipeline_version (v3 default), q_align_score. Plus live-DB extras for panorama/splat/style vector. RLS: per-user. Indexes: `idx_renders_laion_score`, `_composite_score`, `_created_at`, `_laion_high` (partial WHERE >6.0).
- **`public.chat_sessions`** — id, room_id FK, user_id FK, render_id FK SET NULL, messages JSONB[], summary, last_action_type, total_messages, created_at, updated_at. Original `chat_own` FOR ALL policy.
- **`public.chat_messages`** — id, room_id FK, user_id FK auth.users, role (user|assistant), content, image_url, tap_x/y, tool_calls JSONB, tool_results JSONB, created_at. Index `chat_messages_room_id_idx`. RLS: per-user + per-room policies.
- **`public.chat_messages_v2`** — id, session_id, user_id, role, content, metadata JSONB, created_at. Session-based, no room FK. RLS: `Users manage own chat messages` FOR ALL.
- **`public.products`** (post-rename, new schema) — id, name, image_url, affiliate_url, clip_embedding_data TEXT (not vector column), commission_rate, in_stock, price, retailer, room_types TEXT[], siglip2_embedding JSONB, dinov3_embedding JSONB, style_tags TEXT[], created_at. RLS: `products_read` SELECT authenticated, `products_service_*` writes service_role only.
- **`public.products_v1`** (legacy/canonical catalog) — migration-history schema with proper `clip_embedding vector(768)`, `clip_fusion_embedding vector(768)`, all retailer columns. CHECK retailer (18 values). **HNSW indexes declared file-only in 20260419000003 — may not exist in prod.** All FK references in supabase.ts point here, not to `products`.
- **`public.listings`** — realtor_id FK, address, description, room_ids UUID[], render_ids UUID[], shareable_slug UNIQUE (gen_random_bytes 4), vote_counts JSONB, qr_code_url, view_count, is_published. RLS: `listings_own` + `listings_public`.
- **`public.votes`** — listing_id FK, render_id FK, device_fingerprint, UNIQUE(listing_id, device_fingerprint). RLS: public insert + public read.
- **`public.jobs`** — user_id FK, job_type (render|depth_map|product_match|inpaint), status, replicate_id, input_params, result_url, error_message, created_at, completed_at. RLS: per-user.
- **`public.furniture_placements`** — room_id FK, furniture_catalog_id, position_x/y, rotation_y, scale, color_override. RLS: `placements_via_room` via EXISTS check.
- **`public.cart_items`** — user_id FK, product_id FK (→ products_v1), quantity (>0), UNIQUE(user_id, product_id). RLS: per-user.
- **`public.anchor_renders`** — style_weights JSONB, image_url, room_type, label. RLS: public read.
- **`public.rate_limits`** — user_id, action, window_start, request_count; UNIQUE triple. RLS: service-role only.
- **`public.product_impressions`**, **`public.product_interactions`** — RLS: per-user.
- **`public.redesign_feedback`** — feedback_score (1-5), UNIQUE(user_id, room_id). RLS: per-user.
- **`public.user_style_profiles`** — style_vector JSONB, swipe_count, rooms_completed, products_unlocked, products_purchased, dominant_style, style_certainty, price_range_preference, preferred_retailers TEXT[], category_affinity JSONB. Upserted by `aggregate-style-profiles` Edge Function. RLS: per-user.
- **`public.style_purchase_signals`** — style_vector GIN index, signal_type (unlocked|purchased|shared). RLS: per-user.
- **`public.room_products`** — room_id FK, product_id FK nullable (→ products_v1), furniture_label, similarity_score, rank, azimuth_degrees, is_unlocked, elevation_degrees (-25 default), visible_from/to_second, hotspot_x/y, serp_title/price/retailer/product_url/image_url, match_score/label, is_sale. RLS: per-user via room; service-role ALL.
- **`public.quiz_anchor_images`** — style_name, style_index (1-10), image_url, storage_path, style_vector JSONB, dominant_colors TEXT[], flux_prompt, round_images JSONB, room_images JSONB. RLS: public read.
- **`public.quiz_comparison_pairs`** — dimension, dimension_index, pair_index, image_a/b_url, base_room_url, flux_prompt_a/b, is_validated, room_type, style_a/b, a/b_dimension_value, is_anchor, anchor_style, dimension_tested. RLS: public read.
- **`public.saved_products`** — user_id FK, room_id FK, product_url, product_data JSONB, UNIQUE(user_id, product_url). RLS: per-user ALL with USING+WITH CHECK.
- **`public.style_loras`** — style_name, trigger_word, lora_url, recommended_scale (default 0.8), quality_score, trained_at. Plus live extras: full_trigger, training_image_count, training_steps, validation_urls JSONB. RLS: public read + service_role write.
- **`public.style_vectors`** — style_code UNIQUE, style_name, style_vector FLOAT[]. RLS: public read.
- **`public.render_comparison_pairs`** — room_id FK, render_a/b_url, winner (a|b|none), pipeline_version_a/b.
- **`public.app_config`** — key PK, value JSONB. Seeded: `pipeline_version="v3"`, `rollout_pct=100`. RLS: public read.
- **`public.sam_embeddings`** — user_id FK, image_hash, embedding BYTEA (cap 2MiB), expires_at (+30 days). UNIQUE(user_id, image_hash). RLS: per-user ALL.
- **`public.render_retries`** — user_id FK, original_render_id, free_retries_used (default 0), paid_retries_used (default 0), UNIQUE(user_id, original_render_id). RLS: SELECT own; writes service-role only.
- **`public.empty_room_cache`** — input_hash UNIQUE, empty_room_url, quality_warning, residual_items JSONB, pipeline_path, pipeline_version (v3.0 default), cost_usd, expires_at (+30 days). Service-role only.
- **`public.render_rate_limits`** — user_id PK, retries_last_hour, hour_start (date_trunc hour). RLS: SELECT own; writes service-role only.
- **`public.render_cost_log`** — render_id, user_id FK, pipeline_version, is_retry, retry_type (free|paid|NULL), cost_usd, tokens_charged, cache_hit. Service-role only.

#### Tables in live DB without CREATE TABLE migrations (confirmed via supabase.ts)
- **`public.style_fingerprints`** — id, user_id FK, vector_data JSONB, quiz_responses JSONB, covariance JSONB, confidence FLOAT8, dimensions JSONB, room_type, style_name, budget_tier, entry_path, fingerprint_version, created_at. Referenced by rooms.fingerprint_id + interactions.fingerprint_id.
- **`public.swipe_history`** — user_id FK, card_id, direction, dwell_time_ms, score_awarded, card_style, card_phase, style_vector_before/after JSONB, session_position, card_image_url. RLS enabled 20260419000000: `swipe_history_own`.
- **`public.interactions`** — user_id, room_id, product_id, fingerprint_id, action (hotspot_tap|product_view|affiliate_click|swap_*|purchase_confirmed|regenerate|refine|add_item|quiz_response), created_at.
- **`public.render_sessions`** — user_id, room_id FK, status, render_url, video_url, iteration (default 1), prompt, style_strength, parallax_video_url, preview_url, created_at. RLS: per-user ALL.
- **`public.style_sessions`** — user_id, capture_session_id, swipes JSONB, style_fingerprint JSONB, confidence, completed, budget_tier, budget_range, created_at. RLS: per-user.
- **`public.click_events`** — user_id FK, product_id FK (→ products_v1), render_id FK, session_id, affiliate_url, retailer, created_at.
- **`public.rate_limit_events`** — user_id FK, endpoint, created_at.

### 5.2 Migrations — 78 files in order
Full per-file annotations provided in Section 5 source (see file-level summary in the Section 5 agent output). Key inflection points:
- `20240001–20240010` — foundation (users, rooms, renders, chat, products, listings, votes, jobs, RLS, storage RLS)
- `20240012–20240020` — products vector dim wars (768 → 1024 → back to 768)
- `20240021–20240023` — renders.status CHECK expansions
- `20240025` — adaptive quiz system
- `20240029–20240030` — RLS security audit + fix per-op policies
- `20240031–20240032` — style data moat (swipe_history enrichment, product_impressions/interactions, redesign_feedback, user_style_profiles, style_purchase_signals)
- `20240036, 20240050` — Marble columns (later dropped)
- `20240054, 20240057` — fusion embedding + rebuilds
- `20240059–20240062` — multi-image pipeline overhaul (17 columns)
- `20260407–20260408` — quiz_anchor_images + comparison_pairs; drop legacy swipe_cards + style_references
- `20260410–20260411` — HNSW migration (wrong column, later fixed file-only in 20260419000003), depth conditioning, design_chat_history, SERP product matching, saved_products
- `20260413` — v3 schema (design_brief, flux_prompt, aesthetic_score, unsplash_references); drop Marble columns; create `style_loras`
- `20260415–20260417` — phase 1 foundation (keep_remove_decisions, style_vectors, render_comparison_pairs), quiz v3 schema, q_align column, session 7 schema
- `20260419` — swipe_history RLS, ref table policies, room_photos storage RLS, HNSW fix (file-only)
- `20260420` — sam_embeddings
- `20260421` — empty_room v3 retry cache (render_retries, empty_room_cache, render_rate_limits, render_cost_log)

**.bak files (not applied):** `20240054000000_create_profiles.sql.bak`, `20240055000000_style_quiz_tables.sql.bak`, `20240056000000_pipeline_mode_and_cost.sql.bak`, `20240057000000_render_sessions.sql.bak`, `20240058000000_rebuild_fusion_ivfflat_full.sql.bak`.
**Deferred:** `_deferred/20260419000004_lora_default_scales.sql.deferred` — targets wrong key format (COVA* names don't exist in prod).

### 5.3 RLS policies (complete)
See Section 5 agent output for full policy table. RLS-enabled: users, token_transactions, rooms, renders, chat_sessions, chat_messages, chat_messages_v2, products (both tables), listings, votes, jobs, furniture_placements, cart_items, anchor_renders, rate_limits, product_impressions, product_interactions, redesign_feedback, user_style_profiles, style_purchase_signals, room_products, quiz_anchor_images, quiz_comparison_pairs, saved_products, style_loras, style_vectors, app_config, sam_embeddings, render_retries, empty_room_cache, render_rate_limits, render_cost_log, swipe_history. **Not explicitly enabled (but may exist in live DB):** render_sessions, style_fingerprints, interactions, style_sessions, click_events, rate_limit_events, render_comparison_pairs.

### 5.4 Supabase Edge Functions (11)

| Function | Purpose | Status |
|---|---|---|
| `chat-room` | Room-context chatbot via Claude `claude-sonnet-4-5` (per CLAUDE.md allowed change). Reads rooms + products, writes chat_messages. | ACTIVE |
| `clip-embed` | HuggingFace CLIP embedding via Inference API. No DB write. | DORMANT (v9 doesn't use) |
| `match-products` | pgvector `search_products_by_embedding` RPC + style tag fallback. | DORMANT |
| `render-room` | Full legacy render pipeline: Depth Pro → FLUX Depth Pro / FLUX-2 Pro. Uploads to room-photos bucket. Rate-limit 10/hr. | ACTIVE (legacy) |
| `get-render-status` | Polls Replicate, handles Stage 1 + Stage 2 LoRA, uploads to renders bucket. 10-min watchdog. | ACTIVE (legacy) |
| `aggregate-style-profiles` | Background job upserting user_style_profiles + style_purchase_signals. Service-role. | ACTIVE |
| `delete-account` | Cascades delete across chat_messages/furniture_placements/renders/rooms/token_transactions/users + storage + auth.admin.deleteUser. | ACTIVE |
| `detect-furniture` | 3D furniture placement via Claude Haiku or fallback layout algorithm. | ACTIVE (3D viewer) |
| `extract-colors` | Downloads image, pixel-samples walls, writes `rooms.wall_color_extracted`. | ACTIVE |
| `generate-depth-map` | Apple Depth Pro primary, Depth Anything V2 fallback; multi_angle supported. | ACTIVE |
| `tests/` | pgTAP SQL tests (not deployable). | TEST ONLY |

### 5.5 Storage buckets (8)

| Bucket | Public? | RLS |
|---|---|---|
| `room-uploads` | No | `uploads_own` — owner path `{user_id}/...` |
| `renders` | No (path-scoped) | `renders_read_own` — owner path; writes service_role |
| `product-images` | Yes | `product_images_public_read` |
| `swipe-cards` | Yes | `swipe_cards_public_read` |
| `3d-models` | Yes | `models_public_read` |
| `scene-snapshots` | No | `snapshots_own` — owner path |
| `quiz-images` | Yes (10MB limit, jpeg/png/webp) | `Public read quiz-images`; service-role writes |
| `room-photos` | No | `room_photos_own` — owner path; wired from render-room |

**Missing:** `room-videos` mentioned in CLAUDE.md but not in any migration or edge function.

### 5.6 RPC functions

| Function | Purpose |
|---|---|
| `handle_new_user()` | Trigger: auto-creates `public.users` row on auth.users INSERT |
| `set_updated_at()` | Trigger: sets `updated_at = NOW()` on UPDATE |
| `deduct_tokens_atomic(user_id, amount, reason, render_id?)` | SECURITY DEFINER; `FOR UPDATE` lock; updates `users.token_balance` + inserts into `token_transactions` |
| `search_products_by_embedding(embedding, threshold, count)` | Cosine similarity on `products.clip_embedding` (768-dim) |
| `search_products_by_fusion_embedding(...)` | Same but on `clip_fusion_embedding` |
| `increment_rooms_render_count(room_id)` | Atomic render_count increment |
| `check_rate_limit(user_id, action, max_req, window_min)` | Hour-bucket rate limit; SECURITY DEFINER |
| `cleanup_rate_limits()` | Deletes rate_limits rows >2 hours old |
| `prune_expired_empty_room_cache()` | Deletes empty_room_cache past expires_at; service-role only |

### 5.7 Key DB observations
1. **`products` vs `products_v1` split**: The migration history operates on `products`, but the live DB has both a `products` table (with TEXT clip_embedding_data, siglip2, dinov3) and a `products_v1` table (with proper vector columns). Rename happened outside migration history. Cart/impressions/interactions/purchase_signals all FK → `products_v1` per supabase.ts.
2. **HNSW migration file-only**: `20260419000003_fix_hnsw_targeting.sql` comment explicitly says "not applied to production as of 2026-04-19." pgvector similarity on `products_v1` may not have functional indexes in prod.
3. **swipe_cards + style_references DROPPED** in 20260408100000. Any code calling `.from('swipe_cards')` will fail.
4. **5 tables exist without CREATE TABLE migrations**: `style_fingerprints`, `swipe_history`, `interactions`, `render_sessions`, `style_sessions` — created outside tracked history.

---

## Section 6 — External Integrations

### 6.1 fal.ai — Working (primary generation provider)
- **Key:** `FAL_KEY` (server-only)
- **Proxy:** `apps/web/app/api/fal/proxy/route.ts` (via `@fal-ai/server-proxy/nextjs`)
- **Models called** (`lib/ai/flux.ts` + scattered): `black-forest-labs/flux-kontext-pro`, `flux-kontext-apps/multi-image-kontext-pro`, `black-forest-labs/flux-schnell`, `black-forest-labs/flux-depth-pro`, `black-forest-labs/flux-fill-pro`, `black-forest-labs/flux-1.1-pro` (validation renders), `philz1337x/clarity-upscaler`, `fal-ai/imageutils/depth`, `fal-ai/esrgan`, `fal-ai/flux-general/image-to-image`, `fal-ai/sam2/image`, `fal-ai/sam-3/image`, `fal-ai/flux-pro/v1/fill`, `fal-ai/lama`, `fal-ai/bria/eraser`, `fal-ai/nano-banana-pro/edit`, `fal-ai/florence-2-large/ocr-with-region`, `fal-ai/ic-light-v2`, `fal-ai/aura-sr`, `fal-ai/flux-lora-fast-training`

### 6.2 Anthropic Claude — Working (core intelligence)
- **Key:** `ANTHROPIC_API_KEY`
- **Model IDs in use (inconsistent!):**
  - `claude-sonnet-4-6`: most Sonnet call sites (design-director, chat, match, detect, render, chat extract, scrape)
  - `claude-sonnet-4-20250514`: `/api/chat/route.ts` only
  - `claude-sonnet-4-5`: `/api/match/complete-room/route.ts` + `empty_room_v2.py`
  - `claude-haiku-4-5-20251001`: fingerprint/explain, match/coherence, quiz/tweak, parse-constraints, prompt-compiler, detect-furniture Edge Function
- **Files**: `lib/ai/*` (design-director, prompt-compiler, room-analyzer, detection/*, chat/*, scraping/*), plus 12+ API routes, `supabase/functions/chat-room`, `supabase/functions/detect-furniture`

### 6.3 Supabase — Working
- **Keys:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Client patterns:
  - `createBrowserClient()` — Client Components, all design step pages, capture pages
  - `createServerSupabaseClient()` — Server Components + API routes
  - `createAdminClient()` / `createAdminSupabaseClient()` — service-role ops (auth callback fingerprint, admin/render-costs, etc.)

### 6.4 Modal — Working
- **No auth** — plain `fetch()` to hardcoded `.modal.run` URLs
- Env override → default URL:
  - `COVA_PERCEPTION_URL` → `…cova-perception…`
  - `COVA_EMPTY_ROOM_URL` → `…cova-empty-room…`
  - `COVA_REDESIGN_URL` → `…cova-redesign…`
  - `REDESIGN_PIPELINE_WEBHOOK_URL` — required, no default (V8 orchestrator)
  - `GROUNDED_SAM2_URL` — optional, falls back to fal SAM2
  - `LAYERED_SEGMENTATION_URL`, `PRE_DETECTION_WEBHOOK_URL`, `FURNITURE_MATCHING_WEBHOOK_URL`, `DEPTHFLOW_WEBHOOK_URL`
- **`COVA_EMPTY_ROOM_V3_URL`** — required, no default → throws at runtime if unset

### 6.5 Replicate — **Deprecated but active**
- **Key:** `REPLICATE_API_TOKEN` (marked "Legacy, being deprecated" in lib/env.ts)
- Still load-bearing in: `lib/ai/flux.ts` (ALL FLUX models), `/api/match` (CLIP batch embedding), `/api/swap` + `/api/swap/status` (FLUX Fill Pro), `/api/quiz/validation-renders`, `/api/render/status` (4 polls), `/api/render/previews/status`, `/api/render/tweak/status`, `/api/generate-art`, `supabase/functions/render-room`, `supabase/functions/generate-depth-map`

### 6.6 Serper / Google Shopping — Working
- **Key:** `SERPER_API_KEY`, passed as `X-API-KEY` header
- **Endpoint:** `https://google.serper.dev/shopping`
- Files: `lib/ai/serper.ts`, `/api/match/route.ts`

### 6.7 SearchAPI Google Lens — Working
- **Key:** `SEARCHAPI_KEY`
- **Endpoint:** `https://www.searchapi.io/api/v1/search?engine=google_lens`
- Files: `/api/match/route.ts` (lines 64-67), `scripts/verify-matching.ts`

### 6.8 Unsplash — Working
- **Key:** `UNSPLASH_ACCESS_KEY`
- **File:** `apps/web/lib/unsplash.ts` (fetchStyleReferences, fetchScoredStyleReferences, fetchMaterialReferences, fetchMoodReferences, fetchAllReferences)
- Consumed in pipeline/redesign as IP-Adapter references (scale 0.45)

### 6.9 Stripe — NOT WIRED
- Schema stub only (`users.stripe_customer_id` column, `.env.example` keys). No Stripe SDK import anywhere. No webhook route. Tokens system is in-memory stub.

### 6.10 Affiliate link services — Partially wired
- **File:** `apps/web/lib/affiliates.ts`
- Amazon: functional with hardcoded `cova03-20` fallback
- IKEA: no affiliate, direct URL
- All others (Article, Crate & Barrel, CB2, West Elm, Pottery Barn, Ruggable, One Kings Lane, Overstock, Etsy, Target): env-var dependent, silently return original URL if unset
- Wayfair: in retailer type but no case handling → falls through
- Only `AMAZON_AFFILIATE_TAG` mentioned in `lib/env.ts`

### 6.11 PostHog — Working (optional)
- **Keys:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- **File:** `apps/web/lib/analytics.ts` — client-only singleton, persistence="memory"
- **Events:** `quiz_started`, `quiz_completed`, `photo_uploaded`, `render_started`, `render_completed`, `hotspot_tapped`, `affiliate_clicked`, `match_viewed`, `swap_initiated`

### 6.12 Sentry — Conditionally initialized
- **Keys:** `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` client fallback
- **Files:** `sentry.server.config.ts`, `sentry.client.config.ts` (adds replayIntegration), `sentry.edge.config.ts`
- Sample rates: 0.1 prod / 1.0 dev; `replaysOnErrorSampleRate: 1.0`, `replaysSessionSampleRate: 0.1`

### 6.13 Vercel — Deployment platform
- No `@vercel/analytics` or `@vercel/speed-insights`
- Standard Next.js App Router deployment
- `NEXT_PUBLIC_VERCEL_URL` used in `QRMode.tsx` for preview deployments

### 6.14 Google Gemini — Working (optional)
- **Key:** `GEMINI_API_KEY` (code) — mismatch with CLAUDE.md's `GOOGLE_GENERATIVE_AI_API_KEY`
- **Model:** `gemini-2.5-flash`
- **File:** `apps/web/lib/ai/room-analyzer.ts` (`analyzeRoomArchitecture`) + `scripts/seed-phase-b.ts`

---

## Section 7 — Style System and LoRAs

### 7.1 LoRA registry (actual state)

**File:** `apps/web/lib/styles/lora-registry.ts` — auto-generated 2026-04-17 by `scripts/train-loras.ts`
All 10 LoRAs stored on fal.ai (`v3b.fal.media`).

| COVA Key | Display Name | Trigger | Default Scale |
|---|---|---|---|
| COVASCANDINAV | Balanced Contemporary | cvscn | 0.88 |
| COVAJAPANDI | Warm & Grounded | cvwmn | 0.88 |
| COVABIOPHILIC | Biophilic | cvbio | 0.92 |
| COVAMINIMAL | Pure & Calm | cvmin | 0.95 |
| COVAMIDCENTURY | Vintage Modern | cvmcm | 0.85 |
| COVACOASTAL | Bright & Airy | cvcst | 0.85 |
| COVABOHEMIAN | Bold & Eclectic | cvboh | 0.78 |
| COVAINDUSTRIAL | Urban Industrial | cvind | 0.80 |
| COVAFARMHOUSE | Classic Traditional | cvfrm | 0.85 |
| COVAARTDECO | Dark & Moody | cvdco | 0.82 |

All quality_score=2.5 (placeholder). Scale formula: `default_scale * blend_weight * 0.85`. Max 3 stacked per render.

**Naming reconciliation (3 sources disagree):**
- **CLAUDE.md root (stale)**: 9 triggers `cvwmn, cvscn, cvmcm, cvind, cvlux, cvmax, cvcst, cvdco, cvboh`
- **Phase 3 notes**: 9 triggers `cvwmn, cvscn, cvbio, cvmcm, cvcst, cvboh, cvind, cvfrm, cvdco`
- **Actual registry**: 10 triggers `cvscn, cvwmn, cvbio, cvmin, cvmcm, cvcst, cvboh, cvind, cvfrm, cvdco`

The code dropped `cvlux, cvmax`, added `cvbio, cvmin, cvfrm`. **COVAMINIMAL maps its DNA trigger to `cvscn` (Scandinavian's trigger) in `COVA_TO_DNA_TRIGGER`** — a known collision that means minimal prompts use Scandinavian's prompt trigger even though its own LoRA URL is distinct.

### 7.2 Style quiz

**Files:** `apps/web/lib/quiz/bayes.ts`, `apps/web/lib/quiz/style-archetypes.ts`
**Dimensions:** 12 (not 6): `warmth, complexity, formality, natureMateriality, colorSaturation, textureRichness, lightingDrama, pattern, lightPreference, lineQuality, symmetryPreference, plantPresence`

**Bayesian engine (bayes.ts):**
- Prior: 12 dims init mean=0.5, variance=0.25
- Observation noise: 0.15
- Cap 4 observations per dim (`MAX_PER_DIM=4`)
- Contradiction threshold |residual|>0.7 → variance ×1.5
- Bonus swipes when >4 dims have sqrt(variance)>0.25
- `fingerprintToStyleBlend`: cosine similarity + softmax T=0.35, filter <10%, renormalize

**Pair count:** dynamic (max-entropy selection); practical min 12 (one per dim), max ~48.

**Quiz API routes:** `fingerprint`, `next-pair`, `next-card`, `mood-board`, `mood-strip`, `style-preview`, `tweak`, `update-fingerprint`, `validation-renders`

### 7.3 Style JSON rulebooks

**Location:** `modal_pipeline/style_rules/` (NOT at `/tmp/style-rules/` or `apps/web/lib/render/style_rules`)

9 files + `_all.json` + pass1/pass2 `.txt` fragments + `CALIBRATION_NOTES.md`:
1. `warm-japandi.json` (density_tier: low, density_axis: material)
2. `coastal-bright.json`
3. `pure-minimal-white.json`
4. `retro-mid-century.json`
5. `industrial-loft.json`
6. `maximalist-eclectic.json`
7. `dark-moody-glam.json`
8. `biophilic-jungle.json`
9. `heritage-traditional.json`

Each JSON: wall_decor, surface_styling, plants, textile_layering, lighting, materials, color_palette, composition, negatives, density_tier, density_axis, hero_furniture_nouns, pass1_fragment, pass2_fragment, _rooms_analyzed, _model.

### 7.4 Anchor images / style references

`/Users/daksh/Desktop/cova/apps/web/anchor-images/` contains only `manifest.json` (not readable at expected path). Runtime anchors served from Supabase `quiz_anchor_images.image_url` + `round_images` JSONB + `room_images`. Migration `20260413000000_anchor_round_images.sql` populated 9×6×3 URL matrix. Local anchor-images dir appears incomplete; Supabase is source of truth.

---

## Section 8 — Authentication and User Management

### 8.1 Provider
Supabase Auth via `@supabase/ssr` only. HTTP-only cookies. Rule 1 of CLAUDE.md forbids localStorage/sessionStorage.

### 8.2 Flows implemented
- **Email/password** (`auth/page.tsx` → `signInWithPassword`)
- **Google OAuth** (`signInWithOAuth({provider:"google"})` → `/auth/callback`)
- **Apple**: NOT implemented (despite `stripe_customer_id` column suggesting future monetization)
- **Forgot password**: no-op stub (`handleForgotPassword` empty; no `resetPasswordForEmail` call anywhere)
- **Sign-up**: no-op stub (`handleRequestAccess`); new users only via Google

**Alternate surface:** `components/auth/AuthModal.tsx` exists but not imported anywhere (orphan).

### 8.3 Session handling
`middleware.ts` instantiates `createServerClient` directly (not via generic `updateSession` wrapper), calls `getUser()` on every request, refreshes cookies via `setAll` handler on NextResponse.

### 8.4 Where auth is enforced
See Section 1.4 for middleware matcher + public routes.

**Auth gate pattern in API routes:** `createServerSupabaseClient()` → `getUser()` → 401 JSON if missing. Admin endpoints additionally check `ADMIN_TEST_USER_IDS` whitelist (env-var RBAC, not production-grade).

**Pre-auth quiz flow:** steps 1-3 run pre-auth. Fingerprint stored client-side as base64 Zustand in `cova_anon_fingerprint` cookie. On OAuth callback, cookie is parsed and fingerprint persisted via admin client to `style_fingerprints` + `users.style_fingerprint`, then cookie cleared.

### 8.5 Token / credit system — CRITICAL GAP
- **DB schema exists**: `token_transactions` ledger (append-only, `delta`, `reason`, `render_id`), `deduct_tokens_atomic()` SECURITY DEFINER with `FOR UPDATE` lock (from migration `20240002000000`)
- **Application code bypasses schema**: `apps/web/lib/tokens.ts` uses in-memory `Map<string,number>`. Default 100 tokens per user. Admins (env allowlist) get 999,999.
- **`TODO(tokens-schema)`** comment at line 4: "replace in-memory balances with a real user_token_balances table + audit log before rollout beyond admin."
- **Actively used in production** by `/api/render/empty-room` + `/api/render/retry` — paid retries silently not billed on cold starts.

### 8.6 User profile (columns in `users` table)
See Section 5.1. Key fields: `style_fingerprint JSONB`, `style_blend JSONB`, `style_blend_v3 JSONB`, `budget_dna JSONB`, `token_balance INTEGER`, `stripe_customer_id TEXT`, `onboarding_completed BOOLEAN`. Auto-created via `on_auth_user_created` trigger firing `handle_new_user()`.

### 8.7 Known auth gaps
1. Forgot-password not implemented (stub)
2. Email sign-up not implemented (stub)
3. Token system completely disconnected from its DB schema
4. No Apple OAuth
5. Admin auth is env-var allowlist, not proper RBAC
6. `/api/dev/rerun` and `/api/dev-log` excluded from middleware matcher (bypass auth entirely)
7. 11 API routes with no auth check (see Section 3 cross-cutting)
8. Service-key bypass in 3 routes uses plain `===` (not constant-time)

---

## Section 9 — Known Issues and Technical Debt

### 9.1 TODO / FIXME / HACK

**CRITICAL**
- `lib/tokens.ts:4` — `TODO(tokens-schema)`: in-memory balances stub. Actively used in prod billing paths.
- `modal_pipeline/furniture_matching_pipeline.py:325` — `DEPRECATED — catalog-based CLIP/pgvector matching removed.` File still ships.

**IMPORTANT**
- `app/design/step-8b/page.tsx:25` — `TODO: wire STYLE_STRENGTH_DEFAULT to the vibe sliders`. Sliders currently have no effect on render output.

**MINOR**
- `lib/marble.ts:10` — `@ts-expect-error MARBLE_DISABLED — preserved for re-enabling`. Entire module commented out.

### 9.2 Hardcoded values that should be env vars

**Supabase project ID `xdeacbmkdwqrwxonqaqh` hardcoded:**
- `app/design/step-2/page.tsx:33` (SUPABASE_STORAGE_BASE)
- `app/api/quiz/style-preview/route.ts:21,23,25` (3 stock-room URLs)
- `lib/ai/lora-registry.ts:73-82` (10 LoRA backup URLs)

**Modal service URLs hardcoded (with env override, but defaults in code):**
- `lib/ai/empty-room-client.ts:11`
- `lib/ai/redesign-client.ts:14`
- `lib/ai/perception-client.ts:10`
- `modal_pipeline/empty_room_v3.py:59`

**Localhost in production paths:**
- `app/api/render/status/route.ts:16` — `"http://localhost:3000"` fallback with no env guard
- `app/api/capture/generate-token/route.ts:22`
- `app/api/design-chat/route.ts:240`
- `app/api/dev/rerun/route.ts:47` (dev-only)

**No hardcoded API keys found** (all via `process.env.*`).

### 9.3 console.log in production code

**Total: 289 calls** (199 in `app/`, 90 in `lib/`). No NODE_ENV filter.

Top offenders:
- `app/api/pipeline/redesign/route.ts` — 39
- `app/api/pipeline/segment-masks/route.ts` — 22
- `app/api/pipeline/furniture-match/route.ts` — 14
- `lib/unsplash.ts` — 13
- `lib/ai/lora-registry.ts` — 9
- `app/api/render/status/route.ts` — 8
- `app/api/quiz/fingerprint/route.ts` — 8
- `app/design/step-7c/page.tsx` — 7
- `app/api/match/route.ts` — 7
- `app/design/step-7e/page.tsx` — 6
- `app/design/step-7d/page.tsx` — 6
- `lib/logger.ts` — 6 (the logger module itself has raw `console.*` calls)

Logger abstraction exists but inconsistently used.

### 9.4 Disabled TypeScript checks

Only **2 `@ts-expect-error`** (both acceptable context):
- `apps/web/__tests__/flux-prompt-50.test.ts:1514` — test runner
- `apps/web/lib/marble.ts:10` — intentional disable marker

Zero `@ts-ignore` / `@ts-nocheck`.

**`as any` casts (10)** — all in Supabase calls for custom tables missing generated types:
- `app/auth/callback/route.ts:88,114`
- `app/api/quiz/fingerprint/route.ts:1106,1119,1160`
- `app/api/quiz/update-fingerprint/route.ts:84,104,134,162`
- `app/api/quiz/tweak/route.ts:359`

All follow pattern `admin.from("style_fingerprints") as any`. Fix: regenerate Supabase types (`npx supabase gen types typescript --project-id xdeacbmkdwqrwxonqaqh > apps/web/lib/types/supabase.ts`).

### 9.5 Dead code

**Zero-caller API routes:**
- `/api/admin/render-costs` (no admin UI)
- `/api/design-dna/card`
- `/api/detect/material`
- `/api/match/accessories`
- `/api/match/coherence`
- `/api/dev/rerun` (dev-only)

**Dormant lib files:**
- `lib/clipSearch.ts` — header marks DORMANT; V9 uses Serper + Lens
- `lib/marble.ts` — entire module commented out

**Dead components:**
- `components/auth/AuthModal.tsx` — orphan
- `components/capture/RoomMeasure.tsx` — WebXR experiment
- `components/cova/ShopRoom.tsx` — possibly dead
- `components/cova/StepIndicator.tsx` — unused (steps use inline)
- `components/layout/AppShell.tsx` — unused in design flow
- `components/quiz/CardStack.tsx` + `ConfidenceBar.tsx` + `ReturningUserStrip.tsx` — quiz UIs inlined in step-2/3
- `components/render/RetryButton.tsx` — fully implemented but not wired to any page
- `components/ui/switch.tsx` — Radix wrapper unused

**Dead pages (test harnesses):**
- `/budget`, `/chatbot`, `/product-panel` — test/stub pages with mocked data

**Frozen zones:**
- `apps/mobile/` (Rule 11)
- 10 Supabase Edge Functions (Rule 12, except chat-room model change)

### 9.6 Dependency version mismatches

**Root vs apps/web:**
| Package | Root | apps/web | Notes |
|---|---|---|---|
| react | 18.3.1 exact | ^18 range | Minor |
| @types/node | ^25.5.0 | ^20 | **Significant major gap** |
| typescript | ^5.3.0 | ^5 | Harmless |

**CLAUDE.md pins vs actual:** All pinned versions match. Only notable: CLAUDE.md says `three@0.155.0` but package.json has `^0.183.2` — **major version drift in THREE.js**.

### 9.7 Root-level cruft

**54 `.mjs` one-shot fix scripts** (all timestamped 2026-04-14):
```
check_fp.mjs, check_pairs.mjs, test_quiz_{combos,realistic,v2,v3,v4}.mjs,
generate_anchors.mjs, fix_{cookie, competing_names, competing_styles, dangling_let,
dangling_let2, dim_conflict_ref, explain, final, fp_logs, nextpair_targeting,
nlp_callsites, nlp_deltas, nlp_dynamic, nlp_final, nlp_q2q3, nlp_targeted,
nlp_unified, nlp_wire, nlp_wire2, opt_b_nextpair, opt_b_route, opt_b_step2,
opt_b_step3, opt_b_step3b, opt_b_store, pairs, return_type, step2_centers_final,
step2_nlp, step2_v2centers, step3_confidence, step3, step4_desc, step4_dims,
step4_radar, style_match_centers, style_named_q, tiebreaker_deltas, tiebreaker,
ts_errors, unused, unused2, unused3, v2_centers_v2, v2centers_hoist,
v2centers_inject}.mjs
```

**Python experiments (2):** `generate_quiz_images.py`, `resume_quiz_images.py`
**Debug/data JSONs (2):** `diagnostic_report.json`, `test_flythrough_verify.json`
**Stale report:** `FINAL_AUDIT_REPORT.md` (2026-04-17 — predecessor audit)

**Risky:** `/Users/daksh/Desktop/cova/.env.local` at root is `-rwxr-xr-x` and contains live credentials. Next.js doesn't read it from root, but tools scanning for `.env` files will find it. Verify `.gitignore` covers it.

---

## Section 10 — Gap Analysis vs. Target Product

### Target product features

#### 10.1 Empty room pipeline (Gemini V3) — wired into UI
- **Current state**: **PARTIAL**. `cova-empty-room-v3` Modal app (`empty_room_gemini.py`) is deployed. `/api/render/empty-room` route + `lib/render/empty-room-v3.ts` client exist. Cache table + cost log present.
- **What's missing**: `COVA_EMPTY_ROOM_V3_URL` env var not set → client throws at runtime. No UI surface that calls this route (RetryButton component exists but unwired; no empty-room preview page).
- **Depends on**: env var population + UI integration (render reveal page or new step-7.5 empty-room preview)

#### 10.2 Redesign pipeline (Pass 1 hero furniture + Pass 2 decor density) — 9 style LoRAs
- **Current state**: **PARTIAL**. V9 `cova-redesign` deployed (Phase 5 done, 14/15 beat Collov). 10 LoRAs trained and registered (not 9 — registry adds `cvbio, cvmin, cvfrm`, drops CLAUDE.md's `cvlux, cvmax`). Prompt + LoRA resolution via `readLoras()` in `lora-blending.ts`. Director rewrite complete (Phase 3).
- **What's missing**: `COVA_REDESIGN_URL` unset → `/api/pipeline/redesign` still calls V8 orchestrator (`REDESIGN_PIPELINE_WEBHOOK_URL`) via `redesign_pipeline.py` → `generation.py`. Two-pass (hero + decor density) is in `redesign_v2.py` (staging only) — not promoted to `cova-redesign` production. LoRA naming doc drift (CLAUDE.md vs registry). COVAMINIMAL → cvscn trigger collision.
- **Depends on**: env wiring, promote redesign_v2 two-pass logic into `redesign.py`, fix LoRA naming across docs

#### 10.3 Personalization screen (6 slots)
- **Target slots**: Art & Posters, Smart Products, Specific Items, Lighting Mood, Personality Objects, Freetext
- **Current state**: **MISMATCHED**. Current flow has 5 sequential screens (7e smart tech → 7f art → 7g lifestyle → 7h required object → 7d tabbed chatbot) not a single 6-slot screen. Tabs on 7d: All, Products, Tech, Art.
- **What's missing**: Consolidated 6-slot personalization UX; no "Lighting Mood" or "Personality Objects" slots exist as named entities; freetext is currently handled by `required_object` input (7h).
- **Depends on**: full UI rebuild of personalization stage

#### 10.4 Refinement screen (chat-based post-render adjustments)
- **Current state**: **PARTIAL**. `/design/step-8b` offers 4 refinement paths (specific text / vibe sliders / layout / direction). Max 3 refinements enforced. `/api/render/refine` works.
- **What's missing**: Chat-based interface for refinement (current is form/slider-based). Vibe sliders have TODO — not wired to output.
- **Depends on**: step-8b UI rebuild to chat-first; vibe slider → render parameter mapping

#### 10.5 Hotspots (shoppable product detection on final render)
- **Current state**: **WORKING**. `/design/step-9` with zone-based hotspots, product panel, category filter, sort. Data from `rooms.room_products` populated by `/api/pipeline/furniture-match` (Modal furniture-matching + Serper + Google Lens).
- **What's missing**: Some CDN fallback images when DB is empty; no CLIP-based hotspot positioning (uses `azimuth_degrees/elevation_degrees` for 3D variant). Product data reliability depends on SERP + affiliate links.
- **Depends on**: Catalog data quality (~18,150 products across 12 retailers per M6), affiliate URL coverage (10 retailers in lib/affiliates.ts but most env vars unset)

#### 10.6 Token / credit system (real, not stubbed)
- **Current state**: **STUB**. DB schema exists (`token_transactions` + `deduct_tokens_atomic` RPC). Application layer is in-memory `Map<string, number>` in `lib/tokens.ts`.
- **What's missing**: Swap `lib/tokens.ts` to call `deduct_tokens_atomic` RPC; add token purchase flow; wire Stripe (`stripe_customer_id` column exists, no SDK integrated); build `/api/tokens/*` endpoints; UI for balance display + purchase.
- **Depends on**: Stripe integration decision + webhook implementation; user_token_balances table (or directly use users.token_balance + token_transactions ledger)

#### 10.7 Admin cost dashboard
- **Current state**: **BACKEND ONLY**. `/api/admin/render-costs` exists with aggregated cost/retry/cache-hit/pipeline breakdown. `render_cost_log` table populated by render routes.
- **What's missing**: No UI page. No `/dashboard/admin/*` or `/admin/*` route. No admin authentication beyond `ADMIN_TEST_USER_IDS` env allowlist.
- **Depends on**: proper admin RBAC; admin UI pages

#### 10.8 15-room benchmark runner
- **Current state**: **CLI SCRIPTS ONLY**. `bench/scripts/run_phase_5_redesign_bench.py`, `run_phase_5_judge.py`, `run_phase_5_reflection.py`, `smoke_phase_5_redesign.py`. Also `run_phase_a_bench.py`, `run_phase_2_service_bench.py`. All require local execution.
- **What's missing**: No in-app UI to trigger benchmarks or view results. No persistent bench result table in DB.
- **Depends on**: bench orchestration endpoint + results table + admin UI

---

## Known Issues — Prioritized Action List

### P0 — Security / critical breakage (fix before any new feature)
1. Restrict `/api/rooms/[roomId]` PATCH to an allowlist of columns
2. Add auth check to `/api/quiz/validation-renders`
3. Set `COVA_EMPTY_ROOM_V3_URL` in `.env.local` (or add a default in `lib/render/empty-room-v3.ts`)
4. Replace in-memory token stub with RPC-backed implementation
5. Swap plain `===` service-key comparisons to timing-safe comparison (crypto.timingSafeEqual) in `detect/render`, `pipeline/furniture-match`, `test-pipeline`

### P1 — Pipeline consistency
6. Wire `COVA_REDESIGN_URL` + `COVA_EMPTY_ROOM_URL` + `COVA_PERCEPTION_URL` into env; switch `/api/pipeline/redesign` to call V9 `cova-redesign` instead of V8 orchestrator (or decide to keep V8 and delete V9)
7. Decide Replicate deprecation: either rip out all remaining Replicate calls (8 routes + 2 Edge Functions + lib/ai/flux.ts) or stop labeling it deprecated
8. Regenerate Supabase types to eliminate 10 `as any` casts
9. Apply or delete `_deferred/20260419000004_lora_default_scales.sql.deferred` + confirm `20260419000003_fix_hnsw_targeting.sql` is applied in prod
10. Resolve `products` vs `products_v1` table split — document the rename in a migration
11. Add CREATE TABLE migrations for `style_fingerprints`, `swipe_history`, `interactions`, `render_sessions`, `style_sessions`

### P2 — Doc / naming drift
12. Update CLAUDE.md LoRA trigger list to match actual registry (drop cvlux/cvmax, add cvbio/cvmin/cvfrm)
13. Reconcile `GEMINI_API_KEY` (code) vs `GOOGLE_GENERATIVE_AI_API_KEY` (CLAUDE.md)
14. Reconcile `AMAZON_AFFILIATE_TAG` (code) vs `AMAZON_ASSOCIATE_TAG` (CLAUDE.md)
15. Reconcile `three@^0.183.2` (package.json) vs `three@0.155.0` (CLAUDE.md)
16. Document step-7d/e/f/g/h personalization flow in CLAUDE.md or rebuild to match target 6-slot model

### P3 — Hygiene
17. Delete 54 `fix_*.mjs` scripts at repo root
18. Delete or move `generate_quiz_images.py`, `resume_quiz_images.py`, `diagnostic_report.json`, `test_flythrough_verify.json`, `FINAL_AUDIT_REPORT.md`
19. Route all raw `console.log` calls through `lib/logger.ts` (or remove)
20. Delete dead components: AuthModal, RoomMeasure, ShopRoom, StepIndicator, AppShell, CardStack, ConfidenceBar, ReturningUserStrip, SwipeCard, switch.tsx
21. Delete or wire the 6 dead API routes (admin/render-costs, design-dna/card, detect/material, match/accessories, match/coherence)
22. Remove `/budget`, `/chatbot`, `/product-panel` test pages or move under `/dev/*`
23. Deprecate `/room/[roomId]/3d` per CLAUDE.md's "3D disabled" rule, or un-deprecate in CLAUDE.md
24. Consolidate duplicated `generateBboxMask` between `/api/render/tweak` and `/api/swap`

### P4 — UX completion
25. Implement forgot-password flow
26. Implement email sign-up flow
27. Wire RetryButton into step-8a or empty-room preview page
28. Replace dashboard + saved mock data with live Supabase queries
29. Wire step-8b vibe sliders to actual render parameters (the `STYLE_STRENGTH_DEFAULT` TODO)
30. Fix `DeleteAccountButton` to call `supabase.functions.invoke('delete-account')` instead of `alert()`

---

## Appendix — Files I Could Not Fully Determine

- **Live Supabase SQL state**: No remote DB query access from this environment. All schema conclusions derived from 62 applied migrations + `apps/web/lib/types/supabase.ts` generated types. Likely accurate but cannot confirm live-prod state (e.g., whether HNSW indexes are actually applied).
- **Storage bucket contents / file counts**: Not queryable from this context. Bucket definitions derived from migrations.
- **Actual deployed Modal app status**: Derived from CLAUDE.md notes + file headers. `modal app list` output not available.
- **`apps/web/anchor-images/manifest.json`**: Reported as not found at read time — may exist only in Supabase.
- **Vercel deployment config beyond `vercel.json`**: Not checked via Vercel API.
- **PostHog event coverage in production**: Events defined but production dashboard not audited.
