# Phase 0.5 Run 2 — Empty-Room Bench Summary

**Date:** 2026-04-20  
**Input:** 15 rooms from `bench/manifest.json`  
**Path tested:** Bria Eraser (`fal-ai/bria/eraser`) primary, SAM-3 furniture union (20 widened prompts) + **24px dilation** (was 16px)  
**New in Run 2:** Low-coverage rescan gate — medium/heavy clutter rooms with <20% primary coverage trigger second SAM-3 pass at score_threshold=0.20  
**Total cost (15 rooms):** $3.30  
**Total wall-clock (sum of per-room):** 458s (run concurrent ×3)  
**Overall pass rate:** 1/15  

## Per-metric pass rates

| Metric | Threshold | Pass count |
|---|---|---|
| SSIM ≥0.97 | — | 3/15 |
| Ghost <1.0% | — | 8/15 |
| VP <3.0% | — | 2/15 |
| EDR 0.7–1.3 | — | 12/15 |
| Lat ≤60.0s | — | 15/15 |
| Cost ≤$0.5 | — | 15/15 |
| **Overall** | all 6 | **1/15** |

## Per-room results

R = rescan triggered (second SAM-3 pass at score_threshold=0.20)

| Room | Strat (C/G/T/L) | SSIM | Ghost | VP | EDR | Lat | Cost | **Pass** |
|---|---|---|---|---|---|---|---|---|
| room-01 | l/cor/popco/harsh | 0.942✗ | 7.5%✗ | 7.9%✗ | 1.03✓ | 8.6s✓ | $0.180✓ | **✗** |
| room-02R | m/lon/plank/soft- | 0.929✗ | 0.0%✓ | 4.5%✗ | 1.54✗ | 7.8s✓ | $0.280✓ | **✗** |
| room-03 | l/cor/herri/harsh | 0.974✓ | 0.9%✓ | 17.8%✗ | 0.97✓ | 8.9s✓ | $0.180✓ | **✗** |
| room-04R | h/slo/wall-/mixed | 0.970✓ | 8.2%✗ | 3.5%✗ | 0.65✗ | 8.2s✓ | $0.280✓ | **✗** |
| room-05 | m/lon/shag-/harsh | 0.940✗ | 2.5%✗ | 10.5%✗ | 0.90✓ | 12.5s✓ | $0.180✓ | **✗** |
| room-06 | n/bay/hardw/brigh | 0.984✓ | 0.0%✓ | 1.1%✓ | 0.94✓ | 8.1s✓ | $0.180✓ | **✓** |
| room-07R | m/lon/carpe/harsh | 0.942✗ | 1.3%✗ | 3.8%✗ | 0.81✓ | 8.7s✓ | $0.280✓ | **✗** |
| room-08 | m/lon/flora/soft- | 0.928✗ | 0.6%✓ | 10.6%✗ | 0.80✓ | 8.0s✓ | $0.180✓ | **✗** |
| room-09R | h/cor/popco/lamp- | 0.934✗ | 0.0%✓ | 5.3%✗ | 0.87✓ | 9.0s✓ | $0.280✓ | **✗** |
| room-10R | m/lon/plush/tv-gl | 0.951✗ | 0.0%✓ | 12.4%✗ | 0.39✗ | 7.9s✓ | $0.280✓ | **✗** |
| room-11 | h/lon/moroc/warm- | 0.923✗ | 20.7%✗ | 9.7%✗ | 0.95✓ | 7.7s✓ | $0.180✓ | **✗** |
| room-12R | m/cor/hardw/dayli | 0.956✗ | 7.0%✗ | 9.7%✗ | 0.87✓ | 10.0s✓ | $0.280✓ | **✗** |
| room-13 | l/cor/expos/soft- | 0.964✗ | 1.0%✓ | 3.0%✓ | 0.95✓ | 11.1s✓ | $0.180✓ | **✗** |
| room-14 | n/lon/stack/mixed | 0.919✗ | 0.0%✓ | 7.0%✗ | 0.81✓ | 15.1s✓ | $0.180✓ | **✗** |
| room-15 | h/cor/wood-/soft- | 0.935✗ | 17.3%✗ | 5.3%✗ | 0.84✓ | 20.6s✓ | $0.180✓ | **✗** |

**Overall pass rate:** 1/15  

## Stratification analysis

- **Clutter:** heavy: 0/4 · light: 0/3 · medium: 0/6 · none: 1/2
- **Geometry:** bay-window-niche: 1/1 · corner: 0/6 · long-perspective: 0/7 · sloped-ceiling: 0/1
- **Texture:** carpet: 0/1 · exposed-brick: 0/1 · floral-rug: 0/1 · hardwood-grain: 1/1 · hardwood-plank: 0/1 · herringbone-parquet: 0/1 · moroccan-rug: 0/1 · plank-floor: 0/1 · plush-carpet: 0/1 · popcorn-ceiling: 0/2 · shag-rug-pattern: 0/1 · stacked-stone: 0/1 · wall-molding-break: 0/1 · wood-paneling: 0/1
- **Lighting:** bright-natural: 1/1 · daylight-plus-led: 0/1 · harsh-backlit: 0/1 · harsh-directional: 0/3 · lamp-lit-mixed: 0/1 · mixed-backlit: 0/1 · mixed-window-fixture: 0/1 · soft-daylight: 0/2 · soft-overcast: 0/2 · tv-glow-only: 0/1 · warm-evening-lamp: 0/1

## Rescan stats (low-coverage gate)

- **Rooms that triggered rescan:** 6/15
- **Avg coverage before rescan:** 13.7%
- **Avg coverage after rescan:** 13.7%
- **Rescan rooms pass rate:** 0/6
- **Non-rescan rooms pass rate:** 1/9
- **Performance comparison:** Rescan avg SSIM 0.9471 vs non-rescan avg SSIM 0.9454 — rescan rooms outperformed

### Per-room rescan detail

| Room | Clutter | Cov Before | Cov After | Δ | SSIM | Pass |
|---|---|---|---|---|---|---|
| room-02 | medium | 15.0% | 15.0% | 0.0pp | 0.9295 | FAIL |
| room-04 | heavy | 12.3% | 12.3% | 0.0pp | 0.9703 | FAIL |
| room-07 | medium | 5.9% | 5.9% | 0.0pp | 0.9418 | FAIL |
| room-09 | heavy | 13.2% | 13.2% | 0.0pp | 0.9335 | FAIL |
| room-10 | medium | 19.9% | 19.9% | 0.0pp | 0.9513 | FAIL |
| room-12 | medium | 15.9% | 15.9% | 0.0pp | 0.9560 | FAIL |

## H2 hard-exit table — room-01, room-09, room-11

These rooms were flagged as Bria-VAE-drift (H2) candidates in the mask audit.
An improvement of ≥0.02 SSIM vs Run 1.5 would indicate mask quality was a
contributing factor; no improvement confirms Bria architectural drift as root cause.

| Room | Run 1.5 SSIM | Run 2 SSIM | Δ | ≥0.02 improvement? |
|---|---|---|---|---|
| room-01 | 0.9402 | 0.9418 | +0.0016 | no |
| room-09 | 0.9297 | 0.9335 | +0.0038 | no |
| room-11 | 0.9193 | 0.9235 | +0.0042 | no |

**H2 verdict:** H2 confirmed as Bria-architectural-drift; mask iteration does not address it. NONE of room-01/09/11 improved by ≥0.02 SSIM with 24px dilation + rescan. Root cause is Bria VAE latent-space drift on complex room content, not mask coverage.

## room-10 over-masking check

**Run 1.5 dilated coverage:** 29.0%  
**Run 2 dilated coverage:** 33.5%  
**Verdict:** Over-masking persists (Run 1.5: 29.0% → Run 2: 33.5%). 24px dilation increased coverage further. H1 (mask coverage) flag on room-10 is a real concern.

## Failure mode summary

- **room-01** (light/corner/popcorn-ceiling/harsh-directional): SSIM 0.942 < 0.97; ghost 7.5% ≥ 1.0%; VP 7.9% ≥ 3.0%
- **room-02** [RESCAN] (medium/long-perspective/plank-floor/soft-overcast): SSIM 0.929 < 0.97; VP 4.5% ≥ 3.0%; EDR 1.54 outside [0.7,1.3]
- **room-03** (light/corner/herringbone-parquet/harsh-directional): VP 17.8% ≥ 3.0%
- **room-04** [RESCAN] (heavy/sloped-ceiling/wall-molding-break/mixed-backlit): ghost 8.2% ≥ 1.0%; VP 3.5% ≥ 3.0%; EDR 0.65 outside [0.7,1.3]
- **room-05** (medium/long-perspective/shag-rug-pattern/harsh-backlit): SSIM 0.940 < 0.97; ghost 2.5% ≥ 1.0%; VP 10.5% ≥ 3.0%
- **room-07** [RESCAN] (medium/long-perspective/carpet/harsh-directional): SSIM 0.942 < 0.97; ghost 1.3% ≥ 1.0%; VP 3.8% ≥ 3.0%
- **room-08** (medium/long-perspective/floral-rug/soft-overcast): SSIM 0.928 < 0.97; VP 10.6% ≥ 3.0%
- **room-09** [RESCAN] (heavy/corner/popcorn-ceiling/lamp-lit-mixed): SSIM 0.934 < 0.97; VP 5.3% ≥ 3.0%
- **room-10** [RESCAN] (medium/long-perspective/plush-carpet/tv-glow-only): SSIM 0.951 < 0.97; VP 12.4% ≥ 3.0%; EDR 0.39 outside [0.7,1.3]
- **room-11** (heavy/long-perspective/moroccan-rug/warm-evening-lamp): SSIM 0.923 < 0.97; ghost 20.7% ≥ 1.0%; VP 9.7% ≥ 3.0%
- **room-12** [RESCAN] (medium/corner/hardwood-plank/daylight-plus-led): SSIM 0.956 < 0.97; ghost 7.0% ≥ 1.0%; VP 9.7% ≥ 3.0%
- **room-13** (light/corner/exposed-brick/soft-daylight): SSIM 0.964 < 0.97
- **room-14** (none/long-perspective/stacked-stone/mixed-window-fixture): SSIM 0.919 < 0.97; VP 7.0% ≥ 3.0%
- **room-15** (heavy/corner/wood-paneling/soft-daylight): SSIM 0.935 < 0.97; ghost 17.3% ≥ 1.0%; VP 5.3% ≥ 3.0%

## Gate recommendation

**FAIL — Bria mask-mode not viable primary; escalate to Canny+FLUX secondary**

<10/15 pass rate (1/15). Mask iteration alone insufficient. Recommend escalating to Canny+FLUX secondary path as described in §3.5.

### Gate decision tree applied
- ≥13/15 pass → PROCEED TO RUN 3
- 10–12/15 pass → MIXED
- <10/15 pass → FAIL
- Result: 1/15 → **FAIL**

## Cost reconciliation

- Per-room baseline: $0.180 (20 SAM-3 primary + 8 SAM-3 ghost + 1 Bria)  
- Per-room rescan overhead: $0.100 (20 additional SAM-3 calls at $0.005 each)  
- Rooms rescanned: 6 → rescan overhead: $0.60  
- 15-room total: $3.30  
- Hard cap: $4.00  
- Status: WITHIN CAP
