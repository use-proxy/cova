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

---

## After Run 3

### 4. Bria VAE round-trip drift on unmasked architectural pixels (H2 confirmed, LaMa probe a424364)

Bria's diffusion VAE re-encodes ALL pixels (masked and unmasked) in latent space on every
call. This introduces a noise floor on unmasked architectural surfaces (walls, ceilings, floors)
that is independent of mask quality or size. LaMa (pixel-space CNN) eliminates this drift
entirely on rooms with <35% dilated mask coverage: room-01 SSIM-unmasked 0.9402→0.9995,
room-09 0.9297→0.9989. The H2 drift is a Bria architectural property, not a mask problem.

---

### 5. LaMa is a local CNN with no world prior — collapses when mask coverage exceeds ~40%

LaMa achieves near-perfect architecture preservation at <35% dilated mask coverage. At >40%
coverage (room-11: 50.7% dilated), LaMa must reconstruct over half the image with no
surrounding context. SSIM-unmasked drops from ~0.999 to 0.714 — complete coherence collapse.
LaMa is not viable as a standalone inpainter for high-coverage rooms. Threshold for LaMa
viability is conservatively ~35% dilated coverage.

---

### 6. LaMa and Bria have orthogonal failure modes — hybrid routing exploits complementarity

LaMa fails at HIGH coverage (no world prior to hallucinate plausible content from).
Bria fails at LOW coverage (VAE re-encode drifts pixels that should be untouched).
A coverage-based router eliminates both failure modes: route ≤35% dilated coverage to LaMa,
route >35% to Bria. The 35% threshold is provisional — Phase 1 hardening should calibrate
on a larger room set. This hybrid is the Run 3 primary path.

---

### 7. Phase 5 flag: VAE-based redesign inpainters may exhibit H2-style architectural drift

Nano Banana Pro is VAE-based. H2-style drift may appear in the redesign stage where
architecture (walls, ceilings, floors) should be preserved while furniture is replaced.
Phase 5 bench MUST measure architecture-preservation SSIM on fixed clean patches
(e.g., wall/ceiling corner patch), NOT whole-image SSIM. Whole-image SSIM will be
artificially low in redesign because furniture pixels legitimately change — patch SSIM on
confirmed-architectural surfaces is the only metric that isolates VAE drift from intended
furniture replacement.

---

### 8. Ghost-furniture metric is biased against pixel-space inpainters

LaMa preserves unmasked pixels exactly. If SAM 3 primary mask missed furniture (a common
occurrence — see lesson 1), that real furniture remains in the LaMa output unchanged. The
SAM 3 ghost-detection rerun then re-detects it and counts it as "ghost furniture" — a false
positive. Run 3 introduced `ghost_inside_mask_pct` (ghost area intersected with the dilated
primary mask, as % of full image) for LaMa-routed rooms. This metric detects only ghosts
inside regions that were actually erased — the only meaningful definition of "inpainting
artifact." Apply this rule to any future pixel-space inpainter evaluation (LaMa or similar).
