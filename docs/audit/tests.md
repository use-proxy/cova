# Test Suite Audit

Generated: 2026-04-19

---

## 1. Current Test Inventory

### Test Frameworks

| Framework | Config File | Scope |
|-----------|-------------|-------|
| Vitest | `apps/web/vitest.config.ts` | Unit + integration tests (apps/web) |
| Playwright | `apps/web/playwright.config.ts` | E2E browser tests (apps/web) |
| Python scripts | None (ad-hoc) | Pipeline quality tests (tests/quality, tests/e2e) |

### Total Test Count

| Category | Files | Test Cases |
|----------|-------|------------|
| Vitest (`__tests__/`) | 15 | 351 |
| Vitest (`tests/`) | 31 | 307 |
| Supabase function tests | 7 | 200 |
| Playwright E2E specs | 6 | 33 |
| Python scripts (no formal test framework) | 7 | 0 (script-based, not pytest) |
| **Total** | **66** | **891** |

---

### Per-File Breakdown: `apps/web/__tests__/`

| File | Tests | Category |
|------|-------|----------|
| `area1/anchor-display.test.ts` | 19 | Unit |
| `area1/fingerprint.test.ts` | 17 | Unit |
| `area1/quiz-flow.test.ts` | 19 | Integration |
| `area2/render-context-assembler.test.ts` | 32 | Unit |
| `area2/room-analysis.test.ts` | 17 | Integration |
| `area3/flux-prompt.test.ts` | 75 | Unit |
| `area3/render-pipeline.test.ts` | 23 | Integration |
| `area4/complete-room.test.ts` | 14 | Integration |
| `area4/match-pipeline.test.ts` | 26 | Integration |
| `area4/scoring.test.ts` | 40 | Unit |
| `area4/serper.test.ts` | 11 | Unit |
| `area4/room-budget.test.ts` | 12 | Integration |
| `shared/navigation-flow.test.ts` | 21 | Unit |
| `shared/rate-limit.test.ts` | 15 | Unit |
| `pipeline.test.ts` | 10 | Integration |
| `flux-prompt-50.test.ts` | 1 | Unit |

### Per-File Breakdown: `apps/web/tests/`

| File | Tests | Category |
|------|-------|----------|
| `ai/clip.test.ts` | 26 | Unit |
| `ai/cross-encoder.test.ts` | 10 | Unit |
| `ai/detection.test.ts` | 5 | Unit |
| `ai/flux-property.test.ts` | 18 | Unit |
| `ai/flux.test.ts` | 17 | Unit |
| `ai/llm-judge.test.ts` | 6 | Unit |
| `ai/prompt-snapshots.test.ts` | 7 | Unit |
| `ai/render-quality.test.ts` | 10 | Unit |
| `ai/pipeline-config.test.ts` | 21 | Unit |
| `api/contracts.test.ts` | 8 | Integration |
| `capture/capture.test.ts` | 14 | Integration |
| `db/hnsw-migration.test.ts` | 10 | Unit |
| `design/tokens.test.ts` | 6 | Unit |
| `e2e/api-contracts.test.ts` | 27 | Integration |
| `e2e/data-integrity.test.ts` | 8 | Integration |
| `fixtures/msw-integration.test.ts` | 11 | Integration |
| `integration/data-flow.test.ts` | 42 | Integration |
| `lib/affiliates.test.ts` | 10 | Unit |
| `lib/env.test.ts` | 4 | Unit |
| `lib/rateLimit.test.ts` | 5 | Unit |
| `lib/retry.test.ts` | 9 | Unit |
| `lib/storage.test.ts` | 7 | Unit |
| `security/keys.test.ts` | 5 | Unit |
| `security/prompt-safety.test.ts` | 10 | Unit |
| `stores/area2Store.test.ts` | 10 | Unit |
| `stores/index.test.ts` | 4 | Unit |
| `stores/room.test.ts` | 12 | Unit |
| `stores/session.test.ts` | 9 | Unit |
| `stores/fingerprint.test.ts` | 14 | Unit |
| `types/supabase.test.ts` | 9 | Unit |

### Per-File Breakdown: `supabase/functions/tests/`

| File | Tests | Category |
|------|-------|----------|
| `chat.test.ts` | 26 | Integration |
| `clip-matching.test.ts` | 27 | Integration |
| `panorama-render.test.ts` | 54 | Integration |
| `render-pipeline.test.ts` | 16 | Integration |
| `render-view.test.ts` | 28 | Integration |
| `room-capture.test.ts` | 21 | Integration |
| `style-quiz.test.ts` | 28 | Integration |

### Per-File Breakdown: Playwright E2E Specs (`apps/web/tests/e2e/`)

| File | Tests | Category |
|------|-------|----------|
| `complete-flow.spec.ts` | 1 | E2E |
| `render-pipeline.spec.ts` | 2 | E2E |
| `user-workflows.spec.ts` | 14 | E2E |
| `visual-checks.spec.ts` | 14 | E2E |
| `full-render-flow.spec.ts` | 1 | E2E |
| `webhook-smoke.spec.ts` | 1 | E2E |

### Python Scripts (no pytest framework)

| File | Category | Notes |
|------|----------|-------|
| `tests/quality/test_preprocessing.py` | Manual script | Runs preprocessing pipeline on sample images |
| `tests/quality/test_professionalization.py` | Manual script | Runs professionalization pass on 10 sample rooms |
| `tests/quality/test_runner.py` | Manual script | Orchestrates quality test runs |
| `tests/e2e/fire_v6_tests.py` | Manual script | Fires v6 pipeline and saves renders |
| `tests/e2e/fire_v6_diagnostic.py` | Manual script | Diagnostic v6 pipeline run |
| `tests/e2e/fire_v7_tests.py` | Manual script | Fires v7 pipeline and saves renders |
| `tests/e2e/fire_v8_tests.py` | Manual script | Fires v8 pipeline and saves renders |

---

## 2. Category Breakdown

| Category | Test Count | Percentage |
|----------|------------|------------|
| Unit tests | 490 | 55.0% |
| Integration tests | 368 | 41.3% |
| E2E tests | 33 | 3.7% |
| **Total** | **891** | 100% |

### Known Issues

- `apps/web/__tests__/area1/quiz-flow.test.ts` (7 tests): Supabase admin client mock chain is stale (documented in CLAUDE.md as post-launch test debt).
- Python test scripts in `tests/quality/` and `tests/e2e/` have no formal test assertions; they are fire-and-observe scripts rather than automated tests.
- The `tests/pipeline/` directory exists but is empty.

---

## 3. Coverage Gap Analysis: v9 Pipeline Stages

The v9 pipeline (as documented in generation.py and the pipeline architecture) consists of these stages:

### Stage 1: Perception (Room Analysis / Understanding)

**What it does:** Analyzes the input photo to extract room context (shape, dimensions, lighting, materials, architectural features), runs object detection (Grounded-SAM2 / RAM++), builds keep/remove masks.

**Existing coverage:**
- `__tests__/area2/room-analysis.test.ts` (17 tests) — area2 store, `/api/rooms/create`, `/api/rooms/status`, `/api/detect`, `/api/parse-constraints`
- `__tests__/area2/render-context-assembler.test.ts` (32 tests) — pure function `assembleRenderContext()` with defaults, null handling, threshold logic
- `tests/ai/detection.test.ts` (5 tests) — detection pipeline helpers
- `tests/stores/area2Store.test.ts` (10 tests) — Zustand store for room analysis data
- `__tests__/pipeline.test.ts` (10 tests) — `/api/pipeline/pre-detect` validation

**Gaps:** No tests for OneFormer semantic segmentation output parsing, mask confidence thresholds, SAM2 refinement loop, or wall/floor/ceiling classification accuracy.

### Stage 2: Empty-Room (Furniture Removal)

**What it does:** Input cleaning (paint over text/logos), then Fill Pro with architecture-inverse mask to produce an empty room. Mask built from OneFormer semantic segmentation + SAM2 wall-object subtraction.

**Existing coverage:**
- `tests/quality/test_preprocessing.py` (manual script) — visual QA of preprocessing on 10 rooms
- `tests/quality/test_professionalization.py` (manual script) — visual QA of professionalization pass
- `__tests__/area3/render-pipeline.test.ts` (23 tests) — API routes for render/from-context, render/status, previews, tweak

**Gaps:** No tests for mask_build.py logic (architecture mask generation, dilation parameters), input cleaning (text/logo painting), Fill Pro parameter validation, or empty-room output quality assertions.

### Stage 3: Redesign (AI Redesign Generation)

**What it does:** Vision-aware Design Director (Claude Sonnet) writes a spatially-aware design brief from the Stage 1 empty room. Fill Pro generates 4 styled candidates using the brief + anti-hallucination clauses. LoRA stacking, IP-Adapter references, differential diffusion for keep-items.

**Existing coverage:**
- `__tests__/area3/flux-prompt.test.ts` (75 tests) — extensive buildFluxPrompt + buildFluxPromptFromContext testing (descriptors, length limits, safety)
- `__tests__/area2/render-context-assembler.test.ts` (32 tests) — render context assembly
- `tests/ai/flux.test.ts` (17 tests) — FLUX prompt/parameter helpers
- `tests/ai/flux-property.test.ts` (18 tests) — FLUX property-based tests
- `tests/ai/prompt-snapshots.test.ts` (7 tests) — prompt snapshot regression tests
- `tests/ai/pipeline-config.test.ts` (21 tests) — pipeline configuration validation

**Gaps:** No tests for the Vision Director Claude call (system prompt, structured output parsing, spatial placement validation), LoRA stacking logic, IP-Adapter reference selection, or 4-candidate generation orchestration.

### Stage 4: Compositing (Combining Layers)

**What it does:** In v8+, compositing is removed — Fill Pro output is used directly. Post-processing chain: denoise, CLAHE contrast, teal-orange grade, vignette, film grain, unsharp mask, sRGB normalize.

**Existing coverage:**
- `tests/ai/render-quality.test.ts` (10 tests) — render quality metric helpers
- Manual visual QA via `tests/e2e/renders/` directory (50+ render images across v6-v8)

**Gaps:** No unit tests for any of the 11 post-processing steps in `modal_pipeline/postprocess.py`, no tests for color grading parameters, no automated visual regression tests.

### Stage 5: Drift Verify (Quality / Consistency Checks)

**What it does:** 3-model ensemble quality scorer (HPSv2 + Q-Align + Aesthetic Predictor V2.5). Auto-reject gate at overall < 5.0 triggers regeneration. Scores 4 candidates and picks the best.

**Existing coverage:**
- `tests/ai/llm-judge.test.ts` (6 tests) — LLM-based quality judging helpers
- `tests/ai/render-quality.test.ts` (10 tests) — render quality metric computation
- `modal_pipeline/scoring.py` exists but has no formal test file

**Gaps:** No tests for the 3-model ensemble weighting, score normalization to 0-10 scale, auto-reject threshold behavior, candidate ranking logic, or HPSv2/Q-Align/Aesthetic model output parsing.

### Stage 6: Refinement (Iterative Improvement)

**What it does:** User-driven refinement via style intensity slider, color tweaks, and targeted re-generation. API routes: `/api/render/tweak`, `/api/render/tweak/status`. Stages 1-3 are skipped on refinement runs if output already exists.

**Existing coverage:**
- `__tests__/area3/render-pipeline.test.ts` — tweak route tests (POST tweak, GET tweak/status, auth, validation)
- `tests/e2e/fire_v7_tests.py`, `fire_v8_tests.py` — manual refinement iteration scripts

**Gaps:** No tests for idempotency skip logic in `redesign_pipeline.py`, no tests for refinement-specific prompt modifications, no tests for style intensity slider parameter mapping.

---

## 4. New Test Plan (~48 tests)

### Priority 1: Perception Stage (8 tests)

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| P1 | `perception/semantic-labels.test.ts` — OneFormer output contains expected ADE20K labels for a living room | Unit | Label parsing from semantic segmentation output |
| P2 | `perception/mask-confidence-threshold.test.ts` — Objects below 0.5 confidence are marked as `confidenceTier: "auto-remove"` | Unit | Detection confidence tier assignment |
| P3 | `perception/room-context-completeness.test.ts` — Room context always has non-null values for required fields (roomShape, floorMaterial, wallColor) | Unit | Room analysis output shape completeness |
| P4 | `perception/depth-map-range.test.ts` — Depth map values are normalized to [0, 1] range | Unit | Depth map normalization |
| P5 | `perception/object-dedup.test.ts` — Duplicate detections within 0.5m 3D proximity are merged | Unit | 3D proximity deduplication |
| P6 | `perception/camera-angle-detection.test.ts` — Camera angle classification returns valid enum value | Unit | Camera angle enum validation |
| P7 | `perception/architectural-features.test.ts` — Crown molding, bay windows, built-ins are detected from feature list | Unit | Architectural feature extraction |
| P8 | `perception/pre-detect-webhook-payload.test.ts` — Pre-detect webhook sends correct payload shape to Modal | Integration | Webhook payload contract |

### Priority 2: Empty-Room Stage (8 tests)

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| E1 | `empty-room/architecture-mask-classes.test.ts` — HARD_STRUCTURAL set contains wall, ceiling, floor, window, door | Unit | Mask class membership |
| E2 | `empty-room/mask-dilation.test.ts` — Dilation is 12px with elliptical kernel | Unit | Dilation parameter correctness |
| E3 | `empty-room/mask-inversion.test.ts` — Fill Pro mask is exact inverse of architecture mask | Unit | Mask inversion logic |
| E4 | `empty-room/input-cleaning-text.test.ts` — Regions with detected text (Tesseract) are painted over with sampled wall color | Unit | Text region cleaning |
| E5 | `empty-room/fill-pro-params.test.ts` — Fill Pro call uses empty prompt, correct model version, and architecture-inverse mask | Integration | Fill Pro API parameter contract |
| E6 | `empty-room/normalize-label-key.test.ts` — `normalize_label_key()` correctly maps ADE20K class names to internal keys | Unit | Label normalization |
| E7 | `empty-room/get-dilation-px.test.ts` — `get_dilation_px()` returns correct dilation for various image resolutions | Unit | Resolution-adaptive dilation |
| E8 | `empty-room/mask-no-furniture.test.ts` — Architecture mask does NOT include furniture, decorations, or clutter labels | Unit | Mask exclusion correctness |

### Priority 3: Redesign Stage (10 tests)

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| R1 | `redesign/vision-director-system-prompt.test.ts` — System prompt includes spatial choreography instructions and 60-30-10 color rule | Unit | Design director prompt content |
| R2 | `redesign/vision-director-output-schema.test.ts` — Design Director output JSON has required fields: room_type, weaknesses, objects (6-12), palette, lighting | Unit | Structured output schema validation |
| R3 | `redesign/vision-director-forbidden-words.test.ts` — Design Director output does not contain forbidden words (beautiful, stunning, modern, etc.) | Unit | Forbidden word filter |
| R4 | `redesign/lora-stacking-format.test.ts` — LoRA stack JSON is valid array of {url, scale, name} objects with scale in [0.0, 1.0] | Unit | LoRA stack format validation |
| R5 | `redesign/lora-trigger-words.test.ts` — Each style LoRA has correct trigger word (cvwmn, cvscn, cvmcm, etc.) | Unit | Trigger word registry correctness |
| R6 | `redesign/ip-adapter-refs.test.ts` — IP-Adapter reference URLs are valid Unsplash URLs with scale 0.45 | Unit | Reference URL validation |
| R7 | `redesign/4-candidate-generation.test.ts` — Generation produces exactly 4 candidates with different seeds | Integration | Multi-candidate orchestration |
| R8 | `redesign/anti-hallucination-clauses.test.ts` — Prompt contains "editorial photography" and excludes CGI/watermark language | Unit | Prompt safety clauses |
| R9 | `redesign/differential-diffusion-map.test.ts` — Change map has white (255) for change regions and black (0) for preserved regions | Unit | Change map correctness |
| R10 | `redesign/room-type-passthrough.test.ts` — room_type from user input reaches Fill Pro call without mutation | Integration | room_type pipeline passthrough |

### Priority 4: Post-Processing / Compositing Stage (7 tests)

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| C1 | `postprocess/clahe-clip-limit.test.ts` — CLAHE clipLimit=3.0 on LAB L-channel | Unit | CLAHE parameter |
| C2 | `postprocess/teal-orange-lab.test.ts` — Teal-orange grade shifts LAB a/b channels within expected range | Unit | Color grade bounds |
| C3 | `postprocess/vignette-center.test.ts` — Vignette is centered on image with elliptical shape | Unit | Vignette geometry |
| C4 | `postprocess/film-grain-disabled-default.test.ts` — Film grain step is disabled by default | Unit | Default toggle state |
| C5 | `postprocess/chain-order.test.ts` — Film grain is always the last step if enabled | Unit | Processing order invariant |
| C6 | `postprocess/step-failure-fallthrough.test.ts` — If one step fails, chain continues with previous output | Unit | Error resilience |
| C7 | `postprocess/output-srgb.test.ts` — Final output is normalized to sRGB color space | Unit | Color space correctness |

### Priority 5: Drift Verify / Quality Gate (8 tests)

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| D1 | `scoring/ensemble-weights.test.ts` — HPSv2=0.5, Q-Align=0.3, Aesthetic=0.2 sum to 1.0 | Unit | Weight validation |
| D2 | `scoring/auto-reject-threshold.test.ts` — Score < 5.0 returns reject=true | Unit | Reject gate threshold |
| D3 | `scoring/auto-reject-above.test.ts` — Score >= 5.0 returns reject=false | Unit | Pass gate threshold |
| D4 | `scoring/normalize-0-10.test.ts` — Raw model scores are normalized to 0-10 scale | Unit | Score normalization |
| D5 | `scoring/candidate-ranking.test.ts` — 4 candidates are ranked by ensemble score, highest first | Unit | Ranking order |
| D6 | `scoring/hpsv2-score-range.test.ts` — HPSv2 output is a float in [0, 1] before normalization | Unit | Model output range |
| D7 | `scoring/scoring-prompt-same-room.test.ts` — Scoring prompt includes same-room context and original photo comparison | Unit | Scoring prompt content (regression from commit c764eb5) |
| D8 | `scoring/all-reject-retry.test.ts` — If all 4 candidates score < 5.0, retry flag is set with max 3 attempts | Integration | Retry orchestration |

### Priority 6: Refinement Stage (7 tests)

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| F1 | `refinement/idempotency-skip.test.ts` — Stages 1-3 are skipped when preprocessed/professionalized/structural outputs already exist | Integration | Idempotency skip logic |
| F2 | `refinement/stage4-always-reruns.test.ts` — Generation (Stage 4) always re-runs even on refinement | Integration | Re-run enforcement |
| F3 | `refinement/style-intensity-mapping.test.ts` — Style intensity slider value [0-100] maps to LoRA scale [0.0-1.0] | Unit | Slider-to-parameter mapping |
| F4 | `refinement/tweak-type-routing.test.ts` — tweak_type "color" routes to image-to-image, "layout" routes to fill | Unit | Tweak type routing |
| F5 | `refinement/refinement-preserves-context.test.ts` — Refinement run preserves original render_context fields | Integration | Context preservation |
| F6 | `refinement/max-refinements.test.ts` — Maximum 5 refinements per room before rate limit | Integration | Refinement cap |
| F7 | `refinement/refinement-cost-log.test.ts` — Each refinement appends to pipeline_cost_log JSONB | Integration | Cost tracking accumulation |

---

## 5. Priority Ordering Summary

| Priority | Stage | New Tests | Rationale |
|----------|-------|-----------|-----------|
| 1 | Perception | 8 | Foundation — bad perception cascades to all downstream stages |
| 2 | Empty-Room | 8 | Mask correctness directly determines redesign quality |
| 3 | Redesign | 10 | Core value prop — prompt quality and generation parameters |
| 4 | Post-Processing | 7 | Visual quality chain has no automated tests currently |
| 5 | Drift Verify | 8 | Quality gate prevents bad renders from reaching users |
| 6 | Refinement | 7 | User-facing iteration loop; idempotency logic is complex |
| **Total** | | **48** | |

### Implementation Notes

- Tests for Python pipeline code (Priorities 2, 4, 5) should use pytest with fixtures from `tests/quality/professionalization/` sample images.
- Tests for TypeScript API routes (Priorities 1, 3, 6) follow the existing vi.doMock + vi.resetModules pattern from `__tests__/`.
- The empty `tests/pipeline/` directory is the natural home for new pipeline-specific tests.
- Python test files in `tests/quality/` and `tests/e2e/` should be migrated to pytest format with proper assertions.
