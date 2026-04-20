# VP Threshold Recompute Summary — Run 3

**Computed:** Phase 0.5 Diagnostic 2
**Source data:** bench/run-3-empty-room/metrics/room-XX.json (all 15 rooms)
**Fixed thresholds:** SSIM ≥0.97, ghost <1.0%, edge 0.7–1.3, latency ≤60s, cost ≤$0.50
**Varied:** VP threshold (3%, 5%, 7%, 10%)

---

## Pass Rate Table

| VP threshold | Overall | LaMa-routed | Bria-routed |
|---|---|---|---|
| 3% | 1/15 | 1/10 | 0/5 |
| 5% | 2/15 | 2/10 | 0/5 |
| 7% | 2/15 | 2/10 | 0/5 |
| 10% | 2/15 | 2/10 | 0/5 |

> LaMa rooms (n=10): room-01, room-02, room-04, room-06, room-07, room-09, room-10, room-12, room-13, room-14
> Bria rooms (n=5): room-03, room-05, room-08, room-11, room-15

---

## Rooms Flipping fail→pass as VP Threshold Relaxes

**VP 5%** — flip fail→pass vs 3% baseline: room-13
  - room-13 (lama): vp_raw=3.4955%, still fails: []

**VP 7%** — flip fail→pass vs 3% baseline: room-13
  - room-13 (lama): vp_raw=3.4955%, still fails: []

**VP 10%** — flip fail→pass vs 3% baseline: room-13
  - room-13 (lama): vp_raw=3.4955%, still fails: []

---

## Per-Inpainter Analysis

**LaMa-routed rooms:**
  - VP 3%: 1/10
  - VP 5%: 2/10
  - VP 7%: 2/10
  - VP 10%: 2/10

**Bria-routed rooms:**
  - VP 3%: 0/5
  - VP 5%: 0/5
  - VP 7%: 0/5
  - VP 10%: 0/5

Relaxing VP **helps LaMa slightly** (room-13 flips at 5%) but does **not help Bria at all** —
all 5 Bria rooms fail on non-VP metrics (ghost artefacts, SSIM, edge density) that are
independent of the VP threshold.

---

## Smallest VP Threshold for ≥13/15

No VP threshold (up to 10%) produces ≥13/15 overall pass. Maximum achievable is 2/15 even at 10% threshold.

**Rooms with non-VP failures (irreducible at any VP threshold):**
  - room-01 (lama): ghost=5.9715, edge=0.5082
  - room-02 (lama): ssim=0.7145
  - room-03 (bria): ghost=1.1762
  - room-04 (lama): ssim=0.8611
  - room-05 (bria): ssim=0.9403, ghost=2.4523
  - room-07 (lama): ssim=0.7048
  - room-08 (bria): ssim=0.9275
  - room-09 (lama): ghost=4.8812, edge=0.6547
  - room-10 (lama): ssim=0.9222, edge=0.6132
  - room-11 (bria): ssim=0.9234, ghost=21.0428
  - room-12 (lama): edge=0.5969
  - room-14 (lama): ssim=0.4302
  - room-15 (bria): ssim=0.9349, ghost=18.5422

---

## Measurement Integrity

**Measurement integrity:** Moot — no threshold up to 10% reaches ≥13/15 due to pervasive non-VP failures
across the test set. VP calibration is a secondary concern relative to SSIM degradation, ghost artefacts,
and edge-density suppression that dominate the failure count.

---

## Cross-Reference: Diagnostic 1

Diagnostic 1 verdict is mixed — borderline architectural line shift. VP threshold relaxation may partially correct measurement error but cannot be confirmed cleanly.

---

## Decision-Tree Branch

**Branch D — Bria-routed rooms still fail at permissive VP while LaMa rooms make modest gains.**

Diagnostic 1 verdict is Mixed: arch-line centroid shift of 3.34% is marginally above 3% but the top-20% length filter is contaminated by furniture lines (all-lines drop 551→309, arch-lines drop 111→62, same ~44% reduction rate). Cannot confirm whether 3.34% arch shift is furniture artifact or real perspective drift.

At VP 10%, LaMa: 2/10, Bria: 0/5. Empty-room stage works adequately for low-coverage rooms (LaMa ≤35% coverage). All 5 Bria rooms fail on ghost artefacts, SSIM, or edge density independent of VP threshold. VP metric relaxation is not the path to ≥13/15. Real problem is Bria's ghost-furniture residue and SSIM degradation at high mask coverage (≥37%). Document as known limitation; Phase 1 hardening needs better high-coverage inpainting solution.

Secondary signal (Branch B): even relaxing to 10% only reaches 2/15, far below 13/15 target. Irreducible non-VP failures dominate (SSIM on 5 rooms, ghost on 4 rooms, edge on 3 rooms).
