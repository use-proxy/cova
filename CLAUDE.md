# COVA V1 — Claude Code Constraints

# Copy this file to: apps/web/CLAUDE.md AND root CLAUDE.md

# READ THIS BEFORE EVERY SESSION. NO EXCEPTIONS.

# Last updated: April 1, 2026 | Spec: v7

---

## Project Identity

- **Product:** Cova — AI interior design web app
- **Repo:** github.com/pgoel813/cova
- **Web app:** `apps/web/` (Next.js 14 App Router)
- **Pipeline:** `modal_pipeline/` (Python only)
- **Supabase project:** xdeacbmkdwqrwxonqaqh
- **Production domain:** covainterior.com
- **Spec:** cova_v1_complete_spec_v7.docx (single source of truth)
- **Founders:** Daksh Parikh + Pranav Goel

---

## 12 HARD RULES — NEVER VIOLATE THESE

1. **NEVER use localStorage or sessionStorage.**
   Auth state uses HTTP-only cookies via `@supabase/ssr`. Any localStorage usage will break auth on page refresh. Use `createBrowserClient` from `@supabase/ssr` in Client Components, `createServerClient` in Server Components and API routes.
   sessionStorage was previously used as an overflow fallback in the fingerprint cookie store — this has been removed (April 2026, pre-launch hardening). The sessionStorage fallback is fully gone. The covariance matrix is stripped from the cookie payload to keep it under 3000 bytes without any fallback needed.

2. **ALWAYS dynamic import SplatViewer with `ssr: false`.**

   ```typescript
   const SplatViewer = dynamic(() => import("@/components/SplatViewer"), {
     ssr: false,
   });
   ```

   Three.js requires the `window` object. Violating this causes a build error.

3. **NEVER import `@sparkjsdev/spark` at module level in any page file.**
   SparkJS must only be imported inside the dynamically imported SplatViewer component. Any top-level import in a Next.js page or layout will crash the build.

4. **ALWAYS use `createBrowserClient` from `@supabase/ssr` in Client Components (`'use client'`).**
   Never import from `@supabase/supabase-js` directly in App Router code.

5. **ALWAYS use `createServerClient` from `@supabase/ssr` in Server Components, API routes, and middleware.**
   Session must be updated in `middleware.ts` using the `updateSession()` pattern from `@supabase/ssr` docs.

6. **NEVER call CLIP embedding from any client-side code.**
   CLIP embeddings are generated server-side only — in Supabase Edge Functions or Next.js API routes. Never in `'use client'` components.

7. **NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_` variable.**
   Service role key must only appear in server-side code.

8. **NEVER show style names to the user in any string.**
   The five style names — Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist — must never appear in any user-facing label, tooltip, placeholder, heading, or message. Use descriptive language only (e.g. "your design style").

9. **SparkJS import path is `@sparkjsdev/spark` — never load from CDN.**
   The npm package is the correct and only source.

10. **QR capture token must be validated before any video upload is permitted.**
    JWT token in QR code URL must be verified in `/api/capture/validate-token` before Supabase Storage accepts the upload. Invalid or expired token = 401 response.

11. **NEVER modify `apps/mobile/` directory.**
    The V0 iOS app must remain untouched. All V1 work is in `apps/web/` and `modal_pipeline/` only. If a file path starts with `apps/mobile/`, do not touch it.

12. **NEVER modify Supabase Edge Functions except one specific change.**
    Only permitted change: in `chat-room` Edge Function, change model name from `claude-haiku-4-5-20251001` to `claude-sonnet-4-5` (already done in Session 0). All other Edge Functions are FROZEN: `render-room`, `get-render-status`, `match-products`, `detect-furniture`, `extract-colors`, `clip-embed`, `aggregate-style-profiles`, `delete-account`, `generate-depth-map`.

13. **The capture flow is HYBRID — QR for desktop, direct camera for mobile, upload as fallback.**
    NEVER reintroduce webcam mode.
    NEVER reintroduce multi-shot/ShotStrip flow.
    Always wire new capture UI through `app/design/step-6/page.tsx` not `app/capture/`.
    Mobile QR handoff page lives at `app/capture/mobile/[token]/page.tsx`.

---

## Supabase Schema Rules

**FROZEN — never alter:**

- `products` table (5,581+ rows with 768-dim CLIP embeddings)
- `quiz_cards` table (950 rows)
- All existing table columns
- All existing Edge Functions (except `chat-room` model name)

**PERMITTED additions only (run once, idempotent):**

```sql
ALTER TABLE renders ADD COLUMN IF NOT EXISTS splat_url TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS redesign_splat_url TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS style_vector FLOAT[];
ALTER TABLE renders ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS modal_job_id TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS marble_operation_id TEXT;
```

Storage bucket: `room-videos` — private, with RLS (users can INSERT/SELECT own videos only). Create via Supabase dashboard.

---

## AI Pipeline Architecture

**Track 1 — Real Room Reconstruction (~30s, ~$0.40)**
Video → AnySplat on Modal A10G → Gaussian splat (SPZ) + camera poses → Supabase Storage

**Track 2 — AI Redesign (~4.5-6.5 min, ~$1.10)**
AnySplat splat → gsplat renders equirectangular 360° panorama from room centroid → Lang-SAM segments furniture → FLUX Fill removes furniture (Replicate) → FLUX Kontext Pro places new furniture (Replicate) → Marble API (primary) OR SHARP on Modal (fallback) → redesigned 3D splat

**Track 3 — Product Matching (~26s, ~$0.15)**
gsplat renders 6 undistorted perspective cube face crops (front/back/left/right/ceiling/floor) from redesigned room → Claude Vision detects ALL furniture on 6 crops in parallel → project detections to 3D world coordinates using AnySplat depth + camera poses → deduplicate by 3D proximity (0.5m threshold) → CLIP embed each crop (Replicate) → pgvector cosine search → style vector re-ranking (×1.10 match, ×0.85 no match) → retailer diversity enforcement → top 3 per item → THREE.Sprite hotspots at 3D world coordinates in SparkJS

**Critical pipeline rules:**

- Detect furniture on CUBE FACES not on equirectangular panorama (distortion problem)
- CLIP similarity threshold: 0.65 (not 0.70 — maximizes hotspot coverage)
- Modal GPU: A10G primary, L4 or A100 fallback
- Marble is primary 3D lift, SHARP is fallback — both maintained until M7 testing

---

## Product Matching — Retailer Lineup

**Tier 1 (active/applying now):**

- **Amazon:** cova03-20 tag (ACTIVE) — unlimited products
- **Target:** Impact network (application submitted, pending approval)
- **Article:** article.com/affiliates (apply now) — ~2,000 curated products
- **IKEA:** direct links, no affiliate, $0 commission — ~10,000 products

**Tier 2 (apply this week):**

- **Crate & Barrel:** Sovrn network — 5% commission
- **CB2:** Sovrn network (same account as Crate & Barrel) — 5% commission
- **West Elm:** ShareASale — 3% commission
- **Ruggable:** CJ (existing account) — up to 6% commission
- **One Kings Lane:** CJ (existing account) — up to 12% commission

**Tier 3 (before M6):**

- **Pottery Barn:** ShareASale — up to 4% commission
- **Overstock/Beyond:** CJ — up to 6% commission
- **Etsy:** Awin — 4% commission

**Wayfair:** Program currently closed to new publishers. Check cj.com quarterly. Add when reopens.

Target clean product count: ~18,150 across all sources

---

## UI Design System

- **Background:** #0A1628 (deep navy)
- **Surface:** #0F1F3D (cards, panels)
- **Border:** #1E3A5F
- **Gold primary:** #C9A84C (CTAs, hotspots, active states)
- **Gold subtle:** #F0D080
- **White warm:** #F8F6F1 (primary text)
- **Text secondary:** #8BA3C0
- **Success:** #4A9B7F
- **Error:** #C0504A
- **Font headings:** EB Garamond (room names, landing headline only)
- **Font UI:** Inter (all other text)
- **Border radius:** 12px cards, 8px inputs, 24px pills
- **Motion:** 200ms ease-out all transitions

- **UI generation platform:** v0 by Vercel (v0.dev) — outputs real Next.js/React/Tailwind code
- **Animation library:** Framer Motion (the library, not Framer the website builder)
- **Rule:** Generate screens in v0 ONLY after the underlying feature works functionally

---

## Milestone Sequence (M0–M14)

Pre-milestone conversation required before any milestone begins. Nothing gets built until that conversation happens.

| Milestone | Description                                                                                   | Status             |
| --------- | --------------------------------------------------------------------------------------------- | ------------------ |
| M0        | Setup — accounts, credentials, Supabase columns, repo, CLAUDE.md                              | ✅ DONE            |
| M1        | Pipeline Proof CRITICAL — AnySplat on Modal, walk through real room in browser                | ✅ DONE            |
| M2        | Seed Catalog — Wayfair replaced; scrape one retailer (~1,000 products) to validate matching   | ✅ DONE            |
| M3        | Web Foundation — Next.js scaffold, auth (all 3 methods), routing                              | ✅ DONE            |
| M4        | Quiz + Capture + UI Pass 1 — quiz ported, Path A+B capture, v0 generates quiz/capture screens | ✅ DONE            |
| M5        | Processing + Viewer + UI Pass 2 — processing UI, SparkJS viewer, real room loads              | ✅ DONE            |
| M6        | Full Catalog Completion — all 12 retailers, ~18,000 clean products, IVFFlat rebuilt           | ✅ DONE            |
| M7        | AI Redesign Pipeline — full pipeline end-to-end, Marble vs SHARP decision                     | ✅ DONE            |
| **M8**    | **Commerce — cube face detection, CLIP matching, hotspots, product panel, affiliate URLs**    | **🔄 IN PROGRESS** |

### v9 Render Pipeline — Phase Status (overlay on M0-M14)

v9 is the render-pipeline-only rebuild described in `docs/cova-v9-research.pdf`.
Phases run in parallel to M8 commerce work; their artifacts live in `docs/audit/`,
`docs/phase-0/`, and `tests/director-audit/`.

| v9 Phase | Description                                                        | Status             |
| -------- | ------------------------------------------------------------------ | ------------------ |
| 0        | Audit — LoRAs, Director, Modal, Supabase RLS, tests, pgvector      | ✅ **COMPLETE** (2026-04-20) |
| 0.5      | 20-room bench build + smoke-test harness                           | Ready to start     |
| 1        | Perception service (cova-perception Modal app, 3 endpoints)        | ✅ **COMPLETE** (2026-04-20) |
| 2        | Empty-room service (cova-empty-room Modal app)                     | ✅ **COMPLETE** (2026-04-20), latency fix 2026-04-21 |
| 3        | Director rewrite (LoRA weighted blending, F6.1–F6.5 hygiene)       | ✅ **COMPLETE** (2026-04-20) |
| 4        | Custom LoRA training (10 archetypes trained, all in style_loras DB) | ✅ **COMPLETE** (2026-04-17) |
| 5        | Redesign service (flux-general primary, NB-Pro fallback)           | ✅ **COMPLETE** (2026-04-21) |
| 7+       | Chain-of-Hotspot quality boost + later phases                       | Blocked on 5       |

Phase 0 deliverables landed: `docs/audit/loras.md`, `docs/audit/director.md`,
`docs/audit/modal.md`, `docs/audit/supabase.md`, `docs/audit/tests.md`,
`docs/audit/pgvector.md`, `docs/audit/prompt-surfaces.md`. Director audit B-3
active-leak patch committed 2026-04-20. Phase 0 extension (full-codebase
prompt-path audit) committed 2026-04-20 — patched `buildFluxPromptFromContext`,
`quiz/style-preview`, Python `generation.py` sanitizer, director density-token
rename, step-3b user-visible display labels (via
`toCovaKeyDisplayName`), step-7d SUGGESTION_CHIPS copy. Phase 0 CLOSED.
Deferred follow-ups catalogued in `docs/phase-0/follow-ups-deferred.md`.

Phase 1 complete (2026-04-20). `cova-perception` deployed to Modal A10G with
three v1 endpoints: `/v1/detect_preservation_spec`, `/v1/encode_sam2_for_cache`,
`/v1/depth_anything_v2`. TS client at `apps/web/lib/ai/perception-client.ts`.
Deferred follow-ups in `docs/phase-1/follow-ups-deferred.md`. Closeout report
in `docs/phase-1/CLOSEOUT.md`.

### Production Modal apps
- **cova-perception** — `https://cova-interior--cova-perception-perception-api.modal.run`
  Endpoints: `/v1/detect_preservation_spec`, `/v1/encode_sam2_for_cache`,
  `/v1/depth_anything_v2`. See `modal_pipeline/perception.py`.
- **cova-empty-room** — `https://cova-interior--cova-empty-room-emptyroom-api.modal.run`
  Endpoint: `/v1/generate_empty_room`. See `modal_pipeline/empty_room.py`.
- **cova-redesign** — `https://cova-interior--cova-redesign-redesign-api.modal.run`
  Endpoint: `/v1/generate_redesign`. See `modal_pipeline/redesign.py`.

### Environment variables (Phase 1-5 additions)
- `COVA_PERCEPTION_URL` — base URL of the `cova-perception` Modal app.
- `COVA_EMPTY_ROOM_URL` — base URL of the `cova-empty-room` Modal app.
- `COVA_REDESIGN_URL` — base URL of the `cova-redesign` Modal app.
  All three default in-client to the production URLs above.
| M9        | Chatbot + Analytics + UI Pass 3 — chatbot, PostHog, Sentry, remaining screens                 |                    |
| M10       | Polish + User Testing — error states, 5 real user tests                                       |                    |
| M11       | Deployment — Vercel production, covainterior.com                                              |                    |
| M12       | iOS Shell — Expo WebView, camera bridge, TestFlight                                           |                    |
| M13       | Final UI Polish + Landing Page — demo video, full polish                                      |                    |
| M14       | VC Prep — example rooms, pitch deck, demo script                                              |                    |

---

## Tech Stack (exact versions)

```
next@14.2.35
typescript@5.x
tailwindcss@3.4.x
@supabase/ssr@0.10.0
@supabase/supabase-js@2.101.0
@sparkjsdev/spark@0.1.10
three@0.183.2
zustand@5.0.12
framer-motion@12.38.0
react-qr-code@2.0.18
jose@6.2.2
replicate@1.x
posthog-js@1.x
@sentry/nextjs@9.x
zod@3.x
@anthropic-ai/sdk@0.82.0
lucide-react@1.7.0
```

Note: `sharp` is Python/pipeline only (not in web app). `@react-three/fiber` removed — SparkJS used instead.

---

## Repo Structure

```
apps/
  mobile/              <- FROZEN. Never touch.
  web/                 <- All web work here
    CLAUDE.md          <- This file (copy here)
    app/               <- Next.js App Router pages
    components/        <- React components
    lib/               <- Shared utilities
      types/
        supabase.ts    <- CANONICAL Supabase types (AUTO-GENERATED). Import as @/lib/types/supabase.
                          Regenerate: npx supabase gen types typescript --project-id xdeacbmkdwqrwxonqaqh > apps/web/lib/types/supabase.ts
                          apps/web/types/supabase.ts was DELETED — do not recreate it.
    .env.local         <- Never commit
modal_pipeline/        <- Python only. Not TypeScript.
  room_reconstruction.py
  catalog_builder.py
.claude/
  SESSION_MEMORY.md    <- Update after every session
CLAUDE.md              <- This file (also at root)
```

### Dev-only flags (no runtime effect)

- **FINGERPRINT_SAVE_VERIFIED** — checklist flag. No code reads it. Set to `true` after
  running `scripts/test-fingerprint-save.ts` against a real auth session to confirm
  style_fingerprints insert works end-to-end. Not a feature flag.

---

## Environment Variables (apps/web/.env.local)

```bash
# Supabase (copy from root .env.local)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# Analytics + monitoring (copy from apps/mobile/.env)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
SENTRY_DSN=

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AI APIs (copy from root .env.local)
REPLICATE_API_TOKEN=
ANTHROPIC_API_KEY=

# Modal (created today — in .env.local already)
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=

# Marble (pending API approval)
MARBLE_API_KEY=

# Affiliate tags
AMAZON_AFFILIATE_TAG=cova03-20
TARGET_AFFILIATE_ID=
ARTICLE_AFFILIATE_ID=
CRATE_BARREL_AFFILIATE_ID=
CB2_AFFILIATE_ID=
WEST_ELM_AFFILIATE_ID=
RUGGABLE_AFFILIATE_ID=
ONE_KINGS_LANE_AFFILIATE_ID=
POTTERY_BARN_AFFILIATE_ID=
OVERSTOCK_AFFILIATE_ID=
ETSY_AFFILIATE_ID=
```

---

## M0 Status (as of March 30, 2026)

**Done:**

- [x] CJ Affiliate account created + W-9 submitted
- [x] Wayfair confirmed closed to new publishers
- [x] Amazon cova03-20 confirmed active
- [x] Impact account created (pending domain verification)
- [x] covainterior.com registered on Namecheap
- [x] Namecheap MX records added for ImprovMX
- [x] Modal account created + tokens in .env.local
- [x] Repo cleaned up (deleted redundant files)
- [x] CLAUDE.md created (this file)
- [x] SESSION_MEMORY.md created

**Pending — come back to:**

- [ ] ImprovMX — wait for DNS propagation, set up hello@covainterior.com
- [ ] Impact — verify covainterior.com, apply to Target
- [ ] Amazon tax info — after EIN obtained
- [ ] Replicate — confirm token active, add to .env.local
- [ ] Anthropic — confirm key active, add to .env.local
- [ ] Sentry DSN — find from V0, add to .env.local
- [ ] PostHog key — find from V0, add to .env.local
- [ ] Marble API — request access at worldlabs.ai
- [ ] Supabase — run 6 SQL ALTER TABLE statements
- [ ] Supabase — create room-videos storage bucket with RLS
- [ ] apps/web/ — create Next.js 14 scaffold
- [ ] apps/web/.env.local — populate all variables
- [ ] apps/mobile/ — confirm still builds untouched

---

## Before Starting Any Claude Code Session

1. Read `.claude/SESSION_MEMORY.md`
2. Confirm current milestone
3. Have pre-milestone conversation if starting a new milestone
4. Read relevant spec section (cova_v1_complete_spec_v7.docx)
5. Update SESSION_MEMORY.md when session ends

---

## Screen Build Log

| Screen                | Route        | Status   | Notes                                                                                  |
| --------------------- | ------------ | -------- | -------------------------------------------------------------------------------------- |
| Screen 11 — Dashboard | `/dashboard` | **DONE** | RoomCard, StatsRow, StyleProfile, NewRoomCTA, ChatBubble; mock data; Supabase fallback |

---

## Known Decisions Log

| Decision               | Choice                              | Rationale                               |
| ---------------------- | ----------------------------------- | --------------------------------------- |
| Reconstruction         | AnySplat on Modal A10G              | Feed-forward, no COLMAP, indoor-trained |
| Redesign input         | gsplat 360° panorama                | Solves single-frame coverage problem    |
| Furniture segmentation | Lang-SAM                            | Text-prompted, no bounding boxes        |
| 3D lift                | Marble (primary) + SHARP (fallback) | Both until M7 testing                   |
| Product detection      | 6 cube face crops                   | Eliminates equirectangular distortion   |
| UI generation          | v0 + Framer Motion                  | Real Next.js code output                |
| CLIP threshold         | 0.65                                | Maximizes hotspot coverage              |
| Wayfair replacement    | 12-retailer lineup                  | ~18,150 clean products                  |
| Domain                 | covainterior.com                    | Registered Namecheap March 30 2026      |
| UI platform            | v0 by Vercel                        | NOT Framer (website builder)            |
| App name               | Cova                                | Domain covainterior.com is separate     |
| W-9                    | SSN individual (Daksh Parikh)       | EIN application failed online           |
| Tax info               | Defer Amazon tax until EIN          | Get EIN before submitting               |

---

## Post-launch test debt

- **quiz-flow.test.ts (7 tests)** — Supabase admin client mock chain is stale. Fix mock setup to chain `createAdminSupabaseClient()` correctly.

---

## Known issues

- **P0 before V3 goes live: input image size guard missing.** Phone camera photos are typically 8-15MB. Anthropic Claude Vision rejects >5MB base64 images. Fix: add Sharp resize/compress at the API route level before Modal call. Target ≤1536px longest edge, ≤4MB, JPEG 85%. Surfaced during Phase B Step 2 health check (2026-04-21); `modal_pipeline/empty_room_gemini.py` pipeline currently fails with `anthropic.BadRequestError: image exceeds 5 MB maximum` on any unresized input.

---

## Phase 3 — LoRA weighted blending + hygiene (completed 2026-04-20)

**Commits:** 06b10f7, f8049dd, 25e34a8, fd6b956, b052a1a, and the Phase 3 closeout commit.
**Scope:** `apps/web/lib/ai/design-director.ts`, new `apps/web/lib/ai/lora-blending.ts`, `apps/web/lib/logging/redactor.ts`, `apps/web/lib/errors.ts`, `apps/web/.eslintrc.json`, `.husky/pre-commit`, `apps/web/components/chat/SuggestionChips.tsx`, new tests under `apps/web/tests/ai/`, docs under `docs/phase-3/`.

**Director schema (additive, non-breaking):**
`DesignBrief.style_weights.loras?: Record<string, number>` — optional map of
cv-triggers → blend weights summing to 1.0. `primary_lora`/`primary_scale`
retained for back-compat with frozen Edge Functions (Rule 12) and legacy rows.
Director populates `loras` from `context.style_blend` when present, else
`{[loraTrigger]: 1.0}`.

**Contract:** max 3 LoRAs, drop < 0.10 threshold (below user-perceptible
aesthetic influence; avoids wasting inference cost), normalize to sum 1.0.

**Reader helper:** `readLoras(styleWeights)` in `lora-blending.ts`
synthesizes `{[primary_lora]: 1.0}` for legacy rows. Use this in Phase 5
renderer, not raw `brief.style_weights.loras`.

**Forbidden-name defense layers now complete (research §7.4 5-layer model):**
- Layer 1 — ESLint `no-restricted-syntax` rule F6.1 (author-time).
- Layer 2 — Husky `pre-commit` hook F6.2 (commit-time).
- Layer 3 — runtime sanitizer `sanitizeForbiddenNames` (Phase 0 B-3).
- Layer 4 — Zod `.refine` on Sonnet free-text fields (Phase 0 B-3).
- Layer 5 — log redactor `apps/web/lib/logging/redactor.ts` F6.5 wired into `captureError()`.

**Deferred to Phase 4/5:** F3-RBF.1 (RBF kernel), F3-NAMING.1 (research cvjpd/cvlux/cvmax vs impl cvwmn/etc.), F3-BLEND-CTX.1 (upstream style_blend wiring into RenderContext), F3-CVMIN-COLLISION.1 (COVAMINIMAL and COVASCANDINAV both resolve to cvscn), F3-PARITY.1 (Python Director parity). See `docs/phase-3/follow-ups-deferred.md`.

**Handoff to Phase 4:** 9 canonical cv-triggers per `COVA_TO_DNA_TRIGGER` in `apps/web/lib/styles/lora-registry.ts` are `cvwmn, cvscn, cvbio, cvmcm, cvcst, cvboh, cvind, cvfrm, cvdco`. Research-doc naming (cvjpd, cvlux, cvmax) does NOT match the implementation registry — reconcile at Phase 4 kickoff.

**Handoff to Phase 5:** render orchestrator must populate `RenderContext.style_blend` from `users.style_blend` before calling Director; otherwise all renders route through single-primary fallback.

---

## Phase 2 — Empty-room service (completed 2026-04-20)

**Commits:** 5036ec9, f71e1d8, 6298810, and the Phase 2 closeout commit.
**Scope:** new `modal_pipeline/empty_room.py`, new `apps/web/lib/ai/empty-room-client.ts`, new `apps/web/tests/ai/empty-room-client.test.ts`, new `bench/scripts/run_phase_2_service_bench.py`, `bench/phase-2-empty-room/`, `docs/phase-2/*`.

**Deployed Modal app:** `cova-empty-room` at
`https://cova-interior--cova-empty-room-emptyroom-api.modal.run`.
A10G, Python 3.10, 1 endpoint: `POST /v1/generate_empty_room`.

**Pipeline (ported 1:1 from Phase 0.5 Run 3):**
SAM 3 × 20 furniture prompts (parallel, `max_workers=6`) → union mask →
24px morphological dilation → 35% coverage router (LaMa ≤35% via
`fal-ai/lama`, Bria >35% via `fal-ai/bria/eraser`) → output download →
architectural-patch SSIM on clean 200×200 upper-third patch → return
`EmptyRoomResponse` schema_version "1.0".

**Acceptance (15-room bench, [`bench/phase-2-empty-room/results.md`](bench/phase-2-empty-room/results.md)):**
- Architectural-patch SSIM ≥ 0.80: **15/15 pass** (mean 0.975, min 0.902).
- Per-call cost: $0.14 flat, ≤ $0.30 target.
- Router distribution: 10 LaMa / 5 Bria — exact match to Run 3.
- **Latency gate MISSED:** p95 95s parallel / 88s sequential vs 45s target.
  Tracked as F2-LATENCY.1 with four named self-heal paths.

**Environment variables:**
- `COVA_EMPTY_ROOM_URL` — optional override; client falls back to production URL above.

**Client usage:**
```ts
import { generateEmptyRoom, EmptyRoomCoverageTooHighError } from "@/lib/ai/empty-room-client";
const res = await generateEmptyRoom(imageUrl);
// 413 → EmptyRoomCoverageTooHighError with .coveragePct for UX gate (F2-COVERAGE.1).
```

**Non-goals kept out:** `empty_room_cache` Supabase table (zero projected
hit rate, deferred F2-CACHE.1); perception integration at service
request-time (phase-2 calls SAM 3 directly, see
[`docs/phase-2/service-design.md`](docs/phase-2/service-design.md) §3).

**Handoff to Phase 5:** call `/v1/generate_empty_room`, pass
`empty_room_url` as the reference image for NB-Pro / FLUX.2 Pro Edit.
Use `mask_coverage_dilated_pct` to key decide extra prompt scaffolding
on high-coverage rooms.

**Phase 2.5 latency fix (2026-04-21):** `SAM3_MAX_WORKERS` 6→20 +
`client_timeout=40s` + parallel mask downloads took 88s p95 → 42.6s
warm p95 / 53.3s cold p95 with 15/15 SSIM preserved and $0.14/call flat.
Target <30s not fully met; residual is fal SAM3 server-side tail. See
`docs/phase-2/CLOSEOUT.md` §Phase 2.5 addendum and
`bench/phase-2-empty-room/results-v2.md`. F2-LATENCY.1 is PARTIALLY
RESOLVED.

**Deferred:** F2-LATENCY.1 (remaining gap to <30s — upstream ceiling), F2-CONSOLIDATION.1
(deprecate `cova-restoration-pipeline` + `cova-grounded-sam2` after Phase 5
adoption), F2-PERCEPTION.1 (add furniture-spec endpoint to perception),
F2-CACHE.1, F2-TEXTURE.1, F2-COVERAGE.1, F2-HEALTHZ.1. See
[`docs/phase-2/follow-ups-deferred.md`](docs/phase-2/follow-ups-deferred.md).

---

## Phase 5 — Redesign service + Collov-calibrated gate (completed 2026-04-21)

**Scope:** new `modal_pipeline/redesign.py` (cova-redesign on A10G),
new `apps/web/lib/ai/redesign-client.ts` + 17 tests, F3-BLEND-CTX.1
resolved in `apps/web/lib/ai/renderContext/assembler.ts` +
`apps/web/app/api/pipeline/redesign/route.ts`,
`bench/phase-5-redesign/` artifacts, `bench/scripts/smoke_phase_5_redesign.py`,
`bench/scripts/run_phase_5_redesign_bench.py`, `bench/scripts/run_phase_5_judge.py`,
`bench/scripts/run_phase_5_reflection.py`, `docs/phase-5/CLOSEOUT.md`.

**Deployed Modal app:** `cova-redesign` at
`https://cova-interior--cova-redesign-redesign-api.modal.run`.
A10G, Python 3.10, 1 endpoint: `POST /v1/generate_redesign`.

**Pipeline:** resolve weighted LoRA stack from `(archetype_key, style_blend)`
using `LORA_REGISTRY` (10 trained archetypes mirrored from
`apps/web/lib/styles/lora-registry.ts`) → build D_full_activation prompt
(3× trigger prefix + typed prose + archetype vocab + 2× trigger suffix)
→ `fal-ai/flux-general/image-to-image` with strength=0.82,
guidance=3.5, steps=28, LoRA stack of 3 (1 style + add-details + realism)
→ `nano-banana-pro/edit` fallback on any flux-general failure.
Reflection hooks: `strength_override`, `guidance_override`,
`lora_scale_multiplier`, `prompt_override`, `seed`.

**Acceptance (15-room bench, [`bench/phase-5-redesign/PHASE_5_RESULTS.md`](bench/phase-5-redesign/PHASE_5_RESULTS.md)):**
- Gate: composite ≥ 7.5 AND style_fidelity ≥ 7.0 (beats Collov bar).
- **14/15 rooms beat Collov** (gate threshold: 11/15) — PASS.
- Mean composite: **8.44** vs Collov baseline **7.10** (+1.34).
- Mean style_fidelity: **8.27** vs Collov **5.50** (+2.77 — key axis).
- 10 rooms pass at base, 4 recovered at reflection iter 1, 1 stuck
  (room-02 piano+MCM living-room — tracked as **F5-ROOM-02-HARD.1**).
- Total Phase 5 spend: **$2.19** (93% under $30 cap).
- Judge: `claude-sonnet-4-5` vision, 4 Collov reference PNGs per call,
  6-axis rubric, temperature 0, 35 judge calls total.

**F3-BLEND-CTX.1 (Phase 3 deferred) resolved:**
`assembler.ts` now derives `style_blend` from v3 fingerprints via
`fingerprintToStyleBlend(dims)` and writes both `style_blend` (snake)
and `styleBlend` (camel) to the `RenderContext`. The redesign route
adds a fallback path from `rooms.style_blend` when the assembled
context is missing it. Director now activates the weighted-blend path
(not the single-primary fallback) on v3-fingerprint users. 35 assembler
tests pass (32 existing + 3 new).

**Service fix caught in-bench:** `_build_prompt` accepted `room_type`
but never emitted it, causing 7/15 rooms to transform room type. Patch
adds `_ROOM_TYPE_PHRASE` + `preserve original room architecture`
clause; rooms 03 + 11 then passed at base, 09 + 12 unlocked under
reflection.

**Environment variables:**
- `COVA_REDESIGN_URL` — optional override; TS client falls back to
  the production URL above.

**Modal workspace note:** Deploying `cova-redesign` hit the 8-web-endpoint
workspace limit. Stopped `cova-restoration-pipeline` (Phase 0 audit:
dormant, no web callers) and `cova-clip-text-embed` (only web caller
`apps/web/lib/clipSearch.ts` is DORMANT per its header; v9 uses Serper
+ Google Lens for product matching). Both trivially restorable via
`modal deploy modal_pipeline/<name>.py` if needed.

**Client usage:**
```ts
import { generateRedesign } from "@/lib/ai/redesign-client";
const res = await generateRedesign({
  emptyRoomUrl: "https://…empty.png",
  archetypeKey: "COVAJAPANDI",
  styleBlend: { COVAJAPANDI: 0.7, COVASCANDINAV: 0.3 },
  roomType: "bedroom",
  budgetMax: 5000,
});
// res.provider === "flux-general"  (or "nano-banana-pro" on fallback)
// res.loras_used === [{ trigger: "cvwmn", … }, add-details, realism]
```

**Deferred:** F5-ROOM-02-HARD.1 (piano+MCM+living-room edge case —
Phase 7 CoHP candidate), F5-COLDSTART.1 (flux-general 3-parallel cold
start → NB-Pro fallback; add warmup), F5-BIOPHILIC-BENCH.1 (cvbio
absent from Phase 5 bench), F5-ROOMTYPE-DEFAULT.1 (strength 0.82 vs
0.70 per-room), F5-JUDGE-DETERMINISM.1 (minor Sonnet run-to-run noise
at temperature 0), F5-ROOM02-CALIBRATE.1. See `docs/phase-5/CLOSEOUT.md`.

**Handoff to Phase 7:** room-02 is the sole gate failure and the
primary CoHP test case. Rooms that scored 8.4-8.85 at base (01, 03,
07, 08, 11, 15) are secondary CoHP polish candidates.
