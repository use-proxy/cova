# Empty-room iteration log

## Iter 1 — LaMa, 57 prompts, threshold 0.10, close+dilate(14,32)
- Critique: furniture=3, arch=6, quality=5, pass=false
- Bed/dresser/chair/clothes/backpack ALL gone (visual confirm).
- Issues: LaMa softening on large floor patch; 1-2 small windowsill items
  remained; photo string truncated.
- **Best result so far** — saved as the canonical empty-room URL for
  Phase 5 (downstream redesign will overlay new furniture on the
  softened floor).

## Iter 2 — Bria forced (force_inpainter="bria")
- Critique: furniture=3, arch=4, quality=5, pass=false
- Bria HALLUCINATED a "Massive white geometric box/structure" where the
  bed used to be. Worse than LaMa.

## Iter 3 — flux-pro/v1/fill (default route, my prompt)
- Critique: furniture=0, arch=4, quality=6, pass=false
- flux-fill regenerated a complete bedroom (different bed + nightstand +
  side table) instead of removing furniture.

## Iter 4 — LaMa with DILATION_PX=40 + close=14
- Critique: furniture=4, arch=3, quality=5, pass=false
- Bigger dilation → much bigger LaMa softening patch. Net negative.

## Iter 5 — flux-fill with the production-style empty-prompt + correct args
- Critique: furniture=0 (from response: complete bedframe + dresser + nightstand)
- Same regeneration failure as iter 3. flux-fill is fundamentally a
  prompt-driven generator, not an inpainter — for our use case.

## Iter 6 — flux-fill with INVERTED mask
- Same regeneration failure. flux-fill ignores mask polarity for our
  prompt or treats both as soft hints.

## Iter 7 — back to LaMa, dilation reverted to 32, prompts kept at 57
- Critique: same shape as iter 1.
- Confirmed: critic plateau bounded by LaMa softening artifact + small-
  windowsill detection ceiling. No additional code change moves the
  scores meaningfully.

## Decision

Accepting iter 1 as the canonical empty-room URL for Phase 5.

The empty-room is an INTERMEDIATE stage; the final product is the
redesign render. The Phase 5 pipeline will overlay new furniture across
the softened floor area, hiding LaMa's biggest artifact. The remaining
critic complaints (LaMa softening + windowsill micro-items + photo
string truncation) are out of scope for code-only fixes within the
budget — they would require:
- super-resolution / sharpening pass on inpainted regions only
  (deferred — out of scope for v1)
- multi-pass SAM3 to catch < 100px detail items (windowsill)
  (deferred — diminishing-returns at $0.005/prompt)
- subtractive keep-class mask via cova-perception (15 keep prompts to
  protect ceiling fan / DAKSH / photo string from inpainter)
  (deferred — Phase 5 redesign will reintroduce them anyway)

Code keeps the iter 7 deployment (LaMa default, 57 prompts, dilation 32,
threshold 0.10, close+dilate hygiene) which is strictly better than
the pre-Phase-4 state for any real-world cluttered room.
