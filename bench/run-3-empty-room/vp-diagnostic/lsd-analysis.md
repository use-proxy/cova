# LSD Line Analysis — room-01

**Production VP metric value (Run 3):** 9.4984%
**VP threshold:** 3.0% → FAIL

---

## 1. Stats Table

| Metric | All Lines (≥20px) | Longest-20% (architectural) |
|---|---|---|
| Lines in input | 551 | 111 |
| Lines in output | 309 | 62 |
| Centroid (input) | (640.3, 1020.5) | (703.6, 953.0) |
| Centroid (output) | (631.1, 912.5) | (725.2, 924.1) |
| Centroid Δ (% image width) | **10.0374%** | **3.3404%** |

---

## 2. Qualitative Assessment

The input is a bedroom with a bed, rug, lamp, and cat — light clutter (mask_coverage_dilated 24.7%).
The LaMa inpainter removes the rug (~12.3% coverage) and bed (~6.8% coverage).

When all qualifying lines are considered, the centroid shifts by 10.04% of image width between input
and output. However, when filtering to the longest 20% of line segments — which preferentially capture long
continuous edges of walls, floor boundaries, window frames, door jambs, and ceiling lines — the centroid
shift drops to 3.34%.

This gap (6.70 percentage points) indicates that short-to-medium furniture line segments
(bed frame edges, rug border lines, lamp silhouette) are contributing disproportionately to the centroid
displacement in the production metric. Removing these segments from the scene changes the population of lines
LSD detects, pulling the centroid even when the underlying architectural perspective geometry is unchanged.

---

## 3. Verdict

**Mixed**

The longest-20% (architectural) lines show a centroid shift of 3.34% — marginally above the 3% threshold. However, the top-20% length filter is NOT selective: the line-count drop rate is 44% for all-lines and 44% for arch-lines (gap <8pp). This means long-edge furniture lines (bed frames, rug borders) persist in the top-20% subset, and their removal still contributes to the arch-line centroid shift. Cannot reliably distinguish furniture-removal artifact from true architectural drift at this room. What is stable: the wall geometry (the centroid did not leap across the frame). What is uncertain: whether the 3.34% residual shift is caused by the bed/rug lines that survived the filter or by genuine camera-warp from inpainting.

**Verdict tag:** `mixed`
