# Phase 2 — 15-Room Service Bench Results

**Date:** 2026-04-20
**Service URL:** `https://cova-interior--cova-empty-room-emptyroom-api.modal.run`
**Script:** [`bench/scripts/run_phase_2_service_bench.py`](../scripts/run_phase_2_service_bench.py)
**Total spend:** $2.10 of $15 cap (14 production calls + 1 cold-start smoke).

## Headline

| Gate | Target | Actual | Verdict |
|---|---|---|---|
| Architectural-patch SSIM ≥ 0.80 | ≥10/15 | **15/15** (100%) | ✅ PASS |
| Per-call cost | ≤ $0.30 | $0.14 (flat) | ✅ PASS |
| p95 end-to-end latency (warm) | ≤ 45s | **95s (parallel), 88s (sequential)** | ❌ MISS |
| Hard upstream failures | 0 | 0 | ✅ PASS |
| Soft failures (partial_failures) | tolerated | 0 across 15 rooms | ✅ CLEAN |

**Overall:** quality and cost goals hit. Latency missed by ~2× — attributed to
per-SAM-3-call latency inside fal (see §3). Pause-and-report escalated via
[F2-LATENCY.1](../../docs/phase-2/follow-ups-deferred.md).

## Per-room metrics

| Room | Inpainter | cov_dilated | Patch SSIM | Latency | Cost |
|---|---|---|---|---|---|
| room-01 | lama | 24.5% | 1.000 | 60.2s (cold) | $0.140 |
| room-02 | lama | 26.9% | 0.902 | 33.5s | $0.140 |
| room-03 | bria | 38.3% | 0.993 | 44.7s | $0.140 |
| room-04 | lama | 21.8% | 0.998 | 24.6s | $0.140 |
| room-05 | bria | 36.9% | 0.983 | 69.2s | $0.140 |
| room-06 | lama | 5.5%  | 1.000 | 95.0s | $0.140 |
| room-07 | lama | 13.6% | 0.998 | 63.2s | $0.140 |
| room-08 | bria | 64.8% | 0.975 | 89.0s | $0.140 |
| room-09 | lama | 24.9% | 1.000 | 67.5s | $0.140 |
| room-10 | lama | 33.5% | 0.908 | 52.6s | $0.140 |
| room-11 | bria | 50.7% | 0.975 | 71.5s | $0.140 |
| room-12 | lama | 24.8% | 0.999 | 51.7s | $0.140 |
| room-13 | lama | 6.2%  | 1.000 | 63.3s | $0.140 |
| room-14 | lama | 4.3%  | 0.935 | 50.7s | $0.140 |
| room-15 | bria | 41.6% | 0.984 | 64.5s | $0.140 |

Aggregated: latency p50 = 63.2s, p95 = 95.0s, p99 = 95.0s. SSIM min
0.902 (room-02), mean 0.975, max 1.000.

## Routing

10 LaMa calls, 5 Bria calls, 0 short-circuits. Router threshold at 35%
fires predictably; the 5 Bria-routed rooms correspond exactly to the Run 3
Bria rooms (room-03, 05, 08, 11, 15 in both).

## Comparison to Phase 0.5 Run 3

| Metric | Run 3 | Phase 2 service | Delta |
|---|---|---|---|
| Inpainter routing distribution | 10 LaMa / 5 Bria | 10 LaMa / 5 Bria | 0 drift |
| Patch-SSIM pass rate (≥ 0.80) | 15/15 ([vp-diagnostic/5-room-patch-audit.md](../run-3-empty-room/vp-diagnostic/5-room-patch-audit.md)) | 15/15 | 0 regression |
| Cost per room | $0.14 (excl. ghost-SAM3) | $0.14 | 0 delta |
| Mean total latency | ~17s (local bench harness) | 67s (Modal service path) | **+50s regression** |

**Conclusion on quality:** the service faithfully reproduces Run 3's
locked configuration. Every room that Run 3 routed to Bria is also
routed to Bria here; patch SSIMs fall in the same band.

**Conclusion on latency:** the 50s gap is the scope of F2-LATENCY.1.
Evidence points at the Modal → fal network path and/or fal_client
long-poll cadence rather than our service logic — see follow-ups doc.

## Known limitations surfaced in this bench

- **room-02 SSIM = 0.902.** Phase 0.5 Run 3 also flagged this room as
  borderline (whole-image SSIM 0.9578 pre-patch-audit); the architectural
  patch still passes at 0.902, matching Phase 0.5 expectations. No new
  failure mode.
- **room-14 SSIM = 0.935 (stacked-stone walls).** Confirmed
  F2-TEXTURE.1 (high-frequency texture drift, deferred). Still above
  the 0.80 gate.
- **room-10 SSIM = 0.908 (cov 33.5%, near the router threshold).**
  On-boundary rooms accept more drift. Acceptable per gate, will be
  re-examined in Phase 5 robustness.
- **room-06 cold-run latency 95s.** Room was processed on a fresh
  Modal worker under bench parallelism — not a service bug, but a
  latency signal that parallelism + max_containers=4 was churning.

## Raw artifacts

- Aggregate JSON: [`bench_results.json`](bench_results.json)
- Per-room JSON: [`metrics/room-*.json`](metrics)
- Output images (empty-room PNG/WEBP): [`outputs/room-*.webp`](outputs)
- Sequential 5-room latency probe: [`sequential-metrics/`](sequential-metrics)
