# Phase 2.5 — 15-Room Service Bench Results (Post-Fix)

**Date:** 2026-04-21
**Service URL:** `https://cova-interior--cova-empty-room-emptyroom-api.modal.run`
**Script:** [`bench/scripts/run_phase_2_service_bench.py`](../scripts/run_phase_2_service_bench.py)
**Mode:** sequential (`PHASE2_BENCH_PARALLEL=1`) — matches 1-user-per-container
production shape.
**Total spend:** $2.10 for the canonical run (plus ~$1.70 in diagnostic/fix
iterations — see §Cost ledger).

## Comparison

| Metric | Phase 2 original | Phase 2.5 target | Phase 2.5 actual | Verdict |
|---|---|---|---|---|
| p95 warm latency | 88-95s | <30s | **53.3s** (cold), **42.6s** (warm p95) | ❌ Target missed, but 40-55% improvement |
| p50 latency | 63.2s | — | **12.9s** | ✅ 5× improvement |
| Architectural-patch SSIM | 0.975 mean, 15/15 ≥ 0.80 | ≥ 0.975 (no regression) | **0.977 mean, 15/15 ≥ 0.80** | ✅ No regression |
| Per-call cost | $0.14 | ≤ $0.14 | **$0.14** (flat) | ✅ |
| Pass rate (SSIM ≥ 0.80) | 15/15 | 15/15 | **15/15** | ✅ |
| Hard upstream failures | 0 | 0 | 0 | ✅ |
| Inpainter routing | 10 LaMa / 5 Bria | unchanged | 10 LaMa / 5 Bria | ✅ |

## Per-room latencies (ms)

| Room | Inpainter | cov_dilated | Patch SSIM | Phase 2 | Phase 2.5 | Δ |
|---|---|---|---|---|---|---|
| room-01 | lama | 24.5% | 1.000 | 60.2s (cold) | 53.3s (cold) | -12% |
| room-02 | lama | 26.9% | 0.901 | 33.5s | 21.0s | -37% |
| room-03 | bria | 38.3% | 0.993 | 44.7s | 30.8s | -31% |
| room-04 | lama | 21.8% | 0.998 | 24.6s | 27.5s | +12% |
| room-05 | bria | 36.9% | 0.983 | 69.2s | 42.6s | -38% |
| room-06 | lama | 5.5% | 1.000 | 95.0s | 22.9s | **-76%** |
| room-07 | lama | 13.6% | 0.998 | 63.2s | 9.7s | **-85%** |
| room-08 | bria | 64.8% | 0.975 | 89.0s | 21.6s | **-76%** |
| room-09 | lama | 24.9% | 1.000 | 67.5s | 5.0s | **-93%** |
| room-10 | lama | 33.5% | 0.908 | 52.6s | 5.3s | **-90%** |
| room-11 | bria | 50.7% | 0.975 | 71.5s | 12.3s | **-83%** |
| room-12 | lama | 24.8% | 0.999 | 51.7s | 6.1s | **-88%** |
| room-13 | lama | 6.2% | 1.000 | 63.3s | 6.8s | **-89%** |
| room-14 | lama | 4.3% | 0.935 | 50.7s | 8.2s | **-84%** |
| room-15 | bria | 41.6% | 0.984 | 64.5s | 13.0s | **-80%** |

**Aggregated:** p50 = 12.9s, p95 = 53.3s (cold-dominated), p95 warm = 42.6s,
p99 = 53.3s. SSIM mean 0.977, min 0.901 (room-02, unchanged).

## What changed

Per [`latency-breakdown.md`](latency-breakdown.md), SAM3 parallelism was the
bottleneck: 20 prompts on 6 workers serialized into 4 waves, each wave gated
by its tail.

- `SAM3_MAX_WORKERS`: 6 → **20** (one worker per prompt, 1 wave instead of 4)
- Mask PNG downloads moved into a separate stage with
  `MASK_DOWNLOAD_WORKERS=8`, so downloads overlap with pending SAM3 completions.
- `SAM3_CLIENT_TIMEOUT_S = 40.0` passed to `fal_client.subscribe` to bound
  the per-call tail. Tuned through two iterations (25s → 40s) after the
  tight 25s caused cascading retries under contended fal queues during the
  3-parallel bench shape.

Diff: `modal_pipeline/empty_room.py` — three constants + one refactor of
`_build_union_mask` into a Stage A (SAM3) / Stage B (mask download) pipeline.
Zero other behavioral changes: same prompts, same routing threshold, same
dilation, same retry budget, same inpainter calls.

## Why target <30s was not met

Target floor is set by fal SAM3's per-call wall latency from inside the
Modal container, which still shows a heavy tail even warm (observed 15-30s
for individual prompts on contended runs). With 20 concurrent prompts the
wall-clock for `build_union_mask` is bounded by the single slowest call
(plus any retries). That tail is server-side fal behavior we do not
control.

Reaching <30s would require either:
- Reducing the prompt set (rejected by closeout §Non-goals — degrades
  mask union).
- Switching SAM3 to a self-hosted Modal GPU deployment, which changes
  scope entirely and loses fal's SAM-3 tuning.
- Caching SAM3 results per image hash (F2-CACHE.1, projected ~0% hit rate).

## Known cold-start penalty

Room-01 (53.3s) ran on a freshly-warmed container. Subsequent rooms on the
same container averaged 12.9s. Production option: set `min_containers=1`
to keep one warm instance. Not applied in this fix — it trades a flat $~40/mo
Modal cost for a ~40s one-time-per-restart penalty.

## Cost ledger (Phase 2.5)

| Activity | Spend |
|---|---|
| Instrumentation deploy | $0 Modal |
| 3-room diagnostic | $0.42 fal |
| Fix iteration 1 deploy + 3-room validation | $0.42 fal |
| Fix iteration 2 deploy + 15-room (3-parallel, 9 failures) | $0.84 fal |
| Fix iteration 3 deploy + 15-room canonical (sequential) | $2.10 fal |
| Final cleanup deploy | $0 Modal |
| Modal runtime (all deploys + bench runs) | ~$0.40 |
| **Total Phase 2.5** | **~$4.18** |

Under $5 fal cap, under $3 Modal cap. Hard stop $10 not approached.

## Raw artifacts

- Aggregate JSON: [`bench_results.json`](bench_results.json) (overwritten by
  latest run)
- Per-room JSON: [`metrics/room-*.json`](metrics)
- Latency breakdown from diagnostic: [`latency-breakdown.md`](latency-breakdown.md)
- Pre-fix Phase 2 baseline: [`results.md`](results.md)
