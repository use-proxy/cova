# Phase 0.5 Run 1 — Empty-Room Bench Summary

**Date:** 2026-04-20  
**Input:** 15 rooms from `bench/manifest.json`  
**Path tested:** Bria Eraser (`fal-ai/bria/eraser`) primary, SAM-3 furniture union + 16px dilation  
**Total cost:** $2.03 (target ≤ $5, hard cap $10)  
**Total wall-clock (sum of per-room):** 333s (run concurrent ×3)  
**Pass rate:** 0/15 rooms (gate: ≥13)  
**Mean SSIM-unmasked:** 0.9494 (§3.4 rollup needs ≥ 0.99)  

## Per-room results

| Room | Strat (clutter/geom/tex/light) | SSIM ≥0.985 | Ghost ≤0.5% | VP <2% | EDR 0.7–1.3 | Lat ≤90s | Cost ≤$0.50 | **PASS** |
|---|---|---|---|---|---|---|---|---|
| room-01 | l/cor/popco/harsh | 0.942✗ | 6.8%✗ | 2.5%✗ | 0.81✓ | 8.8s✓ | $0.135✓ | **✗** |
| room-02 | m/lon/plank/soft- | 0.931✗ | 6.4%✗ | 2.2%✗ | 0.85✓ | 8.3s✓ | $0.135✓ | **✗** |
| room-03 | l/cor/herri/harsh | 0.972✗ | 2.6%✗ | 14.7%✗ | 0.86✓ | 10.5s✓ | $0.135✓ | **✗** |
| room-04 | h/slo/wall-/mixed | 0.968✗ | 7.7%✗ | 1.1%✓ | 0.73✓ | 9.0s✓ | $0.135✓ | **✗** |
| room-05 | m/lon/shag-/harsh | 0.951✗ | 21.6%✗ | 2.7%✗ | 1.00✓ | 12.9s✓ | $0.135✓ | **✗** |
| room-06 | n/bay/hardw/brigh | 0.985✗ | 0.0%✓ | 1.2%✓ | 1.11✓ | 7.6s✓ | $0.135✓ | **✗** |
| room-07 | m/lon/carpe/harsh | 0.938✗ | 0.0%✓ | 3.3%✗ | 0.96✓ | 10.8s✓ | $0.135✓ | **✗** |
| room-08 | m/lon/flora/soft- | 0.937✗ | 1.8%✗ | 7.8%✗ | 0.90✓ | 8.0s✓ | $0.135✓ | **✗** |
| room-09 | h/cor/popco/lamp- | 0.936✗ | 0.0%✓ | 5.8%✗ | 0.86✓ | 12.3s✓ | $0.135✓ | **✗** |
| room-10 | m/lon/plush/tv-gl | 0.959✗ | 8.8%✗ | 6.9%✗ | 0.33✗ | 9.7s✓ | $0.135✓ | **✗** |
| room-11 | h/lon/moroc/warm- | 0.935✗ | 10.2%✗ | 10.9%✗ | 0.89✓ | 8.9s✓ | $0.135✓ | **✗** |
| room-12 | m/cor/hardw/dayli | 0.958✗ | 8.7%✗ | 4.1%✗ | 0.70✗ | 8.8s✓ | $0.135✓ | **✗** |
| room-13 | l/cor/expos/soft- | 0.964✗ | 0.8%✗ | 2.6%✗ | 0.86✓ | 8.5s✓ | $0.135✓ | **✗** |
| room-14 | n/lon/stack/mixed | 0.923✗ | 0.0%✓ | 4.1%✗ | 0.34✗ | 11.2s✓ | $0.135✓ | **✗** |
| room-15 | h/cor/wood-/soft- | 0.943✗ | 15.1%✗ | 5.1%✗ | 0.98✓ | 7.9s✓ | $0.135✓ | **✗** |

## Stratification analysis (pass counts)

- **Clutter:** light: 0/3 · medium: 0/6 · heavy: 0/4 · none: 0/2
- **Geometry:** corner: 0/6 · long-perspective: 0/7 · sloped-ceiling: 0/1 · bay-window-niche: 0/1
- **Texture:** popcorn-ceiling: 0/2 · plank-floor: 0/1 · herringbone-parquet: 0/1 · wall-molding-break: 0/1 · shag-rug-pattern: 0/1 · hardwood-grain: 0/1 · carpet: 0/1 · floral-rug: 0/1 · plush-carpet: 0/1 · moroccan-rug: 0/1 · hardwood-plank: 0/1 · exposed-brick: 0/1 · stacked-stone: 0/1 · wood-paneling: 0/1
- **Lighting:** harsh-directional: 0/3 · soft-overcast: 0/2 · mixed-backlit: 0/1 · harsh-backlit: 0/1 · bright-natural: 0/1 · lamp-lit-mixed: 0/1 · tv-glow-only: 0/1 · warm-evening-lamp: 0/1 · daylight-plus-led: 0/1 · soft-daylight: 0/2 · mixed-window-fixture: 0/1

## Failure mode summary

- **room-01** (light/corner/popcorn-ceiling/harsh-directional): SSIM 0.942 < 0.985; ghost 6.8% > 0.5%; VP 2.5% ≥ 2%
- **room-02** (medium/long-perspective/plank-floor/soft-overcast): SSIM 0.931 < 0.985; ghost 6.4% > 0.5%; VP 2.2% ≥ 2%
- **room-03** (light/corner/herringbone-parquet/harsh-directional): SSIM 0.972 < 0.985; ghost 2.6% > 0.5%; VP 14.7% ≥ 2%
- **room-04** (heavy/sloped-ceiling/wall-molding-break/mixed-backlit): SSIM 0.968 < 0.985; ghost 7.7% > 0.5%
- **room-05** (medium/long-perspective/shag-rug-pattern/harsh-backlit): SSIM 0.951 < 0.985; ghost 21.6% > 0.5%; VP 2.7% ≥ 2%
- **room-06** (none/bay-window-niche/hardwood-grain/bright-natural): SSIM 0.985 < 0.985
- **room-07** (medium/long-perspective/carpet/harsh-directional): SSIM 0.938 < 0.985; VP 3.3% ≥ 2%
- **room-08** (medium/long-perspective/floral-rug/soft-overcast): SSIM 0.937 < 0.985; ghost 1.8% > 0.5%; VP 7.8% ≥ 2%
- **room-09** (heavy/corner/popcorn-ceiling/lamp-lit-mixed): SSIM 0.936 < 0.985; VP 5.8% ≥ 2%
- **room-10** (medium/long-perspective/plush-carpet/tv-glow-only): SSIM 0.959 < 0.985; ghost 8.8% > 0.5%; VP 6.9% ≥ 2%; EDR 0.33 outside [0.7,1.3]
- **room-11** (heavy/long-perspective/moroccan-rug/warm-evening-lamp): SSIM 0.935 < 0.985; ghost 10.2% > 0.5%; VP 10.9% ≥ 2%
- **room-12** (medium/corner/hardwood-plank/daylight-plus-led): SSIM 0.958 < 0.985; ghost 8.7% > 0.5%; VP 4.1% ≥ 2%; EDR 0.70 outside [0.7,1.3]
- **room-13** (light/corner/exposed-brick/soft-daylight): SSIM 0.964 < 0.985; ghost 0.8% > 0.5%; VP 2.6% ≥ 2%
- **room-14** (none/long-perspective/stacked-stone/mixed-window-fixture): SSIM 0.923 < 0.985; VP 4.1% ≥ 2%; EDR 0.34 outside [0.7,1.3]
- **room-15** (heavy/corner/wood-paneling/soft-daylight): SSIM 0.943 < 0.985; ghost 15.1% > 0.5%; VP 5.1% ≥ 2%

## Near-misses (single-metric failures)

- **room-06** failed only on `ssim_unmasked`

## Gate decision

❌ **FAIL — PRIMARY PATH INADEQUATE** — <10/15 pass on §3.4 strict thresholds. Daksh decides: test Canny+FLUX secondary, test LaMa tertiary, or reconsider architecture.

## Open questions for Daksh

1. **Is §3.4 SSIM-unmasked ≥ 0.985 realistic for amateur phone photography?** Control room-06 (near-empty bay window) hit SSIM 0.985 exactly — the threshold is at the noise floor of Bria's resampling/compression pipeline even without meaningful erasure. Any real erasure pushes it lower.
2. **SAM-3 furniture coverage is frequently incomplete.** Room-13 (2.3% raw) and room-14 (1.3% raw) are flagged as low-coverage — the furniture those rooms contain (exposed brick furniture, stacked-stone built-ins) may need different prompts. Should the primary-mask prompt list be expanded (ottoman, bench, stool, bookshelf, artwork, curtains) or should we accept that SAM-3 is a lower-bound and dilation compensates?
3. **Ghost-furniture failures correlate with high-texture inputs.** Rooms with patterned rugs / wood paneling (room-05 21.6%, room-15 15.1%) trigger more ghosts, suggesting Bria's generative continuation mis-reads texture as furniture silhouette.
4. **VP-shift proxy.** My implementation is a line-midpoint centroid distance, not true RANSAC vanishing-point estimation. Values are on an unknown scale — the 2% threshold may not map cleanly. Research §3.4 says "LSD line detector" without specifying the VP aggregation. Flagging this as a metric-implementation ambiguity, not a Bria failure.
5. **Recommendation for Run 2:** Before testing fallbacks, consider (a) widening the §3.4 SSIM threshold to 0.97 based on empirical ceiling, (b) expanding the SAM-3 prompt list, (c) A/B against `fal-ai/bria/eraser` prompt-free mode if it exists (our current run passes explicit mask).

## Per-room cost reconciliation

Per-room projected: $0.135 (11 SAM-3 primary + 8 SAM-3 ghost + 1 Bria)  
Per-room observed: $0.135 avg  
Total: $2.03
