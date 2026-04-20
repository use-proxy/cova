# Phase 0.5 — Inverted-Mask Probe: Summary

## 1. Hypothesis

Prior bench runs masked furniture (positive selection) and asked the inpainter to remove it. Failure modes: Bria mask-mode drifts unmasked architectural pixels (H2); LaMa collapses on >40% mask coverage (room-11); LaMa drifts on high-frequency-texture inputs (room-02 piano floor, room-14 stacked stone); SAM 3 furniture mask is incomplete on cluttered scenes.

Inverted-mask flips the framing: SAM 3 segments architectural elements (wall/ceiling/floor/window/etc.); we invert to get an erase-everything-else mask; pass to Bria. The inpainter has a complete furniture-region to fill rather than chasing missed furniture instances. Architecture is explicitly kept via the SAM 3 architectural mask.

## 2. Per-Room Results

| Room | Erased % | Kept-patch coords | Kept-patch std | Kept-patch SSIM | Run 3 SSIM (whole) | Verdict | Failure note |
|------|----------|-------------------|----------------|-----------------|---------------------|---------|--------------|
| room-02 | 37.83% | y=0:200, x=80:280 | 7.2 | 0.932711 | 0.714484 | broken (kept-patch SSIM 0.9327<0.95) | SAM3 missed: door, built-in cabinet, fireplace, crown molding, wainscoting, staircase railing |
| room-11 | 69.22% | none found | None | None | 0.923426 | broken (no kept patch found) | — |
| room-14 | 4.55% | y=0:200, x=620:820 | 5.88 | 0.997007 | 0.430205 | coherent | — |

## 3. Per-Prompt SAM 3 Hits

| Prompt | room-02 | room-11 | room-14 |
|--------|--------|--------|--------|
| wall | 2 hit(s), 14.9% | 3 hit(s), 19.8% | 3 hit(s), 30.9% |
| ceiling | 3 hit(s), 45.0% | 0 hits | 1 hit(s), 21.0% |
| floor | 1 hit(s), 19.2% | 1 hit(s), 2.7% | 1 hit(s), 36.8% |
| window | 5 hit(s), 1.9% | 1 hit(s), 1.3% | 1 hit(s), 0.8% |
| door | 0 hits | 2 hit(s), 8.0% | 2 hit(s), 0.5% |
| window frame | 5 hit(s), 1.1% | 0 hits | 1 hit(s), 0.5% |
| built-in cabinet | 0 hits | 0 hits | 1 hit(s), 1.0% |
| fireplace | 0 hits | 1 hit(s), 0.5% | 1 hit(s), 0.3% |
| radiator | 2 hit(s), 1.0% | 0 hits | 0 hits |
| baseboard | 1 hit(s), 0.1% | 1 hit(s), 0.1% | 2 hit(s), 0.3% |
| crown molding | 0 hits | 0 hits | 4 hit(s), 4.8% |
| exposed beam | 1 hit(s), 2.4% | 0 hits | 0 hits |
| wainscoting | 0 hits | 0 hits | 0 hits |
| staircase railing | 0 hits | 0 hits | 0 hits |

## 4. Triptych References

- **room-02**: `bench/probe-inverted-mask/triptych/room-02.png`
- **room-11**: `bench/probe-inverted-mask/triptych/room-11.png`
- **room-14**: `bench/probe-inverted-mask/triptych/room-14.png`

## 5. Comparison to Run 3

> Note: kept-patch SSIM (this probe) measures a 200x200 architectural patch inside the kept region only. Run 3 ssim_unmasked covers all pixels outside the furniture mask — a different denominator. Direction is informative; absolute values are not directly comparable.

- **room-02**: probe kept-patch SSIM=0.9327 vs Run 3 whole-unmasked SSIM=0.7145 (higher by 0.2182). Verdict: broken (kept-patch SSIM 0.9327<0.95). SAM3 missed: door, built-in cabinet, fireplace, crown molding, wainscoting, staircase railing
- **room-11**: probe_ssim=None run3_ssim=0.923426. Verdict: broken (no kept patch found).
- **room-14**: probe kept-patch SSIM=0.9970 vs Run 3 whole-unmasked SSIM=0.4302 (higher by 0.5668). Verdict: coherent. 

## 6. Recommendation

**B — 1/3 coherent.** Hybrid decision. Inverted-mask works for ['room-14']; failed on ['room-02', 'room-11'] because room-02: SAM3 missed: door, built-in cabinet, fireplace, crown molding, wainscoting, staircase railing; room-11: broken (no kept patch found). Recommend testing on 5 more diverse rooms before committing pipeline change.

**Total cost: $0.3300**
