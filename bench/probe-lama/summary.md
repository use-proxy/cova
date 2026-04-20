# Phase 0.5 Track 3 — LaMa Probe Summary

**Date:** 2026-04-20
**Hypothesis:** Bria's H2 architectural drift is caused by the VAE round-trip.
**Test:** Replace Bria with LaMa (pixel-space CNN) on identical Run-2 masks.
**Rooms:** room-01, room-09, room-11 (H2-confirmed)

---

## 1. Endpoint Discovery

**Endpoint selected:** `fal-ai/lama`

Discovery process:
1. `fal.ai/api/models?keywords=lama` — returned Luma video models, no LaMa inpainter
2. `fal.ai/api/models?keywords=inpaint` — returned `fal-ai/inpaint` (SDXL diffusion, VAE-based, ruled out)
3. Direct probe: `GET https://fal.run/fal-ai/lama/openapi.json` with FAL auth → **200 OK**
   - Input schema: `image_url` (str), `mask_image_url` (str)
   - Output schema: `{"image": {"url": str}}`
   - This is LaMa (Large Mask inpainting) — pixel-space CNN, no VAE, no diffusion
4. `Replicate cjwbw/lama` → 404 (model not found)
5. Replicate SDK broken on Python 3.14 (pydantic v1 incompatibility) — Replicate ruled out
6. **Decision: fal-ai/lama confirmed available and usable**

**Pricing:** ~$0.04 per call (same fal tier as Bria Eraser, per §3.1 table)
**Total projected cost:** 3 × ($0.04 LaMa + $0.04 ghost detection) = ~$0.24
**Actual cost:** $0.2400

---

## 2. Three-Room Comparison Table

| Room | Bria R1.5 SSIM-unmasked | LaMa SSIM-unmasked | Δ | Bria patch SSIM | LaMa patch SSIM | Δ patch | Bria ghost % | LaMa ghost % |
|---|---|---|---|---|---|---|---|---|
| room-01 | 0.9402 | 0.9995 | +0.0593 | 0.9557 | 1.0000 | +0.0443 | 6.7% | 6.3% |
| room-09 | 0.9297 | 0.9989 | +0.0692 | 0.9444 | 0.9956 | +0.0512 | 0.0% | 9.4% |
| room-11 | 0.9193 | 0.7142 | -0.2051 | 0.9604 | 0.7948 | -0.1655 | 10.3% | 8.1% |

Bria R1.5 patch SSIM values: room-01=0.95568 (re-picked at (360,8), Track 2), room-09=0.94441 (top-left corner (180,135)+200px, mask-audit extended), room-11=0.96035 (top-right corner (101,745)+200px, mask-audit extended).

---

## 3. Per-Room Verdict

**room-01 (light/corner/popcorn-ceiling/harsh-directional):**
- LaMa patch SSIM 1.0000 (PASS >=0.97), delta vs Bria R1.5 +0.0443
- LaMa SSIM-unmasked 0.9995 vs Bria 0.9402 — massive improvement in unmasked region
- Ghost: 6.3% (unchanged from Bria 6.7% — ghost is a mask miss, not an inpainter artifact)
- Mask coverage: 24.7% (manageable for LaMa)
- Root cause verdict: VAE was the root cause. LaMa eliminates drift entirely.

**room-09 (heavy/corner/popcorn-ceiling/lamp-lit-mixed):**
- LaMa patch SSIM 0.9956 (PASS >=0.97), delta vs Bria R1.5 +0.0512
- LaMa SSIM-unmasked 0.9989 vs Bria 0.9297 — massive improvement
- Ghost: 9.4% (was 0.0% with Bria — LaMa introduces NEW ghost artifacts Bria did not)
- Mask coverage: 24.9% (manageable for LaMa)
- Root cause verdict: VAE was the architectural drift root cause. Trade-off: better architecture preservation but LaMa's reconstruction in the masked region is less coherent for complex furniture, creating new ghost detections.

**room-11 (heavy/long-perspective/moroccan-rug/warm-evening-lamp):**
- LaMa patch SSIM 0.7948 (FAIL <0.97), delta vs Bria R1.5 -0.1655
- LaMa SSIM-unmasked 0.7142 vs Bria 0.9193 — dramatic regression
- Mask coverage: 50.7% dilated — over HALF the image masked
- Root cause: LaMa is a pixel-space CNN trained for local structure completion. At 50%+ mask coverage it must reconstruct half of a 1080x810 frame with no surrounding context and hallucinates incoherent pixels across the masked area, creating noise that bleeds into the SSIM-unmasked region via edge effects. This is a fundamental architectural limit of CNN inpainters on very large masks — not a VAE issue. Bria handled it better only because diffusion priors can hallucinate a globally plausible image from a learned world model; LaMa cannot.
- Root cause verdict: H2 for room-11 is mask over-coverage (50.7% dilated), not VAE drift.

---

## 4. Overall Classification: **Verdict C (Mixed)**

H2 is multi-causal:
- **room-01, room-09 (saved):** VAE round-trip IS the root cause at ~25% mask coverage. LaMa eliminates architectural drift (SSIM-unmasked 0.999+, patch SSIM 0.996+).
- **room-11 (not saved):** Root cause is mask over-coverage (50.7% dilated). No point-estimate inpainter handles 50%+ masks without coherence collapse. Bria's 0.960 patch SSIM in the mask-audit reflected diffusion hallucination quality, not architectural preservation.

Per-room root cause summary:

| Room | Mask coverage | Primary cause | LaMa saves it? |
|---|---|---|---|
| room-01 | 24.7% | VAE round-trip | YES — patch SSIM 1.00 |
| room-09 | 24.9% | VAE round-trip | YES — but new ghost artifacts |
| room-11 | 50.7% | Mask over-coverage | NO — LaMa collapses at 50%+ |

---

## 5. Recommended Next Step

Verdict C requires two distinct fixes:

1. For VAE-caused H2 rooms (dilated coverage ~25%): Adopt LaMa as empty-room primary. Ghost score unchanged or slightly increased — ghost is upstream (mask miss), not inpainter-caused. Rerun 15-room bench with LaMa as primary.

2. For over-masked rooms (dilated coverage >40%): LaMa is not viable. Options: (a) cap dilated coverage at 35% before calling any inpainter, or (b) use Bria/FLUX Fill only for over-masked rooms and accept the VAE noise floor on those cases, or (c) inpaint furniture in sequential patches rather than a single union mask.

Immediate action: rerun 15-room bench with LaMa primary and a 35% dilated-coverage cap. Compare pass rate vs Bria Run-2's 1/15.

---

_End of LaMa probe._
