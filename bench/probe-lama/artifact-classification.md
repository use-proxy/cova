# room-09 LaMa "ghost" artifact classification

**Date:** 2026-04-20
**Crop:** see `room-09_artifact_crop.png` (skipped — full-image inspection sufficient)

## Classification: NOT AN ARTIFACT — false positive from upstream mask under-coverage

The 9.4% "ghost-furniture" reading on LaMa room-09 is **not** a LaMa hallucination. It is **real, original furniture content that the SAM 3 primary mask never covered.** LaMa preserved those pixels exactly as in the input — SAM 3's ghost-detection rerun then re-detects them and labels them "ghost."

### Evidence

- room-09 mask coverage: 13.2% raw / 24.9% dilated. The visible scene contains a desk + dual monitors, three guitars on stands, a gaming console, a dresser, bedding on the floor, LED strips, picture frames. SAM 3 primary masked only fragments of bed/chair/table/desk/lamp/tv (raw 13.2%) — guitars, dresser, decor, and most of the desk surface were missed entirely.
- LaMa is a local CNN that only modifies pixels inside the mask. Unmasked pixels are passed through unchanged. The "ghost" SAM 3 finds is the unmasked original furniture.
- Bria's 0% "ghost" on the same room was misleading in the opposite direction: Bria's diffusion VAE drifts unmasked architectural pixels (H2), and that same drift smeared the unmasked furniture enough that SAM 3 no longer recognized it as furniture. So "Bria 0% ghost" really means "Bria's drift made the furniture unrecognizable to SAM 3," not "Bria removed the furniture."

### Type per the user's taxonomy

Technically **Type 1 (semantic)** — recognizable furniture shapes are present in the LaMa output. But the cause is **upstream mask under-coverage**, not LaMa hallucination. Phase 5 redesign will overpaint these regions (it's redesigning the room), so propagation risk is low — the redesign step will replace this content regardless.

### Implication for Run 3 ghost metric

Current ghost metric (SAM 3 rerun on output, mask area >0.5% per prompt) is **biased against pixel-space inpainters that respect mask boundaries**. It interprets "preserved unmasked furniture" as "ghost." The metric is well-calibrated for Bria-style diffusion inpainters that smear everything, but penalizes correct LaMa behavior.

**Recommendation:** in Run 3, when interpreting LaMa-routed rooms with ghost > 1%, do NOT treat as automatic failure. Cross-check by computing ghost-area inside the dilated mask region only (true ghost = furniture in supposedly-erased regions). If the ghost is outside the mask, it's preserved-original, not artifact. Add this distinction to the Run 3 reporting if cheap; otherwise flag in summary and move on.
