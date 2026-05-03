# Cova Supabase Schema Audit

**Date:** 2026-04-29
**Project:** xdeacbmkdwqrwxonqaqh
**Auditor:** automated DB introspection + apps/web code search
**Scope:** every public-schema table, every column, every index/policy/function/cron/FK
**Source of truth for code:** `apps/web/` only (excluding `_future/`, `tests/`, `scripts/`, `.dev-logs/`, `docs/`)

> **Headline findings**
> 1. The legacy `rooms.personalization_context` column has **0 populated rows** in 308 rooms. The TS `design-director.ts` is the only consumer and it always sees null. The V3 `rooms.personalization` column has 16 populated rows (none in the last 14 days) and is read only by `modal_pipeline/redesign.py`. The two systems do not overlap.
> 2. The style-quiz writes split between `style_fingerprints` (117 rows: 116 v2, 1 v3). The V3 path **discards every step-3 swipe** — when `anchor_prior` is present from step-2, `/api/quiz/fingerprint` computes the fingerprint purely from the prior. The 12 swipes are written nowhere. `swipe_history` is empty (0 rows) yet RLS-protected, indexed, and read by the nightly aggregator.
> 3. **23 of 39 public tables have zero rows** and most of them have no production-code writer either. Several are wired into RLS, indexes, and FKs but are completely dormant.
> 4. The aggregate-style-profiles cron (job_id=1, 02:00 UTC daily) has been running successfully every night since 2026-04-25, but it queries `swipe_history` which is empty, so every run is a no-op.
> 5. `rooms` has accumulated **63 columns** spanning four retired pipelines (Marble, depth-video, perspective-render, V1 single-pass). 142 of 308 rooms are in `redesign_status='failed'` and `redesign_status` itself has 7 distinct values including `"pending\n"` with a trailing newline — clear data-quality drift.

The headline diagnoses for the personalization split-brain (§3) and the quiz mismatch (§4) are at the bottom of those sections. §11 contains the migration recommendations.

---

## 1. Table Inventory

39 tables in `public`, plus `cron.job` / `cron.job_run_details` (system).

| Table | Rows | Last analyze | Status | Purpose (inferred) |
|---|---|---|---|---|
| anchor_renders | 10 | — | **active** | Pre-rendered style anchor images for the quiz step-2 grid. Read by `app/design/_future` and `docs/sessions/step3-render-fix.md`; not in active path. |
| app_config | 2 | — | **active** | `pipeline_version=v3`, `rollout_pct=100`. No code reader found in `apps/web` — likely server-side only. |
| cart_items | 0 | — | **vestigial** | No production-code writer. RLS, FK to `users` + `products_v1`, but never written. |
| chat_messages | 0 | — | **active (empty)** | Read/written by `app/api/chat/history/route.ts` and `app/api/chat/route.ts`, but no production traffic has actually written rows. |
| chat_sessions | 0 | — | **vestigial** | Trigger `chat_sessions_updated_at` exists; no production-code writer found. |
| click_events | 0 | — | **vestigial** | Affiliate-click tracking. No production-code writer. |
| empty_room_cache | 0 | — | **active (empty)** | `app/api/render/empty-room/route.ts` upserts and reads. Cache-hit rate currently 0%. |
| furniture_placements | 0 | — | **vestigial** | Realtor-flow leftover (FK to `rooms`). No production code path. |
| interactions | 0 (1 dead) | — | **active (empty)** | `app/api/interactions/route.ts` writes; `lib/dashboard/queries.ts` and `lib/interactions.ts` read. 1 row was inserted then deleted. |
| jobs | 0 | — | **vestigial** | Generic job-queue table. No production-code writer in `apps/web`. |
| listings | 0 | — | **vestigial** | Realtor share-link flow. Tables, RLS, indexes all exist; no UI. |
| product_impressions | 0 | — | **vestigial** | No production-code writer. |
| product_interactions | 0 | — | **vestigial** | No production-code writer. |
| products | 15,902 | 2026-04-05 | **frozen / legacy** | Original FROZEN catalog per CLAUDE.md (768-dim CLIP via `clip_embedding_data`). Read only by `app/design/step-9/page.tsx`. Same 15,902 IDs as `products_v1` (verified by JOIN). |
| products_v1 | 15,902 | 2026-04-01 | **active** | Production catalog. Adds `clip_embedding`, `clip_fusion_embedding`, HNSW indexes, dimensions_m. 4 retailers only: amazon (13167), overstock (1489), ikea (833), etsy (413). The 12-retailer / 18,150-product spec target is **unmet**. |
| quiz_anchor_images | 9 | — | **active** | 9 anchor styles × style_index. Read by `lib/ai/style-references.ts`, `app/api/quiz/{next-card,mood-board,mood-strip}/route.ts`. |
| quiz_comparison_pairs | 480 | 2026-04-17 | **active** | The 12-pair quiz pool. Read by `app/api/quiz/{next-pair,fingerprint}/route.ts`. |
| rate_limit_events | 0 | — | **vestigial** | Has indexes + RLS. No production-code writer. (Replaced by `rate_limits`.) |
| rate_limits | 4 | — | **active** | Server-only. Lookup by user_id+action+window_start. Used by `lib/rateLimit.ts` (inferred). |
| redesign_feedback | 0 | — | **active (empty)** | `components/SplatViewer.tsx` upserts; nobody has rated a render yet. |
| render_comparison_pairs | 0 | — | **vestigial** | A/B-test support; not in V3 pipeline. |
| render_cost_log | 0 | — | **active (empty)** | `app/api/render/empty-room/route.ts` and `app/api/render/retry/route.ts` insert, but neither has written a row in production yet. Read by `app/api/admin/render-costs/route.ts`. |
| render_rate_limits | 0 | — | **active (empty)** | `app/api/render/retry/route.ts` reads/writes. No traffic. |
| render_retries | 0 | — | **active (empty)** | `app/api/render/retry/route.ts`. No traffic. |
| render_sessions | 63 | 2026-04-08 | **active (cooling)** | Refinement-iteration log. Last insert >14 days ago. Written by `app/api/render/refinement/apply/route.ts`. **0 inserts in last 14 days**. |
| renders | 40 | 2026-03-28 | **legacy** | The pre-V3 render registry. **0 inserts in last 14 days.** V3 pipeline writes the result directly to `rooms.redesign_pano_url` (per CLAUDE.md) and bypasses this table. Most of its 40 columns describe the retired V1 pipeline. |
| room_products | 201 | 2026-04-15 | **active** | Hotspot ↔ product matches. Written by `app/api/pipeline/furniture-match/route.ts`, read by `components/FurnitureHotspots.tsx` + step-9. |
| rooms | 308 | 2026-04-28 | **active (bloated)** | Core flow table. **63 columns**, multiple retired pipelines. See §2. |
| sam_embeddings | 15 | — | **active** | SAM-2 embedding cache. 30-day expiry. Used by perception/refinement flow. |
| saved_products | 0 | — | **active (empty)** | `app/design/step-9/page.tsx` upserts on save. No saves yet. |
| style_fingerprints | 117 | 2026-04-20 | **active** | Quiz output. 116 v2 + 1 v3. Written by `/api/quiz/fingerprint`, `/api/quiz/update-fingerprint`, `/api/auth/callback`. See §4. |
| style_loras | 10 | — | **active** | LoRA registry. 10 archetypes. Read by `lib/ai/lora-registry.ts`. |
| style_purchase_signals | 0 | — | **vestigial** | No production-code writer. |
| style_vectors | 9 | — | **active** | The 9 canonical style code → 6-dim vector lookups. Read by `lib/ai/style-match.ts` (inferred from imports). |
| swipe_history | 0 | — | **vestigial — but read by cron** | 0 rows. Cron job 1 reads it nightly (no-op). No production-code writer. RLS recently added (2026-04-19). |
| token_transactions | 0 (8 dead) | — | **disabled** | Token system. `users.tokens_enabled` defaults `false`. 8 rows were inserted then deleted (test data). |
| user_style_profiles | 0 | — | **vestigial — written by edge fn** | Aggregate-style-profiles cron writes here, but only when swipe_history has data. Never populated. |
| users | 9 | 2026-04-08 | **active** | Account table. Mirrors `auth.users` (FK). Holds `style_fingerprint`, `style_blend`, etc. |
| votes | 0 | — | **vestigial** | Realtor-listing voting. No UI. |

**Legend**
- **active** — code reads/writes and the column is non-empty.
- **active (empty)** — code path exists but no rows have been written in production.
- **active (cooling)** — was active recently, but stopped getting writes when V3 launched.
- **vestigial** — no production-code path, table is unused. Safe to drop after a final code-search confirmation.
- **frozen / legacy** — explicitly preserved by CLAUDE.md rules but superseded.
- **disabled** — feature gated off, no traffic.

---

## 2. Column-Level Detail (selected critical tables)

For brevity this section drills into the four tables that drive the active flow (`rooms`, `users`, `style_fingerprints`, `renders`) and any tables with non-obvious column shape. Empty/vestigial tables are documented at the inventory level.

### 2.1 `rooms` (63 columns) — bloat is the primary issue

`rooms` carries the full state of one user's design session and has accumulated columns from V0 (Marble + AnySplat), V1 (perspective-render + flythrough), V2 (depth-conditioning + hotspot-timing), V3 (personalization + render_context). Below: every column, role today, code reference, status. **Confirmed empty in production** means a SQL count of `IS NOT NULL` rows returned 0.

#### Identity & ownership (active)
| Column | Type | Default | Status | Notes |
|---|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | active | PK |
| `user_id` | uuid NOT NULL | — | active | FK → `users.id`, RLS scoping key |
| `name` | text NOT NULL | `'My Room'` | active | UI display |
| `created_at` / `updated_at` | timestamptz | `now()` | active | Trigger `rooms_updated_at` keeps `updated_at` fresh |
| `status` | text NOT NULL | `'active'` | active-ish | Only `'active'` observed |
| `design_step` | int | 0 | active | UI breadcrumb |
| `pipeline_version` | text | `'v3'` | active | Stable |

#### Photo intake (active, but doubled-up)
| Column | Type | Status | Notes |
|---|---|---|---|
| `original_image_url` | text | active | The new V3 path writes here. |
| `original_photo_url` | text | active (legacy alias) | Older route writes here; `redesign/route.ts:241-242` reads either. **Two columns hold the same logical value.** Unify. |
| `video_url` | text | vestigial | Capture-via-video flow retired. |
| `capture_photo_urls` | jsonb | vestigial | Multi-image capture mode retired (`capture_mode` defaults to `multi_image` but only one URL is used in V3). |
| `capture_mode` | text | vestigial | Default `multi_image`; never read in active path. |
| `preprocessed_image_url` | text | active | DarkIR + OpenCV output. 9/308 set. |
| `professionalized_image_url` | text | retired | V1 professionalization pass. CLAUDE.md confirms "removed 2026-04-13". 9/308 set (legacy data). |

#### Style intent (active)
| Column | Type | Status | Notes |
|---|---|---|---|
| `style_blend` | jsonb NOT NULL | active | Map archetype → weight. **207/308 are `{}`** (rooms created before quiz wiring, or quiz never completed). |
| `redesign_style` | text | active | Single-archetype label; legacy. |
| `final_style_vector` | jsonb | vestigial | No code writer in active path. |
| `style_blend` (`v3`) | jsonb | n/a — see `users.style_blend_v3` |

#### Personalization (THE split-brain — see §3)
| Column | Type | Status | Notes |
|---|---|---|---|
| `personalization` | jsonb | active V3 | Written by `app/api/personalization/save/route.ts`. Read by `app/api/pipeline/redesign/route.ts:164` and forwarded to `modal_pipeline/redesign.py`. **16/308 rows populated; 0 in last 14 days.** |
| `personalization_context` | jsonb | **dead column** | Written **only** by `app/design/_future/step-7e..h` (in `_future/`, not routable). Read by `apps/web/lib/ai/design-director.ts:839` and `app/api/pipeline/redesign/route.ts:191-198` (which merges it into `render_context`). **0/308 rows populated.** |
| `render_context` | jsonb | active V3 | The assembled context object the Director consumes. 27/308 set. |
| `design_brief` | jsonb | active | Director Call 1 output. 8/308. |
| `flux_prompt` | text | active legacy | Director Call 2 output. 11/308. CLAUDE.md notes Director is "no longer the primary prompt source" in V3 but is still called by `redesign/route.ts:337`. |
| `room_analysis` / `room_context` / `room_constraints` / `unsplash_references` | jsonb | active legacy | Used by V1 fallback prompt path. |
| `identityBrief` (read via `render_context.identityBrief`) | jsonb | inactive | No write path; design-director.ts:821 reads it but no producer. |

#### Detection & masks
| Column | Type | Status | Notes |
|---|---|---|---|
| `detection_status` | text | **broken default** | All 308 rows = `'pending'`. Default is `'pending'`. No code path updates it; the V3 pipeline writes `redesign_status` instead. |
| `detection_metadata` | jsonb | active legacy |
| `pre_detection_result` | jsonb | active legacy | Written by retired `cova-pre-detection` Modal app. |
| `render_detection_result` | jsonb | active | Read by `app/design/step-9/page.tsx` for hotspot data. |
| `keep_mask` | jsonb | active legacy | 87/308. Written by older keep-remove flow; V3 doesn't use. |
| `keep_remove_decisions` | jsonb | active | step-7c list of keep/remove names. Read by `redesign/route.ts:300`. |
| `inpainting_mask_url` | text | vestigial | 2/308 set. |
| `change_map_url` / `canny_map_url` | text | vestigial | V1 differential-diffusion artifacts. |
| `fixed_furniture` / `required_objects` | jsonb | vestigial |

#### 3D / panorama (all retired)
| Column | Type | Status | Notes |
|---|---|---|---|
| `splat_path` | text | retired | AnySplat. CLAUDE.md disables 3D output. 4/308 (legacy). |
| `marble_mini_world_id` / `marble_mini_spz_url` / `marble_spz_url_500k` / `marble_spz_url_100k` / `marble_plus_thumbnail_url` | text | retired | Marble API disabled. 4 rows have `marble_spz_url_500k` set (legacy). |
| `redesign_pano_url` | text | active (legacy name) | Per CLAUDE.md: "stores flat 2D image (legacy name)". 21/308 set. |
| `flythrough_video_url` / `flythrough_ready` / `flythrough_duration_seconds` | text/bool/double | retired | Depth video pipeline disabled. 3/308 had it. |
| `parallax_video_url` | text | active legacy | `app/api/parallax/route.ts` writes. |
| `perspective_render_url` | text | retired | 6/308. Disabled. |
| `depth_map_url` / `depth_map_url_v2` / `depth_map_quality_score` | text/double | retired | 31 / 3 / — set. Depth-conditioning columns from M5 pipeline. |
| `depth_conditioning_method` | text | retired |

#### Render output / status
| Column | Type | Status | Notes |
|---|---|---|---|
| `render_url` | text | active | 77/308. **Three render-URL columns coexist.** |
| `latest_render_url` | text | active | 19/308. Newer column. |
| `redesign_pano_url` | text | active | 21/308. (Above.) |
| `render_count` | int NOT NULL | active | Increment via SQL fn `increment_rooms_render_count`. |
| `render_ready` | bool | active legacy |
| `redesign_status` | text | **dirty enum** | Values observed: `pending` (146), `failed` (142), `complete` (15), `kontext_complete` (2), `video_ready` (1), `pending\n` (1, with newline), `render_complete` (1). 142/308 ≈ 46% failed — pipeline-quality issue, not schema. |
| `redesign_error` | text | active | Stores error message. |
| `matched_products` | jsonb | active | Step-9 hotspot match results. |
| `design_chat_history` | jsonb | active legacy |
| `aesthetic_score` | double | active | LAION quality gate. |

#### Empty-room / V3 specifics
| Column | Type | Status | Notes |
|---|---|---|---|
| `empty_room_url` | text | **never written, read every render** | `redesign/route.ts:766` reads it; no code path writes back to it. The `app/api/render/empty-room/route.ts` writes only to the `empty_room_cache` table. **0/308 set.** Pipeline currently inlines empty-room generation per request. |
| `wall_change_requested` / `floor_change_requested` | bool | active V3 |

#### Other
| Column | Type | Status | Notes |
|---|---|---|---|
| `budget` | int NOT NULL | active | default 2500 |
| `room_type` | text | active | default `'living_room'` |
| `room_dimensions` / `dimensions_json` / `dimensions` | jsonb / jsonb / text | **3 ways to store dimensions** | Pick one; legacy duplication. |
| `wall_color_extracted` | text | active legacy |
| `calibration_data` | jsonb | retired (AnySplat) |
| `scene_state` | jsonb | retired |
| `listing_id` | uuid | vestigial (realtor) |
| `modal_job_id` | text | vestigial |
| `pipeline_mode` | text | active legacy | Default `'mini_async_plus'` (Marble Plus) |
| `pipeline_cost_log` | jsonb | active legacy | 0 set |
| `plus_eligible` / `plus_started_at` / `plus_completed_at` / `plus_upgrade_ready` | bool/ts/ts/bool | retired (Marble Plus) |
| `engagement_seconds` / `furniture_matches_count` / `hotspot_timing` | double / int / jsonb | active analytics |
| `user_feedback_score` | int | active legacy |
| `is_public` | (none — on `renders`, not rooms) |
| `fingerprint_id` | uuid | active | FK → `style_fingerprints.id` (added 2026-04-15 phase1_foundation). |
| `generation_seed` | int | active |
| `negative_prompt` | text | active legacy |
| `inclusions` / `constraints` (text[]) | array | active legacy |
| `preview_url` | text | active |

**Bottom line on `rooms`**: of 63 columns, ~25 are V3-active, ~10 are active-legacy still read on fallback paths, and **~28 are unambiguously dead** (Marble, depth video, perspective render, splats, calibration, Marble Plus). See §11.2 for drop list.

---

### 2.2 `users` (21 columns)

| Column | Type | Status | Notes |
|---|---|---|---|
| `id` | uuid PK | active | FK → `auth.users` |
| `email` | text NOT NULL | active |
| `full_name` | text | active |
| `account_type` | text NOT NULL | active | default `'user'` |
| `style_fingerprint` | jsonb NOT NULL | **active — V2/V3 mixed** | 7 of 9 users have it; 6 have V2 dim names (`era/nature/density/...`), 1 has V3 dim names (`warmth/pattern/formality/complexity/...`). See §4. |
| `style_blend` | jsonb | active | Map archetype → weight. 7/9 set. |
| `style_blend_v3` | jsonb | **never written** | 0/9 rows. Column added 2026-04-16 in `quiz_v3_schema` migration but no production-code writer found. |
| `primary_style` / `secondary_style` | text | active | Set by `/api/quiz/fingerprint`. 2/9. |
| `primary_weight` / `secondary_weight` | double | active | 7/9 (default 0). |
| `interactions_count` | int | active | Used in `/api/quiz/update-fingerprint` decay. |
| `budget_dna` | jsonb NOT NULL | vestigial | Default `'{}'`. No active writer. |
| `token_balance` | int NOT NULL | disabled | default 5; `tokens_enabled` defaults false. |
| `tokens_enabled` | bool NOT NULL | disabled | Feature flag. |
| `stripe_customer_id` | text | future |
| `onboarding_completed` | bool NOT NULL | active |
| `last_active_at` / `last_active` | timestamptz | **duplicated** | Two columns for the same idea; pick one. |
| `created_at` | timestamptz NOT NULL |
| `avatar_url` | text |
| `auth_provider` | text |

---

### 2.3 `style_fingerprints` (12 columns) — schema versioning bug

| Column | Type | Status | Notes |
|---|---|---|---|
| `id` | uuid PK | active |
| `user_id` | uuid NOT NULL | active | FK → `users.id` |
| `vector_data` | jsonb NOT NULL | **vestigial** | Default `'[]'`. Older flat-array storage. Never read in active path; superseded by `dimensions`. |
| `dimensions` | jsonb NOT NULL | active | Map dim_name → 0..1. **Schema differs by version** — see below. |
| `covariance` | jsonb NOT NULL | active V2 only | Default `'[]'`. V3 path writes a 12×12 zero matrix; not used downstream. |
| `confidence` | double NOT NULL | active | default 0. |
| `fingerprint_version` | text | active | `'v2'` (116 rows) / `'v3'` (1 row). Default `'v2'`. |
| `style_name` | text | vestigial | Older single-style label. |
| `room_type` | text | active | Per-room fingerprint scoping. |
| `budget_tier` | text | vestigial |
| `quiz_responses` | jsonb NOT NULL | active V2 only | 90 rows have data, 27 are empty. **V3 path never writes this** (the swipes are dropped). |
| `entry_path` | text | active |
| `created_at` | timestamptz NOT NULL |

**Dimension-name divergence:**
| Version | Dim names |
|---|---|
| v1/v2 (116 rows) | `era`, `nature`, `density`, `pattern`, `texture`, `material`, `formality`, `lineQuality`, `colorSaturation`, `lightPreference`, `colorTemperature`, `culturalInfluence` |
| v3 (1 row) | `warmth`, `pattern`, `formality`, `complexity`, `lineQuality`, `lightingDrama`, `plantPresence`, `colorSaturation`, `lightPreference`, `textureRichness`, `natureMateriality`, `symmetryPreference` |

Only 4 dim names overlap (`pattern`, `formality`, `lineQuality`, `colorSaturation`, `lightPreference`). Any code reading from a `dimensions` blob without checking `fingerprint_version` will silently degrade.

---

### 2.4 `renders` (40 columns) — 0 inserts in last 14 days

The V3 pipeline writes results to `rooms.redesign_pano_url` (per CLAUDE.md) and bypasses the `renders` table entirely. The 40 existing rows date to ≤2026-03-28. Most columns describe the retired V1 multi-stage pipeline:

| Status | Columns |
|---|---|
| Active legacy | `id, room_id, user_id, status, image_url, created_at, design_rationale` |
| Quality scoring (active legacy) | `brisque_score, clip_style_score, laion_score, hps_score, composite_score, q_align_score, aesthetic_score, was_selected` |
| V1 prompt artifacts | `prompt_used, negative_prompt_used, denoising_strength, guidance_scale, seed, replicate_prediction_id, render_type, quality_tier` |
| Marble | `splat_url, redesign_splat_url, marble_operation_id, modal_job_id, panoramic_url, panoramic_prediction_id, is_panoramic` |
| Style | `style_applied, style_blend_secondary, style_blend_ratio, style_vector` |
| V3 carry-over | `loras_used, empty_room_url, stage, pipeline_version` |
| Tokens | `tokens_charged, tokens_used` |
| Realtor | `is_public` |

If kept, the table is read-only for analytics. If dropped, the V3 flow loses nothing (it never writes here).

---

### 2.5 `room_products` (16 columns)

Active. Stores hotspot ↔ catalog matches per room. Notable:
- `azimuth_degrees`, `elevation_degrees`, `hotspot_x`, `hotspot_y` — placement vectors used by `components/FurnitureHotspots.tsx`.
- `serp_*` columns (`serp_title`, `serp_price`, `serp_retailer`, `serp_product_url`, `serp_image_url`) — Serper Google Shopping fallback when no `product_id` exists. CLAUDE.md endorses this path.
- `is_unlocked` (bool, default false) — token-gated reveal. Inactive while tokens disabled.
- `visible_from_second` / `visible_to_second` — flythrough timestamps; vestigial.

### 2.6 `quiz_anchor_images` / `quiz_comparison_pairs`

Active and read by quiz routes. `quiz_comparison_pairs.is_validated` defaults `false`; 16 of 480 rows have `livability_score_a/b` set. Indexes `idx_pairs_dimension`, `idx_pairs_validated` are heavily used (10k+ tuple reads).

### 2.7 `style_loras` (12 columns)

Read by `lib/ai/lora-registry.ts` (1 active query). All 10 archetype LoRAs present. `validation_urls`, `training_steps`, `training_image_count` populated for new ones.

### 2.8 Empty/vestigial tables — column shape preserved for migration reference

`cart_items`, `chat_messages`, `chat_sessions`, `click_events`, `furniture_placements`, `interactions`, `jobs`, `listings`, `product_impressions`, `product_interactions`, `rate_limit_events`, `redesign_feedback`, `render_comparison_pairs`, `render_cost_log`, `render_rate_limits`, `render_retries`, `saved_products`, `style_purchase_signals`, `swipe_history`, `token_transactions`, `user_style_profiles`, `votes` — all have schema, RLS, indexes, and 0 rows. Schema details in `information_schema.columns` if needed for a `pg_dump` migration; not reproduced here to keep this report scannable.

---

## 3. Personalization Path Forensics — split-brain diagnosis

### Inventory

There are **two `rooms` columns** + one transient struct:

| Column / field | Schema | Where written | Where read | Row count populated |
|---|---|---|---|---|
| `rooms.personalization_context` | jsonb (free-form `{smart_tech, art, lifestyle, required_object}`) | `apps/web/app/design/_future/step-7e/page.tsx`, `_future/step-7f`, `_future/step-7g`, `_future/step-7h` (all retired V1 screens; **not routable**, paths under `_future/` are not exposed) | `apps/web/lib/ai/design-director.ts:839-923` (legacy V1 director, still called by `redesign/route.ts:337`); `apps/web/app/api/pipeline/redesign/route.ts:191-198` (merges into `render_context`) | **0 / 308** |
| `rooms.personalization` | jsonb (V3 manifest schema_version 2: `{art, smart_products, specific_items, lighting, identity_objects, freetext}`) | `apps/web/app/api/personalization/save/route.ts` (called by `app/design/step-7p/page.tsx`) | `app/api/pipeline/redesign/route.ts:770` → forwarded to `modal_pipeline/redesign.py` (Sonnet planner + per-pass fragment builders) | 16 / 308; **0 in last 14 days** |
| `render_context.personalization_context` (transient) | merged in-memory at request time | `redesign/route.ts:192-198` synthesizes from `rooms.personalization_context` | `lib/ai/design-director.ts:839` | always-null because source column is always-null |

### Disconnects

1. **`personalization_context` is a dead column.** The only writers live under `app/design/_future/` which `apps/web/app/design/_future/README.md` documents as retired. No production page links to `_future/step-7e..h`. Confirmed in the DB: 0 of 308 rooms have a non-null value.
2. **The V1 design-director still has 80 lines of code reading `personalization_context`.** `lib/ai/design-director.ts:838-923` walks `smart_tech`, `art`, `lifestyle`, `required_object` keys. Because the source column is null, this code is unreachable in production — but it's still bundled, still tested in `tests/ai/`, and still imported by the redesign route which calls `runDesignDirector(...)` on every redesign.
3. **The new V3 `personalization` is consumed only by Python.** `modal_pipeline/redesign.py:527-940` reads `personalization` (`art`, `smart_products`, `specific_items`, `lighting`, `identity_objects`, `freetext`) and builds the scene-spec + Pass 1/2/3 fragments. The TypeScript director never reads it. So the brief stored in `rooms.design_brief` has no V3 personalization signal.
4. **`design_brief` and `flux_prompt` continue to be written** by the TS director (`redesign/route.ts:337-385`) even though `modal_pipeline/redesign.py` writes its own scene-spec and ignores them. They are vestigial side-effects on every redesign.
5. **The disabled UI (`step-7e..h`) is genuinely off-route.** Only `step-7p/page.tsx` is reachable from the V3 user flow (`step-7 → step-7p → step-8a` per `app/design/_future/README.md`). step-7p does not write `personalization_context`. So the legacy column has no path to ever receive new data.
6. **Recent V3 personalization writes have stalled.** 16 of 308 rooms have `personalization` set, but 0 of those were updated in the last 14 days. Combined with 0 new renders in the last 14 days, this looks like overall traffic dropping rather than a personalization-specific bug — but worth instrumenting before declaring fix.

### Diagnosis

> The dead column is genuinely dead. The disabled UI is genuinely disabled. The split-brain is **between the TS director and the Python pipeline, not between two UIs**. The TS director's branch reading `personalization_context` is unreachable; its presence in source is dead code. The new V3 `personalization` is read only on the Python side.

### Recommended migration path

1. Drop `lib/ai/design-director.ts:838-923` (the `personalization_context` block) and the corresponding `personalization_context` field on `RenderContext`. Drop the merge step in `redesign/route.ts:191-198`.
2. Drop the `rooms.personalization_context` column.
3. Decide whether `runDesignDirector` should still run at all under V3. If yes, port the personalization slot reading from `modal_pipeline/redesign.py` so the TS-stored `design_brief` actually reflects the user's stated intents. If no, remove `runDesignDirector` from the redesign route and stop persisting stale `design_brief` / `flux_prompt`.
4. Drop the `_future/step-7e..h` files now that nothing depends on them. `_future/README.md` says they're "preserved for V4"; if V4 is hypothetical, source control already preserves them.

---

## 4. Style Quiz Forensics — write/read mismatch

### Tables holding quiz state

| Table | Rows | Written by | Read by |
|---|---|---|---|
| `quiz_anchor_images` | 9 | seed scripts (`scripts/generate-quiz-library.ts`) | `app/api/quiz/{next-card,mood-board,mood-strip,fingerprint}/route.ts`, `lib/ai/style-references.ts` |
| `quiz_comparison_pairs` | 480 | seed scripts | `app/api/quiz/{next-pair,fingerprint}/route.ts` |
| `style_fingerprints` | 117 (116 v2, 1 v3) | `/api/quiz/fingerprint`, `/api/quiz/update-fingerprint`, `/auth/callback` | `lib/dashboard/queries.ts`, `app/api/pipeline/redesign/route.ts` (via users.style_fingerprint join) |
| `users.style_fingerprint` (jsonb mirror) | 7/9 | same routes | `app/api/pipeline/redesign/route.ts:215`, dashboard, etc. |
| `users.style_blend` | 7/9 | same routes | every renderer |
| `users.style_blend_v3` | **0/9** | none | none |
| `swipe_history` | 0 | none in production | nightly aggregate-style-profiles edge fn |
| `anchor_renders` | 10 | `scripts/generate-quiz-library.ts` | `app/design/_future/step-2/page.tsx` (legacy), `docs/sessions/step3-render-fix.md` |

### Quiz UI flow (V3 active)

```
step-1   →  step-2 (3 anchor questions, computes anchor_prior in zustand store)
        ↓
step-3   →  /api/quiz/next-pair  (12 swipe pairs)
        ↓  (12 zustand phase_b_responses)
step-3   →  /api/quiz/fingerprint  body: { phase_b_responses, anchor_prior, ... }
        ↓
        Branches at app/api/quiz/fingerprint/route.ts:913
```

### The branching bug

`app/api/quiz/fingerprint/route.ts:913` reads:
```ts
if (body.anchor_prior && Object.keys(body.anchor_prior).length > 0) {
  // V3 FAST PATH — see lines 911-996
  // 1. initPosterior(anchor_prior)
  // 2. posteriorToFingerprint  ← uses ONLY the prior
  // 3. write style_fingerprints { fingerprint_version: 'v3', dimensions: <12 V3 dims> }
  // 4. write users with v3 blend
  // RETURN — phase_b_responses are NEVER consulted
}
// V2 PATH (unchanged) — lines 998+ , uses phase_b_responses to drive Bayes update
```

So under V3, the user's 12 swipes are entirely discarded. Under V2 (no anchor_prior), the swipes are used. This explains why 116 / 117 fingerprint rows are V2: most users completed the quiz before step-2's anchor_prior wiring was reliable, or anchor_prior was lost between steps.

A second mismatch sits in `/api/quiz/update-fingerprint/route.ts` (the thumbs-up/down rating handler). It hardcodes V2 dim names (`V2_SLOT_KEYS = ['colorTemperature','colorSaturation','formality','density','era','material']`). When a V3 user rates a render, the route writes those V2 dim names back into the user's V3 `dimensions` blob, **silently corrupting the V3 fingerprint** by mixing dim families.

### `swipe_history` is not the same as the in-flight swipes

`swipe_history` is the table the **nightly aggregate-style-profiles cron** reads to compute aggregate `user_style_profiles`. It's empty because no current code path writes to it. The step-3 swipes flow only into the request body of `/api/quiz/fingerprint` and are discarded after the response (under V3) or summarized into a `quiz_responses` jsonb field on `style_fingerprints` (under V2). The audit-style-profiles edge function therefore runs nightly with 0 input.

### Diagnosis

> Two independent quiz bugs:
> 1. **V3 fast-path drops swipes.** The 12 swipes from step-3 are uploaded with the request body but never read when `anchor_prior` is set. The single V3 user's fingerprint is the result of step-2's anchor selection alone.
> 2. **Update-fingerprint corrupts V3 rows.** Rating a render writes V2 dim names back to V3 fingerprints. Currently invisible only because all 1 V3 user has interactions_count = 0.
>
> A third issue is structural: `users.style_blend_v3` was added but never written by any route. The downstream pipeline (`redesign/route.ts:288`) reads `users.style_blend` (the legacy column), which `update-fingerprint` recomputes via `softmaxStyleMatch(newV2, "v2")` — i.e. always with V2 semantics, even for V3 users.

### Recommended fix outline

1. **Reuse swipes in the V3 path.** After `posteriorToFingerprint(initPosterior(prior))`, fold each `phase_b_response` into the posterior (the `bayes` lib already supports `updatePosterior`). Then re-derive dims.
2. **Make `/api/quiz/update-fingerprint` version-aware.** Read `style_fingerprints.fingerprint_version`. If `v3`, update with V3 dim slots and re-blend with `softmaxStyleMatch(...,"v3")`. If `v2`, current logic.
3. **Decide `users.style_blend_v3`'s fate.** Either start writing to it, or drop it. Today it's pure schema clutter.
4. **Either populate `swipe_history` from the fingerprint route or drop it + the cron job.** Currently it's dead weight that powers nothing but a successful nightly no-op.

---

## 5. Indexes and Performance

105 index rows total (Postgres pkey + secondary). High-traffic vs. unused breakdown from `pg_stat_user_indexes` (`idx_scan` column):

### Heavily used (idx_scan > 1000)
| Index | Scans | Purpose |
|---|---|---|
| `render_sessions.idx_render_sessions_room_id` | 16,621 | refinement lookups |
| `rooms.rooms_pkey` | 14,062 | obvious |
| `products_v1.products_pkey` | 54,471 | obvious |
| `products.products_pkey1` | 15,959 | the legacy products table is **still scanned** (probably from `app/design/step-9/page.tsx:478` `from("products")`) |
| `quiz_comparison_pairs.idx_pairs_dimension` | 1,220 | quiz dimension lookups |
| `quiz_comparison_pairs.quiz_comparison_pairs_pkey` | 1,573 |
| `users.users_pkey` | 1,101 |
| `rooms.idx_rooms_created_at` | 1,008 | dashboard + listings |

### Used (idx_scan 1-1000)
| Index | Scans |
|---|---|
| `rooms.idx_rooms_user_id` | 513 |
| `quiz_anchor_images.idx_anchors_style` | 493 |
| `cart_items.cart_items_user_id_product_id_key` | 5,769 |
| `room_products.room_products_room_id_idx` | 318 |
| `chat_messages.chat_messages_room_id_idx` | 217 |
| `interactions.idx_interactions_room_id` | 217 |
| Several smaller indexes on quiz_*, redesign_feedback, style_fingerprints | tens to hundreds |
| `products_v1.products_clip_ivfflat` | 91 (the active vector index) |
| `products_v1.products_v1_clip_embedding_hnsw_idx` | **0** |
| `products_v1.products_v1_fusion_embedding_hnsw_idx` | **0** |

### Never scanned (idx_scan = 0) — candidates to drop
| Index | Table | Notes |
|---|---|---|
| `idx_products_clip_embedding` | products | legacy IVFFlat on retired column. Drop with table. |
| `products_v1_clip_embedding_hnsw_idx` | products_v1 | HNSW migration done 2026-04-10; either no caller uses it or `products_clip_ivfflat` is preferred. Drop the IVFFlat OR drop the HNSW once we pick one. |
| `products_v1_fusion_embedding_hnsw_idx` | products_v1 | Same — fusion-embedding lookup never queried. |
| `idx_products_in_stock` | products_v1 | scanned 1× in test |
| `idx_pairs_is_anchor` | quiz_comparison_pairs |
| `idx_quiz_comparison_pairs_anchor` | quiz_comparison_pairs | duplicate of `idx_pairs_anchor_style`? both partial-index-y |
| `style_loras_pkey` | style_loras | scanned 0× (lookup goes through trigger_word_unique) |
| `style_loras_style_name_idx` | style_loras | 0 |
| `style_vectors_pkey` | style_vectors | 0 |
| `idx_style_fingerprints_room_type` | style_fingerprints | 0 |
| `style_fingerprints_pkey` | style_fingerprints | 0 |
| `idx_swipe_history_card_style` | swipe_history | 0 (table empty) |
| `swipe_history_pkey` | swipe_history | 0 |
| `redesign_feedback_pkey` | redesign_feedback | 2 scans, 0 returns |
| `idx_redesign_feedback_user_room` (UNIQUE) | redesign_feedback | unique index unused |
| `idx_renders_*` (composite_score, created_at, laion_high, laion_score) | renders | all 0 — table cooled |
| `rooms.rooms_generation_seed_idx` | rooms | 0 |
| `idx_render_sessions_created_at` | render_sessions | 1 scan |
| `idx_empty_room_cache_*` (3 indexes) | empty_room_cache | 0 (cache empty) |
| `idx_render_cost_log_*` (2 indexes) | render_cost_log | 0 |
| `idx_render_retries_user_original` | render_retries | 0 |
| `render_retries_user_original_unique` | render_retries | 0 |
| `idx_click_events_user`, `cart_items_pkey`, etc. | various dormant tables | 0 |

A pre-launch sweep should drop indexes attached to vestigial tables (handled by §11.1) and choose between IVFFlat and HNSW on `products_v1.clip_embedding`. The HNSW migration record is in `supabase/migrations/20260410000000_hnsw_migration.sql`; it appears to have built the indexes but nothing was switched to use them.

---

## 6. RLS Policies

86 policy rows across 35 tables; full table at top of `docs/audit/supabase.md`. Highlights below; see §11.4 for consolidation plan.

### Active and correct
- `rooms`, `users`, `style_fingerprints`, `chat_messages`, `interactions`, `render_sessions`, `room_products`, `redesign_feedback`, `cart_items`, `style_purchase_signals`, `product_impressions`, `product_interactions`, `saved_products`, `swipe_history`, `token_transactions`, `chat_sessions`, `jobs`, `furniture_placements`, `sam_embeddings`, `style_loras`, `quiz_anchor_images`, `quiz_comparison_pairs`, `app_config`, `products`, `products_v1`, `style_vectors`, `anchor_renders`, `render_retries`, `render_rate_limits`, `rate_limits`, `rate_limit_events`, `votes`, `listings`, `click_events`, `user_style_profiles` — all RLS-enabled with sane policies.

### Duplicate / overlapping policies
- **`rooms` has 5 policies**: `rooms_select_own`, `rooms_insert_own`, `rooms_update_own`, `rooms_delete_own`, **and** `users_own_rooms` FOR ALL. The FOR-ALL is redundant; consolidate.
- **`users` has 5 policies**: same pattern (`users_own_data` FOR ALL is redundant with the four per-op).
- **`renders` has 5 policies**: per-op + `renders_service_insert` (which uses `WITH CHECK true`, allowing **anonymous role** to INSERT renders). This is a hole — fix the service-insert check to `auth.role() = 'service_role'`.
- **`chat_messages` has 6 policies**: an old quoted-name pair (`"Users can insert own room messages"`, `"Users can read own room messages"`) plus the four `chat_messages_*_own`. Drop the quoted ones.
- **`style_fingerprints` has 4 policies**: per-op + `users_own_fingerprints` FOR ALL. Redundant. Also missing DELETE policy by intent (data retention).
- **`render_sessions` has 3 policies**: two select policies (`render_sessions_select_own` + `users_own_render_sessions` FOR ALL).
- **`interactions` has 3 policies**: per-op + `users_own_interactions` FOR ALL.
- **`swipe_history` has 2 policies** (Users can manage own swipe history + swipe_history_own) — same predicate.
- **`products_v1` has 5 policies** including a `products_select_all` that allows public read AND a `products_read` that allows authenticated read. The public one shadows the authenticated one.
- **`products` has 1 policy** (public_read). OK — it's a frozen reference table.

### RLS holes
- `votes.votes_insert` allows `INSERT` with no check (`true`). Anonymous insert is intended (anonymous voting), but should at minimum cap rate; rely on Supabase rate-limits + `votes_listing_id_device_fingerprint_key` unique index.
- `renders.renders_service_insert` — INSERT with check `true` is exploitable from anon-key clients; must be `auth.role() = 'service_role'`.
- `swipe_history` RLS was added 2026-04-19 (`20260419000000_enable_swipe_history_rls.sql`); previously CRITICAL per `docs/audit/supabase.md`. Now resolved.

### Consolidation candidates (move to single FOR-ALL with explicit USING + WITH CHECK)
`rooms`, `users`, `chat_messages`, `style_fingerprints`, `render_sessions`, `interactions`, `cart_items`, `token_transactions`. Each currently has 4-6 per-op policies; one FOR-ALL would suffice and is what the older tables already use.

---

## 7. Edge Functions / DB Functions / Triggers

### Edge Functions (10, all ACTIVE)

| Name | Purpose | Last update | Status |
|---|---|---|---|
| `aggregate-style-profiles` | nightly cron from swipe_history | 2026-03-31 v2 | **stale-input** (swipe_history empty) |
| `chat-room` | Sonnet chat | 2026-03-28 v19 | active (CLAUDE.md mentions model bump) |
| `clip-embed` | server-side CLIP | 2026-03-25 v18 | dormant per `lib/clipSearch.ts` header |
| `delete-account` | account deletion | 2026-03-25 v16 | active |
| `detect-furniture` | step-9 detection | 2026-03-28 v3 | dormant — V3 uses Modal `cova-redesign-v3` |
| `extract-colors` | wall_color_extracted | 2026-03-28 v3 | dormant — wall_color is in `rooms.wall_color_extracted` and not refreshed in V3 |
| `generate-depth-map` | depth ControlNet input | 2026-03-25 v31 | dormant — V3 generates depth inline on Modal |
| `get-render-status` | poll render status | 2026-03-28 v34 | dormant — V3 uses `app/api/render/status/route.ts` |
| `match-products` | hotspot match | 2026-03-28 v19 | dormant — V3 uses `app/api/pipeline/furniture-match/route.ts` |
| `render-room` | start render | 2026-03-28 v48 | dormant — V3 uses `app/api/pipeline/redesign/route.ts` |

CLAUDE.md Rule 12 says these Edge Functions are FROZEN and only `chat-room` may be edited. So they cannot be deleted via the normal flow. Their code lives in `supabase/functions/`. Recommend marking them DEPRECATED in a docstring rather than deleting.

### Database functions (in `public`)

| Name | Args | Used? |
|---|---|---|
| `check_rate_limit(uuid, text, int, int)` | rate limiting | active (called from API routes — search did not show direct calls; likely via RPC) |
| `cleanup_rate_limits()` | maintenance | unused; no cron |
| `deduct_tokens_atomic(uuid, int, text, uuid)` | token deduction | **disabled** (tokens off) |
| `handle_new_user()` | trigger fn | called by an `auth.users` trigger (not in `pg_trigger` for public) |
| `increment_rooms_render_count(uuid)` | RPC | active |
| `prune_expired_empty_room_cache()` | maintenance | unused; would prune `empty_room_cache` if cron added |
| `rls_auto_enable()` | helper | unused |
| `search_products_by_embedding(vector, double, int)` | semantic search RPC | **legacy products table** — `app/design/step-9/page.tsx` and matching routes |
| `search_products_by_fusion_embedding(vector, double, int)` | semantic search RPC | **products_v1** — fusion path |
| `set_updated_at()` | trigger fn | active (3 triggers below) |

### Triggers

| Trigger | Table | Function |
|---|---|---|
| `chat_sessions_updated_at` | chat_sessions | `set_updated_at()` |
| `listings_updated_at` | listings | `set_updated_at()` |
| `rooms_updated_at` | rooms | `set_updated_at()` |

`rooms` has only one trigger; explicit at the table-level. `chat_sessions` and `listings` are vestigial — drop with their tables.

---

## 8. Cron Jobs

`cron.job` returns 1 row:

| jobid | jobname | schedule | command | active |
|---|---|---|---|---|
| 1 | `aggregate-style-profiles` | `0 2 * * *` (02:00 UTC daily) | `SELECT net.http_post(url:='https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1/aggregate-style-profiles', headers:='{"Authorization":"Bearer <service-role>"}'::jsonb)` | t |

Recent runs (cron.job_run_details): all `succeeded` 2026-04-25 through 2026-04-29. Edge function returns `{processed:0}` because it iterates `swipe_history` user_ids and there are 0. **Effectively a no-op.**

> **The Authorization header inlines a service-role token in the cron command.** Anyone with `pg_cron` read access (e.g., a future read-only DB user) can read the secret. Move to a `vault.secrets` reference or a dedicated function token.

No other scheduled jobs exist.

---

## 9. Foreign Key Relationships

50 FKs. Cluster summary (CASCADE = on delete cascade, SET NULL = on delete set null):

```
auth.users ─── ALL user FKs (but most rows reference public.users which itself FK→auth.users)

users ─── (FK→auth.users)
  ├── rooms (CASCADE)
  ├── renders (CASCADE)
  ├── style_fingerprints (CASCADE)
  ├── chat_messages (CASCADE)
  ├── chat_sessions (CASCADE)
  ├── jobs (CASCADE)
  ├── token_transactions (CASCADE)
  ├── click_events (CASCADE)
  ├── cart_items (CASCADE)
  ├── interactions (SET NULL)
  ├── swipe_history (CASCADE)
  ├── listings (realtor_id → CASCADE)
  └── rate_limit_events (CASCADE)

rooms ─── (FK→users CASCADE)
  ├── renders (CASCADE)
  ├── room_products (CASCADE)
  ├── render_sessions (CASCADE)
  ├── chat_messages (CASCADE)
  ├── chat_sessions (CASCADE)
  ├── furniture_placements (CASCADE)
  ├── product_impressions (CASCADE)
  ├── product_interactions (CASCADE)
  ├── redesign_feedback (CASCADE)
  ├── interactions (SET NULL)
  ├── render_comparison_pairs (CASCADE)
  └── saved_products (CASCADE)

products_v1 ───
  ├── room_products (CASCADE)
  ├── cart_items (CASCADE)
  ├── click_events (CASCADE)
  ├── product_impressions (CASCADE)
  ├── product_interactions (CASCADE)
  ├── interactions (SET NULL)
  ├── style_purchase_signals (CASCADE)
  └── (self-FK linked_product_id)

style_fingerprints ───
  ├── interactions (fingerprint_id → SET NULL)
  └── rooms (fingerprint_id → SET NULL)  ← NEW (2026-04-15)

renders ───
  ├── chat_sessions (render_id → SET NULL)
  ├── click_events (CASCADE)
  └── votes (CASCADE)

listings ─── votes (listing_id → CASCADE)

products ─── (no inbound FKs)  ← orphan
```

### Orphan tables (no FK to any active table)
- `products` — frozen reference table; isolated by design.
- `app_config` — config blob.
- `style_loras` — registry.
- `style_vectors` — registry.
- `quiz_anchor_images` — referenced by no table; key collision via `style_index` is informal.
- `quiz_comparison_pairs` — referenced by no table.
- `anchor_renders` — referenced by nobody.
- `rate_limits` (FK to `auth.users`) — fine.

### Inconsistent referencing of `users` vs `auth.users`
`product_impressions`, `product_interactions`, `redesign_feedback`, `render_cost_log`, `render_rate_limits`, `render_retries`, `sam_embeddings`, `saved_products`, `style_purchase_signals`, `user_style_profiles`, `rate_limits` all FK directly to `auth.users(id)` rather than `public.users(id)`. The other tables (rooms, renders, jobs, chat_*, interactions, swipe_history, token_transactions, listings, cart_items, click_events, rate_limit_events, style_fingerprints) FK to `public.users`.

This split has no runtime impact today (since `public.users.id` always equals `auth.users.id` per `users_id_fkey`), but it's a maintenance hazard. Pick one and make all tables consistent — recommend `public.users` for app tables, `auth.users` only for tables where Supabase Auth ownership matters (e.g., the rate-limit ones, since those need to work even if the public.users row hasn't been provisioned yet).

---

## 10. Data Quality Issues

### NULL anomalies
- **`rooms.detection_status`**: 308/308 rows are `'pending'` (the default). No code path updates it. Either drop the column or add a producer.
- **`rooms.empty_room_url`**: 0/308 rows populated, but every redesign request reads it and falls back to the original photo. Either start writing it (V3 cache hit) or drop the column.
- **`rooms.style_blend`**: 207/308 rows are `'{}'` (the default). 32% of rooms have a real blend.
- **`rooms.original_image_url` and `original_photo_url`**: 139 rooms have neither. These rooms cannot be re-rendered.

### Dirty enums / strings
- **`rooms.redesign_status`**: 7 distinct values where 4 are intended (`pending`, `failed`, `complete`, `render_complete`). One row has `'pending\n'` (trailing newline). 142/308 are `'failed'` (46% pipeline failure rate is the headline operational issue, but it's not a schema problem).
- **`rooms.pipeline_mode`**: default `'mini_async_plus'` references retired Marble Plus. No code reader; safe to drop.
- **`rooms.capture_mode`**: default `'multi_image'`; multi-image capture retired.

### Stale rows
- `renders` table: newest row 2026-03-28 (>30 days old). Pipeline cooled.
- `render_sessions`: newest row 2026-04-08 (>20 days). Refinement traffic cooled or moved.
- `style_fingerprints`: 116 v2 rows; newest v2 was 2026-04-15. Last 14 days had only 7 inserts.
- `users`: 9 total. Last 30-day inserts: 4. Either pre-launch quiet period or signup funnel broken.

### Test/placeholder data
- 214/308 rooms have `name='My Room'` and `budget=2500` (the schema defaults). That's 70%. Many are likely test rooms; cross-reference with `original_image_url IS NULL` (139) — those are likely abandoned sessions.
- `token_transactions`: 8 inserted-then-deleted rows from token-system testing.

### Duplicate columns (same data, two columns)
| Pair | Table |
|---|---|
| `original_image_url` ↔ `original_photo_url` | rooms |
| `last_active_at` ↔ `last_active` | users |
| `room_dimensions` ↔ `dimensions_json` ↔ `dimensions` (text) | rooms |
| `personalization` ↔ `personalization_context` | rooms (semantically different but functionally one is dead) |
| `render_url` ↔ `latest_render_url` ↔ `redesign_pano_url` | rooms |
| `style_blend` (rooms / users) — different scope, OK |
| `amount` ↔ `delta` | token_transactions |
| `tokens_charged` ↔ `tokens_used` | renders |

Each pair is a candidate for consolidation in §11.

### Empty tables that imply broken integrations
- `redesign_feedback` (component-side `SplatViewer.tsx` writes; 0 rows) → suggests SplatViewer never reaches users (or is broken) since at least one user has rendered.
- `chat_messages` (chat history route writes; 0 rows) → chat UI either disabled or never used.
- `interactions` (1 inserted-then-deleted) → interaction tracking failing silently.
- `saved_products` (step-9 saves; 0 rows) → no user has saved a product.
- `render_cost_log` (cost tracking; 0 rows) → cost telemetry not wired up.
- `swipe_history` (0 rows; queried nightly) → quiz path doesn't write here as designed.
- `user_style_profiles` (0 rows; aggregate fn writes) → blocked on swipe_history.

---

## 11. Migration Recommendations

### Risk legend
- **Low** — drop is reversible (data already empty, schema in version control).
- **Med** — code references must be removed first.
- **High** — has FK dependents or is referenced by Edge Functions.

### 11.1 Tables to drop (after a final code search to confirm no production-code reference)

| Table | Rows | Risk | Rationale | Migration |
|---|---|---|---|---|
| `cart_items` | 0 | Low | No production-code writer in `apps/web`. | `DROP TABLE cart_items CASCADE;` (also drops 4 RLS policies, 1 FK each from products_v1 and users) |
| `click_events` | 0 | Low | No writer. | `DROP TABLE click_events CASCADE;` |
| `furniture_placements` | 0 | Low | Realtor flow; no UI. | `DROP TABLE furniture_placements CASCADE;` |
| `jobs` | 0 | Low | Generic job queue, no producer. | `DROP TABLE jobs CASCADE;` |
| `listings` | 0 | Low | Realtor share flow disabled. Drop trigger first. | `DROP TRIGGER listings_updated_at ON listings; DROP TABLE listings CASCADE;` |
| `votes` | 0 | Low | Depends on `listings`. | `DROP TABLE votes CASCADE;` (cascades from listings) |
| `product_impressions` | 0 | Low | No writer. | `DROP TABLE product_impressions CASCADE;` |
| `product_interactions` | 0 | Low | No writer. | `DROP TABLE product_interactions CASCADE;` |
| `style_purchase_signals` | 0 | Low | No writer. | `DROP TABLE style_purchase_signals CASCADE;` |
| `user_style_profiles` | 0 | Med | Written by `aggregate-style-profiles` edge fn (frozen by Rule 12). Coordinate with edge fn deprecation. | mark deprecated; drop after edge fn unfreeze |
| `swipe_history` | 0 | Med | Read by frozen edge fn. Coordinate. Also cron job 1 reads it. | drop cron job 1, then drop table |
| `rate_limit_events` | 0 | Low | Superseded by `rate_limits`. | `DROP TABLE rate_limit_events CASCADE;` |
| `render_comparison_pairs` | 0 | Low | A/B pairs table, no UI. | `DROP TABLE render_comparison_pairs CASCADE;` |
| `chat_sessions` | 0 | Low | `chat_messages` is the active chat table. Drop trigger first. | `DROP TRIGGER chat_sessions_updated_at ON chat_sessions; DROP TABLE chat_sessions CASCADE;` |
| `token_transactions` | 0 | Low | Tokens disabled. | `DROP TABLE token_transactions CASCADE;` (and drop `deduct_tokens_atomic` fn) |
| `render_retries` | 0 | Low | Token-related. | drop |
| `render_rate_limits` | 0 | Low | Token-related. | drop |
| `render_cost_log` | 0 | Low | Cost telemetry abandoned for V3. | drop |
| `empty_room_cache` | 0 | Low | Cache never hit; either land it properly or drop. Recommend dropping until V1 token system needs caching. | drop |
| `renders` | 40 | Med | Cooled; 0 inserts in 14 days. Read by `app/api/render/retry/route.ts:60` (which itself is dormant). | rename to `_renders_legacy` rather than drop, then drop after V1 launch confirms no consumer. |
| `products` | 15,902 | High | Frozen by spec; same IDs as `products_v1`. Read by `app/design/step-9/page.tsx:478` only. | (Phase 1) re-point step-9 to `products_v1`. (Phase 2) drop `products` and rename `products_v1` → `products`. **Do not drop ad-hoc** — see §11.5. |
| `anchor_renders` | 10 | Low | Referenced only by retired step-2 and docs. | drop after confirming step-2 no longer reads. |

### 11.2 Columns to drop on `rooms`

Group A — Marble / 3D / video pipelines (retired by CLAUDE.md):
```sql
ALTER TABLE rooms
  DROP COLUMN IF EXISTS splat_path,
  DROP COLUMN IF EXISTS marble_mini_world_id,
  DROP COLUMN IF EXISTS marble_mini_spz_url,
  DROP COLUMN IF EXISTS marble_spz_url_500k,
  DROP COLUMN IF EXISTS marble_spz_url_100k,
  DROP COLUMN IF EXISTS marble_plus_thumbnail_url,
  DROP COLUMN IF EXISTS plus_eligible,
  DROP COLUMN IF EXISTS plus_started_at,
  DROP COLUMN IF EXISTS plus_completed_at,
  DROP COLUMN IF EXISTS plus_upgrade_ready,
  DROP COLUMN IF EXISTS pipeline_mode,
  DROP COLUMN IF EXISTS pipeline_cost_log,
  DROP COLUMN IF EXISTS modal_job_id,
  DROP COLUMN IF EXISTS calibration_data,
  DROP COLUMN IF EXISTS scene_state,
  DROP COLUMN IF EXISTS flythrough_video_url,
  DROP COLUMN IF EXISTS flythrough_ready,
  DROP COLUMN IF EXISTS flythrough_duration_seconds,
  DROP COLUMN IF EXISTS perspective_render_url,
  DROP COLUMN IF EXISTS depth_map_url,
  DROP COLUMN IF EXISTS depth_map_url_v2,
  DROP COLUMN IF EXISTS depth_map_quality_score,
  DROP COLUMN IF EXISTS depth_conditioning_method;
```
Risk: Med. Some legacy rows still have `splat_path`, `flythrough_video_url`, etc. populated — confirm dashboard / room-detail UI doesn't read.

Group B — V1 capture / professionalization (retired):
```sql
ALTER TABLE rooms
  DROP COLUMN IF EXISTS video_url,
  DROP COLUMN IF EXISTS capture_photo_urls,
  DROP COLUMN IF EXISTS capture_mode,
  DROP COLUMN IF EXISTS professionalized_image_url,
  DROP COLUMN IF EXISTS keep_mask,
  DROP COLUMN IF EXISTS inpainting_mask_url,
  DROP COLUMN IF EXISTS canny_map_url,
  DROP COLUMN IF EXISTS change_map_url,
  DROP COLUMN IF EXISTS pre_detection_result,
  DROP COLUMN IF EXISTS detection_metadata,
  DROP COLUMN IF EXISTS fixed_furniture,
  DROP COLUMN IF EXISTS required_objects;
```
Risk: Med. `keep_mask` is used by older retry paths; verify.

Group C — duplicate columns (consolidate, then drop):
```sql
-- 1. Collapse photo URL into one column
UPDATE rooms SET original_image_url = COALESCE(original_image_url, original_photo_url);
ALTER TABLE rooms DROP COLUMN original_photo_url;

-- 2. Collapse render URL into one column
UPDATE rooms SET render_url = COALESCE(render_url, latest_render_url, redesign_pano_url);
ALTER TABLE rooms DROP COLUMN latest_render_url, DROP COLUMN redesign_pano_url;
-- Risk: every consumer of redesign_pano_url must move to render_url first. See CLAUDE.md
-- which says "rooms.redesign_pano_url stores flat 2D image (legacy name)". Locked.

-- 3. Collapse dimensions
ALTER TABLE rooms DROP COLUMN dimensions, DROP COLUMN dimensions_json;
-- keep room_dimensions (jsonb)

-- 4. detection_status — drop (always 'pending', no consumer)
ALTER TABLE rooms DROP COLUMN detection_status;
```
Risk: Med (consumer rewrite required for render_url).

Group D — personalization legacy (per §3):
```sql
ALTER TABLE rooms DROP COLUMN personalization_context;
-- TS code: remove design-director.ts:838-923 + redesign/route.ts:191-198 first.
```
Risk: Low (column is empty).

Group E — `users`:
```sql
ALTER TABLE users DROP COLUMN budget_dna;       -- never written
ALTER TABLE users DROP COLUMN style_blend_v3;   -- never written
-- Choose one of last_active_at / last_active and drop the other.
ALTER TABLE users DROP COLUMN last_active;
-- Tokens (if disabled forever):
ALTER TABLE users DROP COLUMN token_balance, DROP COLUMN tokens_enabled, DROP COLUMN stripe_customer_id;
```

Group F — `style_fingerprints`:
```sql
ALTER TABLE style_fingerprints
  DROP COLUMN vector_data,    -- legacy flat-array storage
  DROP COLUMN style_name,     -- single-style label, vestigial
  DROP COLUMN budget_tier;    -- vestigial
```
Risk: Low.

Group G — `renders` (if retained as legacy archive): drop columns referencing retired pipelines:
```sql
ALTER TABLE renders
  DROP COLUMN brisque_score,
  DROP COLUMN clip_style_score,
  DROP COLUMN denoising_strength,
  DROP COLUMN guidance_scale,
  DROP COLUMN seed,
  DROP COLUMN replicate_prediction_id,
  DROP COLUMN render_type,
  DROP COLUMN quality_tier,
  DROP COLUMN splat_url, DROP COLUMN redesign_splat_url,
  DROP COLUMN marble_operation_id, DROP COLUMN modal_job_id,
  DROP COLUMN panoramic_url, DROP COLUMN panoramic_prediction_id, DROP COLUMN is_panoramic,
  DROP COLUMN style_blend_secondary, DROP COLUMN style_blend_ratio, DROP COLUMN style_vector,
  DROP COLUMN tokens_charged, DROP COLUMN tokens_used,
  DROP COLUMN is_public, DROP COLUMN was_selected,
  DROP COLUMN q_align_score, DROP COLUMN hps_score, DROP COLUMN composite_score, DROP COLUMN laion_score;
```

### 11.3 Indexes to drop

After tables are dropped, the indexes drop with them. Standalone drops:
```sql
DROP INDEX IF EXISTS public.products_v1_clip_embedding_hnsw_idx;   -- 0 scans
DROP INDEX IF EXISTS public.products_v1_fusion_embedding_hnsw_idx; -- 0 scans
DROP INDEX IF EXISTS public.idx_products_clip_embedding;            -- legacy products IVFFlat
DROP INDEX IF EXISTS public.rooms_generation_seed_idx;              -- 0 scans
DROP INDEX IF EXISTS public.idx_pairs_is_anchor;                    -- 0 scans
DROP INDEX IF EXISTS public.idx_quiz_comparison_pairs_anchor;       -- duplicate of idx_pairs_anchor_style
DROP INDEX IF EXISTS public.style_loras_style_name_idx;             -- 0 scans, replaced by trigger_word_unique
DROP INDEX IF EXISTS public.idx_style_fingerprints_room_type;       -- 0 scans
```
Risk: Low. Confirm HNSW vs IVFFlat decision first — only drop the unused one. The active one is `products_clip_ivfflat` (91 scans).

### 11.4 RLS policy consolidation

Replace 4 per-op policies + 1 FOR-ALL with 1 FOR-ALL on each of: `rooms`, `users`, `chat_messages`, `style_fingerprints`, `render_sessions`, `interactions`, `cart_items`, `token_transactions`, `swipe_history`. Example for `rooms`:

```sql
DROP POLICY rooms_select_own ON rooms;
DROP POLICY rooms_insert_own ON rooms;
DROP POLICY rooms_update_own ON rooms;
DROP POLICY rooms_delete_own ON rooms;
-- keep users_own_rooms (FOR ALL using auth.uid() = user_id)
```

Tighten the unsafe `renders.renders_service_insert`:
```sql
DROP POLICY renders_service_insert ON renders;
CREATE POLICY renders_service_insert ON renders FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
```

Drop the deprecated quoted-name policies on `chat_messages`:
```sql
DROP POLICY "Users can insert own room messages" ON chat_messages;
DROP POLICY "Users can read own room messages" ON chat_messages;
```

### 11.5 Data migration: `products` → `products_v1`

Phase 1: stop reading from `products`. The single hold-out is `app/design/step-9/page.tsx:478`. Repoint to `products_v1` with the wider column set (it's a superset).

Phase 2 (post-V1 launch): rename `products_v1` → `products`. Bring forward the Edge Functions (Rule 12 says they're frozen — they reference the `products` table by name and must be updated synchronously).

Phase 3: drop all `dinov3_embedding` / `siglip2_embedding` legacy embedding columns; the V3 path uses CLIP only.

Risk: High. Coordinate with frozen Edge Functions (`match-products`, `clip-embed`) which assume the `products` table name and 768-dim CLIP via `clip_embedding_data`.

### 11.6 New tables / columns required for V1

Per the "post-launch" tasks in CLAUDE.md and observed gaps:

#### Token system (when enabled)
The schema is mostly there, but disconnected:
- `users.token_balance`, `users.tokens_enabled` exist. OK.
- `token_transactions(id, user_id, delta, reason, render_id)` exists. **It also has `amount`, `type`, `description` columns** which duplicate `delta` / `reason`. Pick one shape.
- `deduct_tokens_atomic(uuid, int, text, uuid)` exists. OK.
- Add: `users.last_token_grant_at timestamptz` for monthly free-token grants.

#### Refine history (currently in `render_sessions`)
`render_sessions` does the job. Confirm the schema covers all V1 refine actions. Consider renaming `iteration` → `refine_index` and adding:
```sql
ALTER TABLE render_sessions
  ADD COLUMN refine_action text,        -- 'tap_to_refine' | 'chat_chip' | 'global'
  ADD COLUMN refine_payload jsonb;       -- Sonnet classifier output
```

#### Google Lens / Serper results
Currently stored inline on `room_products.serp_*` columns. For V1 with multiple-retailer matches per item:
```sql
CREATE TABLE product_search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_product_id uuid NOT NULL REFERENCES room_products(id) ON DELETE CASCADE,
  source text NOT NULL,           -- 'serper' | 'google_lens' | 'amazon'
  rank int NOT NULL,
  retailer text,
  title text,
  price double precision,
  product_url text,
  image_url text,
  raw jsonb,                       -- full API response
  created_at timestamptz DEFAULT now()
);
CREATE INDEX product_search_results_room_product_idx ON product_search_results(room_product_id);
ALTER TABLE product_search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_search_via_room ON product_search_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM room_products rp JOIN rooms r ON r.id = rp.room_id
    WHERE rp.id = product_search_results.room_product_id AND r.user_id = auth.uid()
  ));
```
Then drop `room_products.serp_*` and read from `product_search_results` instead.

#### Refined style profile
The current `style_fingerprints` table mixes V2 and V3 with no enforced schema split. Recommended: enforce a CHECK constraint by version, and add a generated column for the canonical 12-dim vector.
```sql
ALTER TABLE style_fingerprints
  ADD CONSTRAINT chk_v3_dimensions CHECK (
    fingerprint_version <> 'v3' OR (
      dimensions ? 'warmth' AND dimensions ? 'pattern' AND dimensions ? 'formality'
      AND dimensions ? 'complexity' AND dimensions ? 'lineQuality'
      AND dimensions ? 'lightingDrama' AND dimensions ? 'plantPresence'
      AND dimensions ? 'colorSaturation' AND dimensions ? 'lightPreference'
      AND dimensions ? 'textureRichness' AND dimensions ? 'natureMateriality'
      AND dimensions ? 'symmetryPreference'
    )
  );
```

#### Audit / observability
Consider an append-only `pipeline_events` table for the V3 redesign run, replacing the bloat-prone `rooms.pipeline_cost_log` jsonb.

---

## 12. Open Questions

1. **Are V2 fingerprints kept or migrated?** 116 of 117 rows are V2. If V1 launches with V3-only Director, those users will fall back to single-primary LoRA (per `lora-blending.ts:readLoras`). Plan: backfill V2 → V3 dims via Bayes inversion, or sunset those users by re-running the quiz on first login. Confirm with product.
2. **Is the V3 quiz fast-path swipe-discard intentional?** §4 frames this as a bug, but it may be deliberate if the team decided the anchor questions are sufficient signal. Confirm before implementing the fold-in fix.
3. **Should `renders` and `render_sessions` consolidate?** `renders` has 40 rows, cooled. `render_sessions` has 63 rows, also cooled. The V3 pipeline writes neither. Decide: (a) keep both as analytics archives, (b) merge into one `pipeline_runs` table, (c) drop both.
4. **`empty_room_url` on rooms — drop or wire up?** Currently the V3 pipeline regenerates the empty room every request because the column is never populated. Adding a write would amortize ~15s of latency per refinement. Worth doing only if V3 actually re-uses empty rooms (the empty-room cache table `empty_room_cache` keys by image hash, which would handle this anyway).
5. **Edge Functions — really frozen forever?** CLAUDE.md Rule 12 says yes. But several are demonstrably unused (`render-room`, `get-render-status`, `match-products`, `detect-furniture`, `extract-colors`, `generate-depth-map`, `clip-embed`). Marking them deprecated in code (without deleting) keeps the constraint while reducing confusion.
6. **`anchor_renders` — used by step-2 or not?** Code reads only from `_future/step-2`, but the active `step-2/page.tsx` builds image URLs from `quiz-images` storage bucket directly. Confirm `anchor_renders` is not consulted on the active path.
7. **Cost telemetry plan.** `render_cost_log` is wired into 2 routes but never written in production. Either remove the writes or fix the writes — current state is misleading.
8. **`auth.users` vs `public.users` FK split — formalize?** §9 lists ~12 tables FKing directly to `auth.users` and ~14 tables FKing to `public.users`. Pick a rule.
9. **Will the chat history be revived?** `chat_messages` has 0 rows but is wired to `app/api/chat/history/route.ts`. If V1 doesn't ship chat persistence, drop the table.
10. **`style_loras` registry duplication.** The TS registry `apps/web/lib/styles/lora-registry.ts` and the DB table `style_loras` both encode the same data. Decide which is canonical.
11. **`rooms.fingerprint_id` FK** was added 2026-04-15 but I did not find a single code path that sets it. Either populate it from `redesign/route.ts` or drop.

---

## Appendix A — Generated artifacts (in /tmp on the auditor's machine)

- `/tmp/columns.tsv` — every column on every public table
- `/tmp/indexes.tsv` — every index DDL
- `/tmp/policies.tsv` — every RLS policy with USING / WITH CHECK
- `/tmp/fks.tsv` — every foreign key DDL
- `/tmp/idx_stats.tsv` — `pg_stat_user_indexes` snapshot used for §5

These are reproducible via the `psql` connection string in `apps/web/.env.local#SUPABASE_DB_URL`.

## Appendix B — Auditor's confidence

- §1 / §5 / §6 / §7 / §8 / §9: high (direct DB introspection).
- §2: high for the four spotlighted tables; documented "vestigial / no production-code writer" was based on `grep -r` on `apps/web/` excluding tests, scripts, dev logs, and docs. A buried reference may exist.
- §3 / §4 (diagnoses): high. Cross-checked DB row counts against code paths.
- §10 / §11: medium-high. Drop recommendations are correct given the audit but assume Edge Functions remain frozen and the CLAUDE.md rules hold.
- §12: open by definition.
