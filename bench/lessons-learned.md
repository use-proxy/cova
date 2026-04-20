# Phase 0.5 — Lessons Learned

Three anti-patterns surfaced in Run 2 and the Track 2/3 probes.

---

## 1. SAM 3 rescan at lower score threshold does not recover missed coverage

In Run 2, 6 rooms triggered the <20% coverage rescan at score_threshold=0.20.
All 6 had ZERO coverage gain — SAM 3 had already saturated detectable furniture.
The rescan added $0.10/room in SAM 3 cost with no benefit in any of the 6 rooms:
avg coverage before 13.7%, avg coverage after 13.7%.

SAM 3's miss is structural: small, occluded, or uncommon furniture types are not in
the prompt list — lowering the score threshold does not surface them. The model
simply returns the same high-confidence masks at a lower threshold bar.

Actionable: if mask coverage is genuinely too low, expand the prompt list with more
specific furniture types (e.g. "guitar", "monitor stand", "pedestal fan") or accept
lower-bound coverage and rely on dilation. Do not add lower-threshold rescan gates.

---

## 2. Aggressive dilation on already-over-masked rooms compounds over-segmentation

room-10 went from 29.0% dilated coverage (Run 1.5, 16px) to 33.5% (Run 2, 24px).
For heavy-clutter rooms where SAM 3 is already marking a large fraction of the image,
further dilation pushes coverage into territory where no inpainter can reconstruct
coherently (room-11 in Track 3: 50.7% dilated, LaMa collapses completely).

Actionable: use adaptive dilation — skip or reduce dilation when raw mask coverage
already exceeds ~30%. Phase 3 harness should check raw coverage before applying
the 24px dilation step and cap dilated coverage at 35% regardless of raw coverage.

---

## 3. Bria's fal endpoint does not support prompt-free / auto-mask mode

Three endpoint variants were tested in Track 2 (probe-bria-prompt-free):
fal-ai/bria/eraser, fal-ai/bria/background-removal variants — all 404 or
validation-error when called without an explicit mask_url. Bria mask-mode is
the only Bria mode available on fal as of 2026-04-20. Do not include
"Bria prompt-free" in any future fallback chain without re-checking fal's catalog.
The endpoint fal-ai/lama (pixel-space CNN) IS available and accepts image_url +
mask_image_url — use it as the VAE-free alternative, not Bria prompt-free.
