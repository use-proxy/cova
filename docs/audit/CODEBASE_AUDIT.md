# Cova Codebase Audit

**Date:** 2026-04-29
**Scope:** Full repository (read-only)
**Author:** Claude Code (autonomous audit)
**Purpose:** Inventory the codebase, identify what is load-bearing for the V1 pipeline (preprocess → classify → render → verify → deliver), and flag what should be archived.

> **Audit method:** Parallel exploration agents + manual cross-referencing of CLAUDE.md, package manifests, Modal app definitions, Supabase function code, and import graphs. No files modified.

---

## 1. Repository Tree (3 levels)

```
cova/
├── apps/
│   ├── mobile/                      ← V0 React-Native iOS app (FROZEN — Rule 11)
│   │   ├── .maestro/                Maestro UI tests (15+ flows)
│   │   ├── src/                     screens, components, hooks, navigation, store
│   │   ├── ios/                     native iOS shell
│   │   ├── modules/                 native modules (RoomPlan)
│   │   └── assets/, scripts/, dist/
│   └── web/                         ← V1 Next.js 14 web app (PRIMARY)
│       ├── app/                     App Router routes (pages + /api)
│       ├── components/              React components (auth, capture, chat, cova, dashboard, layout, product, providers, quiz, render, ui, + 3 top-level)
│       ├── lib/                     ai/, supabase/, store/, stores/, dashboard/, debug/, quiz/, styles/, render/, types/, scraping/, +root utils
│       ├── tests/                   ai, api, capture, db, design, e2e, fixtures, integration, lib, security, seed, stores, types
│       ├── __tests__/               area1–4 + flux-prompt-50.test.ts + pipeline.test.ts
│       ├── scripts/                 backfill, seed, debug, e2e helpers
│       ├── public/                  static assets
│       ├── docs/                    inline app docs
│       ├── middleware.ts            Supabase SSR session updater + route guard
│       ├── next.config.mjs, sentry.*.config.ts, tailwind.config.ts, vitest.config.ts, playwright.config.ts
│       └── .dev-logs/               local NDJSON log files (gitignored)
│
├── modal_pipeline/                  ← Python Modal apps (V1 pipeline GPU layer)
│   ├── perception.py                cova-perception (PROD)
│   ├── empty_room.py                cova-empty-room (PROD)
│   ├── redesign.py                  cova-redesign (PROD)
│   ├── composite_art.py             cova-composite-art (STAGING)
│   ├── empty_room_v2.py, empty_room_v3.py, empty_room_gemini.py    (DORMANT alts)
│   ├── redesign_v2.py, redesign_phase5.py.bak, redesign_pipeline.py, generation.py    (LEGACY/FROZEN/RETIRED)
│   ├── pre_detection_pipeline.py, restoration.py, professionalization.py, segmentation.py, structural_extraction.py, mask2former_service.py, preprocessing.py    (FROZEN/STOPPED/DORMANT)
│   ├── grounded_sam2_pipeline.py, depthflow_render.py    (DORMANT)
│   ├── clip_text_embed.py, embed_catalog.py, embed_catalog_gpu.py, embed_fusion_gpu.py    (M6 catalog DORMANT)
│   ├── furniture_matching_pipeline.py    (M7 experimental DORMANT)
│   ├── mask_build.py, postprocess.py, scoring.py, spatial_templates.py, utils.py    (helpers)
│   ├── canny_ablation_test.py, cn_lora_compat_test.py, kontext_probe_test.py    (test scripts)
│   ├── lib/                         pipeline_logger and shared
│   ├── catalog_data/, luts/, style_rules/, test_output/
│   └── scrape_catalog.py, insert_products.py    (catalog tooling)
│
├── supabase/                        ← Supabase project
│   ├── functions/                   Edge Functions (1 active, 9 FROZEN)
│   ├── migrations/                  74 .sql migration files (2024-01 → 2026-04-27)
│   ├── tests/, _temp/
│
├── packages/
│   └── shared/                      ← @cova/shared workspace pkg (Supabase types only; consumed by apps/mobile)
│       └── src/index.ts, supabase/, types/
│
├── ios/                             ← Standalone Xcode project (older, separate from apps/mobile/ios)
│   ├── cova/, cova.xcodeproj/, cova.xcworkspace/
│   ├── Pods/, Podfile, build/
│
├── bench/                           ← Phase-specific benchmark artifacts
│   ├── phase-1-perception/, phase-2-empty-room/, phase-5-probe*, phase-5-redesign/
│   ├── probe-*/, run-*/, rooms/, scripts/, overnight_verification/
│
├── benchmarks/                      ← Cross-pipeline + competitor compares
│   ├── competitors/collovai/, cova/, render-upgrade-outputs/, pipeline-fix-outputs/
│
├── docs/                            ← All documentation
│   ├── audit/                       ← THIS FILE + Phase 0 audits (loras/director/modal/supabase/tests/pgvector/prompt-surfaces)
│   ├── debug/, gallery/, migrations/, sessions/
│   ├── phase-0/, phase-1/, phase-2/, phase-3/, phase-5/    Phase closeouts + deferred follow-ups
│   ├── pipeline-fix/, render-upgrade/, render-upgrade-v2/    pipeline iteration logs
│
├── scripts/                         ← Misc TS/Python utilities
│   ├── bakeoff/, bakeoff-empty/, bakeoff-final/, density-test/, camera-anchor-test/, structural-conditioning-test/, minimal-prompt-test/    Empirical test runs
│   ├── seed-products/, lora_training/, lora-training/, overnight/, raw-data/    catalog + training tooling
│   ├── backfill-*.ts, generate-*.ts, fix-*.ts    one-shot data scripts
│   ├── deploy-all.sh, ci-test-loop.sh    deployment helpers
│   ├── ios/, .expo/                 misc iOS/Expo build leftovers
│
├── tests/                           ← Cross-package tests (root)
│   ├── director-audit/, e2e/, pipeline/, python/, quality/
│
├── experiments/                     ← Research scratch (lora_audit, lora_quality_eval, lora_spot_test, v9_validation, fal_endpoint_smoke_test)
├── lora-backups/                    ← Snapshots of trained LoRAs
├── lora-training/                   ← Training pipeline artifacts
├── training-data/                   ← Per-archetype training images (10 archetypes: COVAARTDECO, COVABIOPHILIC, COVABOHEMIAN, COVACOASTAL, COVAFARMHOUSE, COVAINDUSTRIAL, COVAJAPANDI, COVAMIDCENTURY, COVAMINIMAL, COVASCANDINAV)
├── styles/, swipe-pairs/, anchor-images/, assets/, data/, results/    static assets/data
├── test-assets/, test-results/      Playwright artifacts
├── .agents/, .claude/, .husky/, .github/    agent configs + git hooks + CI workflows (cova-ci, verify, python-tests)
├── CLAUDE.md                        ← Project rules + phase status (single source of truth)
├── ARCHITECTURE.md, COVA_CONTEXT.md, COVA_MVP_SPEC_v1.1.md, DESIGN.md, SITE.md, PRODUCT_TRUTH.md, SCRAPING_LOG.md, SPRINT_LOG.md, SESSION_NOTES.md, SESSION_0_AUDIT.md, FINAL_AUDIT_REPORT.md
├── package.json (root), pnpm-workspace.yaml, turbo.json, vercel.json, pyproject.toml
└── ~70 fix_*.mjs / test_quiz_*.mjs scripts at repo root    (one-shot scripts from Apr 14, can almost certainly be archived)
```

### Significant folder one-liners

| Folder | Contents |
|---|---|
| `apps/web/` | V1 Next.js 14 web app — the production target |
| `apps/mobile/` | V0 React Native + Expo app — **FROZEN per CLAUDE.md Rule 11** |
| `modal_pipeline/` | Python Modal apps + helpers (3 prod, ~15 dormant/frozen, several legacy) |
| `supabase/` | Schema migrations, RLS, 10 Edge Functions (9 FROZEN) |
| `packages/shared/` | Tiny TS workspace package; only consumer is `apps/mobile` |
| `ios/` | Pre-Expo Xcode shell; superseded by `apps/mobile/ios/` |
| `bench/` | Phase-by-phase quality + perf bench artifacts |
| `benchmarks/` | Competitor (Collov AI) + cross-iteration render comparisons |
| `docs/` | All session and phase closeout docs |
| `tests/`, `apps/web/tests/`, `apps/web/__tests__/` | Three parallel test homes |
| `scripts/` | Heterogeneous mix: bakeoff harnesses, backfill scripts, ad-hoc fixes |
| `training-data/`, `lora-training/`, `lora-backups/` | Custom LoRA training assets (10 archetypes) |
| `experiments/` | Research scratch; not on production code path |

---

## 2. Application Surface

### `apps/web/` — Next.js 14 Web App  ✅ ACTIVE (PRIMARY)

| Field | Value |
|---|---|
| Stack | Next.js 14.2.35 (App Router) + React 18 + TypeScript 5 + Tailwind 3.4 |
| Auth | Supabase via `@supabase/ssr` (HTTP-only cookies; Rule 1) |
| 3D | THREE.js 0.183 + `@sparkjsdev/spark` (lazy-loaded; Rules 2 & 3) |
| State | Zustand 5 |
| Image gen client | `@fal-ai/client`, `replicate` (legacy), `@anthropic-ai/sdk`, `@google/generative-ai` |
| Telemetry | `@sentry/nextjs` 9, `posthog-js` 1.257 |
| Build status | **Last built locally Mon Apr 27 18:38 PDT 2026** — `.next/build-manifest.json` exists; CI build (`apps/web` workspace) runs on every push to main/develop. |
| Key entry points | `app/page.tsx` (landing), `app/layout.tsx` (root), `middleware.ts`, `app/design/step-{1..9}/page.tsx`, `app/api/pipeline/*`, `app/api/render/*` |

**Stack notes:** `sharp` is included in `apps/web/package.json` despite CLAUDE.md saying "sharp is Python/pipeline only" — used at the API-route level for image normalization (e.g., `lib/render/normalize-input-image.ts`). This is consistent with the documented P0 known issue (input image size guard).

### `apps/mobile/` — React Native (Expo SDK 52)  🟠 FROZEN

| Field | Value |
|---|---|
| Stack | React Native 0.76.9 + Expo 52 + `@react-three/fiber` 8 + `@sentry/react-native` |
| Status | **FROZEN per Rule 11** — V0 iOS app, do not modify |
| Build status | Pods installed under `ios/Pods/`, last build artifact in `apps/mobile/dist/`. Maestro flows under `.maestro/flows/` (active: 01_splash_and_auth, 02_style_quiz_precise, 04_render_pipeline_precise, 05_panorama_viewer_precise, 14_returning_user_precise). |
| Key entry points | `apps/mobile/src/screens/main/*`, `src/screens/auth/*`, `src/navigation/*`, `src/store/*` |
| Workspace dep | `@cova/shared` |

### `ios/` — Standalone Xcode project  ❓ UNCLEAR (pre-Expo legacy)

| Field | Value |
|---|---|
| Contents | `cova.xcodeproj`, `cova.xcworkspace`, `Pods/`, `RoomPlanModule.swift`, `AppDelegate.mm` |
| Relationship | Distinct from `apps/mobile/ios/` (Expo's native shell). Likely a pre-pnpm/Expo Xcode workspace. Not referenced in `package.json` scripts. |
| Build status | Has `Pods/` and `build/` — has been built at some point. Not part of any active CI workflow. |

### `packages/shared/` — Workspace package  🟡 ACTIVE (mobile only)

| Field | Value |
|---|---|
| Name | `@cova/shared@0.0.1` |
| Contents | `src/index.ts`, `src/supabase/`, `src/types/` (Supabase row types) |
| Consumer | `apps/mobile` only (`workspace:*` dependency). `apps/web` has its own `lib/types/supabase.ts` (auto-generated, canonical). |

---

## 3. Modal Apps Inventory

> Endpoint pattern: `https://cova-interior--<app-name>-<endpoint-name>.modal.run`
> See `docs/audit/modal.md` (Phase 0) for the deeper deployment audit.

### Production (live, on the V1 critical path)

| # | App | File | Endpoint | Last touched | Cost / call | Description |
|---|---|---|---|---|---|---|
| 1 | **cova-perception** | `modal_pipeline/perception.py` | `…cova-perception-perception-api.modal.run` (3 routes: `/v1/detect_preservation_spec`, `/v1/encode_sam2_for_cache`, `/v1/depth_anything_v2`) | 2026-04-20 | ~$0.02 | Phase 1 service. SAM-3 keep-class detection (ceiling fans, mirrors, fireplace, molding) + MediaPipe face flag + PaddleOCR wall-text → `preservation_spec.json`. SAM-2 image-encoder cache. Depth-Anything-V2 passthrough. Consumed by Phases 2/5/8. |
| 2 | **cova-empty-room** | `modal_pipeline/empty_room.py` | `…cova-empty-room-emptyroom-api.modal.run/v1/generate_empty_room` | 2026-04-21 | $0.14 flat | Phase 2 service. EXIF + CLAHE → SAM-3 (22 furniture prompts) → ADE20K subtraction → depth-edge augmentation → morphological close/dilate → FLUX Fill Pro (primary) / Bria Eraser / LaMa fallback → Gaussian blend. Latency p95 42.6s warm / 53.3s cold. |
| 3 | **cova-redesign** | `modal_pipeline/redesign.py` | `…cova-redesign-redesign-api.modal.run/v1/generate_redesign` | 2026-04-27 | $0.15/room (Phase 5 bench) | Phase 5 service. 3-pass FLUX i2i with weighted LoRA stack (10 archetypes from `lora-registry.ts`) + IC-Light v2 relight + editorial post + Claude Vision QA. Pass 0 = Claude Vision layout planner. **Note:** code declares `APP_NAME = "cova-redesign-v3"` but production endpoint URL uses `cova-redesign` per CLAUDE.md. |

### Staging / Not yet wired

| # | App | File | Status |
|---|---|---|---|
| 4 | **cova-composite-art** | `modal_pipeline/composite_art.py` (last touched 2026-04-23) | Deployed but **no TS client** in `apps/web/lib/ai/`. `personalization-compiler.ts` declares `art_compositing_required` but step-7p UI never invokes the endpoint. |

### Frozen (deployed for backwards compatibility / Stage helpers in `cova-redesign-pipeline` orchestrator)

| App | File | Reason FROZEN |
|---|---|---|
| **cova-redesign-pipeline** | `redesign_pipeline.py` | V5 orchestrator. CLAUDE.md keeps `REDESIGN_PIPELINE_WEBHOOK_URL` working. Do not modify. |
| **cova-preprocessing-pipeline** | `preprocessing.py` | Stage 1 of V5 orchestrator. |
| **cova-structural-extraction** | `structural_extraction.py` | Stage 3 of V5 orchestrator (depth + canny via fal.ai). |
| **cova-segmentation** | `segmentation.py` | OneFormer + SAM-3 layered mask service. Stopped 2026-04-23; restorable. |
| **cova-mask2former-v3** | `mask2former_service.py` | Phase A architecture-only segmentation. Not in V1 flow. |

### Stopped (intentionally undeployed to free Modal's 8-endpoint workspace cap)

| App | Stopped | Restorable | Reason |
|---|---|---|---|
| **cova-clip-text-embed** | 2026-04-21 | yes (`modal deploy`) | Only caller is `apps/web/lib/clipSearch.ts` which is DORMANT. v9 uses Serper + Google Lens. |
| **cova-restoration-pipeline** | 2026-04-21 | yes | Phase 0 audit: dormant, no web callers. |
| **cova-pre-detection** | 2026-04-23 | yes | Replaced by `/api/pipeline/pre-detect` directly invoking `cova-perception`. |

### Dormant (file-system-only, not on workspace; preserved for revival)

| App | File | Why kept |
|---|---|---|
| **cova-empty-room-v2** | `empty_room_v2.py` | Phase 1B variant (44 prompts + verify loop). v1 won the bake-off. |
| **cova-empty-room-v3 / Gemini** | `empty_room_gemini.py` | Phase A nano-banana-pro variant, killed 2026-04-21. Bench harness still imports helpers. |
| **cova-redesign-v2** | `redesign_v2.py` | Two-pass alternative; superseded by 3-pass v3. |
| **cova-generation** | `generation.py` | V8 pre-Phase-5 monolithic orchestrator (~2000 lines). Not deployed. **Strong archive candidate.** |
| **cova-professionalization** | `professionalization.py` | Removed from active orchestrator 2026-04-19. |
| **cova-grounded-sam2** | `grounded_sam2_pipeline.py` | V1 experimental segmentation. Superseded by `cova-segmentation`. |
| **cova-depthflow** | `depthflow_render.py` | Parallax MP4 generator. Feature-flagged out. |
| **cova-furniture-matching** | `furniture_matching_pipeline.py` | M7 catalog matching; v9 uses Next.js `/api/match` route. |
| **cova-catalog-embedder** | `embed_catalog.py` | M6 CLIP-via-Replicate. DORMANT per file header. |
| **cova-clip-embedder-gpu** | `embed_catalog_gpu.py` | M6 CLIP-via-A10G. DORMANT per file header. |
| **cova-fusion-embedder** | `embed_fusion_gpu.py` | M6 fusion (0.6×img + 0.4×text). DORMANT per file header. |

### Helper Python (no Modal app)

`mask_build.py`, `postprocess.py`, `scoring.py`, `spatial_templates.py`, `utils.py`, `lib/pipeline_logger.py`, `insert_products.py`, `scrape_catalog.py`, plus probes (`canny_ablation_test.py`, `cn_lora_compat_test.py`, `kontext_probe_test.py`) — imported by orchestrators or used only as scripts.

### Backup files in tree (non-deployable)

- `redesign_phase5.py.bak` — explicit `.bak` suffix, archive candidate.

---

## 4. Lib / Shared Code Inventory

### `apps/web/lib/` — high-import (load-bearing)

| Module | Purpose | Importer count (apps/web) | Status |
|---|---|---|---|
| `supabase/server.ts` | SSR Supabase client (server components, route handlers) | 48 | ✅ ACTIVE |
| `supabase/admin.ts` | Service-role client | 29 | ✅ ACTIVE |
| `supabase/client.ts` | Browser SSR client | 15 | ✅ ACTIVE |
| `ai/flux.ts` | FLUX i2i client (fal.ai + Replicate fallback) | 35 | ✅ ACTIVE |
| `env.ts` | Env var validation/access | 63 | ✅ ACTIVE |
| `debug/flow-logger.ts` | Step-by-step user-flow logger | 16 | ✅ ACTIVE |
| `affiliates.ts` | Affiliate URL builders (Amazon, etc.) | 11 | ✅ ACTIVE |
| `ai/serper.ts` | Google Shopping search (v9 product matching) | 23 | ✅ ACTIVE |
| `rateLimit.ts` | API rate limiter | 6 | ✅ ACTIVE |
| `tokens.ts` | Token-economics stub | 47 | ✅ ACTIVE |

### `apps/web/lib/ai/` — V1 pipeline TypeScript clients

| Module | Purpose | Status |
|---|---|---|
| `perception-client.ts` | Calls `cova-perception` endpoints | ✅ ACTIVE (Phase 1) |
| `empty-room-client.ts` | Calls `cova-empty-room` | ✅ ACTIVE (Phase 2) |
| `redesign-client.ts` | Calls `cova-redesign` | ✅ ACTIVE (Phase 5) |
| `personalization-compiler.ts` | Compiles PersonalizationManifest v2.0 → render passes | ✅ ACTIVE (V3 step-7p) |
| `lora-registry.ts` | 10 archetypes; **canonical mirror with Modal `redesign.py`** | ✅ ACTIVE |
| `lora-blending.ts` | Weighted LoRA blend (Phase 3) | ⚠️ Defined; few importers — Phase 3 closeout says "use `readLoras()` helper here" |
| `room-analyzer.ts` | Gemini Flash room architecture analysis | ✅ ACTIVE |
| `style-references.ts` | Unsplash style reference fetcher | ✅ ACTIVE |
| `style-match.ts`, `anchor-display.ts`, `style-archetypes` | V3 anchor quiz (step-2) helpers | ✅ ACTIVE |
| `chat/extractStructuredData.ts`, `chat/systemPrompts.ts` | Step-8b chat tool calling | ✅ ACTIVE (used by `/api/design-chat`) |
| `scraping/productScraper.ts` | Product detail scrape | ✅ ACTIVE |
| `mask-assembly.ts`, `inpainting.ts`, `upscaler.ts`, `renderCrop.ts`, `matchUtils.ts` | API-route helpers | ✅ ACTIVE |
| `catalog-guard.ts` | Runtime warning shim for legacy catalog code paths | 🟠 DORMANT runtime guard (intentional) |
| `design-director.ts` | V1 Claude Vision scene planner | 🟡 LEGACY-ACTIVE — kept for refinement-UI suggestions; main generation path is now Modal `redesign.py` Pass 0 |
| `prompt-compiler.ts` | V1 FLUX staging-script compiler | 🟡 LEGACY — superseded by `redesign.py` |
| `clip.ts`, `depth.ts`, `grounding.ts`, `segmentation.ts`, `detection/{depth,grounding,objectMaterial,ram,roomContext,sam}.ts`, `redesign-client` (legacy), `empty-room-client` (legacy), `renderContext/{assembler,persist}.ts`, `forbidden-names.ts`, `fit.ts`, `budget.ts`, `canonical-archetypes.ts`, `curated-references.ts` | Mostly **0 importers** — V1 Replicate clients superseded by Modal services | 🔴 DEAD or LOW-USE — verify before removing |

### `apps/web/lib/` — root utilities (mixed)

| Module | Purpose | Status |
|---|---|---|
| `fal.ts` | fal.ai client singleton | ✅ ACTIVE |
| `unsplash.ts` | Unsplash API | ✅ ACTIVE (style references) |
| `analytics.ts` | PostHog wrapper | ✅ ACTIVE (root-layout provider) |
| `errors.ts` | Custom error classes | ✅ ACTIVE (Phase 3 hygiene) |
| `logger.ts`, `logEvents.ts`, `logging/redactor.ts` | Structured logging + Phase 3 redactor (Layer 5) | ✅ ACTIVE |
| `features.ts` | Feature flags | ✅ ACTIVE |
| `render-config.ts`, `render/empty-room-v3.ts`, `render/normalize-input-image.ts` | V3 render orchestration | ✅ ACTIVE |
| `interactions.ts` | User-event logging | ✅ ACTIVE |
| `clipSearch.ts` | Curated CLIP catalog search | 🟠 **DORMANT** — header explicitly says so; Modal counterpart `cova-clip-text-embed` stopped |
| `marble.ts` | Marble/WorldLabs 3D | 🟠 **DISABLED** — header `MARBLE_DISABLED`, all functions commented |
| `fluxKontext.ts` | FLUX Kontext Pro via Replicate | 🔴 **0 importers** — Replicate path being deprecated |
| `pipelineConfig.ts` | Pipeline-mode config | 🔴 **0 importers** — never read |
| `pipelinePoller.ts` | Server-side poller for Modal jobs | 🔴 **0 importers** |
| `measureBridge.ts` | Bridge to room measurement tool | 🔴 **0 importers** |
| `deviceDetection.ts` | Mobile UA detection | 🔴 **0 importers** |
| `routes.ts` | Route constants | 🔴 **0 importers** |
| `retry.ts` | Retry-with-backoff util | 🔴 **0 importers** |

### `apps/web/lib/` — feature subdirs

| Subdir | Modules | Status |
|---|---|---|
| `quiz/` | `bayes.ts`, `style-archetypes.ts` — V3 fingerprint computation | ✅ ACTIVE |
| `dashboard/` | `colorUtils.ts`, `queries.ts` | ✅ ACTIVE |
| `store/` (singular) | `fingerprint.ts`, `room.ts`, `session.ts`, `refine.ts`, `index.ts` | ✅ ACTIVE — main client state |
| `stores/` (plural) | `area2Store.ts` (used), `cameraStore.ts` / `roomStore.ts` / `userStore.ts` (only `SplatViewer` + `FurnitureHotspots`) | ⚠️ **DUPLICATE STORE TREE** — most files only used by dead components |
| `styles/` | `lora-registry.ts` (canonical) | ✅ ACTIVE |
| `types/` | `area2.ts`, `match.ts`, `personalization.ts`, `supabase.ts` (auto-generated) | ✅ ACTIVE |
| `db/` | (db helpers) | ✅ ACTIVE |
| `catalog/`, `debug/`, `scraping/` | Active helpers per area | ✅ ACTIVE |

### `packages/shared/`

| Module | Purpose | Status |
|---|---|---|
| `src/index.ts`, `src/supabase/*`, `src/types/*` | Supabase row types + light helpers | ✅ ACTIVE in `apps/mobile` only |

---

## 5. Component Inventory (`apps/web/components/`)

### Active

| Component | Path | Purpose | Used by |
|---|---|---|---|
| **CovaButton** | `cova/CovaButton.tsx` | Themed button | 22 importers |
| **CovaCard** | `cova/CovaCard.tsx` | Themed card | 16 importers |
| **GoldDivider** | `cova/GoldDivider.tsx` | Decorative divider | 5 importers |
| **ShopRoom** | `cova/ShopRoom.tsx` | step-9 product overlay | 1 importer |
| **AppShell** | `layout/AppShell.tsx` | Root layout shell | layout |
| **AuthModal** | `auth/AuthModal.tsx` | Login modal | `app/layout.tsx` |
| **AvatarDropdown**, **DeleteAccountButton**, **RoomCard**, **StyleProfile** | `dashboard/*` | Dashboard widgets | dashboard pages |
| **ChatBubble**, **ChatPanel**, **ChatInput**, **ChatMessage**, **ProductSearchResult**, **SuggestionChips**, **TypingIndicator** | `chat/*` | Step-8b chat UI | step-8b, `/chatbot` test page |
| **ProductCard**, **ProductImageGallery**, **ProductPanel**, **SimilarItems** | `product/*` | Step-9 product UI | step-9, `/product-panel` test page |
| **CaptureResult**, **CompletionScreen**, **MobileCapture**, **ModeSwitcher**, **QRCapture**, **QRMode**, **QualityChecker**, **UploadFallback**, **UploadMode** | `capture/*` | Step-6 capture flows | step-6 + `/capture/*` |
| **AnalyticsProvider**, **GlobalErrorCapture** | `providers/*` | Telemetry providers | root layout |
| **SwipeCard**, **CardStack**, **ConfidenceBar** | `quiz/*` | Step-3 (V1 quiz, mostly dormant) | step-3 (legacy fallback) |
| **RetryButton** | `render/RetryButton.tsx` | Retry render | step-8a |
| **shadcn/ui** | `ui/{alert-dialog,dropdown-menu,switch}.tsx` | Primitives | various |

### Unused (0 importers — verify before deleting)

| Component | Path | Notes |
|---|---|---|
| **SplatViewer** | `components/SplatViewer.tsx` | THREE.js + SparkJS Gaussian splatting viewer. ~700 LOC. Wired to dead `redesign_feedback` table. **Belongs to retired AnySplat capture flow.** |
| **FurnitureHotspots** | `components/FurnitureHotspots.tsx` | 3D product hotspot projection. Only consumer is SplatViewer. Same retired flow. |
| **RoomChatbot** | `components/RoomChatbot.tsx` | Standalone chatbot, ~700 LOC. Superseded by `chat/ChatPanel.tsx`. |
| **CovaInput** | `cova/CovaInput.tsx` | Themed input — never used |
| **StepIndicator** | `cova/StepIndicator.tsx` | Multi-step progress |
| **RoomMeasure** | `capture/RoomMeasure.tsx` | Room measurement UI |
| **DesignDnaShare** | `dashboard/DesignDnaShare.tsx` | Social sharing |
| **NewRoomCTA** | `dashboard/NewRoomCTA.tsx` | New-room CTA |
| **RoomsGrid** | `dashboard/RoomsGrid.tsx` | Dashboard grid |
| **SavedProductCard** | `dashboard/SavedProductCard.tsx` | Saved-products card |
| **StatsRow** | `dashboard/StatsRow.tsx` | Dashboard stats row |
| **ReturningUserStrip** | `quiz/ReturningUserStrip.tsx` | Returning-user banner |

> Several of the unused dashboard components match the "Screen 11 — Dashboard" entry in `CLAUDE.md > Screen Build Log`. The dashboard placeholder pages currently embed mock data inline rather than using these components — they may have been generated by v0 but never wired through.

---

## 6. Page / Route Inventory (`apps/web/app/`)

| Path | Purpose | Auth | Status |
|---|---|---|---|
| `/` | Landing page (Playfair + DM Sans). Authed users redirect to `/dashboard` | Public | ✅ Functional |
| `/auth` | Email/password + Google OAuth sign-in | Public | ✅ Functional (forgot-pwd / sign-up are stubs) |
| `/auth/callback/*` | OAuth callback | Public | ✅ Functional |
| `/design/step-1` | Welcome / particle canvas | Public | ✅ Functional |
| `/design/step-2` | V3 anchor quiz (room-type + 3 anchor pairs) | Protected (middleware) | ✅ Functional |
| `/design/step-3` | V1 12-pair pairwise quiz | Protected | ⚠️ Legacy fallback — bypassed in V3 main flow |
| `/design/step-4` | Fingerprint reveal + tweak | Protected | ✅ Functional |
| `/design/step-5` | Budget tier selection | Protected | ✅ Functional |
| `/design/step-6` | Photo capture (QR + upload) | Protected | ✅ Functional |
| `/design/step-7` | Pre-detection polling cosmetic | Protected | ✅ Functional |
| `/design/step-7p` | Unified personalization (Manifest v2.0) | Protected (implicit) | ✅ Functional |
| `/design/step-8a` | Render reveal + before/after slider | Protected | ✅ Functional |
| `/design/step-8b` | Tap-to-refine + chat refinement | Protected (implicit) | ✅ Functional |
| `/design/step-9` | Shoppable hotspots + product grid | Protected (implicit) | ✅ Functional |
| `/design/_future/step-7b…7h` | Retired V1 personalization steps | n/a | 🔴 Deprecated (kept under `_future/`) |
| `/dashboard` | Dashboard home | Protected | ⚠️ Placeholder (mock data) |
| `/dashboard/saved` | Saved products | Protected | ⚠️ Placeholder (mock data) |
| `/dashboard/settings` | Account settings | Protected | ⚠️ UI skeleton (toggles non-functional) |
| `/dashboard/profile` | User profile (real fingerprint via `getUserFingerprint()`) | Protected (SSR) | ✅ Functional |
| `/capture/new` | Trigger room creation | Protected | ✅ Functional |
| `/capture/[roomId]` | Multi-photo capture (8 slots) | Implicit | ✅ Functional |
| `/capture/mobile/[token]` | Mobile QR upload | Token-validated | ✅ Functional |
| `/chatbot` | Test harness for ChatPanel | Public | ⚠️ Test page |
| `/product-panel` | Test harness for ProductPanel | Public | ⚠️ Test page |
| `/budget` | Budget calculator bottom sheet | Implicit | ⚠️ Hardcoded prototype |
| `/room/[roomId]/3d` | 3D room view | Unverified | ⚠️ Status unknown — likely dead AnySplat path |

**middleware.ts:** Public pages = `/`, `/auth`, `/auth/callback`, `/design/step-1`. Protected = `/design/step-2…/step-9` + `/dashboard`. Public APIs are listed in §7. All other API routes return 401 if no user.

---

## 7. API Route Inventory (`apps/web/app/api/`) — 56 routes

### Quiz (V3 active + V1 legacy)

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/quiz/fingerprint` | POST | Public | internal style-match, Supabase | ✅ V3 path |
| `/api/quiz/tweak` | POST | Auth | Anthropic | ✅ V3 active |
| `/api/quiz/style-preview` | POST | Auth | fal.ai | ⚠️ Conditional (step-4 preview) |
| `/api/quiz/next-pair`, `/next-card`, `/mood-strip`, `/mood-board`, `/update-fingerprint`, `/validation-renders` | various | Public/Auth | Supabase, Unsplash | 🟡 V1 legacy (step-3) |

### Render (V3 active + V1 legacy)

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/render` | POST | Auth | fal.ai, Anthropic | 🟡 LEGACY — superseded by `/api/pipeline/redesign` |
| `/api/render/status` | GET | Auth | Supabase | ✅ Active (step-8a poll) |
| `/api/render/retry` | POST | Auth | fal.ai | ✅ Active |
| `/api/render/tweak` & `/tweak/status` | POST/GET | Auth | Anthropic + fal.ai | ✅ Active (step-8b chat) |
| `/api/render/refinement/detect` | POST | Auth | fal.ai SAM-3, Claude Haiku | ✅ Active (step-8b tap) |
| `/api/render/refinement/apply` | POST | Auth | Anthropic, Modal | ✅ Active (step-8b apply) |
| `/api/render/empty-room` | POST | Auth | fal.ai | ⚠️ Conditional |
| `/api/render/previews` & `/previews/status` | POST/GET | Auth | fal.ai | ⚠️ Conditional (step-4 preview) |
| `/api/render/refine` | POST | Auth | fal.ai | 🟡 Legacy (region refine) |
| `/api/render/from-context` | POST | Auth | fal.ai | ⚠️ Recovery path |

### Pipeline (V3 critical path)

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/pipeline/redesign` | POST | Auth | Modal `cova-redesign` | ✅ V3 critical |
| `/api/pipeline/pre-detect` | POST | Auth | Modal `cova-perception` | ✅ V3 critical |
| `/api/pipeline/furniture-match` | POST | Auth | Serper, SearchAPI | ✅ Active |
| `/api/pipeline/segment-masks` | POST | Auth | Modal | 🟡 Legacy / conditional |

### Chat

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/chat` | POST | Auth | Anthropic (or Edge Function `chat-room`) | ⚠️ Demo/POC |
| `/api/chat/history` | GET | Auth | Supabase | ⚠️ Partial |
| `/api/design-chat` | POST | Auth | Anthropic, scraper, art-gen | ✅ V3 critical (step-8b) |

### Personalization (V3)

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/personalization/save` | POST | Auth | Supabase, internal compiler | ✅ V3 critical (step-7p) |
| `/api/personalization/generate-art-preview` | POST | Auth | fal.ai / Replicate | ✅ Active |
| `/api/personalization/lighting-previews` | POST | Auth | Modal | ✅ Active |

### Rooms / Capture

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/rooms/create` | POST | Auth | Supabase | ✅ Active |
| `/api/rooms/[roomId]` | GET/PUT/DELETE | Auth | Supabase | ✅ Active |
| `/api/rooms/status` | GET | Auth | Supabase | ✅ Active (poll) |
| `/api/rooms/capture` | POST | Auth | Supabase | 🟡 Legacy |
| `/api/rooms/public-count` | GET | Public | Supabase | ⚠️ Marketing |
| `/api/capture/generate-token` | POST | Auth | Supabase | ✅ Active |
| `/api/capture/validate-token` | POST | Token (Rule 10) | Supabase + JWT | ✅ Active |

### Generate / Style / Match / Detect

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/generate-art` | GET | Auth | fal.ai, Replicate | ✅ Active (chat-triggered) |
| `/api/design-dna/card` | POST | Auth | internal | 🟡 Legacy |
| `/api/fingerprint/explain` | POST | Auth | Anthropic | ✅ Active |
| `/api/style-references/match` | POST | Public | Unsplash | ✅ Active |
| `/api/match` | POST | Auth | Serper | ⚠️ Partial |
| `/api/match/{accessories,coherence,room-budget,complete-room}` | POST | Auth | Serper, SearchAPI, Anthropic | ⚠️ Conditional |
| `/api/detect` & `/detect/status` | POST/GET | Auth | Modal | 🟡 Legacy |
| `/api/detect/material` | POST | Auth | Anthropic | ⚠️ Optional |
| `/api/detect/render` | POST | Auth | Anthropic Vision | ✅ Active (step-9 hotspots) |

### Misc / Utility

| Endpoint | Method | Auth | Calls | Status |
|---|---|---|---|---|
| `/api/fal/proxy` | GET/POST | Auth | fal.ai | ✅ Active |
| `/api/parallax` | POST | Auth | internal | ⚠️ Experimental |
| `/api/local-ip` | GET | Public | — | ⚠️ Debug-only |
| `/api/parse-constraints` | POST | Auth | Anthropic | ⚠️ Optional |
| `/api/interactions` | POST | Auth | Supabase | ⚠️ Telemetry |
| `/api/swap` & `/swap/status` | POST/GET | Auth | Supabase, Serper | ⚠️ Placeholder |
| `/api/dev-log` | POST | Auth | local file | ⚠️ Dev-only |
| `/api/dev/rerun` | POST | Auth | Modal | ⚠️ Dev-only |
| `/api/test-pipeline` | POST | Public | Modal | ⚠️ Test only |
| `/api/admin/render-costs` | GET | Auth (admin?) | Supabase | ⚠️ Admin |

**Counts:** 56 routes, ~47 protected, ~9 public, ~26 fully active, ~30 partial/legacy/dev.

---

## 8. External Service Dependencies

| # | Service | Purpose | Used in | Auth | Active? | Cost contribution (per render) |
|---|---|---|---|---|---|---|
| 1 | **Supabase** | Postgres, Auth, Storage, Edge Functions | Everywhere | `NEXT_PUBLIC_SUPABASE_URL`/anon, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | ✅ Critical | Usage-based |
| 2 | **Modal** | GPU compute (3 prod apps) | `apps/web/lib/ai/{perception,empty-room,redesign}-client.ts`, `modal_pipeline/*.py` | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | ✅ Critical | ~$0.31/room (perception + empty + redesign) |
| 3 | **fal.ai** | FLUX i2i, SAM-3, LaMa, Bria, IC-Light, Depth Anything v2 | `lib/fal.ts`, `app/api/fal/proxy/route.ts`, every Modal app | `FAL_KEY` | ✅ Critical | Bundled into Modal cost above |
| 4 | **Anthropic** | Claude Sonnet/Haiku for design director, QA, chat, refinement classifiers | `lib/ai/design-director.ts`, `lib/ai/detection/*`, `app/api/chat/*`, `app/api/render/refinement/*`, `modal_pipeline/redesign.py` Pass 0 + QA | `ANTHROPIC_API_KEY` | ✅ Critical | ~$0.04/render (Pass 0 + QA + refine) |
| 5 | **Google Generative AI (Gemini)** | Room architecture analysis | `lib/ai/room-analyzer.ts` | `GEMINI_API_KEY` | ✅ Active | ~$0.002/room |
| 6 | **Serper.dev** | Google Shopping product search | `lib/ai/serper.ts`, `app/api/match/route.ts` | `SERPER_API_KEY` | ✅ Active | ~$0.01–0.05/match cycle |
| 7 | **SearchAPI** | Google Lens visual product search | `app/api/match/route.ts`, `scripts/verify-matching.ts` | `SEARCHAPI_KEY` | ✅ Active (fallback) | Per-query |
| 8 | **Unsplash** | Style reference images (V1 IP-Adapter conditioning + landing page hero) | `lib/unsplash.ts` | `UNSPLASH_ACCESS_KEY` | 🟡 Optional | Free tier |
| 9 | **PostHog** | Product analytics | `lib/analytics.ts`, `components/providers/AnalyticsProvider.tsx` | `NEXT_PUBLIC_POSTHOG_KEY`/`HOST` | ✅ Active | SaaS |
| 10 | **Sentry** | Error tracking | `sentry.{client,server,edge}.config.ts`, `lib/errors.ts` | `SENTRY_DSN` | ✅ Active | SaaS |
| 11 | **Replicate** | Legacy CLIP, FLUX Kontext, depth, grounding-DINO, generate-art | `lib/ai/{flux,clip,depth,grounding}.ts`, `lib/ai/detection/{sam,depth}.ts`, `app/api/generate-art/route.ts`, M6 Modal embedders | `REPLICATE_API_TOKEN` | 🟡 Being deprecated | Variable |
| 12 | **Marble (WorldLabs)** | Video → 3D world | `lib/marble.ts` (commented out) | `MARBLE_API_KEY` | 🔴 Disabled | $1.20/pano if enabled |
| 13 | **Affiliate networks** (Amazon, Article, C&B, CB2, West Elm, Pottery Barn, Ruggable, OKL, Overstock, Etsy, Target, IKEA) | Affiliate URL builders | `lib/affiliates.ts` | Affiliate IDs in env | ✅ Amazon active; rest pending | Revenue, not cost |
| 14 | **Apify** | (referenced in `turbo.json` env list, `APIFY_API_TOKEN`) | unclear — possibly retired scraper | `APIFY_API_TOKEN` | ❓ Unverified — check actual usage |

---

## 9. Environment Variables & Secrets

> Source-of-truth for required vs optional: `apps/web/lib/env.ts` (validates at startup).

### Critical (block startup)

| Var | Used in | Required? | Active |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | middleware, all Supabase clients | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + middleware | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts`, all server routes | ✅ | ✅ |
| `SUPABASE_JWT_SECRET` | `/api/capture/validate-token` (Rule 10 QR JWT) | ✅ | ✅ |
| `FAL_KEY` | `lib/fal.ts`, render normalize, every Modal endpoint | ✅ | ✅ |
| `ANTHROPIC_API_KEY` | chat, design-director, refinement, Modal redesign Pass 0/QA | ✅ | ✅ |
| `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | Modal deploy + invocation | ✅ | ✅ |
| `REDESIGN_PIPELINE_WEBHOOK_URL` | `lib/env.ts` validation | ✅ | ✅ |

### Optional but used

| Var | Used in | Active |
|---|---|---|
| `COVA_PERCEPTION_URL`, `COVA_EMPTY_ROOM_URL`, `COVA_EMPTY_ROOM_V3_URL`, `COVA_REDESIGN_URL` | Modal client overrides (defaults to prod) | ✅ |
| `GEMINI_API_KEY` | room analyzer | ✅ |
| `SERPER_API_KEY` | product matching | ✅ |
| `SEARCHAPI_KEY` | product matching fallback | ✅ |
| `UNSPLASH_ACCESS_KEY` | style references | 🟡 |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | analytics | ✅ |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Sentry | ✅ |
| `NEXT_PUBLIC_APP_URL` | absolute URL gen | ✅ |
| `AMAZON_AFFILIATE_TAG` | affiliate URLs (= `cova03-20`) | ✅ |
| `ARTICLE_AFFILIATE_ID`, `CRATE_BARREL_AFFILIATE_ID`, `CB2_AFFILIATE_ID`, `WEST_ELM_AFFILIATE_ID`, `POTTERY_BARN_AFFILIATE_ID`, `RUGGABLE_AFFILIATE_ID`, `ONE_KINGS_LANE_AFFILIATE_ID`, `OVERSTOCK_AFFILIATE_ID`, `ETSY_AFFILIATE_ID`, `TARGET_AFFILIATE_ID` | affiliate URLs | 🟡 Pending application approvals |

### Stale / deprecated

| Var | Status |
|---|---|
| `REPLICATE_API_TOKEN` | Listed in `turbo.json` and `lib/env.ts` but Replicate is being deprecated (CLAUDE.md). Active in legacy paths only. |
| `MARBLE_API_KEY` | Marble disabled — **stale** until Marble re-enabled. |
| `APIFY_API_TOKEN` | In `turbo.json` env list. Unclear current usage — **verify**. |
| `MODAL_WEBHOOK_URL` | Listed in `turbo.json` env. Used? |
| `PRE_DETECTION_WEBHOOK_URL`, `FURNITURE_MATCHING_WEBHOOK_URL` | Test fixtures only; **stale**. |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile` only — frozen app, but variables are referenced. |
| `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD` | Playwright fixtures only. |
| `FINGERPRINT_SAVE_VERIFIED` | "Dev-only checklist flag, no code reads it" per CLAUDE.md. |

---

## 10. Build, Test, Deploy Status

### Web app build
- ✅ **Builds locally.** `apps/web/.next/build-manifest.json` last touched **Mon Apr 27 18:38 PDT 2026**, indicating a successful `next build`.
- TypeScript strict mode active (`tsconfig.tsbuildinfo` present).
- Sharp added as a runtime dep (Apr 2026).

### Tests
- **Unit / integration:** `apps/web/__tests__/` (area1–4, flux-prompt-50.test.ts, pipeline.test.ts) + `apps/web/tests/{ai,api,capture,db,design,integration,lib,security,seed,stores,types}` — Vitest, configured via `vitest.config.ts`.
- **E2E:** `apps/web/tests/e2e/` (Playwright). Configured via `playwright.config.ts`. Helpers under `tests/e2e/helpers/`.
- **Maestro UI tests:** `apps/mobile/.maestro/flows/` — but mobile is frozen.
- **Python:** `tests/python/` (pytest, marked smoke / modal). CI runs only `smoke and not modal` (no GPU on CI).
- **Director audit:** `tests/director-audit/`.
- **Test-result artifacts** in `apps/web/test-results/`, `apps/web/playwright-report/`, `apps/web/coverage/` — **stale local artifacts**, can be gitignored if not already.
- **Known test debt** (CLAUDE.md): `quiz-flow.test.ts` (7 tests) — Supabase admin-client mock chain stale.

### Deployment pipeline
- **Web → Vercel.** `vercel.json`: `buildCommand: "pnpm --filter web run build"`, region `sfo1`. Implicit auto-deploy from main.
- **Modal → manual.** `modal deploy modal_pipeline/<name>.py` (no GitHub Action). Workspace cap is 8 web endpoints — Phase 5 closeout records the hard juggling that was needed.
- **Supabase → manual** via `supabase` CLI / dashboard.
- **CI workflows** (`.github/workflows/`):
  - `cova-ci.yml` — unit + integration on `apps/web` (npm cache, Node 20).
  - `verify.yml` — TypeScript check on `apps/mobile`, runs `supabase/functions/tests/run-all.ts`, secret-leak grep on `apps/mobile/src`.
  - `python-tests.yml` — `pytest tests/python -m "smoke and not modal"` on Python 3.10.
- **`.husky/pre-commit`** — F6.2 forbidden-name guard (Phase 3 hygiene Layer 2).

### Current errors / broken builds
- No active broken build evidenced (latest `.next` exists). 
- **Known issue (P0 from CLAUDE.md):** `modal_pipeline/empty_room_gemini.py` rejects images >5 MB; needs Sharp resize at the route level. Tracked, not fixed.
- **Known incomplete:** `cova-composite-art` deployed but not wired (TS client missing).
- **Known regression risk:** `cova-redesign` Phase 5 bench room-02 (piano + MCM + living room) below gate; tracked as F5-ROOM-02-HARD.1.

---

## 11. Archive / Cleanup Recommendations

### A. Retired pipeline iterations — strong archive candidates

| Path | Evidence of retirement | Recommended action |
|---|---|---|
| `modal_pipeline/generation.py` | V8 monolithic orchestrator, ~2000 LOC, not deployed; superseded by Phase-5 `redesign.py` | **Archive to `docs/archive/v8-generation/`** |
| `modal_pipeline/redesign_v2.py` | Header: "NOT production." Two-pass alt; v3 is canonical | **Archive** |
| `modal_pipeline/redesign_phase5.py.bak` | `.bak` extension | **Delete** |
| `modal_pipeline/empty_room_v2.py` | Phase 1B variant; v1 won bake-off | Archive (keep one ref copy) |
| `modal_pipeline/empty_room_v3.py` (file, not the deployed app) | Intermediate version | Verify which file holds production code; archive the other |
| `modal_pipeline/empty_room_gemini.py` | "Killed 2026-04-21 post bake-off; kept for bench harness" | **Move to `bench/` if only bench imports it** |
| `modal_pipeline/professionalization.py` | Header: "DORMANT — Removed 2026-04-19" | Archive |
| `modal_pipeline/grounded_sam2_pipeline.py` | Header: "DORMANT — Not used in v9" | Archive |
| `modal_pipeline/depthflow_render.py` | Header: "DORMANT" | Archive |
| `modal_pipeline/restoration.py` | Stopped 2026-04-21; Phase-0 dormant | Archive |
| `modal_pipeline/clip_text_embed.py` | Stopped; v9 uses Serper + Google Lens | Archive |
| `modal_pipeline/embed_catalog.py`, `embed_catalog_gpu.py`, `embed_fusion_gpu.py` | M6 catalog DORMANT per file headers | **Bundle into `modal_pipeline/_dormant/` or move to `docs/archive/m6-catalog/`** |
| `modal_pipeline/furniture_matching_pipeline.py` | M7 experimental, no TS client | Archive |
| `modal_pipeline/pre_detection_pipeline.py` | Stopped 2026-04-23 | Archive (CLAUDE.md says step-7 now hits perception directly) |
| `modal_pipeline/segmentation.py`, `mask2former_service.py` | FROZEN per Rule 12 — keep but isolate | Move to `modal_pipeline/_frozen/` for clarity |
| `modal_pipeline/test.mp4`, `test_trimmed.mp4` | Test inputs in source tree | **Delete** or move to `bench/fixtures/` |

### B. Components with no importers

All listed in §5 "Unused":
- `apps/web/components/SplatViewer.tsx` — **AnySplat 3D viewer; retired with capture flow**
- `apps/web/components/FurnitureHotspots.tsx` — only used by SplatViewer
- `apps/web/components/RoomChatbot.tsx` — superseded by `chat/ChatPanel.tsx`
- `apps/web/components/cova/CovaInput.tsx`, `cova/StepIndicator.tsx`
- `apps/web/components/dashboard/{DesignDnaShare,NewRoomCTA,RoomsGrid,SavedProductCard,StatsRow}.tsx` — generated v0 dashboard widgets, never wired
- `apps/web/components/capture/RoomMeasure.tsx`
- `apps/web/components/quiz/ReturningUserStrip.tsx`

Recommendation: **Delete** SplatViewer/FurnitureHotspots/RoomChatbot only after confirming `/room/[roomId]/3d` page has been deleted/redirected. The other unused components likely arrived via v0 generation and can be removed safely.

### C. Lib modules with no importers

Already enumerated in §4:
- `lib/fluxKontext.ts` — Replicate FLUX Kontext, no callers, Replicate deprecating → **delete**
- `lib/pipelineConfig.ts`, `lib/pipelinePoller.ts` — never imported → **delete**
- `lib/measureBridge.ts`, `lib/deviceDetection.ts`, `lib/routes.ts`, `lib/retry.ts` — never imported → **delete**
- `lib/marble.ts` — commented out wholesale; either fully delete or move to `lib/_disabled/` with a one-line README
- `lib/clipSearch.ts` — DORMANT per header; intentional. Either keep with the explicit DORMANT header (current state) or move to `lib/_dormant/`
- `lib/stores/{cameraStore,roomStore,userStore}.ts` — only used by SplatViewer/FurnitureHotspots; remove together with those components, then collapse `lib/stores/` → `lib/store/` (singular) so the duplicate tree goes away.
- `lib/ai/clip.ts`, `depth.ts`, `grounding.ts`, `segmentation.ts`, `detection/*`, `redesign-client` (legacy duplicate?), `empty-room-client` (legacy duplicate?), `renderContext/*`, `forbidden-names.ts`, `fit.ts`, `budget.ts`, `canonical-archetypes.ts`, `curated-references.ts` — most are V1 Replicate clients superseded by Modal. **Verify each before deletion** — the agent reported "0 importers" but the modules may be re-exported via barrels.

### D. API routes with no frontend caller

The following are likely safe to remove or hide behind a feature flag:
- `/api/render` (root) — superseded by `/api/pipeline/redesign`
- `/api/render/refine` — superseded by `/api/render/refinement/{detect,apply}`
- `/api/render/from-context` — recovery path; verify it's still used
- `/api/render/previews` & `/previews/status` — only used by step-4 preview if enabled
- `/api/detect` & `/detect/status` — superseded by `/api/pipeline/pre-detect`
- `/api/quiz/{next-pair, next-card, mood-strip, mood-board, update-fingerprint, validation-renders}` — V1 quiz path; retire when step-3 is removed
- `/api/design-dna/card` — verify
- `/api/match/{accessories,coherence,room-budget,complete-room}` — verify whether step-9 actually invokes any
- `/api/swap` & `/swap/status` — placeholder
- `/api/parallax` — experimental
- `/api/local-ip`, `/api/dev-log`, `/api/dev/rerun`, `/api/test-pipeline` — dev/debug-only; gate behind `NODE_ENV !== "production"`

### E. Modal apps deployed but not used

- `cova-composite-art` — **deployed but never invoked**. Either wire the TS client and step-7p UI for `art_compositing_required`, or **un-deploy** (frees a Modal slot).
- `cova-redesign-pipeline`, `cova-preprocessing-pipeline`, `cova-structural-extraction`, `cova-segmentation`, `cova-mask2former-v3` — FROZEN deployments retained for backwards compatibility. Audit which webhooks/env vars actually point at them today. Likely candidates to undeploy if no caller exists.

### F. Supabase Edge Functions

CLAUDE.md Rule 12 lists nine FROZEN functions. None of them are called from `apps/web/` except `chat-room`. They occupy schema and admin surface area for no benefit:
- `render-room`, `get-render-status`, `match-products`, `detect-furniture`, `extract-colors`, `clip-embed`, `aggregate-style-profiles`, `delete-account`, `generate-depth-map`

Recommendation: **Keep but flag as stale** in this audit. Cannot remove safely without product/founder sign-off because Rule 12 forbids modification. Consider a follow-up doc proposing their formal retirement.

### G. Frozen mobile / iOS

- `apps/mobile/` — FROZEN per Rule 11. **Keep as-is.** Do not refactor.
- `ios/` (root) — duplicate of `apps/mobile/ios/`? **Verify with the founder** — if it's a pre-Expo Xcode project that's no longer the source of truth, archive to `docs/archive/ios-prebuild/`.

### H. Repo-root one-shot scripts (Apr 14, 2026)

`/Users/daksh/Desktop/cova/` contains ~70 `fix_*.mjs` and `test_quiz_*.mjs` scripts at the very top level (e.g., `fix_nlp_unified.mjs`, `fix_step3.mjs`, `test_quiz_v3.mjs`). All dated 2026-04-14, all clearly one-shot codemods.
- `check_fp.mjs`, `check_pairs.mjs`, `generate_anchors.mjs`, `resume_quiz_images.py`, `generate_quiz_images.py`, `quiz_image_prompts.csv`
- `diagnostic_report.json`, `test_flythrough_verify.json`
- `FINAL_AUDIT_REPORT.md`, `SESSION_0_AUDIT.md`, `SESSION_NOTES.md`, `SPRINT_LOG.md`, `SCRAPING_LOG.md`, `CHAT_STARTER.md`, `COVA_CONTEXT.md`, `COVA_MVP_SPEC_v1.1.docx` (the `.md` is the readable copy)

Recommendation: **Move all to `docs/archive/repo-root-cleanup-2026-04/`** (or delete). They clutter the root and are effectively snapshots, not code.

### I. Stale CI / config

- `apps/web/.dev-logs/*.ndjson` (in git status as untracked) — local NDJSON logs. Confirm `.gitignore` covers them.
- `apps/web/coverage/`, `apps/web/playwright-report/`, `apps/web/test-results/` — local test artifacts; same.
- `node_modules/` at repo root (1078 entries) — workspace hoist, normal for pnpm.
- Old `pnpm-lock.yaml` (677 KB) — keep, it's the lockfile.

---

## 12. Open Questions (need human clarification)

1. **`/room/[roomId]/3d` page:** Status not directly verified. Is the 3D viewer route still part of V1, or was it retired with the AnySplat capture flow? Removing it would unlock deletion of `SplatViewer`, `FurnitureHotspots`, `lib/stores/{cameraStore,roomStore,userStore}.ts`, and probably `apps/web/lib/marble.ts` for good.

2. **`ios/` (repo root) vs `apps/mobile/ios/`:** Two iOS code trees coexist. Which one is the V0 iOS app referenced in Rule 11? Confirm before archiving the unused tree.

3. **`cova-composite-art` integration:** Is this scheduled to ship in V1, or should it be undeployed to free a Modal endpoint slot?

4. **`apps/web/lib/ai/design-director.ts` and `prompt-compiler.ts`:** CLAUDE.md says the V3 redesign generation now runs through `modal_pipeline/redesign.py` Pass 0. Are these files still needed for refinement-UI suggestion continuity, or can they be removed in a future cleanup?

5. **Replicate deprecation timeline:** When will `lib/ai/clip.ts`, `lib/fluxKontext.ts`, M6 Modal embedders, `/api/generate-art` Replicate paths, and `REPLICATE_API_TOKEN` be safe to delete?

6. **Apify usage:** `APIFY_API_TOKEN` is in `turbo.json`'s env list. No active code imports it visibly — is this stale, or is it used by a script I missed (catalog scraping)?

7. **V1 quiz path (`/design/step-3` + 6 V1 quiz API routes):** When is step-3 (the V1 12-pair pairwise quiz) safe to delete? Currently it's "fallback" but the V3 main flow bypasses it.

8. **Dashboard pages (`/dashboard`, `/dashboard/saved`, `/dashboard/settings`):** Tracker for replacing mock data with real Supabase queries. Will the unused dashboard components (`RoomCard`, `StatsRow`, etc.) be wired in, or removed?

9. **Stale test scripts at repo root** (~70 files): Founder confirm before bulk-archiving.

10. **Frozen Edge Functions** (Rule 12): If none of the nine frozen functions are called from `apps/web/` (audit found zero callers besides `chat-room`), can the founder authorize a one-time formal retirement (delete all nine)? They occupy operational surface area.

---

## Audit summary (5 bullets)

1. **The V1 critical path is small and clean.** Three Modal apps (`cova-perception`, `cova-empty-room`, `cova-redesign`), one Supabase Edge Function (`chat-room`), and ~26 Next.js API routes carry the entire preprocess → classify → render → verify → deliver flow. The TS clients (`apps/web/lib/ai/{perception,empty-room,redesign}-client.ts`) and `app/api/pipeline/{redesign,pre-detect}` are the load-bearing seams.

2. **A retired AnySplat capture flow is still on disk.** `apps/web/components/SplatViewer.tsx`, `FurnitureHotspots.tsx`, `lib/marble.ts` (disabled), `lib/stores/{camera,room,user}Store.ts`, and likely `app/room/[roomId]/3d/page.tsx` belong to the pre-V1 video → 3D pano flow. They should be removed together once `/room/[roomId]/3d` is verified dead.

3. **Significant Modal pipeline cruft.** `modal_pipeline/` holds ~15 dormant/legacy/frozen apps next to the 3 production ones. `generation.py` (~2000 LOC V8 monolith), `redesign_phase5.py.bak`, `redesign_v2.py`, `professionalization.py`, `grounded_sam2_pipeline.py`, `depthflow_render.py`, three M6 catalog embedders, `furniture_matching_pipeline.py`, `pre_detection_pipeline.py`, plus three empty-room variants. Bundle into `modal_pipeline/_archive/` or `docs/archive/` to clarify the production surface.

4. **Nine of ten Supabase Edge Functions are dead weight.** Only `chat-room` is called. The other nine are FROZEN per Rule 12 with no active callers — Rule 12 prevents safe modification, so they need explicit founder sign-off to retire. All v9 traffic for matching/detect/render goes through Next.js API routes + Modal apps.

5. **Repo root and `lib/` have a lot of one-shot scripts and 0-importer files.** ~70 `fix_*.mjs`/`test_quiz_*.mjs` scripts dated 2026-04-14 sit in the root. `apps/web/lib/` has ~6 utility files with zero importers (`pipelineConfig`, `pipelinePoller`, `measureBridge`, `deviceDetection`, `routes`, `retry`, `fluxKontext`) and ~12 unused React components. None affect production but they make the codebase harder to navigate and signal a stale tree to new contributors.
