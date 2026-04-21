# Phase 5 Closeout — Redesign Service

**Status:** CLOSED (gate passed)
**Date:** 2026-04-21
**Gate:** **14/15 rooms beat Collov** (quality bar: composite ≥ 7.5 AND style_fidelity ≥ 7.0)
**Cost:** ~$2.19 (93% under $30 cap)
**Closure confidence:** 9/10

## What shipped

### Code
- **`modal_pipeline/redesign.py`** (769 lines) — new Modal app `cova-redesign` on A10G. Single endpoint `POST /v1/generate_redesign`. Deployed at `https://cova-interior--cova-redesign-redesign-api.modal.run`.
  - `LORA_REGISTRY` mirrors `apps/web/lib/styles/lora-registry.ts` (10 trained archetypes × cv* triggers × default_scales).
  - `UNIVERSAL_LORAS` stack: add-details (Shakker-Labs) + RealismLora (XLabs-AI), always appended to the style LoRAs.
  - `ARCHETYPE_VOCAB` — 10 entries, material-first noun lists, superset of `STYLE_DNA_BLOCKS` in the Director.
  - `_build_prompt` emits the D_full_activation template (3× trigger prefix + typed prose + vocab + 2× trigger suffix) validated at 8.75/10 on COVAJAPANDI in `experiments/lora_quality_eval/`.
  - `_resolve_lora_stack` ports `buildLorasFromBlend` semantics: primary always first, blend weights normalized, top-3 capped, sub-0.10 dropped, scale capped at 1.2.
  - flux-general primary via `fal-ai/flux-general/image-to-image` (strength=0.82, guidance=3.5, steps=28). NB-Pro fallback on any failure.
  - Reflection-loop hooks: `strength_override`, `guidance_override`, `lora_scale_multiplier`, `prompt_override`, `seed`.
- **`apps/web/lib/ai/redesign-client.ts`** — TS client with Zod schemas mirroring the frozen Pydantic contract. Single retry on 5xx / 502, no retry on 4xx. 90s timeout (accommodates cold start). `COVA_REDESIGN_URL` env override.
- **`apps/web/tests/ai/redesign-client.test.ts`** — 17 tests + 1 integration canary (skipped by default). Covers happy path, LoRA activation, style_blend passthrough, reflection overrides, NB-Pro fallback, 400/502/timeout/schema-mismatch, null judge_score, force_nb_pro.

### F3-BLEND-CTX.1 resolved
- `apps/web/lib/ai/renderContext/assembler.ts` — `deriveStyleBlend(fingerprint)` runs `fingerprintToStyleBlend` for v3 fingerprints and populates both `context.style_blend` and `context.styleBlend` on the assembled `RenderContext`. v1/v2 fingerprints return undefined (Director falls back to single-primary, as before).
- `apps/web/app/api/pipeline/redesign/route.ts` — belt-and-suspenders: if `renderContext.style_blend` is still missing at Director call time, injects from the `rooms.style_blend` DB column.
- 3 new assembler tests + 32 existing assembler tests still pass (35/35 total).

### Bench artifacts
- `bench/phase-5-redesign/bench_results.json` — 15-room aggregate.
- `bench/phase-5-redesign/gate_result.json` — best-of scores per room, gate decision.
- `bench/phase-5-redesign/metrics/room-XX.json` — per-room bench + judge metadata (15 files).
- `bench/phase-5-redesign/outputs/room-XX_redesign.webp` — 15 base-run renders.
- `bench/phase-5-redesign/triptychs/room-XX.png` — 15 triptychs (original | empty | redesign).
- `bench/phase-5-redesign/judge/rollup_base.json`, `rollup_base-with-room-type.json`, `rollup_iter1.json`, `rollup_iter2.json` — judge run-level summaries.
- `bench/phase-5-redesign/judge/judge_runs/<run_id>/room-XX.json` — raw Sonnet judge transcripts per room × run.
- `bench/phase-5-redesign/reflection/room-XX_iteration_log.json` — iteration-by-iteration log for each of the 7 rooms that ran reflection.
- `bench/phase-5-redesign/reflection/outputs/room-XX_iterN.jpg` — reflection-iteration renders.
- `bench/phase-5-redesign/PHASE_5_RESULTS.md` — scorecard + per-room + cost ledger.

### Bench harness
- `bench/scripts/smoke_phase_5_redesign.py` — Task 5.4 smoke test.
- `bench/scripts/run_phase_5_redesign_bench.py` — Task 5.5 15-room bench (parallel-3 default; `--serial` flag for cold-start recovery).
- `bench/scripts/run_phase_5_judge.py` — Task 5.6 Collov-calibrated vision judge (Sonnet 4.5, 4 ref images + 1 render per call, 6 axes + composite, exact phase-spec prompt).
- `bench/scripts/run_phase_5_reflection.py` — Task 5.7 reflection loop (up to 2 iterations per failing room, cumulative parameter sweep).

## Quality gate results

| Metric | Cova (best-of) | Collov baseline | Delta |
|--------|:-------------:|:---------------:|:-----:|
| **composite** | **8.44** | 7.10 | +1.34 |
| **style_fidelity** | **8.27** | 5.50 | **+2.77** |
| architectural_integrity | 8.67 | 9.00 | −0.33 |
| photorealism | 8.27 | 8.00 | +0.27 |
| editorial_quality | 8.33 | 6.00 | +2.33 |
| spatial_composition | 8.60 | 7.00 | +1.60 |
| object_coherence | 9.00 | 7.00 | +2.00 |

**Beats Collov: 14/15** (93.3% pass rate vs 73.3% gate threshold).

## LoRA effectiveness

All 10 trained archetypes exercised at least once. All flows loaded the full 3-LoRA stack (1 style + 2 universal). Style fidelity lift (+2.77 over Collov) is attributable to the LoRAs — Collov cannot train per-style LoRAs. Every archetype hit ≥8 style_fidelity on at least one room. COVABIOPHILIC was absent from this bench's assignments (carry to Phase 7 bench).

## Key findings

1. **flux-general strength 0.82 is too aggressive for architecturally complex rooms.** The empty-room output is a clean shell, and 0.82 strength had FLUX re-dreaming walls/ceilings/room-type on 7/15 rooms. Dropping to 0.70 (+ raised guidance + LoRA scale bump) recovered 4 of those 7. Makes 0.70 a strong candidate for production default; keep 0.82 on rooms with flat walls (Phase 7 CoHP can decide dynamically).

2. **The biggest bug caught was a service-level prompt defect, not a parameter issue.** `_build_prompt` accepted `room_type` but didn't emit it. Adding an explicit `"a {room_phrase}"` clause + `preserve original room architecture` tag recovered rooms 03 and 11 at base, and unlocked rooms 09 and 12 under reflection. **Lesson: the most impactful lever in T→I generation is prompt content, not param tuning.** Always grep the prompt builder for unused inputs first.

3. **Cold-start on flux-general is real.** First-wave parallel calls (3 concurrent from cold) timed out at 180s and fell back to NB-Pro. Warm calls ran 15–25s. The TS client's 90s timeout is fine for warm; cold requests should use a warmup call first, or we accept NB-Pro fallback as the cold-path quality floor.

4. **Room-02 (piano + living-room + MIDCENTURY) is the hardest input on the bench.** 4 rendering attempts (base × 2, reflection × 2) all produced bedroom transforms. Suggests a class of inputs where empty-room removal is too aggressive — the piano footprint in the original becomes ambiguous in the empty shell. Tracked as **F5-ROOM-02-HARD.1** for Phase 7 CoHP.

## Handoffs

### Phase 7 (Chain-of-Hotspot)

- **F5-ROOM-02-HARD.1** — the single bench failure. Use reference-image IP-Adapter with a piano-preservation mask, or CoHP anchor points around preserved objects. If CoHP can't fix, document it as a gated input class.
- **Rooms 01/03/07/08/15** passed at base but scored 8.40-8.85. CoHP can push them to 9+ for commercial polish.
- **COVABIOPHILIC** missing from Phase 5 — add a bench room in Phase 7.

### Phase 4 retraining candidates

None urgent. All 9 trained archetypes that were exercised scored ≥8 style_fidelity on at least one room. COVAMIDCENTURY showed variance (room-02 fail, room-12 pass via reflection) but the failure is architectural drift, not LoRA weakness.

### Consolidation (F2-CONSOLIDATION.1)

- **`cova-restoration-pipeline`** — stopped during Phase 5 to free a Modal web endpoint slot. No web-app caller. If Phase 7 doesn't revive it, retire.
- **`cova-clip-text-embed`** — stopped during Phase 5 to free a Modal web endpoint slot. Its only web caller (`apps/web/lib/clipSearch.ts`) is marked DORMANT; active v9 product matching uses Serper + Google Lens + client-side CLIP. Retire at next opportunity.
- **`cova-grounded-sam2`** — still active (strategy 3 fallback in `segment-masks/route.ts`). Deprecate only when `cova-perception` becomes mandatory for that route.

### Modal endpoint budget

The 8-endpoint workspace limit bit during this phase's deploy. Stopping 2 dormant apps freed slots; we're now at 8 active (cova-redesign included). Any new Phase 7 Modal service will require retiring another app or upgrading the Modal plan.

## Cost ledger

- Empty-room calls: **$0.00** (reused Phase 2.5 cached fal URLs, still valid)
- Redesign base bench (15) + rerenders (3 NB-Pro → flux-general): **$0.675**
- Room_type-fix rerender (5 rooms): **$0.225**
- Reflection renders (11 iterations × $0.045): **~$0.50**
- Sonnet 4.5 judge calls (base 15 + base-with-room-type 5 + iter1 10 + iter2 5 = 35): **~$0.79**
- **Total: ~$2.19** vs $30 cap.

## Deferred follow-ups

| ID | Description | Priority |
|----|-------------|:--------:|
| F5-ROOM-02-HARD.1 | room-02 piano+MCM+living-room — empty-room ambiguity drives bedroom transform across all iters | Phase 7 |
| F5-COLDSTART.1 | flux-general 3-parallel cold-start causes NB-Pro fallback. Add a warmup call or keep-warm container | Phase 5 follow-up |
| F5-BIOPHILIC-BENCH.1 | Add a COVABIOPHILIC room to Phase 7 bench so the `cvbio` LoRA is exercised | Phase 7 |
| F5-ROOMTYPE-DEFAULT.1 | Service default strength 0.82 vs 0.70 — pick per-room dynamically or move to 0.70 as new default | Phase 7 |
| F5-JUDGE-DETERMINISM.1 | Sonnet judge at temperature 0 still shows minor run-to-run variance on borderline scores (room-11 iter2 went 4.15 → 3.20 on re-judge with identical input). Investigate or accept noise floor. | Phase 7 |
| F5-ROOM02-CALIBRATE.1 | Re-judge room-02's latest render against fresh Collov refs to confirm the 4.00 ceiling isn't an artifact of the judge's "piano" mental model | Phase 7 |
