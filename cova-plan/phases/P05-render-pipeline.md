# Phase 5 — Render Pipeline

**Cova V1 implementation · Phase 5 of 12 · Self-contained · The heaviest phase**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 5 of 12 |
| **Goal** | The 8-stage render pipeline. Take a processed room photo + style_blend + personalization_manifest, deliver an editorial-grade redesigned photo with hotspots ready for product matching. Target: ~60s p50 latency, ~$0.32 cost per render. |
| **Executor session estimate** | 6–9 sessions across M9/M10/M11 |
| **Calendar estimate** | 4–6 weeks (most complex phase in V1) |
| **Predicted Claude credits** | ~$150–200 |
| **Predicted infra spend** | ~$50–80 (M9 stage development testing, 50-render quality test gate, M10 verifier tuning, fixture renders) |
| **Depends on** | Phase 1, 2, 3, 4 closed; Phase 0 FLUX.2 Pro/Max pricing verified |
| **Blocks** | Phase 6 (refine), Phase 7 (product matching), Phase 9 (dashboard) |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding, lists gaps. You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phase 4 closed and `rooms.personalization_manifest` populated. Verifies 4 live Modal apps (cova-perception, cova-empty-room, cova-redesign, cova-composite-art) all reachable. Uses Context7 MCP for: current fal-ai/flux-2-pro/edit endpoint shape, current flux-pro/v1/fill passthrough blend params, current Sonnet 4.5/4.6 vision API, current IC-Light v2 Modal patterns, current Supabase advisory locks for orchestration. Uses EXA MCP for: enumerated prompt vs prose density-test patterns, hard-constraint preamble examples, 8-dim verifier rubrics. Uses web search for: latest fal.ai pricing, Modal A10G GPU pricing. Writes executor prompt (likely longest of any phase) to `cova-plan/planner-output/P5-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers all 8 stages individually + orchestration + verifier + UI. May need to split into 2-3 separate executor prompts (M9 backend, M10 verifier+hotspots, M11 UI).
5. **Executor fires.** 6–9 sessions. M9 first (stages 1-5b), M10 second (verifier + hotspots), M11 third (cinematic UI).
6. **Verifier session 1 fires.** Reviews stage orchestration, idempotency, cache, hard-constraint preamble, 8-dim rubric, retry budget, architectural baseline, top-3 preload, all 50+ failure_categories. Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: race conditions in pipeline_runs, signed URL TTL drift, Stage 4 cache key drift, retry double-counting, mood relight skipped when it shouldn't be.
8. **50-render quality test (mandatory gate).** Daksh + Pranav run 50 renders covering all 10 styles × variety of room types × variety of personalization completeness. ≥80% first-attempt pass, ≥95% after 1 retry. Manual visual review on every render.
9. **Manual screenshot review.** §15 click-script + 50-render gallery. Captures: input photo + rendered output side-by-side for 10 representative renders, in-progress cinematic frames, reveal cinematic frames.
10. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (verifier mean dim scores, cache hit rate, p50/p95 latencies, cost per stage actual vs predicted, 50-render results).

---

## 2. Prereq verification

### Phase 1+2+3+4 closure checks
- All previous phases CLOSED in `PHASE_STATUS.md`
- `rooms.personalization_manifest` populated for at least 1 test user (with all 3 slots filled and at least one with art composite)
- `users.style_blend` populated with non-uniform distribution
- 4 Modal apps live (verify via `modal app list`):
  - cova-perception
  - cova-empty-room
  - cova-redesign
  - cova-composite-art (used in Phase 4)
- fal.ai API key in `.env.local`, FLUX.2 Pro/Max pricing verified (Phase 0)
- Anthropic API key in `.env.local`
- R2 bucket `cova-renders` empty (V0 cleared in Phase 3)
- All Phase 1 ops infrastructure in place: Sentry, redactLogPayload, lib/cost/log, lib/errors/categories, lib/config/timeouts, PostHog

### Halt conditions
- Any of 4 Modal apps not deployed → halt, redeploy
- FLUX.2 pricing not verified → halt, get pricing from fal.ai dashboard
- `personalization_manifest` validation fails on test row → halt, fix in Phase 4 remediation
- Required MCPs not connected → halt

---

## 3. Pre-decisions

**G1. FLUX.2 Pro vs Max.** *Resolution:* Phase 0 task. Lock based on actual pricing comparison. If Max is <2× Pro cost and visibly better in 5-render bake-off, use Max. Else Pro.

**G2. Edit strength locked at 0.85** [empirical finding from prior testing — 0.65 too conservative, 0.95 destroys architecture, 0.85 wins density-test 80/80].

**G3. cleanPrompt() post-processor scope.** *Resolution locked:* collapse multi-whitespace, remove orphan punctuation (e.g. `, , `), normalize Oxford commas, lowercase first-letter-after-period in clauses. Prevents FLUX misinterpreting whitespace as instruction noise. Snapshot test: 540 variants (60 templates × 9 personalization states) tested in CI.

**G4. 10 style codices.** *Resolution:* drafted as JSON at `cova-plan/render/style-codex/{style}.json` during M9. Each codex has: clause_templates (~25 candidate clauses), material_palette, light_signature, do_not (anti-patterns), density_tier (0.2 minimalist → 0.85 bohemian). Daksh + Pranav review all 10 before M9 closes.

**G5. Stage 4 cache TTL.** *Resolution locked:* 30 days. Storage cost negligible (R2). Eviction via cron.

**G6. Stage 5b mood relight conditional.** *Resolution locked:* runs ONLY if `personalization_manifest.lighting.mood` is non-null. Skipped otherwise (saves $0.030 + 6s).

**G7. Verifier 8-dim rubric (locked).** Each scored 0-10:
1. Camera (vantage preserved)
2. Architecture (walls/windows/doors/ceiling/floor structure match input)
3. Density (matches style codex density_tier)
4. Style (matches user style_blend)
5. Material (textures plausible, not plastic/low-poly)
6. Lighting (matches mood directive)
7. Wall decor (art placement makes sense)
8. Surface (floor/wall/ceiling textures consistent)

Pass: all 8 ≥7. 1-retry budget on any single dim <7 (re-run Stage 5 with edit_strength 0.75).

**G8. Hard-constraint preamble locked:**
```
TREAT camera angle as HARD CONSTRAINT. Score 0-3 if vantage shifted.
TREAT wall color as HARD CONSTRAINT. Score 0-3 if paint color drifted from {wall_color_hex}.
ALL OTHER DIMS scored 0-10 normally.
```

**G9. architectural_baseline snapshot locked.** After Stage 6 passes on FIRST successful render for a room, snapshot verifier-relevant features (camera angle, wall color hex, architecture mask) to `renders.architectural_baseline` jsonb. Refines verify against this snapshot, not previous render. Wall hex tolerance widens 5 ΔE per refine generation, capped 20 ΔE. Prevents drift over chains.

**G10. Top-3 hotspot Lens preload locked.** After Stage 8 delivery, background job calls Lens for top 3 hotspots (largest by area, not user-picked direct-link). Total background cost ~$0.075. User-perceived render latency unaffected. First clicks on top-3 are instant.

**G11. Retry budget enforcement.** *Resolution locked:* if any dim <7 in Stage 6 → re-run Stage 5 with edit_strength 0.75 (slightly lower = preserve more of input) → re-verify. Second pass: ship best-of-2 by sum of dim scores even if both fail. Log `failure_category='verifier_fail_after_retry'`.

**G12. 540-variant cleanPrompt snapshot.** *Resolution:* 60 prompt templates (~6 per style across density variations) × 9 personalization states (3 art × 3 lighting) = 540 variants. Snapshot test in CI catches prompt regressions.

**G13. The 50-render quality gate.** *Resolution locked:* mandatory before Phase 5 closes. 50 renders covering: all 10 styles (5 each), variety of room types (living/bed/kitchen/studio/dining), variety of capture conditions (well-lit/low-light/cluttered/mirrors), mix of personalization completeness (some 0 slots, some 3 slots). Daksh + Pranav score each: 1-5 quality + 8-dim rubric. Acceptance: ≥80% pass first attempt (verifier all dims ≥7), ≥95% after 1 retry.

**G14. Block C parking lot (NOT V1).** Three optimizations to claw back time post-launch if needed: direct-edit experiment (skip Stage 4 entirely), drop Stage 5b by default for warm/bright moods (only run for dramatic/focused), skip Stage 6 verifier on first 1000 production renders. None ship in Phase 5. All deferred to Phase 11+ optimization.

---

## 4. Background context (self-contained)

### 4.1 What the render pipeline delivers

After 8 stages run, Cova has:
- `renders` row with: `render_url`, `hotspots[]`, `verification_scores`, `architectural_baseline`, `template_version`, `refine_index=0`, `parent_render_id=null`
- Final rendered JPEG at R2: `cova-renders/{render_id}/stage5b/final.jpg` (or stage5 if mood relight skipped)
- Hotspot manifest with bbox + label per shoppable item (up to 15)
- `pipeline_runs` rows for every stage of every attempt
- Cost telemetry rows in `render_cost_log`

### 4.2 Hard rules [from prior empirical testing]

- **D-013:** 8 stages locked. Don't add 9th. Don't merge two. Don't reorder.
- **D-003:** No LoRAs. All 10 trained beat by FLUX.2 prompt-only.
- **D-004:** No multi-reference style images. Camera score collapsed 6.0→2.0.
- **D-005:** No depth-conditioning ControlNet on Stage 5.
- **D-006:** No multi-pass FLUX.1 → FLUX.2 averaging.
- **D-015:** fetch() only for fal.ai/Anthropic. No SDKs.
- **Architecture-preserving** Stage 4 empty-room intermediate via flux-pro/v1/fill with passthrough blend.
- **Enumerated prompt format** locked at Stage 3 (density-test 80/80 vs prose 42/80).

### 4.3 The 8 stages (locked)

| Stage | Cost | Latency | What |
|---|---|---|---|
| 1 Preprocess | $0.001 | 1s (skipped if processed_url) | Sharp pipeline (already in Phase 1/3) |
| 2 Perception | $0.020 | 8s | Modal: Depth-Anything-V2 + SAM-3 + Sonnet wall-color + Haiku room-type |
| 3 Director | $0.012 | 5s | Sonnet enumerated prompt + hard-constraint preamble |
| 4 Empty-room | $0.140 | 25s | Modal: SAM-3 furniture detect + flux-pro/v1/fill passthrough; SHA256-cached |
| 5 Redesign | $0.100 | 12s | fal-ai/flux-2-pro/edit on empty-room; edit_strength 0.85 |
| 5b Mood relight | $0.030 | 6s | IC-Light v2 mood; conditional |
| 6 Verification | $0.005 | 4s | Sonnet 4.5/4.6 vision 8-dim rubric |
| 7 Hotspot detect | $0.005 | 5s | SAM-3 region detect + Sonnet labeling; LAZY Lens |
| 8 Delivery | $0.001 | 1s | Signed URL + R2 + Cloudflare Images + PostHog |
| **Total** | **$0.314** | **~67s** | |

With art composite (Phase 4 if user picked art): +$0.05 + 8s = ~$0.36 / ~75s
With Stage 4 cache hit (refines): -$0.14 -25s = ~$0.17 / ~42s

### 4.4 Reference room test set (curated for testing)

10 reference rooms at `cova-plan/render/reference-rooms/`:
- ref-living-1.jpg (well-lit modern)
- ref-living-2.jpg (cluttered low-light)
- ref-bed-1.jpg (small bedroom, daylight)
- ref-bed-2.jpg (large master with windows)
- ref-kitchen-1.jpg (open-plan with island)
- ref-kitchen-2.jpg (galley)
- ref-studio-1.jpg (open-plan studio apartment)
- ref-dining-1.jpg (formal dining)
- ref-living-3.jpg (with mirror)
- ref-bed-3.jpg (with extreme angle)

Used for: 50-render quality test, verifier tuning, snapshot regression. Daksh + Pranav curate before Phase 5 starts.

---

## 5. Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Orchestrator | Modal worker (Python 3.10) + Postgres advisory locks | Idempotent stage transitions |
| Stage 2 perception | Depth-Anything-V2 + SAM-3 + Sonnet 4.5 vision + Haiku 4.5 | Modal A10G |
| Stage 3 director | Sonnet 4.5/4.6 (Anthropic) | Enumerated prompt with hard-constraint preamble |
| Stage 4 empty-room | SAM-3 + fal-ai/flux-pro/v1/fill + passthrough blend | Modal A10G |
| Stage 4 cache | SHA256(processedImage + dimensions) → R2 + Postgres lookup | 30-day TTL |
| Stage 5 redesign | fal-ai/flux-2-pro/edit via fetch() (NO SDK) | edit_strength 0.85 |
| Stage 5b mood relight | IC-Light v2 | Modal A10G; conditional |
| Stage 6 verifier | Sonnet 4.5/4.6 vision (Anthropic) | 8-dim rubric + hard-constraint preamble |
| Stage 7 hotspot | SAM-3 + Sonnet 4.5 vision | Region detect + labeling |
| Stage 7 preload | Background SearchApi.io Google Lens for top 3 | Phase 7 client lib |
| Stage 8 delivery | Cloudflare R2 + Cloudflare Images signed URL | 24h TTL for client display |
| Real-time progress | Supabase Realtime channel OR client poll every 2s | Drives in-progress cinematic |

---

## 6. Scope

### 5A — Backend M9 (stages 1-5b)

1. **Schema migrations:**
```sql
CREATE TABLE pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  render_id uuid REFERENCES renders(id) ON DELETE CASCADE,
  stage_index int NOT NULL,
  stage_name text NOT NULL,
  attempt_number int NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('pending','running','succeeded','failed','timed_out','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  model_used text,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,6),
  error_code text,
  error_msg text,
  failure_category text,
  parent_run_id uuid REFERENCES pipeline_runs(id),
  metadata jsonb,
  UNIQUE (room_id, stage_index, attempt_number)
);
CREATE INDEX pipeline_runs_room_idx ON pipeline_runs(room_id, started_at DESC);
CREATE INDEX pipeline_runs_status_idx ON pipeline_runs(status, started_at DESC);
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
-- Service-role-only

CREATE TABLE empty_room_cache (
  cache_key text PRIMARY KEY,             -- SHA256(processed_bytes + dims)
  empty_room_url text NOT NULL,
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX empty_room_cache_age_idx ON empty_room_cache(created_at);
ALTER TABLE empty_room_cache ENABLE ROW LEVEL SECURITY;
-- Service-role-only

CREATE TABLE renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  render_url text,
  hotspots jsonb DEFAULT '[]'::jsonb,
  verification_scores jsonb,
  architectural_baseline jsonb,
  template_version text,
  refine_index int NOT NULL DEFAULT 0,
  parent_render_id uuid REFERENCES renders(id),
  refine_prompt text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed')),
  failure_category text,
  total_cost_usd numeric(10,6),
  total_duration_ms int,
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX renders_user_idx ON renders(user_id, created_at DESC);
CREATE INDEX renders_room_idx ON renders(room_id, created_at DESC);
CREATE INDEX renders_parent_idx ON renders(parent_render_id);
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY renders_self_read ON renders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY renders_self_insert ON renders FOR INSERT WITH CHECK (auth.uid() = user_id);
```

2. **Orchestrator** at `apps/web/lib/render/orchestrator.ts`:
   - Reads `rooms.personalization_manifest`, `users.style_blend`
   - Acquires Postgres advisory lock keyed on `(room_id, attempt_number)`
   - Sequential stages with parallelization where possible
   - Writes pipeline_runs row before each stage, updates after
   - On stage failure: applies recovery action from lookup table
   - Returns final render_id

3. **Recovery action lookup** at `apps/web/lib/render/recovery.ts`:
   - Stage 1 preprocess_decode_fail → retry once with raw bytes
   - Stage 2 perception_modal_fail → retry once after 5s
   - Stage 2 depth_extraction_fail → fatal
   - Stage 2 sam3_fail → fatal
   - Stage 3 director_sonnet_fail → retry once; if still fails, fall back to template
   - Stage 4 empty_room_modal_fail → retry once; if still fails, fatal
   - Stage 4 flux_fill_api_fail → retry once after 10s
   - Stage 5 flux2_edit_api_fail → retry once via Stage 6 verifier retry budget
   - Stage 5 flux2_timeout → retry once via Stage 6 retry budget
   - Stage 5 flux2_rate_limit → wait 30s, retry once
   - Stage 5b iclight_modal_fail → non-fatal, ship Stage 5 output
   - Stage 6 verifier_sonnet_fail → non-fatal, ship without verification flag
   - Stage 6 verifier_dim_low → trigger Stage 5 retry with edit_strength 0.75
   - Stage 7 hotspot_detection_fail → non-fatal, ship without hotspots
   - Stage 8 delivery_url_sign_fail → retry once

4. **Stage 1 preprocess** at `apps/web/lib/render/stage1-preprocess.ts`:
   - No-op if `rooms.processed_url` exists (which is always true after Phase 3)
   - Else: re-run Sharp pipeline from Phase 1/3
   - Cost log: $0.001 (effectively free)

5. **Stage 2 perception** at `apps/web/lib/render/stage2-perception.ts`:
   - Calls cova-perception Modal app with `processed_url`
   - Modal app runs in parallel:
     - Depth-Anything-V2 → depth_map.png (single-channel, written to R2)
     - SAM-3 keep-class detection → preservation_targets mask (ceiling fans, mirrors, fireplaces, moldings, ceiling beams, exposed ductwork)
     - Sonnet 4.5 vision wall-color extraction → samples ~10 wall patches, returns hex
     - Haiku 4.5 room-type classification → confidence + alternates
       - If confidence <0.7 OR top-2 within 0.15: escalate to Sonnet 4.5
   - Outputs: `preservation_spec.json` + `depth_map.png` + `wall_color_hex` to R2 `cova-renders/{render_id}/stage2/`
   - Hard-room handling: if `rooms.hard_room_score >= 0.5`, write flag `hard_room_active: true` into preservation_spec
   - Cost log: ~$0.020 total
   - failure_category: `perception_modal_fail`, `depth_extraction_fail`, `sam3_fail`, `sonnet_color_fail`, `room_type_classifier_fail`

6. **Stage 3 director** at `apps/web/lib/render/stage3-director.ts`:
   - Reads: preservation_spec, wall_color_hex, room_type, users.style_blend, rooms.personalization_manifest, room dimensions estimate
   - Loads style codex matching style_blend.primary, weights in secondary
   - Sonnet 4.5/4.6 prompt produces 12-16 enumerated clauses + hard-constraint preamble
   - Applies cleanPrompt() post-processor
   - Returns enumerated_prompt (string) + template_version (for snapshot tracking)
   - Cost log: $0.012
   - failure_category: `director_sonnet_fail`, `codex_load_fail`, `manifest_parse_fail`, `prompt_clean_fail`

7. **cleanPrompt()** at `apps/web/lib/render/clean-prompt.ts`:
   - Collapse multi-whitespace
   - Remove orphan punctuation (`, , `, ` ,`, ` .`)
   - Normalize Oxford commas
   - Lowercase first-letter-after-period in clauses
   - Returns cleaned prompt
   - Snapshot test at `tests/render/clean-prompt-snapshots.test.ts` with 540 variants

8. **Style codices** at `cova-plan/render/style-codex/{slug}.json` for all 10:
```json
{
  "style": "warm_japandi",
  "display_name": "Warm Japandi",
  "clause_templates": [
    "Light oak hardwood flooring with subtle wabi-sabi grain.",
    "Low boucle sofa, cream, three-cushion, against the back wall.",
    "Paper pendant lamp, 60cm diameter, hung 1.6m above floor center.",
    "Linen sheers diffusing soft 2700K light from the existing window.",
    "Hand-thrown ceramic vessel on the existing low side table.",
    ...
  ],
  "material_palette": {
    "floor": "light oak hardwood",
    "walls": "preserve wall paint hex",
    "decor": ["paper", "ceramic", "linen", "natural wood"]
  },
  "light_signature": "soft 2700K natural light, golden-hour ambient",
  "do_not": ["neon", "concrete", "macramé", "steel beam", "boucle in colors other than cream/taupe"],
  "density_tier": 0.35
}
```

9. **Stage 4 empty-room** at `apps/web/lib/render/stage4-empty-room.ts`:
   - Compute cache_key = SHA256(processedBytes + dimensions)
   - Lookup in empty_room_cache; if hit + age <30d: return empty_room_url, increment hit_count
   - Else: call cova-empty-room Modal app
     - SAM-3 detects all furniture (mask of items to remove)
     - fal-ai/flux-pro/v1/fill with mask + prompt "empty room, preserve all walls and architecture"
     - Passthrough blend keeps architecture pixel-exact
   - Output: empty-room intermediate JPEG q90, write to R2 `cova-renders/{render_id}/stage4/empty.jpg`
   - Insert empty_room_cache row
   - Cost log: $0.140 (Modal + SAM-3 + flux-pro/v1/fill)
   - failure_category: `empty_room_modal_fail`, `sam3_furniture_detect_fail`, `flux_fill_api_fail`, `passthrough_blend_fail`

10. **Stage 5 redesign** at `apps/web/lib/render/stage5-redesign.ts`:
    - Direct fetch() to fal.ai (NO SDK):
      ```typescript
      const resp = await fetch('https://fal.run/fal-ai/flux-2-pro/edit', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${process.env.FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: emptyRoomUrl,
          prompt: enumeratedPrompt,
          edit_strength: 0.85,
          seed: deterministicSeed, // for test reproducibility
        }),
        signal: AbortSignal.timeout(TIMEOUTS.falClient), // 320s
      });
      ```
    - Output: redesigned JPEG q90 to R2 `cova-renders/{render_id}/stage5/redesign.jpg`
    - On retry (Stage 6 dim<7): re-run with edit_strength 0.75
    - Cost log: $0.100 per attempt
    - failure_category: `flux2_edit_api_fail`, `flux2_timeout`, `flux2_rate_limit`, `flux2_invalid_prompt`

11. **Stage 5b mood relight** at `apps/web/lib/render/stage5b-mood-relight.ts`:
    - **Conditional:** runs ONLY if `personalization_manifest.lighting.mood` is non-null
    - Skipped otherwise (saves $0.030 + 6s)
    - Calls cova-redesign Modal app (Pass 3 = IC-Light v2)
    - 4 mood profiles map to IC-Light parameters:
      - warm_cozy → 2700K, soft fill, golden-hour cast
      - bright_airy → 5000K, even fill, slight warm tint
      - dramatic_moody → selective accents, deep shadows
      - focused_workspace → 5500K, even, task-light cone
    - Output: mood-relit JPEG to R2 `cova-renders/{render_id}/stage5b/final.jpg`
    - Cost log: $0.030
    - failure_category: `iclight_modal_fail`, `mood_profile_invalid` (NON-FATAL, ship Stage 5 output)

### 5B — Backend M10 (stages 6-8 + UI orchestration)

12. **Stage 6 verifier** at `apps/web/lib/render/stage6-verifier.ts`:
    - Inputs: original `processed_url`, final render (Stage 5b output if ran else Stage 5), preservation_spec, enumerated prompt
    - Hard-constraint preamble (locked):
      ```
      TREAT camera angle as HARD CONSTRAINT. Score 0-3 if vantage shifted.
      TREAT wall color as HARD CONSTRAINT. Score 0-3 if paint color drifted from {wall_color_hex}.
      ALL OTHER DIMS scored 0-10 normally.
      ```
    - 8-dim rubric (each 0-10): camera, architecture, density, style, material, lighting, wall_decor, surface
    - Pass criteria: all dims ≥7
    - Output JSON:
      ```json
      {
        "camera": 9, "architecture": 8, "density": 8, "style": 9,
        "material": 7, "lighting": 8, "wall_decor": 8, "surface": 9,
        "summary": "...",
        "pass": true,
        "retry_recommended": false,
        "retry_dimension": null,
        "architectural_baseline": { ... }
      }
      ```
    - 1-retry budget: if any dim <7, re-run Stage 5 with edit_strength 0.75. Second pass: ship best-of-2 by sum scores.
    - architectural_baseline snapshot on first pass (camera angle, wall hex, architecture mask)
    - Cost log: $0.005 per call
    - failure_category: `verifier_sonnet_fail` (non-fatal, ship without flag), `verifier_malformed_json` (retry once, then fail), `verifier_fail_after_retry`

13. **Stage 7 hotspot detection** at `apps/web/lib/render/stage7-hotspots.ts`:
    - SAM-3 detects all furniture/decor regions
    - Filter regions:
      - Reject <5% of image area (noise)
      - Reject >40% of image area (background)
      - Filter labels: only shoppable categories (sofa, chair, table, lamp, rug, art, vase, plant_pot, cushion, throw, lighting_fixture, electronics)
      - Skip walls/floors/ceilings/windows/doors
    - Pad bounding boxes 10-15% (Lens needs context)
    - Sonnet 4.5 vision labels each region with description
    - For products user picked in Slot 2/3: spatial heuristic match → mark `direct_link: true` with product details
    - For others: `direct_link: false` + bbox + label + description (Lens at click time, Phase 7)
    - Up to 15 hotspots
    - Output: hotspot manifest jsonb on `renders.hotspots`
    - Trigger top-3 background preload (largest non-direct-link hotspots) — fire-and-forget Lens calls
    - Cost log: $0.005 (region detect) + $0.075 background preload
    - failure_category: `hotspot_detection_fail`, `sam3_region_detect_fail`, `sonnet_label_fail` (NON-FATAL)

14. **Stage 8 delivery** at `apps/web/lib/render/stage8-delivery.ts`:
    - Insert/update `renders` row
    - Mint signed URL for render_url (24h TTL for client; longer for emailed shares)
    - Increment `rooms.current_render_version`
    - Set `renders.failure_category = NULL` on success
    - PostHog `render_completed` with duration_ms, cost_usd, render_id
    - Background preload trigger (top-3 Lens, fire-and-forget)
    - Cost log: $0.001
    - failure_category: `delivery_url_sign_fail`, `renders_insert_fail`

15. **API routes:**

**POST /api/render/start**
- Body: `{ room_id }`
- Validates room belongs to user, status=ready_for_render
- Creates renders row with status=running, refine_index=0
- Acquires advisory lock
- Kicks off orchestrator (async, returns render_id immediately)
- Returns: `{ ok: true, render_id }`

**GET /api/render/status?render_id**
- Returns: `{ render_id, current_stage, stage_name, progress_pct, eta_seconds, status, failure_category }`
- Polled by client every 2s; OR Supabase Realtime channel push

**GET /api/render/result?render_id**
- Returns: `{ render_url, hotspots, verification_scores, architectural_baseline, status }`

**POST /api/render/retry**
- Body: `{ render_id }` — internal, used by verifier retry budget
- Re-triggers Stage 5 only (Stage 4 cache hit)
- Increments attempt_number on pipeline_runs

**POST /api/render/webhook/fal**
- fal.ai callback endpoint
- Idempotent: `INSERT ... ON CONFLICT DO NOTHING RETURNING id`
- If no row returned, drops duplicate webhook silently

### 5C — UI M11 (cinematic in-progress + reveal + select-cta)

#### Render in-progress (/render/in-progress)

**Tool:** Draftly Pro (cinematic) + Frontend Visionary (overlays, status polling)

**Intent:** cinematic wait moment. Generic camera moves over editorial composition with caption that updates based on `current_stage`.

**Architecture:**
- 1 generic Draftly cinematic clip (~10s loop, $1 one-time)
- HTML/SVG overlay with caption that updates based on `current_stage` from /api/render/status
- Captions per stage:
  - Stage 1 → "Preparing your photo…"
  - Stage 2 → "Reading your room…"
  - Stage 3 → "Composing your style…"
  - Stage 4 → "Clearing the room…"
  - Stage 5 → "Painting your design…"
  - Stage 5b → "Setting the light…"
  - Stage 6 → "Reviewing the result…"
  - Stage 7 → "Tagging the pieces…"
  - Stage 8 → "Almost there…"

**Layout:**
- Full-bleed cinematic canvas
- Centered ivory caption overlay, EB Garamond Italic 32px
- Sticky bottom: gold progress bar 4px, fills smoothly
- ETA caption DM Sans 13px ivory 60% below progress

**Motion:**
- Caption cross-fade 600ms when stage changes
- Progress bar lerps to actual progress (not instant)
- Cinematic loops seamlessly

**Reduced motion:**
- Static editorial photo backdrop (no Veo)
- Caption updates without cross-fade
- Progress bar fills instantly

**Edge cases:**
- Pipeline hangs: after 90s without stage advance, show "Taking a bit longer than usual…" reassurance caption
- Pipeline fails: transition to error state with "Couldn't create your render. Try again?" + retry CTA + token refund logged
- User navigates away: pipeline continues; user returns to dashboard, can find render in-progress later

**Analytics:**
- render_in_progress_viewed
- render_in_progress_stage_advanced {stage_index}
- render_in_progress_eta_exceeded (>90s)
- render_failed {failure_category}
- render_completed (transition to /render/reveal)

#### Render reveal (/render/reveal?render_id)

**Tool:** Draftly Pro (cinematic payoff moment) + Frontend Visionary (overlays naming user's choices)

**Intent:** dramatic reveal. Cinematic settles to display the rendered image. Caption mentions user's chosen style + key personalization choices.

**Architecture:**
- Same template as Phase 2 style reveal: 1 generic cinematic + dynamic overlay
- Overlay names user's design choices ("Warm Japandi · Warm cozy · Sonos Arc Ultra")

**Layout:**
- Phase A: cinematic plays (~5s)
- Phase B: image settles full-bleed; overlay shows
  - Headline EB Garamond Light Italic 56px gold: "Your room."
  - Subhead italic 24px ivory 80%: dynamic style + mood string
  - Bottom: 2 CTAs (Refine | Shop)

**Hotspots:** NONE in reveal. Clean image. Hotspots only on /render/[id]/shop (Phase 7).

**Reduced motion:**
- Skip cinematic, go directly to settled image
- Caption fades in without animation

**Edge cases:**
- Render image fails to load: error placeholder + retry button
- User refreshes: same render re-renders from cache (no re-generation)

**Analytics:**
- render_reveal_viewed {render_id}
- render_reveal_cta_clicked {cta: 'refine'|'shop'}

#### Select CTA (/render/select-cta?render_id)

Often inlined into reveal; routed to its own URL for simpler navigation state.

**Layout:**
- Full-bleed dark backdrop, rendered image visible 60% opacity
- Centered card 480px ivory bg
  - Headline: *"What's next?"* EB Garamond Italic 28px
  - 2 CTAs:
    - "Refine this design →" (gold pill primary)
    - "Shop this room →" (ghost ivory)

**Behavior:**
- Refine → opens refine modal (Phase 6)
- Shop → navigates to /render/[id]/shop (Phase 7; route exists in Phase 5 but page is Phase 7)

### 5D — Integration + review

- 50-render quality test (G13) — mandatory gate
- 540-variant cleanPrompt snapshot test passes
- All 8 stages run end-to-end
- Cost telemetry has rows for every stage of every render
- Verifier scores logged
- architectural_baseline snapshotted on first render
- Hotspot manifest populated with top-3 preload
- Cinematic in-progress + reveal smooth on broadband; graceful degradation on 4G
- /render/select-cta routes correctly
- Verifier 7-phase covers happy path + every stage failure recovery + retry budget + cache hit/miss

---

## 7. Out of scope

- Refine flow (Phase 6)
- Product matching at click time (Phase 7) — Stage 7 here only does region detection + top-3 preload
- Shop screen UI (Phase 7)
- Token enforcement (Phase 8 builds infra)
- Dashboard (Phase 9)
- Block C optimizations (direct-edit, default-skip-mood, skip-verifier — Phase 11+)
- iOS app (never V1)

---

## 8. Files touched

### Created
- `apps/web/app/render/in-progress/page.tsx`
- `apps/web/app/render/reveal/page.tsx`
- `apps/web/app/render/select-cta/page.tsx`
- `apps/web/app/api/render/start/route.ts`
- `apps/web/app/api/render/status/route.ts`
- `apps/web/app/api/render/result/route.ts`
- `apps/web/app/api/render/retry/route.ts`
- `apps/web/app/api/render/webhook/fal/route.ts`
- `apps/web/lib/render/orchestrator.ts`
- `apps/web/lib/render/recovery.ts`
- `apps/web/lib/render/stage1-preprocess.ts`
- `apps/web/lib/render/stage2-perception.ts`
- `apps/web/lib/render/stage3-director.ts`
- `apps/web/lib/render/stage4-empty-room.ts`
- `apps/web/lib/render/stage5-redesign.ts`
- `apps/web/lib/render/stage5b-mood-relight.ts`
- `apps/web/lib/render/stage6-verifier.ts`
- `apps/web/lib/render/stage7-hotspots.ts`
- `apps/web/lib/render/stage8-delivery.ts`
- `apps/web/lib/render/clean-prompt.ts`
- `apps/web/lib/render/cache-key.ts` (SHA256 logic for Stage 4)
- `apps/web/lib/render/style-codex-loader.ts`
- `apps/web/lib/render/preload-hotspots.ts` (top-3 background)
- `apps/web/components/render/InProgressCinematic.tsx`
- `apps/web/components/render/RevealCinematic.tsx`
- `apps/web/components/render/SelectCta.tsx`
- `cova-plan/render/style-codex/warm-japandi.json`
- `cova-plan/render/style-codex/coastal.json`
- `cova-plan/render/style-codex/mid-century.json`
- `cova-plan/render/style-codex/industrial.json`
- `cova-plan/render/style-codex/bohemian.json`
- `cova-plan/render/style-codex/modern-farmhouse.json`
- `cova-plan/render/style-codex/traditional.json`
- `cova-plan/render/style-codex/contemporary-minimalist.json`
- `cova-plan/render/style-codex/mediterranean.json`
- `cova-plan/render/style-codex/scandinavian-organic.json`
- `cova-plan/render/reference-rooms/ref-{room}-{n}.jpg` (10 fixtures)
- `tests/render/clean-prompt-snapshots.test.ts` (540 variants)
- `tests/render/cache-hit.test.ts`
- `tests/render/orchestrator.test.ts`
- `tests/render/recovery.test.ts`
- `tests/render/verifier-rubric.test.ts`
- `tests/render/architectural-baseline.test.ts`
- `tests/render/snapshot-538-variants.json` (initial snapshot data)

### Migrations
- `supabase/migrations/{ts}-pipeline-runs-table.sql` + `_down.sql`
- `supabase/migrations/{ts}-empty-room-cache-table.sql` + `_down.sql`
- `supabase/migrations/{ts}-renders-table.sql` + `_down.sql`

### Modal apps modified
- `modal_pipeline/cova-perception/main.py` — verify A10G + Depth-Anything-V2 + SAM-3 + Sonnet color + Haiku room-type
- `modal_pipeline/cova-empty-room/main.py` — verify SAM-3 + flux-pro/v1/fill passthrough
- `modal_pipeline/cova-redesign/main.py` — verify Pass 3 IC-Light v2 mood profiles

### Modified
- `apps/web/lib/analytics/events.ts` (render events)
- `apps/web/lib/errors/categories.ts` (RenderFailure union, ~50 codes)

---

## 9. API contracts

(All routes use Phase 1 error envelope; auth required)

### POST /api/render/start
```
Body: { room_id: string }
Validation: room belongs to user, rooms.status='ready_for_render'
Returns: { ok: true, render_id: string }
Side effects: creates renders row, kicks off orchestrator async
Idempotency: if render already running for room, returns existing render_id
```

### GET /api/render/status?render_id
```
Returns: {
  render_id, current_stage: 1-8, stage_name: string,
  progress_pct: 0-100, eta_seconds: number,
  status: 'running'|'succeeded'|'failed',
  failure_category: string | null
}
```

### GET /api/render/result?render_id
```
Auth: render belongs to user
Returns: {
  render_url: string (signed 24h TTL),
  hotspots: [...],
  verification_scores: {...},
  architectural_baseline: {...},
  status: 'succeeded'|'failed'
}
```

### POST /api/render/retry
Internal use only — verifier retry budget. Re-fires Stage 5 with edit_strength 0.75, increments attempt_number.

### POST /api/render/webhook/fal
fal.ai callback. Idempotent. Updates pipeline_runs row.

---

## 10. Schema migrations

(See §6 for full DDL — pipeline_runs, empty_room_cache, renders)

Down migrations: drop tables in reverse order. CASCADE handles FK references.

---

## 11. Failure handling

```typescript
export type RenderFailure =
  // Stage 1
  | 'preprocess_decode_fail' | 'preprocess_resize_fail'
  // Stage 2
  | 'perception_modal_fail' | 'depth_extraction_fail' | 'sam3_fail'
  | 'sonnet_color_fail' | 'room_type_classifier_fail'
  // Stage 3
  | 'director_sonnet_fail' | 'codex_load_fail'
  | 'manifest_parse_fail' | 'prompt_clean_fail'
  // Stage 4
  | 'empty_room_modal_fail' | 'sam3_furniture_detect_fail'
  | 'flux_fill_api_fail' | 'passthrough_blend_fail'
  // Stage 5
  | 'flux2_edit_api_fail' | 'flux2_timeout' | 'flux2_rate_limit' | 'flux2_invalid_prompt'
  // Stage 5b
  | 'iclight_modal_fail' | 'mood_profile_invalid'
  // Stage 6
  | 'verifier_sonnet_fail' | 'verifier_malformed_json' | 'verifier_fail_after_retry'
  // Stage 7
  | 'hotspot_detection_fail' | 'sam3_region_detect_fail' | 'sonnet_label_fail'
  // Stage 8
  | 'delivery_url_sign_fail' | 'renders_insert_fail'
  // Orchestrator
  | 'orchestrator_advisory_lock_fail' | 'orchestrator_pipeline_runs_insert_fail'
  | 'render_room_not_ready' | 'render_already_running';
```

(Recovery actions detailed in §6 #3)

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits (planner + executor + verifier × 2) | $150–200 |
| 50-render quality test | ~$20 |
| Stage development testing (~100 test renders) | ~$30 |
| Verifier tuning (Sonnet calls) | ~$5 |
| Reference room curation FLUX renders (one-time) | ~$5 |
| Veo cinematics for in-progress + reveal (one-time, ~$2) | $2 |
| **Total** | **~$210–262** |

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| 8 stages run end-to-end | pipeline_runs has rows for every stage of test render |
| Idempotency | Re-fire /api/render/start for same room → returns existing render_id |
| Stage 4 cache | Run 2 renders on same processed_url → second has cache hit, $0 + 0s for Stage 4 |
| cleanPrompt 540 variants | Snapshot test passes |
| Stage 5 edit_strength 0.85 | Verify in code, not 0.65 or 0.95 |
| Stage 6 hard-constraint preamble | String matches locked spec |
| 8-dim rubric all dims scored | Sample 10 verifier outputs, all have 8 keys with 0-10 values |
| 1-retry budget | Force dim<7 → Stage 5 re-runs with 0.75; if still fails, ships best-of-2 |
| architectural_baseline snapshot | First successful render has architectural_baseline jsonb |
| Stage 5b conditional | If lighting.mood=null, Stage 5b skipped (no pipeline_runs row) |
| Top-3 preload | After delivery, 3 fire-and-forget Lens calls in render_cost_log |
| All ~50 failure_category enums | grep confirms used in error paths |
| Cost log per stage | Every stage attempt has render_cost_log row |
| Timeouts from lib/config | No hardcoded timeout numbers |
| 50-render quality test | ≥80% first-attempt pass, ≥95% after 1 retry (gating closure) |

---

## 14. Adversarial code review checklist

- [ ] Orchestrator uses Postgres advisory lock (not just app-level mutex)
- [ ] pipeline_runs UNIQUE on (room_id, stage_index, attempt_number) prevents duplicate writes
- [ ] Webhook handler is idempotent (`INSERT ON CONFLICT DO NOTHING`)
- [ ] Server-to-server reads use service role, not signed URLs (avoid 1h TTL during 90s pipeline)
- [ ] Signed URL TTL: 24h client, longer for shares (not 1h)
- [ ] Stage 4 cache: SHA256 includes BOTH processedBytes AND dimensions (not just bytes)
- [ ] cleanPrompt() applied to enumerated prompt BEFORE sending to Stage 5
- [ ] Hard-constraint preamble exact text in verifier prompt
- [ ] 8-dim rubric: all 8 keys present, parse failure → retry once
- [ ] Retry budget tracks attempt_number, not boolean (so we can ship best-of-2 by score sum)
- [ ] architectural_baseline snapshotted only on FIRST successful render (refine_index=0)
- [ ] Stage 5b skipped when lighting.mood=null (saves $0.030 + 6s)
- [ ] Top-3 preload is fire-and-forget (doesn't block delivery)
- [ ] Top-3 preload uses cost log category 'lens_preload'
- [ ] Direct-link hotspots from personalization don't trigger Lens calls
- [ ] Hotspot bbox padding 10-15% applied
- [ ] Hotspot filter: <5% area rejected, >40% area rejected
- [ ] No console.log of render_url or hotspot product URLs (PII)
- [ ] Style codex loaded via require/import (no dynamic file read at runtime)
- [ ] FLUX.2 fetch uses AbortSignal.timeout from lib/config/timeouts (320s)
- [ ] Modal app calls have 300s timeout
- [ ] Vercel route timeout 290s (correct chain order)
- [ ] All 4 Modal apps reachable on container start (health check)
- [ ] Background preload error doesn't fail the parent render
- [ ] Renders RLS prevents user A reading user B's renders
- [ ] pipeline_runs RLS service-role only (no user reads infrastructure)
- [ ] empty_room_cache RLS service-role only
- [ ] failure_category populated on every error path (~50 codes used)
- [ ] Pipeline failure → user-facing error UX with retry CTA + token refund logged
- [ ] In-progress cinematic captions match current_stage exactly
- [ ] Real-time progress poll every 2s (or Realtime channel)
- [ ] If pipeline hangs >90s without stage advance, show reassurance caption
- [ ] Cinematic frames lazy-loaded as user scrolls into range
- [ ] FLUX.2 prompt does NOT exceed token limit (truncate gracefully)
- [ ] Sonnet director output validated as JSON (parse error → retry once)
- [ ] Reference room fixtures used in tests, not synthetic
- [ ] Snapshot 538 variants regenerate cleanly when style codex changes (CI fail loud)

---

## 15. Manual click-script

Save to `cova-plan/manual-evidence/P5/`.

### Render happy path (clean room, Warm Japandi, all 3 slots filled)
1. Test user with: completed quiz (Warm Japandi 73%), captured clean room, 3 slots filled (art composite passed, smart-tech 4 products, lighting warm_cozy + 2 products)
2. /onboarding/personalization/lighting → "Continue → render" → /render/in-progress **[E1: in-progress-stage1.png]**
3. Watch caption progression: "Reading your room…" **[E2: stage2.png]**
4. "Composing your style…" **[E3: stage3.png]**
5. "Clearing the room…" **[E4: stage4.png]**
6. "Painting your design…" **[E5: stage5.png]**
7. "Setting the light…" **[E6: stage5b.png]**
8. "Reviewing the result…" **[E7: stage6.png]**
9. "Tagging the pieces…" **[E8: stage7.png]**
10. "Almost there…" **[E9: stage8.png]**
11. ~67s total → /render/reveal cinematic plays
12. Image settles, caption shows "Your room." + style + mood **[E10: reveal-settled.png]**
13. /render/select-cta loads with 2 CTAs **[E11: select-cta.png]**

### Side-by-side comparison (10 reference rooms)
14. Run 10 renders covering all 10 styles and 5 room types
15. Capture: input photo + rendered output side-by-side **[E12-E21: side-by-side-{1-10}.png]**

### Cache hit (refine simulation by re-running on same room)
16. Trigger second render on same room (no Phase 6 yet, so do it via direct API call)
17. Confirm Stage 4 in pipeline_runs row has 0 cost + ~0s duration
18. Confirm empty_room_cache hit_count incremented

### Verifier retry budget
19. Force a verifier dim <7 (e.g., adjust prompt to drift wall color)
20. Confirm Stage 5 re-runs with edit_strength 0.75 (pipeline_runs attempt_number=2)
21. If second pass fails, confirm ship best-of-2 + failure_category='verifier_fail_after_retry' logged

### Mood relight skipped
22. Run render with lighting.mood = null in personalization_manifest
23. Confirm Stage 5b skipped (no pipeline_runs row for stage 5b)
24. Final image is Stage 5 output

### Pipeline failure UX
25. Force Stage 4 fatal error (mock cova-empty-room down)
26. /render/in-progress transitions to error screen **[E22: pipeline-error.png]**
27. Click retry CTA → new render starts

### 50-render quality gate
28. Run 50 renders covering all 10 styles × room types × personalization completeness
29. For each: capture input + output side-by-side, score 1-5, score 8-dim rubric
30. Compute pass rate first attempt + after 1 retry
31. Bundle into `cova-plan/render/quality-gate-50/` with table report

### Mobile responsive
32. iPhone Safari: /render/in-progress + reveal + select-cta render correctly **[E23-25: mobile-render.png]**

### Reduced motion
33. Enable OS reduced motion → /render/in-progress shows static editorial photo + caption updates **[E26: in-progress-reduced.png]**
34. /render/reveal: skip cinematic, image settles directly **[E27: reveal-reduced.png]**

---

## 16. Manual evidence bundle

- 27+ screenshots from §15
- Side-by-side comparison gallery (10 input + output pairs)
- 50-render quality gate report (`cova-plan/render/quality-gate-50/INDEX.md` + per-render scores)
- Cost telemetry SQL dump for sample render (all stages, costs, durations)
- Verifier rubric output for 10 sample renders
- pipeline_runs sample dump for 1 happy + 1 retry-budget render
- Snapshot test output for cleanPrompt 540 variants
- INDEX.md linking artifacts to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P5.md`

If 50-render quality test fails (<80% first-attempt): escalation = adjust style codex content (V1.5 candidates), tune Stage 3 director prompt, OR drop edit_strength experimentation. Block C optimizations (skip Stage 4 direct-edit, etc.) considered IF quality is stable but cost/latency is the issue.

---

## 18. Closing checklist

- [ ] All 27+ screenshots in `cova-plan/manual-evidence/P5/`
- [ ] 50-render quality gate report archived
- [ ] Side-by-side gallery captured
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 5 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: edit_strength 0.85, Stage 4 cache 30d TTL, 8-dim rubric thresholds, hard-constraint preamble exact text, retry budget logic, architectural_baseline rules, Stage 5b conditional, top-3 preload
- [ ] `EMPIRICAL_FINDINGS.md` updated: 50-render quality results (% first-pass, % retry-pass, mean dim scores per dim per style), Stage 4 cache hit rate at scale (target 85%), p50/p95 latency per stage actual vs predicted, cost per render actual vs predicted, FLUX.2 actual cost per call
- [ ] Reference room fixtures (10) committed
- [ ] All 10 style codices committed
- [ ] Phase 6 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

Revert merge commit on main → run paired _down.sql in reverse:
1. renders down (CASCADE drops dependent rows)
2. empty_room_cache down
3. pipeline_runs down

Modal apps stay deployed (rollback doesn't redeploy).

If pipeline broken in prod but auth/quiz/capture/personalization green: feature flag `render_pipeline_enabled=false` shows "Render coming soon" placeholder on /render/in-progress.

---

## 20. Feature flags introduced

| Flag key | Description | Default |
|---|---|---|
| `render_pipeline_enabled` | Master switch for whole pipeline | true |
| `render_stage5b_enabled` | Mood relight stage | true |
| `render_stage6_verifier_enabled` | Verifier (Stage 6) — false ships render without verification | true |
| `render_stage7_hotspots_enabled` | Hotspot detection | true |
| `render_top3_preload_enabled` | Background top-3 Lens preload | true |
| `render_retry_budget_enabled` | 1-retry budget on dim<7 | true |
| `render_stage4_cache_enabled` | Empty-room cache (false = always regenerate) | true |
| `render_direct_edit_experiment` | Block C: skip Stage 4, direct-edit on cluttered photo | false |

---

## End of Phase 5 doc.

Next: Phase 6 (Refine).
