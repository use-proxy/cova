# Collov Benchmark Audit v2

**Date:** 2026-04-26
**Scope:** Read-only audit of the evidence behind the "14/15 rooms beat Collov" claim
**Auditor:** Claude Code (automated)

---

## A. Test Set Composition

The benchmark set is **committed and hardcoded** in
`bench/scripts/run_phase_5_redesign_bench.py:57-73` as `BENCH_ASSIGNMENTS`
and `ROOM_TYPES` (lines 78-94).

15 rooms. Input photos stored as local `.webp` files in `bench/rooms/`.

| Room | Filename | Room type | Archetype | Style blend |
|------|----------|-----------|-----------|-------------|
| room-01 | `room-01_bedroom-cat-popcorn.webp` | bedroom | COVAJAPANDI | single-archetype (no blend) |
| room-02 | `room-02_livingroom-piano-joydivision.webp` | living_room | COVAMIDCENTURY | single-archetype |
| room-03 | `room-03_livingroom-leather-herringbone.webp` | living_room | COVACOASTAL | single-archetype |
| room-04 | `room-04_attic-music-sloped.webp` | bedroom | COVABOHEMIAN | single-archetype |
| room-05 | `room-05_office-gallery-rug.webp` | home_office | COVAFARMHOUSE | single-archetype |
| room-06 | `room-06_empty-bay-window.webp` | living_room | COVAMINIMAL | single-archetype |
| room-07 | `room-07_bedroom-desk-carpet.webp` | bedroom | COVAJAPANDI | single-archetype |
| room-08 | `room-08_livingroom-papasan-floral.webp` | living_room | COVABOHEMIAN | single-archetype |
| room-09 | `room-09_gaming-led-popcorn.webp` | bedroom | COVAINDUSTRIAL | single-archetype |
| room-10 | `room-10_tv-fireplace-dark.webp` | living_room | COVAARTDECO | single-archetype |
| room-11 | `room-11_green-velvet-gallery.webp` | living_room | COVASCANDINAV | single-archetype |
| room-12 | `room-12_bedroom-piano-led.webp` | bedroom | COVAMIDCENTURY | single-archetype |
| room-13 | `room-13_exposed-brick-arched.webp` | living_room | COVAINDUSTRIAL | single-archetype |
| room-14 | `room-14_stacked-stone-empty.webp` | living_room | COVAARTDECO | single-archetype |
| room-15 | `room-15_wood-paneling-twin-beds.webp` | bedroom | COVAFARMHOUSE | single-archetype |

**user_id:** None. These are local bench photos, not Supabase `rooms` rows.
No `original_image_url`, no `created_at`, no `style_fingerprint` column.
They are not real user-uploaded rooms.

**style_blend:** Not used. Every room was assigned a **single archetype** with
weight 1.0. The `style_blend` weighted-LoRA path (the core Phase 3
innovation) was **never exercised** in this benchmark.

---

## B. Collov Comparison Artifacts

### Collov reference images

4 PNG files exist at `benchmarks/competitors/collovai/collov_{1..4}.png`.
These are the **only** Collov outputs stored in the repo.

**Critical finding:** These 4 PNGs are used as **generic calibration
anchors**, not as room-matched comparisons. The judge sees the same 4
Collov images for every single room it scores. There is **no per-room
Collov output** — i.e., Collov was never run on room-01, room-02, ...,
room-15 individually to produce paired comparison renders.

### Cova render being judged

For each room, the judge scores the `bench/phase-5-redesign/outputs/room-XX_redesign.webp`
file (base run) or `bench/phase-5-redesign/reflection/outputs/room-XX_iterN.jpg`
(reflection iterations). These are the actual flux-general outputs.

### "Beats Collov" verdict producer

The verdict is produced by `claude-sonnet-4-5` (vision) via
`bench/scripts/run_phase_5_judge.py`. The judge prompt (lines 172-249)
explicitly tells the model:

> "The Collov renders score approximately 7.1/10 overall."

and

> "Compare explicitly to the Collov references when assigning scores.
> If a Cova render looks the same as a Collov render, score it similarly
> (around 7.1 composite)."

The 7.1 baseline is **stated in the prompt as a fact**, not derived from
a calibration run where the judge scored the Collov PNGs themselves.

### Date of comparison

All judge runs: 2026-04-21 (single day).

---

## C. Scoring Methodology

### Rubric

A structured 6-axis rubric exists in `run_phase_5_judge.py:172-249`.
It is thorough and well-defined.

**Axes (with weights):**

| Axis | Weight | Collov baseline (prompt-stated) |
|------|:------:|:-------------------------------:|
| architectural_integrity | 0.25 | 9.00 |
| photorealism | 0.20 | 8.00 |
| style_fidelity | 0.25 | 5.50 |
| editorial_quality | 0.15 | 6.00 |
| spatial_composition | 0.10 | 7.00 |
| object_coherence | 0.05 | 7.00 |

**Composite formula:** `arch*0.25 + photo*0.20 + style*0.25 + edit*0.15 + spatial*0.10 + coherence*0.05`

**"Beats Collov" threshold:** `composite >= 7.5 AND style_fidelity >= 7.0`

### Where are the Collov per-axis baselines from?

The prompt states Collov scores "~9 on architectural_integrity" and
"~5.5 on style_fidelity" etc. These numbers are described as coming
from "the calibration done in the phase-5 plan" (line 8 of the judge
script). **No calibration run artifact exists in the repo.** The
baselines appear to be human eyeball estimates, not model-scored.

### Per-room scores stored at

- `bench/phase-5-redesign/metrics/room-XX.json` (merged `judge_details`)
- `bench/phase-5-redesign/judge/judge_runs/<run_id>/room-XX.json` (raw transcripts)
- `bench/phase-5-redesign/gate_result.json` (rollup)

---

## D. The Failing Room

**1 room fails: room-02.**

| Field | Value |
|-------|-------|
| room_id | room-02 |
| room_type | living_room |
| archetype | COVAMIDCENTURY |
| input | `room-02_livingroom-piano-joydivision.webp` |
| base composite | 3.50 (rollup) → 5.75 (base judge raw) |
| best composite (iter1) | 4.00 |
| best style_fidelity | 3 |
| failure mode | Complete room-type transformation (living room → bedroom) |

The judge's transcript is unambiguous: "original living room with piano
completely replaced with bedroom architecture." This is not a borderline
call — the render is architecturally broken.

**Is room-02 representative?** Living rooms are 8 of the 15 bench rooms.
The failure is not an edge-case room type. However, the *piano* is an
unusual architectural element. The failure hypothesis (piano footprint
in empty-room shell → ambiguous geometry → bedroom hallucination) is
plausible and specific.

**Note:** The gate_result.json shows `base_composite: 3.5` for room-02,
but the raw base judge JSON shows `composite: 5.75`. This discrepancy
suggests the gate_result was computed from a *different* base run (before
the room_type service fix, which re-rendered rooms 02/03/09/11/12). The
gate file's `base_composite` values for those 5 rooms are from the
pre-fix run; the `best_composite` values incorporate reflection.

---

## E. Benchmark Hygiene Check

### FLAG 1: No actual Collov A/B comparison exists

The 4 Collov reference PNGs are **generic interior renders**, not
redesigns of the same 15 input rooms. The judge never sees "what Collov
would produce for room-01" vs "what Cova produced for room-01." Instead,
it sees 4 fixed Collov images as calibration context and is told to
anchor its scoring around them.

This is a **calibration-by-instruction** methodology, not a **paired
comparison**. The judge is essentially being told "Collov is a 7.1" and
asked "is this Cova render better than 7.1?" The Collov images serve as
visual anchors, but the score comparison is to an **asserted baseline**,
not a measured one.

**Severity: HIGH.** The "14/15 beat Collov" claim is really "14/15
scored above a threshold that a human estimated Collov would score."

### FLAG 2: The Collov baseline was baked into the judge prompt, not derived

The 7.1 composite and per-axis breakdowns (arch=9, photo=8, style=5.5,
edit=6, spatial=7, coherence=7) are hardcoded in the prompt. No
calibration run exists where the judge scored the Collov PNGs against
themselves. The weighted composite of the stated values is:
`9*0.25 + 8*0.20 + 5.5*0.25 + 6*0.15 + 7*0.10 + 7*0.05 = 7.175`,
which rounds to ~7.1. So the numbers are at least internally consistent.
But they were never validated by the judge model itself.

**Severity: MEDIUM.** The anchor could be systematically off in either
direction.

### FLAG 3: Claude Sonnet is both the design director and the judge

The design director (`apps/web/lib/ai/design-director.ts`) uses Claude
Sonnet to produce the `DesignBrief`. The judge (`run_phase_5_judge.py`)
uses `claude-sonnet-4-5` to score the render. While these are different
capabilities (text generation vs vision evaluation), the same model
family is making the creative choices and evaluating the output.

**Severity: MEDIUM.** This is the "judge-is-defendant" pattern. The
model may rate its own stylistic choices more favorably than a human
would. However, the actual pixel generation is by FLUX (not Claude),
which partially mitigates this.

### FLAG 4: Style blends were never tested

Phase 3's core innovation — weighted multi-LoRA blending from
`style_blend` — was not exercised. Every bench room used a single
archetype at weight 1.0. Real users will have blended style
fingerprints (e.g., 0.6 Japandi + 0.3 Scandinavian + 0.1 Minimal).
The benchmark proves single-archetype rendering works. It does not
prove the production blend path works.

**Severity: HIGH** for production confidence. The renders users will
actually receive may look quite different from what was benchmarked.

### FLAG 5: COVABIOPHILIC not exercised

1 of the 10 trained archetypes (COVABIOPHILIC / `cvbio`) has zero
bench coverage. Acknowledged in PHASE_5_RESULTS.md and deferred to
Phase 7.

**Severity: LOW.** Known and tracked.

### FLAG 6: Small sample per archetype

9 archetypes have 1-2 rooms each. With n=1 or n=2 per archetype,
a single lucky/unlucky seed can swing the pass rate. The bench proves
the system *can* produce good renders for each archetype, not that
it *reliably* does.

**Severity: MEDIUM.** Standard for an internal quality gate, but not
sufficient for a production quality claim.

### FLAG 7: No original-room-photo comparison in the judge call

The judge sees 4 Collov PNGs + 1 Cova render + the rubric prompt.
It does NOT see the **original room photo**. The architectural
integrity axis ("Does the render preserve the original room's
architecture?") is scored without the judge having visual access to
what the original architecture was. It must infer architectural
quality from the render alone.

Wait — let me re-check. The `score_room` function (line 308) resolves
`original_path = next(ROOMS_DIR.glob(f"{room_id}*"))` and uses it
only for `describe_room(original_path.name)` which extracts a text
description. The original photo is **not sent to the judge as an image**.

**Severity: HIGH.** The most important axis (arch integrity, weight
0.25) is scored without visual reference to the original room. The
judge can only evaluate whether the render *looks like* a coherent
room, not whether it preserves *the specific* room's architecture.
This explains the inflated arch scores (mean 8.67) — the judge is
essentially scoring "does this look like a real room" rather than
"does this match the input room."

### FLAG 8: Reflection loop allows best-of-N cherry-picking

The final "14/15" count uses best-of-iteration scores. 5 rooms
failed at base; 4 recovered after 1-2 reflection iterations with
modified parameters (lower strength, higher guidance, LoRA scale
bump). The reflection loop is a legitimate production feature (it
would run at render time). However, the scoring methodology is
best-of-3-attempts, which inflates the pass rate relative to what
a first-attempt user experience would be.

**First-attempt (base-run only) pass rate:** The base rollup shows
`n_beats_collov: 8` out of 15 = **53%**. After the room_type service
fix (a code change, not a reflection param change), the
base-with-room-type rollup shows `n_beats_collov: 2` out of 5
re-judged rooms. The final base pass rate after the service fix is
approximately **10/15 = 67%** (8 from original base + 2 from
room-type-fix base).

The jump from 67% (base) to 93% (best-of-iteration) is entirely
from the reflection loop.

**Severity: MEDIUM** if reflection ships as a production feature.
**HIGH** if reflection is bench-only and production serves the
base render.

### FLAG 9: Judge determinism issue is known but unresolved

`docs/phase-5/CLOSEOUT.md` acknowledges (F5-JUDGE-DETERMINISM.1):
"Sonnet judge at temperature 0 still shows minor run-to-run variance
on borderline scores (room-11 iter2 went 4.15 → 3.20 on re-judge
with identical input)." A ~1-point swing on a 10-point scale with
a 7.5 threshold means borderline rooms could flip pass/fail between
runs.

**Severity: LOW** for the 14/15 claim (most passes are 8.4+, well
above the 7.5 threshold). **MEDIUM** for the specific rooms near the
boundary.

### FLAG 10: Collov outputs may be stale

The 4 Collov PNGs have no date metadata in the repo. Collov AI has
been actively improving. If the PNGs are from 2025 or early 2026,
Collov's current output may be better than the calibration anchors.

**Severity: UNKNOWN.** Cannot determine without knowing the age of
the Collov reference images.

---

## F. Verdict

### BENCHMARK DOES NOT EXIST IN A REPRODUCIBLE FORM

Specifically:

1. **No paired comparison.** The claim "14/15 rooms beat Collov" is
   really "14/15 rooms scored above a human-estimated threshold
   baked into the judge prompt." Collov was never run on these 15
   rooms. There is no Collov output to compare against.

2. **Architectural integrity is scored blind.** The judge never sees
   the original room photo. The highest-weighted axis (0.25) is
   evaluated without visual reference, making it a "does this look
   like a room" check rather than a "does this match the input room"
   check.

3. **Production rendering path not tested.** Style blends (the core
   Phase 3 feature) were never exercised. All 15 rooms used single-
   archetype weight=1.0 assignments.

4. **Base pass rate is 67%, not 93%.** The 14/15 number includes
   reflection-loop best-of-N cherry-picking. The first-attempt pass
   rate (which is what a user would experience unless reflection
   ships as a synchronous production feature) is roughly 10/15.

**The 14/15 number is not defensible as a production quality claim.**
It is defensible as an internal signal that the pipeline *can* produce
renders above the estimated Collov threshold under favorable conditions
(single archetype, best-of-3 attempts, no original-room visual
comparison).

### What would make the benchmark rigorous

1. **Run Collov on the same 15 input rooms.** Store the outputs. Score
   them with the same judge. Compare per-room, not against an asserted
   baseline.

2. **Send the original room photo to the judge.** Add it as a 6th
   image in the vision call so architectural integrity is scored
   against the actual input, not inferred.

3. **Test style blends.** Create bench rooms with blended
   `style_blend` assignments (e.g., 0.6/0.3/0.1) to exercise the
   production rendering path.

4. **Report base-run and best-of separately.** The headline number
   should be the first-attempt pass rate. Reflection recovery is a
   separate, useful metric.

5. **Calibrate the Collov baseline empirically.** Run the judge on
   the Collov PNGs (with a neutral room description) and see what
   scores it actually assigns. If the model scores Collov at 8.2
   instead of 7.1, the entire threshold shifts.

### Implication for next priority

Section F of `pipeline_audit_v2.md` (product matching via Serper)
is acting on the assumption that render quality is solved. **It is
not solved — it is promising but inadequately validated.** Before
investing in commerce plumbing, either:

- (a) Build the rigorous benchmark described above and confirm the
  quality claim, then proceed to Section F, OR
- (b) Acknowledge the quality gap is partially faith-based and proceed
  to Section F anyway, accepting the risk that renders may need
  rework post-launch.

Option (b) is defensible if the team believes render quality is "good
enough for beta" and wants to validate the full user flow end-to-end.
Option (a) is the safe path if renders are the core differentiator
and Collov-beating quality is a hard launch requirement.
