═══════════════════════════════════════════════════════════════════

1. WHAT THIS PROJECT IS
   ═══════════════════════════════════════════════════════════════════

Cova Interior — AI interior design web app.

- Stack: Next.js 14 (App Router), TypeScript, Supabase, Modal Labs, Replicate.
- Auth: Supabase Google OAuth. HTTP-only cookies via `@supabase/ssr`.
- Deployment: Vercel, team `cova-interior`, root directory `apps/web`.
- Supabase project: `xdeacbmkdwqrwxonqaqh`.
- Monorepo: `apps/web` is the active app. `apps/mobile` is FROZEN — never touch.
- Python pipelines live in `modal_pipeline/` and run as Modal webhooks.

═══════════════════════════════════════════════════════════════════ 2. THE USER FLOW (source of truth)
═══════════════════════════════════════════════════════════════════

Routes live under `apps/web/app/design/step-*`. Quiz/fingerprint state is held in a Zustand store (`lib/store` / `lib/stores`) and only persisted to Supabase at the points noted.

- `/` — Landing. Unauthed CTA into `/auth`.
- `/auth` — Supabase Google OAuth via `@supabase/ssr`.
- `step-1` — Welcome. No API, no DB write. Navigates to step-2.
- `step-2` — Pick 2 of 9 style anchors. Writes selections to Zustand only.
- `step-3` — 12 pairwise quiz comparisons. Fires `GET /api/quiz/next-card`, `POST /api/quiz/next-pair` per response, then `POST /api/quiz/fingerprint` which writes `users.style_fingerprint`, `users.style_blend`, and inserts into `style_fingerprints`. `GET /api/quiz/validation-renders` may fire for preview images.
- `step-4` — Fingerprint reveal. Reads the fingerprint back and renders a radar chart. No writes.
- `step-5` — Budget tier selection. Persists budget into `rooms.render_context`.
- `step-6` — Room photo upload. Single image only, no video path. Also offers a QR handoff to mobile; token validation via `POST /api/capture/validate-token`. Uploads image to Supabase Storage (`room-videos` bucket) and creates a row in `rooms` with `rooms.original_image_url` / `rooms.original_photo_url`.
- `step-7` — Pre-detection loading screen. Fires `POST /api/pipeline/pre-detect`. Pre-detection writes `rooms.pre_detection_result`. Redesign pipeline fires from step-7d after persistRenderContext() writes rooms.render_context. Deliberately not step-7 — render_context must be populated first.
- `step-7b` — Room constraints form (dimensions, constraints, preferences). Updates `rooms.render_context`.
- `step-7c` — Keep/remove detected items. DYNAMIC ONLY: reads `rooms.pre_detection_result`; if that is not yet populated, it shows a loading state. There are no hardcoded default items. Keep/remove decisions are stored locally and folded into the next render call.
- `step-7d` — Personalization chat. Fires `POST /api/design-chat`. "Design My Room" CTA calls `persistRenderContext()`, then fires `POST /api/pipeline/redesign`, then navigates to step-8a.
- `step-8a` — Render reveal. Polls `GET /api/rooms/status?roomId=…` for `rooms.redesign_pano_url` and `rooms.perspective_render_url`. Displays a single flat 2D image. Offers "Refine This" (→ step-8b) and "Shop This Look" (→ step-9).
- `step-8b` — Refinement. Up to 3 refinements; 4 options per round.
- `step-9` — Shoppable room. On load, reads `room_products` for the room. If empty, fires `POST /api/pipeline/furniture-match {room_id}` and polls. Renders hotspots at `hotspot_x` / `hotspot_y` with the matched product cards.

═══════════════════════════════════════════════════════════════════ 3. THE RENDER PIPELINE
═══════════════════════════════════════════════════════════════════

- Trigger: step-7d fires `POST /api/pipeline/redesign {room_id}` after `persistRenderContext()` succeeds.
- Route: `apps/web/app/api/pipeline/redesign/route.ts`. It loads the room, the user's `style_fingerprint` and `style_blend`, and dispatches to the Modal webhook at env var `REDESIGN_PIPELINE_WEBHOOK_URL`.
- Modal: `modal_pipeline/redesign_pipeline.py::redesign_webhook`.
  - Gemini 2.5 Flash — room architecture analysis via `lib/ai/room-analyzer.ts` (`analyzeRoomArchitecture`). Non-blocking; best effort.
  - Claude Sonnet — prompt compilation via `lib/ai/prompt-compiler.ts` (`compilePromptWithClaude`). Falls back to `buildFluxPrompt` in `lib/ai/flux.ts` if Claude compile fails.
  - Replicate FLUX Kontext Pro (`black-forest-labs/flux-kontext-pro`) — primary render → written to `rooms.redesign_pano_url`.
  - Replicate FLUX Depth Pro (`black-forest-labs/flux-depth-pro`) — perspective render → written to `rooms.perspective_render_url`.
  - Both FLUX calls run in parallel.
- Final output: a single flat 2D image at `rooms.redesign_pano_url`. The column name is a legacy artifact from an earlier panorama design — it now stores a flat image.
- Status: `rooms.redesign_status` transitions through `queued` → `rendering` → `complete` (and `matching_products` during step-9). Step-8a polls via `GET /api/rooms/status`.

═══════════════════════════════════════════════════════════════════ 4. THE PRODUCT MATCHING PIPELINE
═══════════════════════════════════════════════════════════════════

- Trigger: step-9 on load, only if `room_products` is empty for the room.
- Route: `apps/web/app/api/pipeline/furniture-match/route.ts`.
- Modal: `modal_pipeline/furniture_matching_pipeline.py`.
- Input: `rooms.render_detection_result` (detected items + positions from the render).
- Process: for each detected item, Serper shopping search (`https://google.serper.dev/shopping`, `lib/ai/serper.ts`) → filter → rank → insert `room_products` rows.
- Idempotency: atomic lock by setting `rooms.redesign_status = 'matching_products'` with a guard that excludes `'matching_products'` and `'complete'`, so concurrent step-9 loads cannot double-run the pipeline.
- Output columns on `room_products`: `hotspot_x`, `hotspot_y`, `match_label`, `serp_product_url`, plus `furniture_label`, `furniture_description`, `serp_title`, `serp_price`, `serp_retailer`, `serp_image_url`, `similarity_score`, `match_score`, `rank`, `azimuth_degrees`, `elevation_degrees`, `is_sale`, `is_unlocked`, `product_id`.
- Fallback: if zero Serper results after retry, insert detection-only rows sourced from `rooms.render_detection_result` so step-9 always has hotspots to render.

═══════════════════════════════════════════════════════════════════ 5. LOCKED DECISIONS — NEVER CHANGE THESE
═══════════════════════════════════════════════════════════════════

- `apps/mobile/` is FROZEN. Never touch any file here.
- Auth uses HTTP-only cookies via `@supabase/ssr` only. Never use `localStorage` or `sessionStorage` for auth state.
- Client Components: `createBrowserClient` from `@supabase/ssr`.
- Server Components, API routes, middleware: `createServerClient` from `@supabase/ssr`.
- All CLIP embedding work runs server-side (Supabase Edge Functions or API routes). Never call CLIP from a `'use client'` component.
- `SUPABASE_SERVICE_ROLE_KEY` must never appear in a `NEXT_PUBLIC_*` variable.
- `products` table is frozen (holds 768-dim CLIP embeddings). Do not alter its schema.
- Modal GPU: A10G only.
- Supabase project ID is `xdeacbmkdwqrwxonqaqh`. Do not change.
- Never expose raw internal style anchor names to the user. Route through `toDisplayName()` and `sanitizeForbiddenStyleNames()`.

═══════════════════════════════════════════════════════════════════ 6. WHAT IS INTENTIONALLY NOT IN THE PIPELINE
═══════════════════════════════════════════════════════════════════

These files exist in the repo but are NOT part of the active flow. Do not wire them in, call them, or reference them in new code without explicit instruction.

- Marble API: `modal_pipeline/marble_pipeline.py`, `marble_plus_pipeline.py`, `marble_mini_final_pipeline.py`, `marble_multi_image_pipeline.py`. Not imported by `redesign_pipeline.py` or any TS route. Client-side, `apps/web/lib/marble.ts` has every function throwing a `MARBLE_DISABLED` error. Do not re-enable.
- Depth video pipeline: `modal_pipeline/depth_video_pipeline.py`. A previous step-8a called it; it is not part of the current flow.
- Panorama / equirectangular rendering: removed. Output is a flat 2D image. `rooms.redesign_pano_url` stores a flat image despite its name.
- Video upload: step-6 accepts images only. No video path exists.
- AnySplat / room reconstruction: `modal_pipeline/room_reconstruction.py`. Not called by the active flow.
- Hardcoded furniture items: step-7c previously shipped with ~14 hardcoded defaults. Removed. Step-7c renders only real items from `rooms.pre_detection_result`.

═══════════════════════════════════════════════════════════════════ 7. EXTERNAL SERVICES MAP
═══════════════════════════════════════════════════════════════════

- Anthropic Claude (`@anthropic-ai/sdk`):
  - Claude Sonnet — prompt compilation in `lib/ai/prompt-compiler.ts`, consumed by `/api/pipeline/redesign`.
  - Also used in `/api/detect/render`, `/api/fingerprint/explain`, `/api/match`, `/api/match/complete-room`, `/api/match/coherence`, `/api/design-chat`, `/api/render`, `/api/render/refine`, `/api/parse-constraints`.
- Google Gemini 2.5 Flash (`@google/generative-ai`): `lib/ai/room-analyzer.ts` — room architecture analysis consumed by `/api/pipeline/redesign`.
- Replicate (`replicate`):
  - `black-forest-labs/flux-kontext-pro` — primary redesign render.
  - `black-forest-labs/flux-depth-pro` — perspective render.
  - Clarity upscaler and related utility models used in `/api/swap`, `/api/generate-art`, `/api/quiz/validation-renders`, `/api/render/*`.
  - Configured in `lib/ai/flux.ts` and the Modal `redesign_pipeline.py`.
- Modal Labs: webhooks for `redesign_pipeline.py` (`REDESIGN_PIPELINE_WEBHOOK_URL`), `pre_detection_pipeline.py`, `furniture_matching_pipeline.py`.
- Serper: `lib/ai/serper.ts` (`https://google.serper.dev/shopping`), used by `/api/pipeline/furniture-match`, `/api/match`, `/api/match/accessories`.
- SearchAPI Google Lens: used in `/api/match/route.ts` via `SEARCHAPI_KEY` against `searchapi.io` with `engine=google_lens`.
- Supabase: database, auth, and `room-videos` storage bucket (private, RLS, user-scoped insert/select). Accessed via `@supabase/ssr`.
- URL scraper (`scrapeProductUrl`): defined for product-page enrichment; not wired into the active furniture-match path at the time of this audit (unconfirmed for other routes).

═══════════════════════════════════════════════════════════════════ 8. STYLE SYSTEM
═══════════════════════════════════════════════════════════════════

- 9 styles: Japandi, Modern Luxe, Industrial, Coastal, Maximalist, Scandinavian, Mid-Century, Bohemian, Art Deco.
- Style fingerprint: 12-dimensional vector stored in `users.style_fingerprint`. Also persisted into the `style_fingerprints` table alongside `dimensions`, `covariance`, `confidence`, and `style_name`.
- `users.style_blend`: top-weighted style dimensions (JSONB), used by the redesign prompt compiler.
- Display names are produced by `toDisplayName()` in `apps/web/lib/ai/anchor-display.ts`. Never expose raw internal anchor names in user-facing strings.
- `sanitizeForbiddenStyleNames()` lives in `apps/web/lib/ai/flux.ts` and is mirrored on the Python side in `modal_pipeline/redesign_pipeline.py`. Apply it to any prompt text that reaches a model or the user.

═══════════════════════════════════════════════════════════════════ 9. DATABASE TABLES (key ones)
═══════════════════════════════════════════════════════════════════

Only columns confirmed read or written by the current code are listed.

- `users`: `id`, `style_fingerprint`, `style_blend`. Written by `/api/quiz/fingerprint`. Read by `/api/pipeline/redesign`.
- `rooms`: `id`, `user_id`, `room_type`, `original_image_url`, `original_photo_url`, `photo_url`, `render_context`, `style_blend`, `fingerprint_id`, `pre_detection_result`, `render_detection_result`, `redesign_pano_url`, `perspective_render_url`, `render_url`, `redesign_status`, `matched_products`. Written across step-6, step-7, the redesign pipeline, and the furniture-match pipeline.
- `room_products`: `id`, `room_id`, `furniture_label`, `furniture_description`, `similarity_score`, `rank`, `hotspot_x`, `hotspot_y`, `azimuth_degrees`, `elevation_degrees`, `product_id`, `serp_title`, `serp_price`, `serp_retailer`, `serp_product_url`, `serp_image_url`, `match_label`, `match_score`, `is_sale`, `is_unlocked`. Written by `/api/pipeline/furniture-match`; read by step-9.
- `style_fingerprints`: `id`, `user_id`, `style_name`, `dimensions`, `covariance`, `confidence`. Written by `/api/quiz/fingerprint`; read by step-8a and the redesign pipeline.
- `quiz_anchor_images`: the 9-style anchor image set. Read by `/api/quiz/next-card` and step-2.
- `quiz_comparison_pairs`: pairwise comparison set. Read by `/api/quiz/next-pair` during step-3.
- `products`: frozen catalog with 768-dim CLIP embeddings. Read-only from the web app via pgvector similarity search in the matching paths. Do not alter schema.
