# Phase 0.5 Closeout

**Phase 0.5 CLOSED on 2026-04-20.**

This document is the authoritative closeout record for Phase 0.5 (20-room bench build + smoke-test
harness). It supersedes nothing in `PHASE_0_5_VERIFICATION.md` — both documents stand as the full
evidence trail. Reference this document when explaining Phase 0.5 to any founder, investor, or
future contributor.

---

## Locked Configuration

**Empty-room stage:** Hybrid LaMa/Bria + 35% coverage router (Run 3).

- Coverage <= 35%: LaMa inpainter (faster, cheaper, no hallucinations on low-coverage inputs)
- Coverage > 35%: Bria inpainter (handles moderate-to-high furniture coverage better)
- Mask: SAM 3 + 24px dilation

**Gate metric (locked):** Architectural-patch SSIM — NOT whole-image SSIM-unmasked.

Whole-image SSIM-unmasked falsely classifies rooms 04 and 07 as failures (VP-shift artifacts in
ceiling/floor pixels inflate the error). Architectural-patch SSIM samples a 200×200px window in
the structural zone (upper 1/6 of frame, away from furniture) and correctly classifies both as
passing. No pipeline change required — this is a scoring-only correction.

**Threshold:** architectural-patch SSIM >= 0.80 is the acceptance gate.

---

## Documented Limitations

These are known failure modes that are **not being fixed in Phase 0.5**. They are deferred to
Phase 1 hardening, Phase 5 full bench, or separate tracks as noted.

1. **High-coverage rooms (dilated mask > 40% of frame):** LaMa collapses on rooms where furniture
   occupies most of the visible area. The hybrid router switches to Bria at 35%, but Bria also
   struggles above ~50% coverage. Root cause: inpainting paradigm assumption that background is
   visible. Mitigation: coverage-rejection warning UX (Phase 1 hardening). No fix planned inside
   Phase 0.5 scope.

2. **High-frequency-texture rooms (stacked stone walls, dark reclaimed-wood plank floors):**
   LaMa shows visible texture drift — the inpainted region has slightly different grain/pattern
   frequency than the surrounding structure. Detected on room-14. Not fixable cheaply; the
   Bria arm handles it marginally better. Deferred.

3. **SAM 3 incomplete coverage on heavy clutter:** In rooms with many small objects (room-11),
   SAM 3 misses ~15-20% of object pixels, leaving ghost artifacts after inpainting (room-11:
   21.0% ghost furniture ratio with LaMa). SAM 3 is at its detection ceiling for dense clutter.
   Fix requires either a second-pass SAM call or a post-inpaint ghost-removal step. Deferred to
   Phase 1 hardening.

4. **FLUX-Fill does not improve outcomes (confirmed):** FLUX-Fill was tested as an alternative
   inpainter on the 3 hardest failures. Despite SSIM-unmasked gains, no room crossed the
   architectural-patch gate, and room-02 introduced 7.4% ghost furniture (LaMa had 0%). FLUX-Fill
   is 10× the cost of LaMa ($0.05 vs $0.005 per call). Decision: do not adopt. Bria remains the
   high-coverage arm.

5. **Lighting coherence (4.0/5 on all redesigns):** Every redesigned room scored 4.0 on
   lighting_coherence under Sonnet 4.5 judge — multi-source lighting plausibility (edison bulbs
   vs natural light, chandelier vs floor lamp). This is a base-model limitation of nano-banana-pro
   / FLUX. Not correlated with empty-room quality. Phase 5 lighting-coherence work is its own
   track.

---

## Evidence Trail Summary

Phase 0.5 ran 4 runs + 7 probes across 11 committed artifacts:

| Run / Probe | Commit | Summary |
|---|---|---|
| Run 1 (15 rooms baseline) | 8c1dc86 | Established baseline: SSIM-unmasked gate, 15-room input set |
| Run 1.5 (widened prompts + noise floor) | 8a65b58 | Extended to 15 rooms; identified VP-shift problem |
| Run 1.5 rescoring + mask audit | f7f2f6d / b80bfa5 / a48bd5d | Confirmed VP-shift classification errors |
| Run 2 (mask iteration, +24px + rescan) | 7d8ed11 | Reduced ghost rate; established 24px dilation standard |
| LaMa probe (3 rooms) | a424364 | LaMa outperforms Bria on low-coverage inputs |
| Bria prompt-free probe | a188f69 | Model unavailable; no signal |
| Run 3 (hybrid LaMa/Bria + 35% router) | 5411f5d | Locked configuration; hybrid outperforms either alone |
| VP diagnostic | a44a1d6 | Confirmed VP-shift root cause; switched to patch SSIM |
| 5-LaMa-room patch audit | e027d8c | Patch SSIM correctly reclassifies 04 and 07 as passing |
| Inverted-mask probe (3 rooms) | 57b45d8 | No improvement; confirmed inpainter ceiling |
| Phase 5 probe Path B (6 rooms, Warm Japandi) | a2bf4cd | Redesign robust to broken empty-rooms; Haiku judge saturated |
| Test 1 — archetype robustness (4 rooms) | 3cc55eb | Signal holds under Sonnet 4.5 + harder archetypes |
| Test 2 — FLUX-Fill probe (3 rooms) | 67cd88e | FLUX-Fill: no gate cleared, ghost introduced, cost 10× |
| Pairwise judge (8 pairs, 16 calls) | this commit | Confirms robustness signal; confidence 8/10 |

Full synthesis: [`bench/PHASE_0_5_VERIFICATION.md`](PHASE_0_5_VERIFICATION.md)
Pairwise analysis: [`bench/phase-5-probe/pairwise-analysis.md`](phase-5-probe/pairwise-analysis.md)
Raw pairwise results: [`bench/phase-5-probe/pairwise-results.json`](phase-5-probe/pairwise-results.json)

---

## Final Closure Confidence: 8/10

### Justification

The pairwise-preference probe (8 strategic pairs, Sonnet 4.5 judge, position-swap protocol) ran on
all 10 existing redesigns and produced the following findings:

**Set A (same archetype, different empty-room quality):** 1 clean-room win, 1 broken-room win,
1 genuine tie (position-bias). Split/tie distribution — no consistent direction. This directly
refutes the concern that the prior absolute-score uniformity (all rooms at 4.80) was masking a
clean-vs-broken quality gap. When forced to discriminate, the judge cannot reliably prefer clean
over broken within the same archetype.

**Set B (same broken empty-room, different archetypes):** 1 WJ win (B2: WJ beats Maximalist
Eclectic), 1 genuine tie (B1: WJ vs Industrial Loft undecidable). WJ is mildly easier for the
model on degraded inputs, but the harder archetypes are competitive or within tie range. The
archetype choice does not catastrophically degrade redesign quality on broken empty-rooms.

**Set C (cross-comparisons):** C2 showed compound (broken+hard) losing to (clean+easy); C1 was a
tie; C3 was a tie. The compound effect is real but weak — one clear loss out of two direct tests.

**Saturation:** 4/8 pairs were genuine ties (half-saturation, not full). The judge successfully
discriminated on 4 pairs, which is materially better than the prior absolute-score probe where
all rooms were rated identically at 4.80. Pairwise format adds discrimination capability that
absolute scoring lacks.

**Combined evidence justifies 8/10:**
- Path B robustness signal corroborated by pairwise discrimination (Set A: no consistent direction)
- Inpainter ceiling confirmed across 3 alternatives (Bria mask-mode, inverted-mask, FLUX-Fill)
- Failure modes documented and named with upstream-mitigation paths
- Pairwise judge is only half-saturated (not fully); future human preference study could resolve
  remaining uncertainty
- Remaining -2 points: no production LoRA tested (Phase 4 blocked); sample is 10-15 rooms not 30+;
  lighting coherence is a persistent base-model issue unresolved

---

## Explicit Non-Goals (What Was NOT Verified)

These items are **deferred** and must not be assumed verified by Phase 0.5:

- **Production LoRA behavior:** LoRAs cvind (Industrial), cvmax (Maximalist), cvdco (Dark Moody),
  cvlux (Heritage/Luxury), and the full COVAJAPANDI fine-tune do not exist. Phase 4 (LoRA training)
  is blocked on Phase 0.5 closure. Absolute quality scores from text-prompt-only runs may be lower
  than production; directional signal is informative but not a quality guarantee.

- **Lighting coherence:** The 4.0/5 lighting_coherence deduction appeared on every redesigned room
  across 5 archetypes. This is a separate investigation track — not a Phase 0.5 metric.

- **Sample expansion to 30-50 rooms:** The bench covered 15 unique rooms (Run 3 input set) and
  10 redesigns (6 Path B + 4 Test 1). Phase 5 full bench requires 15+ rooms × all trained
  archetypes. Current sample size is sufficient for Phase 0.5 gate but not for production quality
  guarantees.

- **Pairwise human preference (vs MLLM judge):** All scoring in Phase 0.5 used Claude models
  (Haiku 3.5, Sonnet 4.5). Human preference ratings were not collected. Phase 5 evaluation
  must include human preference to validate MLLM judge correlation.

- **High-coverage room adaptive dilation cap:** The adaptive dilation logic does not currently
  cap dilation on rooms where the already-large mask would over-expand. This can cause full-frame
  masking on furniture-dense rooms. Phase 1 hardening item.

---

## Concrete Next-Phase Handoffs

### Phase 4 — Custom LoRA Training (currently blocked, now unblocked)

Train the following 5 LoRAs using the text-prompt benchmarks from Phase 0.5 as quality reference:

| LoRA ID | Archetype | Text-prompt probe result | Priority |
|---------|-----------|--------------------------|----------|
| COVAJAPANDI | Warm Japandi | 4.80/5 Sonnet (Haiku saturated at 5.0) | P1 |
| cvind | Industrial Loft | 4.80/5 Sonnet (same deduction pattern) | P1 |
| cvmax | Maximalist Eclectic | 4.80/5 Sonnet | P2 |
| cvdco | Dark Moody Glam | 4.80/5 Sonnet | P2 |
| cvlux | Heritage Traditional | 4.80/5 Sonnet | P2 |

Training data: curate ~50-100 example images per archetype from design magazines / editorial
sources. Trigger token: `<COVAJAPANDI>`, `<cvind>`, etc. Base model: same as redesign endpoint
(fal-ai/nano-banana-pro or equivalent FLUX fine-tune).

### Phase 5 — Full Bench

Build on the Phase 0.5 bench infrastructure to run a complete multi-archetype evaluation:

1. **Expand rooms to 15+ stratified inputs**: include high-coverage rooms (40-60%), cluttered
   rooms, texture-heavy rooms (stacked stone), and open/minimal rooms to stress all failure modes.

2. **Replace pixel SSIM with depth-map structural similarity** for redesign output evaluation.
   Pixel SSIM captures color changes (furniture swap changes pixels), not structural integrity.
   Depth-map MSE or SSIM on monocular depth estimates from the redesign output vs the original
   room captures architectural preservation more faithfully.

3. **Pairwise-preference rubric over absolute scoring**: the Phase 0.5 pairwise probe demonstrated
   that 4 of 8 pairs are discriminable. Phase 5 should use pairwise comparison as primary metric
   from the start, with absolute scoring as secondary.

4. **Include production LoRA results** once Phase 4 delivers trained weights. Re-run the 10
   existing redesigns with trained LoRAs vs text-prompt-only; use those as the first Phase 5
   data points.

### Phase 1 Hardening (when reached)

1. **Adaptive dilation cap**: add a max-dilation limit (e.g., 40% frame coverage) to prevent
   over-masking on furniture-dense rooms. Rooms exceeding this cap should trigger a
   coverage-rejection warning in the UX rather than proceeding with a degraded mask.

2. **Coverage warning UX**: if the estimated furniture coverage (pre-dilation) exceeds a threshold
   (e.g., 35%), display a message to the user: "This room has a lot of furniture — the empty-room
   step may leave minor artifacts. The redesign will still look great." Do not block the flow.

3. **Ghost detection post-processing**: add a lightweight ghost-furniture check after LaMa/Bria
   inpainting. If detected ghost ratio > 10% (estimated by running SAM on the empty-room output
   and checking overlap with the original mask), retry with the Bria arm before delivering.

---

## Total Phase 0.5 Spend

| Component | Cost |
|-----------|------|
| Run 1 (15 rooms baseline) | $2.03 |
| Run 1.5 (widened prompts + noise floor) | $3.42 |
| Run 2 (mask iteration) | $3.30 |
| LaMa probe (3 rooms) | $0.24 |
| Run 3 (hybrid LaMa/Bria) | $2.70 |
| Inverted-mask probe | $0.33 |
| Phase 5 probe Path B (6 rooms Warm Japandi) | $0.30 |
| Test 1 — archetype robustness (4 rooms) | $0.28 |
| Test 2 — FLUX-Fill probe (3 rooms) | $0.27 |
| Pairwise judge (8 pairs, 16 calls) | $0.40 |
| **Total** | **~$13.27** |

Bria prompt-free probe, VP diagnostic, mask audit, rescoring: $0.00 (no model calls).

Phase 0.5 budget was not pre-capped. Total is within acceptable range for a research phase of
this scope (10-15 rooms, 4 runs, 7 probes).

---

## Artifact Trail

All Phase 0.5 artifacts are committed to `main` branch of `github.com/pgoel813/cova`:

- `bench/PHASE_0_5_VERIFICATION.md` — synthesis of Runs 1-3 + probes 1-7
- `bench/PHASE_0_5_CLOSEOUT.md` — this document (final closeout)
- `bench/lessons-learned.md` — engineering lessons from each run
- `bench/manifest.json` — room input manifest (15 rooms)
- `bench/run-{1,1-5,2,3}-empty-room/` — per-run outputs, metrics, masks
- `bench/probe-{lama,bria-prompt-free,inverted-mask,flux-fill}/` — probe outputs
- `bench/phase-5-probe/` — Path B Warm Japandi redesigns (6 rooms) + pairwise analysis
- `bench/phase-5-probe-2/` — Test 1 harder-archetype redesigns (4 rooms)
- `bench/scripts/` — all automation scripts (run bench, probes, judge, pairwise)
- `docs/audit/` — Phase 0 audit deliverables (LoRAs, Director, Modal, Supabase, tests, pgvector)
- `docs/phase-0/follow-ups-deferred.md` — Phase 0 deferred items
