# Phase 0.5 Run 1.5 — Rescoring Summary

**Calibrated thresholds applied.** Noise floor measured: SSIM 0.98497 ± 3.3e-6 (4 room-06 repeats).
**Valid rooms:** 15/15

## 1. Per-Metric Pass Rate

| Metric | New Threshold | Pass Count |
|--------|--------------|------------|
| SSIM unmasked | ≥ 0.97 | 1/15 |
| Ghost furniture area | < 1.0% | 6/15 |
| VP shift | < 3% | 3/15 |
| Edge density ratio | 0.7–1.3 | 11/15 |
| Bria latency | ≤ 60s | 15/15 |
| Cost per room | ≤ $0.50 | 15/15 |

## 2. Overall Pass Rate (all 6 metrics must pass)

**1/15** rooms pass all 6 calibrated thresholds.

## 3. Ghost-Furniture Distribution

Sorted descending by ghost area %. Rooms >5% flagged as outliers.

| Room | Ghost Area % | Outlier |
|------|-------------|---------|
| room-15 | 16.3519% | YES — OUTLIER |
| room-11 | 10.3346% | YES — OUTLIER |
| room-04 | 9.1659% | YES — OUTLIER |
| room-01 | 6.7343% | YES — OUTLIER |
| room-12 | 6.2356% | YES — OUTLIER |
| room-03 | 3.3297% |  |
| room-05 | 2.3850% |  |
| room-02 | 2.3489% |  |
| room-08 | 1.5933% |  |
| room-13 | 0.9230% |  |
| room-06 | 0.0000% |  |
| room-07 | 0.0000% |  |
| room-09 | 0.0000% |  |
| room-10 | 0.0000% |  |
| room-14 | 0.0000% |  |

## 4. VP-Shift Distribution

Sorted descending by VP shift %.

| Room | VP Shift % |
|------|-----------|
| room-03 | 13.5585% |
| room-11 | 10.8560% |
| room-12 | 9.4290% |
| room-08 | 6.9690% |
| room-10 | 6.9466% |
| room-09 | 5.3717% |
| room-14 | 4.6569% |
| room-02 | 4.5102% |
| room-07 | 3.4413% |
| room-15 | 3.3440% |
| room-05 | 3.3147% |
| room-01 | 3.2262% |
| room-13 | 2.8413% |
| room-04 | 2.5014% |
| room-06 | 1.1604% |

## 5. Verdict Flips vs Run 1.5 Strict

Under Run 1.5 strict thresholds, all 15 rooms failed. Under calibrated thresholds:

### Now-Passing Rooms

| Room | Metrics that flipped to PASS |
|------|------------------------------|
| room-06 | ssim_unmasked |

### Still-Failing Rooms

| Room | Failing Metrics |
|------|----------------|
| room-01 | ssim_unmasked, ghost_furniture, vp_shift |
| room-02 | ssim_unmasked, ghost_furniture, vp_shift |
| room-03 | ssim_unmasked, ghost_furniture, vp_shift |
| room-04 | ssim_unmasked, ghost_furniture |
| room-05 | ssim_unmasked, ghost_furniture, vp_shift |
| room-07 | ssim_unmasked, vp_shift |
| room-08 | ssim_unmasked, ghost_furniture, vp_shift |
| room-09 | ssim_unmasked, vp_shift, edge_density |
| room-10 | ssim_unmasked, vp_shift, edge_density |
| room-11 | ssim_unmasked, ghost_furniture, vp_shift |
| room-12 | ssim_unmasked, ghost_furniture, vp_shift, edge_density |
| room-13 | ssim_unmasked |
| room-14 | ssim_unmasked, vp_shift, edge_density |
| room-15 | ssim_unmasked, ghost_furniture, vp_shift |

## 6. Failure Modes for Still-Failing Rooms

### room-01
- **structural drift (SSIM)**: SSIM = 0.940176 (need ≥ 0.97)
- **ghost furniture**: ghost = 6.7343% (need < 1.0%)
- **VP shift**: VP shift = 3.2262% (need < 3%)

### room-02
- **structural drift (SSIM)**: SSIM = 0.926908 (need ≥ 0.97)
- **ghost furniture**: ghost = 2.3489% (need < 1.0%)
- **VP shift**: VP shift = 4.5102% (need < 3%)

### room-03
- **structural drift (SSIM)**: SSIM = 0.969938 (need ≥ 0.97)
- **ghost furniture**: ghost = 3.3297% (need < 1.0%)
- **VP shift**: VP shift = 13.5585% (need < 3%)

### room-04
- **structural drift (SSIM)**: SSIM = 0.967326 (need ≥ 0.97)
- **ghost furniture**: ghost = 9.1659% (need < 1.0%)

### room-05
- **structural drift (SSIM)**: SSIM = 0.938518 (need ≥ 0.97)
- **ghost furniture**: ghost = 2.3850% (need < 1.0%)
- **VP shift**: VP shift = 3.3147% (need < 3%)

### room-07
- **structural drift (SSIM)**: SSIM = 0.938099 (need ≥ 0.97)
- **VP shift**: VP shift = 3.4413% (need < 3%)

### room-08
- **structural drift (SSIM)**: SSIM = 0.917678 (need ≥ 0.97)
- **ghost furniture**: ghost = 1.5933% (need < 1.0%)
- **VP shift**: VP shift = 6.9690% (need < 3%)

### room-09
- **structural drift (SSIM)**: SSIM = 0.929739 (need ≥ 0.97)
- **VP shift**: VP shift = 5.3717% (need < 3%)
- **edge density**: edge density ratio = 0.6537 (need 0.7–1.3)

### room-10
- **structural drift (SSIM)**: SSIM = 0.951228 (need ≥ 0.97)
- **VP shift**: VP shift = 6.9466% (need < 3%)
- **edge density**: edge density ratio = 0.4589 (need 0.7–1.3)

### room-11
- **structural drift (SSIM)**: SSIM = 0.919259 (need ≥ 0.97)
- **ghost furniture**: ghost = 10.3346% (need < 1.0%)
- **VP shift**: VP shift = 10.8560% (need < 3%)

### room-12
- **structural drift (SSIM)**: SSIM = 0.957425 (need ≥ 0.97)
- **ghost furniture**: ghost = 6.2356% (need < 1.0%)
- **VP shift**: VP shift = 9.4290% (need < 3%)
- **edge density**: edge density ratio = 0.6140 (need 0.7–1.3)

### room-13
- **structural drift (SSIM)**: SSIM = 0.963682 (need ≥ 0.97)

### room-14
- **structural drift (SSIM)**: SSIM = 0.919829 (need ≥ 0.97)
- **VP shift**: VP shift = 4.6569% (need < 3%)
- **edge density**: edge density ratio = 0.5471 (need 0.7–1.3)

### room-15
- **structural drift (SSIM)**: SSIM = 0.936119 (need ≥ 0.97)
- **ghost furniture**: ghost = 16.3519% (need < 1.0%)
- **VP shift**: VP shift = 3.3440% (need < 3%)

## 7. Gate Recommendation

**Overall pass rate: 1/15**

**Recommendation: REVIEW SPECIFIC FAILURES BEFORE FURTHER SPEND — issue is not just thresholds**

Fewer than 10/15 rooms pass. The dominant failure modes listed in Section 6 indicate systemic issues that threshold relaxation alone cannot resolve. Review root causes before additional fal spend.

## Ghost <1% Threshold — Justification

The spec proposed ghost < 1.0% (up from 0.5%) to absorb SAM 3 re-run false positives. This threshold is **accepted**. Rationale: SAM 3 is a prompt-conditioned segmenter and produces measurable false-positive masks on items that were never inpainted (e.g. 'bed' prompt triggering on a headboard shadow). The noise is observed at 0.27–0.92% on clean rooms. The 1.0% ceiling keeps legitimate ghosts (>1%) as failures while absorbing SAM 3 prompt bleed. Rooms at 1.59%–16.35% represent genuine re-appearance of removed furniture, not false positives, and correctly fail.

**Note on latency threshold:** Changed from 90s to 60s to reflect observed Bria p95 of ~27s across this run (max = 26.9s). All 15 rooms pass latency under both thresholds; the tighter 60s limit is a signal-quality improvement with no current cost.

## Appendix — Raw Metric Values

| Room | SSIM | Ghost% | VP Shift% | Edge Ratio | Bria Lat(s) | Cost($) | NEW Pass |
|------|------|--------|-----------|-----------|------------|---------|----------|
| room-01 | 0.940176 | 6.7343 | 3.2262 | 0.9423 | 8.14 | 0.180 | FAIL |
| room-02 | 0.926908 | 2.3489 | 4.5102 | 1.0958 | 10.29 | 0.180 | FAIL |
| room-03 | 0.969938 | 3.3297 | 13.5585 | 0.9385 | 15.39 | 0.180 | FAIL |
| room-04 | 0.967326 | 9.1659 | 2.5014 | 0.7375 | 9.37 | 0.180 | FAIL |
| room-05 | 0.938518 | 2.3850 | 3.3147 | 0.9357 | 9.64 | 0.180 | FAIL |
| room-06 | 0.984968 | 0.0000 | 1.1604 | 1.1440 | 9.76 | 0.180 | PASS |
| room-07 | 0.938099 | 0.0000 | 3.4413 | 0.9784 | 9.68 | 0.180 | FAIL |
| room-08 | 0.917678 | 1.5933 | 6.9690 | 1.0064 | 23.92 | 0.180 | FAIL |
| room-09 | 0.929739 | 0.0000 | 5.3717 | 0.6537 | 26.93 | 0.180 | FAIL |
| room-10 | 0.951228 | 0.0000 | 6.9466 | 0.4589 | 10.84 | 0.180 | FAIL |
| room-11 | 0.919259 | 10.3346 | 10.8560 | 1.1031 | 10.20 | 0.180 | FAIL |
| room-12 | 0.957425 | 6.2356 | 9.4290 | 0.6140 | 8.62 | 0.180 | FAIL |
| room-13 | 0.963682 | 0.9230 | 2.8413 | 0.9423 | 17.36 | 0.180 | FAIL |
| room-14 | 0.919829 | 0.0000 | 4.6569 | 0.5471 | 16.59 | 0.180 | FAIL |
| room-15 | 0.936119 | 16.3519 | 3.3440 | 0.8259 | 9.08 | 0.180 | FAIL |
