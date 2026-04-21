# Phase 3 — Deferred Follow-ups

Phase 3 shipped schema migration + blending logic + 5 forbidden-name hygiene
layers on 2026-04-20. Items below were intentionally deferred or surfaced
during implementation.

---

## F3-RBF.1 — softmaxStyleMatch → RBF kernel replacement

**Inherits from:** Phase 0 F3.1 (see `docs/phase-0/follow-ups-deferred.md`).

**Status:** Deferred again. Phase 3's LoRA migration consumes the
already-archetype-weighted distribution produced by
`fingerprintToStyleBlend` in `apps/web/lib/quiz/style-archetypes.ts`
(softmax with T=0.35, drop-<0.10, renormalize). This distribution is
mathematically sound for its current use — the structural issues flagged in
`tests/director-audit/6d-math.results.json` apply to `softmaxStyleMatch` in
`apps/web/lib/ai/style-match.ts:182`, which is a **different function** used
only by the fingerprint API route for quiz display-style picking, not by the
Director's blend path.

**Consequence:** The LoRA migration does not require RBF. RBF replacement
remains a standalone improvement for quiz display-style picking when the
Phase 5 render bench surfaces evidence that softmax argmax behavior on
borderline fingerprints caps quality.

**Trigger to revisit:** Phase 5 bench data showing user-perceivable quality
cliffs at softmax boundary regions.

**Reference:** Design doc §9.

---

## F3-NAMING.1 — Research-doc vs implementation trigger-name mismatch

**Surfaced:** 2026-04-20 during Task 3.4 test authoring.

**Problem:** The Phase 3 prompt §3.4 lists the canonical 9 archetype
triggers as `cvwmn, cvjpd, cvind, cvmax, cvdco, cvlux, cvboh, cvscn, cvmcm`.
The actual Cova implementation registry at
`apps/web/lib/styles/lora-registry.ts:94` (`COVA_TO_DNA_TRIGGER`) uses a
different set: `cvwmn, cvscn, cvbio, cvmcm, cvcst, cvboh, cvind, cvfrm, cvdco`.

Key discrepancies:
- **Japandi:** research says `cvjpd`, implementation uses `cvwmn` (Warm &
  Grounded). Phase 3 implementation honored the Cova registry.
- `cvbio` (Biophilic) — exists in implementation, missing from research list.
- `cvcst` (Coastal) — exists in implementation, missing from research list.
- `cvfrm` (Farmhouse) — exists in implementation, missing from research list.
- `cvmax` (Maximalist) — exists in `STYLE_DNA_BLOCKS` but NOT in
  `COVA_TO_DNA_TRIGGER`; accessible only via `STYLE_ANCHOR_TO_TRIGGER`
  direct lookup from "Bold & Eclectic" display anchor.
- `cvlux` (Luxury) — same as cvmax; only in DNA blocks + display-anchor map.

**Consequence:** Phase 3 tests (`apps/web/tests/ai/lora-weighted-blending.test.ts`)
cover the 9 canonical implementation triggers. The research doc naming
should be reconciled before Phase 4 LoRA training begins — Phase 4 needs
trigger names that match the archetype→trigger mapping the Director emits.

**Trigger to revisit:** Phase 4 kickoff. Decision required: does Phase 4
train the 9 archetypes as currently mapped (cvwmn, cvscn, cvbio, cvmcm,
cvcst, cvboh, cvind, cvfrm, cvdco) or does the research spec drive a
rename and retrain?

---

## F3-BLEND-CTX.1 — context.style_blend wiring

**Surfaced:** 2026-04-20 during Task 3.3 implementation.

**Problem:** Phase 3 Director reads `context.style_blend` when present. No
upstream code path in `apps/web/app/api/pipeline/*` or
`apps/web/app/api/render/*` currently populates `style_blend` on
`RenderContext`. Users arriving at step-7d/render today will hit the
fallback branch (`{[loraTrigger]: 1.0}`) and emit single-LoRA briefs.

**Consequence:** Phase 3 blending logic is provisioned and tested, but
end-to-end blended renders require upstream wiring to plumb step-3b's
`style_blend` from `users.style_blend` into the pipeline's `RenderContext`.

**Trigger to revisit:** Phase 5 kickoff — render service is the natural
integration point. Add `context.style_blend = await supabase.from('users')
.select('style_blend')` in the render orchestrator.

---

## F3-CVMIN-COLLISION.1 — COVAMINIMAL and COVASCANDINAV both resolve to cvscn

**Surfaced:** 2026-04-20 during registry audit.

**Problem:** `COVA_TO_DNA_TRIGGER` maps both `COVAMINIMAL` and `COVASCANDINAV`
to `cvscn`. When a user's fingerprint surfaces both archetypes, Phase 3's
`buildLorasFromBlend` merges their weights by addition (tested in
`lora-weighted-blending.test.ts`). This is deliberate — single LoRA, one
combined weight — but it hides archetype identity from downstream quality
reporting. Same applies to the two DNA blocks keyed `cvscn` in
`STYLE_DNA_BLOCKS` colliding on semantic content.

**Trigger to revisit:** When training the 10th LoRA (`cvmin`? `cvpur`?) to
differentiate Pure Minimal from Nordic, at which point `COVA_TO_DNA_TRIGGER`
needs a new unique cv-trigger for `COVAMINIMAL`.

---

## F3-PARITY.1 — Python Director parity (inherited)

**Status:** Still deferred from Phase 0 F1.1. Phase 3 did NOT touch
`modal_pipeline/generation.py`. If Phase 5 bench shows materially different
behavior between the TS Director (with new loras blending) and the Python
Director (single-string style), resolve via one of the three options in
`docs/phase-0/follow-ups-deferred.md` § F1.1.

**Trigger to revisit:** Phase 5 bench.
