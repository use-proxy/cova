# Pre-implementation Audit — Render Pipeline Upgrade

Date: 2026-04-21
Prior HEAD: `109dc03` (Pipeline fix: visual-critique-driven empty-room + redesign hardening)
Branch: `main`

## Mission

Ship a pipeline that (1) completely removes all furniture from any input
room, (2) redesigns with LoRAs actually running, (3) passes a strict
designer-preference validation against Collov AI references.

This upgrade builds on the `pipeline-fix` closeout (F6-CONTROLNET-URL.1
blocked LoRAs, F6-LORA-NEVER-RAN.1 every bench call fell to NB-Pro).

---

## 1. Current state per component

### 1.1 `modal_pipeline/empty_room.py`

- **Lines 52–71:** 57 furniture prompts. Overshoots the research
  recommendation of ~20 (too many prompts → each room takes more SAM3
  compute and hits fal rate limits; some categories overlap and only
  bloat the union mask — `bookshelf` vs `bookcase`, `desk chair` vs
  `office chair`, etc.).
- **Line 79:** `SAM3_SCORE_THRESHOLD = 0.10` — lower than research
  recommends (0.25). Risk of wall/floor false-positives.
- **Line 84:** `DILATION_PX = 32`, Line 89: `MORPH_CLOSE_PX = 14`
  (OK; research uses 24 dilation but this is safe).
- **Line 92:** `COVERAGE_SHORT_CIRCUIT_PCT = 1.0` — already raises 422
  (good).
- **Lines 765–769:** router — ≤35% → LaMa, >35% → Bria. Research says
  **FLUX.1 [pro] Fill primary**, LaMa/Bria as fallback cleanup. This is
  the biggest structural change.
- **Lines 478–541:** `_call_flux_fill` already wired with inverted-mask
  handling and prompt scaffolding. Needs to be promoted to primary.
- **No passthrough blend** after inpainting — the output URL is
  returned as-is. Research says: `final = original × (1 - mask_soft) +
  inpainted × mask_soft` with Gaussian σ=8 for bit-exact architecture
  preservation. Lines 793–828 handle output download / SSIM but skip
  the blend.
- **No depth-edge augmentation** of the SAM-3 mask. Adding
  Depth-Anything-V2 Sobel edges → union with SAM-3 mask catches
  low-contrast furniture the text prompts miss.
- **No ADE20K architectural mask subtraction.** Currently relies on
  inpainter not repainting walls, but on aggressive prompts the
  inpainter sometimes "improves" the walls. Subtracting architecture
  from the erase mask fixes this definitively.
- **No image preprocessing** — service receives the raw URL, fetches
  bytes at line 670, and passes it straight to SAM-3. Dark photos get
  poor SAM3 recall; EXIF-rotated phones produce sideways masks.

### 1.2 `modal_pipeline/redesign.py`

- **Line 56:** `FLUX_STRENGTH = 0.55` — too low. LoRAs can't repopulate
  furniture at 0.55 (strength ≤ 0.6 keeps mostly-empty rooms intact;
  diffusion process has no "room" to place new furniture). Research
  says 0.78.
- **Line 57:** `FLUX_GUIDANCE_SCALE = 3.5` — research says 3.8.
- **Line 58:** `FLUX_NUM_STEPS = 28` — research says 32.
- **No `scheduler` param** — fal-ai/flux-general defaults to DEIS.
  Research says euler.
- **Lines 77–94:** Universal LoRAs stack. `add-details` at 0.55 —
  research says 0.45. `realism` at 0.25 — matches research.
- **Lines 216–234:** NEGATIVE_PROMPT is the Phase 5 arch-drift list
  (good), but missing anti-AirBnB/generic-staging terms the research
  recommends: "empty, sparse, barren, generic, airbnb staging, hotel
  lobby, showroom, catalog photo, symmetrical composition, matching
  pillow pair, single overhead light only".
- **No NAG settings** — nag_scale/nag_tau/nag_alpha/nag_end not passed
  to `fal-ai/flux-general`. Research says nag_scale=4.0, nag_tau=2.5,
  nag_alpha=0.25, nag_end=0.25.
- **Lines 617–643:** `_rehost_to_fal` helper exists but the
  `pipeline-fix` closeout documents it **does not work** (v3b.fal.media
  URLs still fail). Research F6-CONTROLNET-URL.1 fix: **rehost via
  Supabase public storage bucket**.
- **Lines 645–693:** `_build_controlnet_unions` — depth at 0.85, canny
  at 0.45. Research says depth 0.55, canny 0.35 (reducing weight avoids
  over-constraining).
- **Lines 873–903:** primary → flux-general, fallback → NB-Pro. This
  pattern is correct; the issue is just that flux-general always fails
  because of the depth URL bug, so LoRAs never run.
- **No two-pass Stage B accessory inpainting** — single call only.
  Research says Stage A for structure + hero furniture, Stage B masked
  accessory inpaint (strength 0.70, different prompt) for editorial
  density.
- **No LoRA verification** — after the fal call there's no check that
  LoRAs were actually applied. Research says log inference_time and
  warn if it falls in the vanilla-flux range.

### 1.3 Bench artifacts

- `benchmarks/target_room.jpg` — the real-world target (DAKSH bedroom).
- `bench/rooms/room-01` … `room-15` (.webp) — 15 stratified bench
  rooms across archetypes.
- `benchmarks/competitors/collovai/collov_1.png` … `collov_4.png` — 4
  Collov AI renders of the target room (the designer-preference
  standard).
- `benchmarks/pipeline-fix-outputs/redesign/room-*.jpg` — previous
  bench outputs (fell back to NB-Pro, LoRAs never ran). Will be
  re-compared.

### 1.4 Supabase storage

- Bucket `room-photos` is public; already hosts `depth_maps/` and
  `edge_maps/` subfolders (used by the web-app's v3 render pipeline at
  `apps/web/CLAUDE.md`). Perfect target for rehosting depth URLs from
  the redesign service.
- Modal secret `supabase-secrets` is already attached to `cova-redesign`
  (line 802) and `cova-empty-room` (line 648). Env vars
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` available inside the
  containers.

---

## 2. Change surface — file & line summary

| File | Lines | Change |
|------|-------|--------|
| `modal_pipeline/empty_room.py` | 52–73 | Reduce FURNITURE_PROMPTS from 57 → ~22 (research list). |
| `modal_pipeline/empty_room.py` | 79 | `SAM3_SCORE_THRESHOLD` 0.10 → 0.25. |
| `modal_pipeline/empty_room.py` | (new) | Add `ARCHITECTURE_PROMPTS` + `_get_architecture_mask` + `_subtract_architecture`. |
| `modal_pipeline/empty_room.py` | (new) | Add `_get_depth_edges` + `_union_with_depth_edges`. |
| `modal_pipeline/empty_room.py` | 465–475 | Rewrite `EMPTY_ROOM_FILL_PROMPT` to research spec. |
| `modal_pipeline/empty_room.py` | 764–769 | Switch router: FLUX Fill primary (was LaMa). Bria = residual fallback. |
| `modal_pipeline/empty_room.py` | (new) | Add `_passthrough_blend` with σ=8; apply between inpainter output and returned URL. |
| `modal_pipeline/empty_room.py` | (new) | Add `_preprocess_image` (EXIF transpose, CLAHE for dark, aspect-enum). |
| `modal_pipeline/empty_room.py` | (new) | Add `_rehost_to_supabase` (bucket=`room-photos/render-upgrade`). |
| `modal_pipeline/redesign.py` | 56–58 | `FLUX_STRENGTH` 0.55 → 0.78, `FLUX_GUIDANCE_SCALE` 3.5 → 3.8, `FLUX_NUM_STEPS` 28 → 32. |
| `modal_pipeline/redesign.py` | 77–94 | `add-details` scale 0.55 → 0.45. |
| `modal_pipeline/redesign.py` | 216–234 | Expand NEGATIVE_PROMPT with research anti-staging terms. |
| `modal_pipeline/redesign.py` | (new) | Add NAG_SETTINGS constant; pass through to fal. |
| `modal_pipeline/redesign.py` | 617–643 | Replace `_rehost_to_fal` with `_rehost_to_supabase`. |
| `modal_pipeline/redesign.py` | 666, 682 | ControlNet depth 0.85 → 0.55, canny 0.45 → 0.35. |
| `modal_pipeline/redesign.py` | 696–754 | Add `scheduler=euler` to `_call_flux_general` args; log `timings.inference` for LoRA verification. |
| `modal_pipeline/redesign.py` | (new) | Stage B — accessory inpainting pass (separate helper + toggle flag on request). |
| `bench/scripts/` (new) | — | `run_render_upgrade_bench.py` — orchestrator that calls empty-room → redesign → Collov-aware designer critic, iterates on seeds up to 3 attempts per room. |
| `docs/render-upgrade/VALIDATION_RESULTS.md` (new) | — | Final per-room pass/fail matrix. |

---

## 3. Conflicts & risks

1. **F6-CONTROLNET-URL.1 (the whole point of this upgrade)** — must
   verify that the Supabase rehost actually produces a URL
   `fal-ai/flux-general/image-to-image` can download. Proven to work in
   `scripts/test-fal-controlnet.py` (hardcoded Supabase URL passed).
   Need to confirm the depth/edge rehost pipeline is reachable from
   inside the `cova-redesign` Modal container (it should: same
   `supabase-secrets` attached).

2. **Prompt reduction risk** — cutting from 57 → 22 prompts could
   regress the target room if the dropped prompts (e.g. "backpack",
   "clothes", "string lights") were doing real work. Mitigation: keep
   the research-recommended 22 but add the target-room killer terms as
   explicit entries: "clothing", "laundry", "curtain" (already in 22),
   "lamp", and rely on depth-edge augmentation to catch the rest.

3. **Strength 0.55 → 0.78 risk** — architectural drift. This is the
   fault line the pipeline-fix closeout warned about. Mitigation: the
   passthrough blend (σ=8 on empty-room mask) preserves unmasked pixels
   bit-exact; depth ControlNet at 0.55 locks geometry; NAG negatives
   push against arch-drift explicitly.

4. **Two-pass Stage B** — adds cost (~$0.05/room second pass) and
   latency (~12s). Research recommends but it's the lowest-leverage
   change. Implement as default-on, let the bench decide.

5. **Critic cost** — 15 bench rooms × avg 2 attempts × 1 Sonnet vision
   call with 6 images each ≈ 30 Sonnet calls × ~$0.08 = ~$2.40. Well
   under the $60 cap.

6. **Collov references are one-room-only** — `collov_1.png` …
   `collov_4.png` are all variations of the DAKSH bedroom. For target
   they're direct comparisons; for the other 15 bench rooms they're a
   **quality standard** (Collov-level preservation / photorealism /
   completeness). The critic prompt handles this distinction.

7. **Modal redeploy risk** — 8-web-endpoint workspace limit.
   `cova-redesign` was deployed by stopping
   `cova-restoration-pipeline` + `cova-clip-text-embed` in Phase 5.
   Re-deploys of those two apps are in-scope only if this upgrade
   breaks them (it shouldn't).

---

## 4. Out-of-scope (not touched this session)

- Personalization wiring (fingerprint / Budget DNA / style_blend into
  `RenderContext`) — Phase 3 BLEND-CTX already resolved that.
- UI changes — this upgrade is pure render quality.
- Web-app v3 pipeline (apps/web/CLAUDE.md) — separate orchestration
  path, not touched.
- Supabase schema — no DDL; `render-upgrade/` folder lives inside the
  existing public `room-photos` bucket.
- Tests for `redesign-client.ts` / `empty-room-client.ts` (TS tests)
  — service signatures unchanged, clients still work.
- Phase 3 deferred follow-ups (F3-* items) — out of scope.

---

## 5. Validation gates

Bench gate (Phase 5 of this upgrade):

- ≥ 13 of 16 rooms (15 bench + 1 target) where the Sonnet designer
  critic returns `COVA_WINS` or `TIE` AND all five hard criteria
  `PASS` or `WARN` (no single `FAIL`).
- Gate PASS → commit. Gate PARTIAL (10–12/16) → one more iteration
  round, then commit with documented residuals. Gate FAIL (< 10/16) →
  pause and report.

Cost gate: hard stop at $60 total (log to
`docs/render-upgrade/cost-log.json`).
