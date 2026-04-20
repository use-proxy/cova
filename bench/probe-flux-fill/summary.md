# Phase 0.5 Verification — FLUX-Fill Probe (Test 2 of 2)

**Date:** 2026-04-20  
**Endpoint:** `fal-ai/flux-pro/v1/fill`  
**Estimated cost per call:** $0.0500  
**Total probe cost:** $0.2700  

## 1. Endpoint Discovery

Tried endpoints in order: fal-ai/flux-pro/v1/fill, fal-ai/flux-pro/fill, fal-ai/flux/fill, fal-ai/flux-pro-fill
Working endpoint: `fal-ai/flux-pro/v1/fill`
Per-call cost: $0.0500 (from openapi or spec estimate)

FLUX-Fill arguments used (endpoint defaults, minimal neutral prompt):
```
prompt: "empty room, clean architectural surfaces, no furniture"
image_url: <fal upload>
mask_url: <existing Run 3 mask>
```
All other parameters: endpoint defaults.

## 2. Per-Room Comparison

| Room | Run 3 SSIM | FLUX SSIM | Δ SSIM | Run 3 patch | FLUX patch | Δ patch | Run 3 ghost% | FLUX ghost% (global/inside) |
|---|---|---|---|---|---|---|---|---|
| room-02 | 0.7145 | 0.9363 | +0.2218 | 0.9123 | 0.9438 | +0.0315 | 0.0% | 7.4%/7.4% |
| room-11 | 0.9234 | 0.9611 | +0.0377 | 0.9708 | 0.9726 | +0.0018 | 21.0% | 19.4%/13.8% |
| room-14 | 0.4302 | 0.9104 | +0.4802 | 0.9342 | 0.9882 | +0.0540 | 0.0% | 0.0%/0.0% |

## 3. Visual Verdict Per Room

### room-02 — Real drift
- SSIM-unmasked: Run 3=0.7145 → FLUX=0.9363 (Δ+0.2218)
- Patch SSIM: Run 3=0.9123 → FLUX=0.9438 (Δ+0.0315) at patch [35, 67] (mask overlap 2.0%)
- Ghost (global/inside-mask): Run 3=0.0% → FLUX=7.4%/7.4%
- VP shift: 2.69%
- Latency: 13.9s
**Verdict: Mixed (SSIM-unmasked +0.222, patch +0.032)**

### room-11 — Bria VAE drift + high ghost
- SSIM-unmasked: Run 3=0.9234 → FLUX=0.9611 (Δ+0.0377)
- Patch SSIM: Run 3=0.9708 → FLUX=0.9726 (Δ+0.0018) at patch [600, 0] (mask overlap 0.0%)
- Ghost (global/inside-mask): Run 3=21.0% → FLUX=19.4%/13.8%
- VP shift: 6.14%
- Latency: 12.7s
**Verdict: Mixed (SSIM-unmasked +0.038)**

### room-14 — Real drift (stacked-stone)
- SSIM-unmasked: Run 3=0.4302 → FLUX=0.9104 (Δ+0.4802)
- Patch SSIM: Run 3=0.9342 → FLUX=0.9882 (Δ+0.0540) at patch [880, 0] (mask overlap 0.0%)
- Ghost (global/inside-mask): Run 3=0.0% → FLUX=0.0%/0.0%
- VP shift: 0.84%
- Latency: 31.9s
**Verdict: Meaningful improvement**

## 4. Cost-Justification Analysis

- LaMa cost: ~$0.04/call (confirmed in bench/probe-lama/cost-log.json)
- FLUX-Fill cost: ~$0.0500/call (1.2× more expensive than LaMa)

- **room-14** (Meaningful): SSIM gain +0.4802. Crosses gate (≥0.97): NO (SSIM=0.9104 < 0.97)

## 5. Verdict

**B — No meaningful improvement; current LaMa/Bria hybrid is at the inpainter ceiling for these failure modes. Do NOT adopt.**

Rooms breakdown:
- room-02: Mixed (SSIM-unmasked +0.222, patch +0.032)
- room-11: Mixed (SSIM-unmasked +0.038)
- room-14: Meaningful improvement

## 6. Cost Reconciliation

| Item | Cost |
|---|---|
| FLUX-Fill calls: 3 × $0.0500 | $0.1500 |
| SAM-3 ghost: 3 × 8 × $0.0050 | $0.1200 |
| Fal uploads (free) | $0.00 |
| Patch SSIM compute (local) | $0.00 |
| **Total** | **$0.2700** |
| Soft cap | $0.40 |
| Hard cap | $0.50 |
| Status | WITHIN CAP |
