# Phase 0.5 Run 3 — Empty-Room Bench Summary (Hybrid LaMa/Bria Router)

**Date:** 2026-04-20  
**Input:** 15 rooms from `bench/manifest.json`  
**Path tested:** Hybrid router — dilated coverage ≤35% → LaMa (`fal-ai/lama`), >35% → Bria (`fal-ai/bria/eraser`)  
**SAM-3:** 20-prompt furniture union + 24px dilation (unchanged from Run 2)  
**Ghost metric:** LaMa rows use `ghost_inside_mask_pct`; Bria rows use `ghost_furniture_area_pct` (unchanged)  
**Rescan gate:** REMOVED — Run 2 showed 0pp coverage gain across all triggered rooms  
**Total cost (15 rooms):** $2.70  
**Total wall-clock (sum of per-room):** 342s (run concurrent ×3)  
**Overall pass rate:** 1/15  

## Per-metric pass rates

| Metric | Threshold | Pass count |
|---|---|---|
| SSIM ≥0.97 | — | 6/15 |
| Ghost <1.0% (LaMa=inside-mask, Bria=global) | — | 9/15 |
| VP <3.0% | — | 2/15 |
| EDR 0.7–1.3 | — | 11/15 |
| Lat ≤60.0s | — | 15/15 |
| Cost ≤$0.5 | — | 15/15 |
| **Overall** | all 6 | **1/15** |

## Per-room results

Ghost column shows `g:<global>%/m:<inside-mask>%`. Pass/fail mark uses `ghost_inside_mask_pct` for LaMa rows and `ghost_furniture_area_pct` for Bria rows. See context: LaMa preserves unmasked pixels exactly — global ghost detects real unmasked furniture (false positive). Inside-mask ghost isolates true inpainting artifacts.

| Room | Inpainter | Strat (C/G/T/L) | SSIM | Ghost (g/m) | VP | EDR | Lat | Cost | **Pass** |
|---|---|---|---|---|---|---|---|---|---|---|
| room-01 | lama | l/cor/popco/harsh | 0.999✓ | g:6.3%/m:6.0%✗ | 9.5%✗ | 0.51✗ | 6.2s✓ | $0.180✓ | **✗** |
| room-02 | lama | m/lon/plank/soft- | 0.714✗ | g:0.0%/m:0.0%✓ | 7.6%✗ | 0.94✓ | 6.9s✓ | $0.180✓ | **✗** |
| room-03 | bria | l/cor/herri/harsh | 0.974✓ | g:1.2%/m:0.7%✗ | 17.5%✗ | 0.99✓ | 11.9s✓ | $0.180✓ | **✗** |
| room-04 | lama | h/slo/wall-/mixed | 0.861✗ | g:0.0%/m:0.0%✓ | 5.3%✗ | 0.72✓ | 1.6s✓ | $0.180✓ | **✗** |
| room-05 | bria | m/lon/shag-/harsh | 0.940✗ | g:2.5%/m:2.3%✗ | 11.0%✗ | 0.88✓ | 10.2s✓ | $0.180✓ | **✗** |
| room-06 | lama | n/bay/hardw/brigh | 1.000✓ | g:0.0%/m:0.0%✓ | 0.2%✓ | 0.92✓ | 2.8s✓ | $0.180✓ | **✓** |
| room-07 | lama | m/lon/carpe/harsh | 0.705✗ | g:0.0%/m:0.0%✓ | 1.8%✓ | 0.73✓ | 5.6s✓ | $0.180✓ | **✗** |
| room-08 | bria | m/lon/flora/soft- | 0.928✗ | g:0.6%/m:0.5%✓ | 10.3%✗ | 0.78✓ | 11.1s✓ | $0.180✓ | **✗** |
| room-09 | lama | h/cor/popco/lamp- | 0.999✓ | g:9.4%/m:4.9%✗ | 6.7%✗ | 0.65✗ | 6.4s✓ | $0.180✓ | **✗** |
| room-10 | lama | m/lon/plush/tv-gl | 0.922✗ | g:0.0%/m:0.0%✓ | 5.6%✗ | 0.61✗ | 7.9s✓ | $0.180✓ | **✗** |
| room-11 | bria | h/lon/moroc/warm- | 0.923✗ | g:21.0%/m:9.0%✗ | 10.0%✗ | 0.96✓ | 9.5s✓ | $0.180✓ | **✗** |
| room-12 | lama | m/cor/hardw/dayli | 1.000✓ | g:0.0%/m:0.0%✓ | 10.7%✗ | 0.60✗ | 5.5s✓ | $0.180✓ | **✗** |
| room-13 | lama | l/cor/expos/soft- | 1.000✓ | g:0.8%/m:0.0%✓ | 3.5%✗ | 0.85✓ | 7.8s✓ | $0.180✓ | **✗** |
| room-14 | lama | n/lon/stack/mixed | 0.430✗ | g:0.0%/m:0.0%✓ | 6.5%✗ | 0.75✓ | 4.7s✓ | $0.180✓ | **✗** |
| room-15 | bria | h/cor/wood-/soft- | 0.935✗ | g:18.5%/m:16.5%✗ | 5.4%✗ | 0.86✓ | 7.8s✓ | $0.180✓ | **✗** |

**Overall pass rate:** 1/15  

## Per-inpainter pass-rate table

| Inpainter | Rooms routed | Passed | Pass rate |
|---|---|---|---|
| LaMa | 10 | 1 | 10% |
| Bria | 5 | 0 | 0% |
| **Total** | **15** | **1** | **7%** |

### Per-metric breakdown within each inpainter group

| Metric | LaMa pass | Bria pass |
|---|---|---|
| SSIM ≥0.97 | 5/10 | 1/5 |
| Ghost <1.0% (LaMa=inside-mask, Bria=global) | 8/10 | 1/5 |
| VP <3.0% | 2/10 | 0/5 |
| EDR 0.7–1.3 | 6/10 | 5/5 |
| Lat ≤60.0s | 10/10 | 5/5 |
| Cost ≤$0.5 | 10/10 | 5/5 |

## Router policy assessment

**Router threshold:** 35.0% dilated coverage (provisional — Phase 1 hardening will calibrate)  
**LaMa rooms:** 10 | **Bria rooms:** 5  

Both inpainters failing — router doesn't address the underlying problem. Failures are not coverage-related. Investigate whether failures cluster on specific geometry types, lighting conditions, or prompt-list gaps.

## H2 hard-exit retest (Run 1.5 → Run 3 delta)

Expected behavior:
- room-01 (24.7% coverage): LaMa-routed → substantial SSIM improvement over Bria Run 1.5
- room-09 (24.9% coverage): LaMa-routed → substantial SSIM improvement over Bria Run 1.5
- room-11 (50.7% coverage): Bria-routed → similar to Run 1.5 (Bria handles high-coverage; no improvement expected from routing)

| Room | Inpainter | Run 1.5 SSIM | Run 3 SSIM | Δ |
|---|---|---|---|---|
| room-01 | lama | 0.9402 | 0.9995 | +0.0593 |
| room-09 | lama | 0.9297 | 0.9989 | +0.0692 |
| room-11 | bria | 0.9193 | 0.9234 | +0.0042 |

## Stratification analysis

- **Clutter:** heavy: 0/4 · light: 0/3 · medium: 0/6 · none: 1/2
- **Geometry:** bay-window-niche: 1/1 · corner: 0/6 · long-perspective: 0/7 · sloped-ceiling: 0/1
- **Texture:** carpet: 0/1 · exposed-brick: 0/1 · floral-rug: 0/1 · hardwood-grain: 1/1 · hardwood-plank: 0/1 · herringbone-parquet: 0/1 · moroccan-rug: 0/1 · plank-floor: 0/1 · plush-carpet: 0/1 · popcorn-ceiling: 0/2 · shag-rug-pattern: 0/1 · stacked-stone: 0/1 · wall-molding-break: 0/1 · wood-paneling: 0/1
- **Lighting:** bright-natural: 1/1 · daylight-plus-led: 0/1 · harsh-backlit: 0/1 · harsh-directional: 0/3 · lamp-lit-mixed: 0/1 · mixed-backlit: 0/1 · mixed-window-fixture: 0/1 · soft-daylight: 0/2 · soft-overcast: 0/2 · tv-glow-only: 0/1 · warm-evening-lamp: 0/1

## Failure mode summary

- **room-01** [lama] (light/corner/popcorn-ceiling/harsh-directional): ghost (ghost_inside_mask_pct) 6.0% ≥ 1.0%; VP 9.5% ≥ 3.0%; EDR 0.51 outside [0.7,1.3]
- **room-02** [lama] (medium/long-perspective/plank-floor/soft-overcast): SSIM 0.714 < 0.97; VP 7.6% ≥ 3.0%
- **room-03** [bria] (light/corner/herringbone-parquet/harsh-directional): ghost (ghost_furniture_area_pct) 1.2% ≥ 1.0%; VP 17.5% ≥ 3.0%
- **room-04** [lama] (heavy/sloped-ceiling/wall-molding-break/mixed-backlit): SSIM 0.861 < 0.97; VP 5.3% ≥ 3.0%
- **room-05** [bria] (medium/long-perspective/shag-rug-pattern/harsh-backlit): SSIM 0.940 < 0.97; ghost (ghost_furniture_area_pct) 2.5% ≥ 1.0%; VP 11.0% ≥ 3.0%
- **room-07** [lama] (medium/long-perspective/carpet/harsh-directional): SSIM 0.705 < 0.97
- **room-08** [bria] (medium/long-perspective/floral-rug/soft-overcast): SSIM 0.928 < 0.97; VP 10.3% ≥ 3.0%
- **room-09** [lama] (heavy/corner/popcorn-ceiling/lamp-lit-mixed): ghost (ghost_inside_mask_pct) 4.9% ≥ 1.0%; VP 6.7% ≥ 3.0%; EDR 0.65 outside [0.7,1.3]
- **room-10** [lama] (medium/long-perspective/plush-carpet/tv-glow-only): SSIM 0.922 < 0.97; VP 5.6% ≥ 3.0%; EDR 0.61 outside [0.7,1.3]
- **room-11** [bria] (heavy/long-perspective/moroccan-rug/warm-evening-lamp): SSIM 0.923 < 0.97; ghost (ghost_furniture_area_pct) 21.0% ≥ 1.0%; VP 10.0% ≥ 3.0%
- **room-12** [lama] (medium/corner/hardwood-plank/daylight-plus-led): VP 10.7% ≥ 3.0%; EDR 0.60 outside [0.7,1.3]
- **room-13** [lama] (light/corner/exposed-brick/soft-daylight): VP 3.5% ≥ 3.0%
- **room-14** [lama] (none/long-perspective/stacked-stone/mixed-window-fixture): SSIM 0.430 < 0.97; VP 6.5% ≥ 3.0%
- **room-15** [bria] (heavy/corner/wood-paneling/soft-daylight): SSIM 0.935 < 0.97; ghost (ghost_furniture_area_pct) 18.5% ≥ 1.0%; VP 5.4% ≥ 3.0%

## Gate recommendation

**HALT — hybrid routing isn't solving the problem; surface for review before further spend**

<10/15 pass rate (1/15). Hybrid routing is not achieving acceptable quality. Options: expand prompt list, investigate non-coverage failure modes, or escalate to Canny+FLUX secondary path from §3.5.

### Gate decision tree applied
- ≥13/15 → EMPTY-ROOM STAGE LOCKED — proceed to Phase 5
- 10–12/15 → inspect failures → PROCEED WITH DOCUMENTED CAVEAT or INVESTIGATE
- <10/15 → HALT
- Result: 1/15 → **HALT**

## Cost reconciliation

- Per-room cost: $0.180 (20 SAM-3 primary + 8 SAM-3 ghost + 1 inpainter @ $0.04)  
- Rescan gate: REMOVED (was $0.10/room overhead, 0pp benefit)  
- LaMa rooms: 10 × $0.180 = $1.80  
- Bria rooms: 5 × $0.180 = $0.90  
- 15-room total: $2.70  
- Hard cap: $6.00  
- Status: WITHIN CAP
