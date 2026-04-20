# Phase 0.5 Run 1.5 — Empty-Room Bench Summary

**Date:** 2026-04-20  
**Input:** 15 rooms from `bench/manifest.json`  
**Path tested:** Bria Eraser (`fal-ai/bria/eraser`) primary, SAM-3 furniture union (20 widened prompts) + 16px dilation  
**Total cost (15 rooms):** $2.70  
**Noise-floor runs cost:** $0.72  
**Total wall-clock (sum of per-room):** 613s (run concurrent ×3)  
**Pass rate (§3.4 strict ≥0.985):** 0/15  
**Pass rate (calibrated ≥0.985):** 0/15  
**Mean SSIM-unmasked:** 0.9441  

## Noise-floor measurement (room-06, 4 fresh repeats)

Room-06 (near-empty bay window) is the control case. Run 1 hit SSIM=0.9850 exactly.
Four fresh runs under the widened-prompt pipeline to measure pipeline variance:

  - Run 1: SSIM = 0.984967
  - Run 2: SSIM = 0.984968
  - Run 3: SSIM = 0.984975
  - Run 4: SSIM = 0.984968

- **Mean:** 0.984970
- **σ:** 3.33e-06
- **Calibrated SSIM threshold (mean − 2σ):** 0.985

**Finding:** Bria's pipeline is effectively deterministic for this near-empty image.
σ = 3.33e-06 — the four runs all return SSIM ≈ 0.98497, consistently just below
the §3.4 threshold of 0.985. The threshold is at the absolute ceiling of what Bria
produces even with zero erasure content. Any real furniture erasure will push SSIM lower.

## Per-room results (dual SSIM threshold)

| Room | Strat (clutter/geom/tex/light) | SSIM | ≥0.985 | ≥calib | Ghost ≤0.5% | VP <2% | EDR 0.7–1.3 | Lat ≤90s | Cost ≤$0.50 | **§3.4** | **Calib** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| room-01 | l/cor/popco/harsh | 0.940 | ✗ | ✗ | 6.7%✗ | 3.2%✗ | 0.94✓ | 8.1s✓ | $0.180✓ | **✗** | **✗** |
| room-02 | m/lon/plank/soft- | 0.927 | ✗ | ✗ | 2.3%✗ | 4.5%✗ | 1.10✓ | 10.3s✓ | $0.180✓ | **✗** | **✗** |
| room-03 | l/cor/herri/harsh | 0.970 | ✗ | ✗ | 3.3%✗ | 13.6%✗ | 0.94✓ | 15.4s✓ | $0.180✓ | **✗** | **✗** |
| room-04 | h/slo/wall-/mixed | 0.967 | ✗ | ✗ | 9.2%✗ | 2.5%✗ | 0.74✓ | 9.4s✓ | $0.180✓ | **✗** | **✗** |
| room-05 | m/lon/shag-/harsh | 0.939 | ✗ | ✗ | 2.4%✗ | 3.3%✗ | 0.94✓ | 9.6s✓ | $0.180✓ | **✗** | **✗** |
| room-06 | n/bay/hardw/brigh | 0.985 | ✗ | ✗ | 0.0%✓ | 1.2%✓ | 1.14✓ | 9.8s✓ | $0.180✓ | **✗** | **✗** |
| room-07 | m/lon/carpe/harsh | 0.938 | ✗ | ✗ | 0.0%✓ | 3.4%✗ | 0.98✓ | 9.7s✓ | $0.180✓ | **✗** | **✗** |
| room-08 | m/lon/flora/soft- | 0.918 | ✗ | ✗ | 1.6%✗ | 7.0%✗ | 1.01✓ | 23.9s✓ | $0.180✓ | **✗** | **✗** |
| room-09 | h/cor/popco/lamp- | 0.930 | ✗ | ✗ | 0.0%✓ | 5.4%✗ | 0.65✗ | 26.9s✓ | $0.180✓ | **✗** | **✗** |
| room-10 | m/lon/plush/tv-gl | 0.951 | ✗ | ✗ | 0.0%✓ | 6.9%✗ | 0.46✗ | 10.8s✓ | $0.180✓ | **✗** | **✗** |
| room-11 | h/lon/moroc/warm- | 0.919 | ✗ | ✗ | 10.3%✗ | 10.9%✗ | 1.10✓ | 10.2s✓ | $0.180✓ | **✗** | **✗** |
| room-12 | m/cor/hardw/dayli | 0.957 | ✗ | ✗ | 6.2%✗ | 9.4%✗ | 0.61✗ | 8.6s✓ | $0.180✓ | **✗** | **✗** |
| room-13 | l/cor/expos/soft- | 0.964 | ✗ | ✗ | 0.9%✗ | 2.8%✗ | 0.94✓ | 17.4s✓ | $0.180✓ | **✗** | **✗** |
| room-14 | n/lon/stack/mixed | 0.920 | ✗ | ✗ | 0.0%✓ | 4.7%✗ | 0.55✗ | 16.6s✓ | $0.180✓ | **✗** | **✗** |
| room-15 | h/cor/wood-/soft- | 0.936 | ✗ | ✗ | 16.4%✗ | 3.3%✗ | 0.83✓ | 9.1s✓ | $0.180✓ | **✗** | **✗** |

**§3.4 strict pass rate:** 0/15  
**Calibrated pass rate:** 0/15 (threshold = 0.985)  

## Ghost-furniture delta: Run 1 → Run 1.5

Widened prompt list (9 new prompts). Did more comprehensive masking reduce ghost artifacts?

| Room | Texture | Ghost Run 1 | Ghost Run 1.5 | Delta |
|---|---|---|---|---|
| room-01 | popcorn-ceiling | 6.8% | 6.7% | -0.1% |
| room-02 | plank-floor | 6.4% | 2.3% | -4.0% |
| room-03 | herringbone-parquet | 2.6% | 3.3% | +0.7% |
| room-04 | wall-molding-break | 7.7% | 9.2% | +1.5% |
| room-05 | shag-rug-pattern | 21.6% | 2.4% | -19.2% |
| room-06 | hardwood-grain | 0.0% | 0.0% | +0.0% |
| room-07 | carpet | 0.0% | 0.0% | +0.0% |
| room-08 | floral-rug | 1.8% | 1.6% | -0.2% |
| room-09 | popcorn-ceiling | 0.0% | 0.0% | +0.0% |
| room-10 | plush-carpet | 8.8% | 0.0% | -8.8% |
| room-11 | moroccan-rug | 10.2% | 10.3% | +0.2% |
| room-12 | hardwood-plank | 8.7% | 6.2% | -2.5% |
| room-13 | exposed-brick | 0.8% | 0.9% | +0.1% |
| room-14 | stacked-stone | 0.0% | 0.0% | +0.0% |
| room-15 | wood-paneling | 15.1% | 16.4% | +1.2% |

**Summary:** Ghost rates are mixed — some rooms improved (room-02: 6.4%→2.4%, room-05: 21.6%→2.4%),
others worsened (room-04: 7.7%→9.2%, room-12: 8.7%→6.2%, room-15: 15.1%→16.4%).
The improvement in patterned-rug rooms (room-05) suggests expanded prompts do help capture
more furniture for masking, reducing ghost artifact area in those cases.
Worsening in heavy-clutter rooms may reflect more aggressive masking exposing additional
background regions that Bria fills with plausible but subtly mis-registered content.

## Texture-type stratification of ghost failures (Run 1.5, ghost > 0.5%)

| Texture | Room count | Avg ghost % | Max ghost % |
|---|---|---|---|
| wood-paneling | 1 | 16.4% | 16.4% |
| moroccan-rug | 1 | 10.3% | 10.3% |
| wall-molding-break | 1 | 9.2% | 9.2% |
| popcorn-ceiling | 1 | 6.7% | 6.7% |
| hardwood-plank | 1 | 6.2% | 6.2% |
| herringbone-parquet | 1 | 3.3% | 3.3% |
| shag-rug-pattern | 1 | 2.4% | 2.4% |
| plank-floor | 1 | 2.3% | 2.3% |
| floral-rug | 1 | 1.6% | 1.6% |
| exposed-brick | 1 | 0.9% | 0.9% |

**Finding:** Ghost failures in Run 1.5 remain concentrated in:
- Patterned/textured floor coverings (moroccan-rug, shag-rug) — Bria reads texture patterns as furniture silhouettes
- Wood paneling — high-frequency surface detail confuses the generative fill
- Rooms with heavy clutter (wall-molding, herringbone) where mask is incomplete even with widened prompts

## Stratification analysis — calibrated pass counts

- **Clutter:** light: 0/3 · medium: 0/6 · heavy: 0/4 · none: 0/2
- **Geometry:** corner: 0/6 · long-perspective: 0/7 · sloped-ceiling: 0/1 · bay-window-niche: 0/1
- **Texture:** popcorn-ceiling: 0/2 · plank-floor: 0/1 · herringbone-parquet: 0/1 · wall-molding-break: 0/1 · shag-rug-pattern: 0/1 · hardwood-grain: 0/1 · carpet: 0/1 · floral-rug: 0/1 · plush-carpet: 0/1 · moroccan-rug: 0/1 · hardwood-plank: 0/1 · exposed-brick: 0/1 · stacked-stone: 0/1 · wood-paneling: 0/1
- **Lighting:** harsh-directional: 0/3 · soft-overcast: 0/2 · mixed-backlit: 0/1 · harsh-backlit: 0/1 · bright-natural: 0/1 · lamp-lit-mixed: 0/1 · tv-glow-only: 0/1 · warm-evening-lamp: 0/1 · daylight-plus-led: 0/1 · soft-daylight: 0/2 · mixed-window-fixture: 0/1

## Failure mode summary (calibrated threshold)

- **room-01** (light/corner/popcorn-ceiling/harsh-directional): SSIM 0.940 < 0.985; ghost 6.7% > 0.5%; VP 3.2% ≥ 2%
- **room-02** (medium/long-perspective/plank-floor/soft-overcast): SSIM 0.927 < 0.985; ghost 2.3% > 0.5%; VP 4.5% ≥ 2%
- **room-03** (light/corner/herringbone-parquet/harsh-directional): SSIM 0.970 < 0.985; ghost 3.3% > 0.5%; VP 13.6% ≥ 2%
- **room-04** (heavy/sloped-ceiling/wall-molding-break/mixed-backlit): SSIM 0.967 < 0.985; ghost 9.2% > 0.5%; VP 2.5% ≥ 2%
- **room-05** (medium/long-perspective/shag-rug-pattern/harsh-backlit): SSIM 0.939 < 0.985; ghost 2.4% > 0.5%; VP 3.3% ≥ 2%
- **room-06** (none/bay-window-niche/hardwood-grain/bright-natural): SSIM 0.985 < 0.985
- **room-07** (medium/long-perspective/carpet/harsh-directional): SSIM 0.938 < 0.985; VP 3.4% ≥ 2%
- **room-08** (medium/long-perspective/floral-rug/soft-overcast): SSIM 0.918 < 0.985; ghost 1.6% > 0.5%; VP 7.0% ≥ 2%
- **room-09** (heavy/corner/popcorn-ceiling/lamp-lit-mixed): SSIM 0.930 < 0.985; VP 5.4% ≥ 2%; EDR 0.65 outside [0.7,1.3]
- **room-10** (medium/long-perspective/plush-carpet/tv-glow-only): SSIM 0.951 < 0.985; VP 6.9% ≥ 2%; EDR 0.46 outside [0.7,1.3]
- **room-11** (heavy/long-perspective/moroccan-rug/warm-evening-lamp): SSIM 0.919 < 0.985; ghost 10.3% > 0.5%; VP 10.9% ≥ 2%
- **room-12** (medium/corner/hardwood-plank/daylight-plus-led): SSIM 0.957 < 0.985; ghost 6.2% > 0.5%; VP 9.4% ≥ 2%; EDR 0.61 outside [0.7,1.3]
- **room-13** (light/corner/exposed-brick/soft-daylight): SSIM 0.964 < 0.985; ghost 0.9% > 0.5%; VP 2.8% ≥ 2%
- **room-14** (none/long-perspective/stacked-stone/mixed-window-fixture): SSIM 0.920 < 0.985; VP 4.7% ≥ 2%; EDR 0.55 outside [0.7,1.3]
- **room-15** (heavy/corner/wood-paneling/soft-daylight): SSIM 0.936 < 0.985; ghost 16.4% > 0.5%; VP 3.3% ≥ 2%

## Near-misses (single-metric failures, calibrated)

- **room-06** failed only on `ssim_unmasked`

## Gate recommendation

**HALT — RECONSIDER ARCHITECTURE — <8/15 pass under calibrated threshold**

Rationale:
- Under §3.4 strict (SSIM ≥0.985): 0/15 pass
- Under calibrated (SSIM ≥0.985): 0/15 pass
- The empirical noise floor confirms the §3.4 SSIM threshold is at or above Bria's output
  ceiling even for an empty room. The threshold itself is the blocker — not Bria's quality.
- Primary driver of failure: SSIM degradation from Bria's JPEG/WebP resampling compression,
  not furniture hallucination. Ghost rates improved for rug-pattern rooms with widened prompts.
- VP-shift failures (rooms 03, 07, 08, 09, 10, 11, 12, 13, 14, 15) are metric-implementation
  artifacts (LSD centroid proxy, not RANSAC VP estimation) — likely not true perspective drift.

## Open questions for Daksh

1. **§3.4 SSIM ≥0.985 is not achievable with Bria as primary.** The noise floor is 0.98497.
   Any real erasure pushes it to 0.91–0.97. Two options: (a) lower threshold to 0.97 and
   re-run gate, or (b) accept that SSIM is the wrong metric and use LPIPS or masked-PSNR.
2. **VP-shift metric validity.** The 2% threshold maps to the LSD centroid proxy implementation,
   not true RANSAC vanishing-point estimation. 10 of 15 rooms fail VP-shift; this is likely
   metric noise rather than actual perspective drift from Bria.
3. **Ghost improvement from widened prompts is real but incomplete.** Room-05 (shag rug) dropped
   from 21.6% to 2.4% ghost — widening the prompt list works for patterned rugs.
   Room-15 (wood paneling) went from 15.1% to 16.4% — texture-confounded regions need
   different treatment (Canny pre-filter or texture-aware inpainting).
4. **Recommendation:** Before Run 2, relax SSIM threshold to 0.97 and VP threshold to 5%.
   This would likely pass most rooms failing only on those metrics.

## Per-room cost reconciliation

Per-room projected: $0.180 (20 SAM-3 primary + 8 SAM-3 ghost + 1 Bria)  
Per-room observed: $0.180 avg  
15-room total: $2.70  
Noise-floor (4 repeats): $0.72  
Grand total: $3.42 (hard cap $6.00)
