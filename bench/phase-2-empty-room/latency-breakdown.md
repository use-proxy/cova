# Phase 2.5 — Latency Breakdown (Diagnostic Run)

**Date:** 2026-04-21
**Service:** `cova-empty-room` (instrumented build, same logic as Phase 2)
**Rooms:** room-01 (LaMa, 24.6%), room-09 (LaMa, 24.9%), room-11 (Bria, 50.7%)
**Mode:** sequential (`PHASE2_BENCH_PARALLEL=1`), 1 container warm-path.

## Per-step timings (seconds)

| Room | fetch | build_union_mask | mask_dl (subset of union) | mask_upload | inpainter | out_dl | ssim | **Total** |
|---|---|---|---|---|---|---|---|---|
| room-01 | 1.05 | **57.21** | 6.33 | 0.87 | 2.19 (lama) | 1.17 | 0.43 | **63.05** |
| room-09 | 0.74 | **66.21** | 3.73 | 0.60 | 2.18 (lama) | 0.94 | 0.06 | **70.71** |
| room-11 | — | **69.07** | 3.34 | 0.51 | 15.05 (bria) | 0.85 | 0.04 | **86.30** |

## SAM3 per-prompt latencies (sampled)

Each room runs 20 prompts through a `ThreadPoolExecutor(max_workers=6)`, so
the 20 calls dispatch in ~4 waves of 6. The tail per wave gates that wave.

- **room-01:** 9.6s min / 11.2s median / 25.3s max. 20/20 completed wave 1.
- **room-09:** 9.5s min / 16.2s median / 32.0s max.
- **room-11:** 6.3s min / 12.8s median / 42.9s max ("curtains"). Long tail.

Compared to the Run 3 local bench harness, which reports ~1.77s p95 per SAM 3
call from a laptop, the Modal container is seeing **5-20×** higher per-call
latency. This is the material delta — not polling cadence, not mask downloads,
not the inpainter, not Modal-side compute.

## Dominant cause

**`build_union_mask` accounts for 80-85% of total latency per room**, and
within that, wall-clock is dominated by SAM3 HTTPS round-trips to fal from
inside the Modal container. `fal_client.subscribe` already uses submit+100ms
polling (inspected source), so polling cadence is not the bottleneck. The
bottleneck is:

1. **Per-call round-trip overhead from Modal→fal**, which appears to be
   several seconds of establishment cost that is not amortized across the
   httpx pool in the way it is on a laptop.
2. **Parallelism underutilization:** 20 prompts on 6 workers → 4 waves,
   each wave serialized on its slowest call.

## Fix plan

1. **Bump `SAM3_MAX_WORKERS` from 6 to 20.** All 20 prompts dispatch at
   once — 1 wave instead of 4. Wall-clock for SAM3 becomes bounded by the
   single-prompt tail (~30-40s worst case), not the 4× multiple.
2. **Parallelize mask PNG downloads.** Currently the union-assembly loop
   downloads masks serially inside `as_completed`. Offload to a small
   inner pool so downloads overlap with pending SAM3 results.
3. **Bound the SAM3 tail via `client_timeout=25s` on subscribe.** Calls
   exceeding 25s get retried (existing retry path, 2 attempts). A retried
   call that takes 1–5s wall becomes faster than waiting 30-42s on the
   original.

**Expected p95 after fix:** 25-35s (bounded by tail SAM3 call, + ~3-5s
inpainter + overhead). If p95 is still >30s after step 1+2 but close, we
accept; the hard target is <30s but tail SAM3 is outside our control.

## What we are NOT changing

- Prompt set (20 furniture prompts) — quality gate on 15-room SSIM requires
  the full union. The closeout explicitly names prompt reduction as a
  quality risk.
- Router threshold (35%), dilation (24px), SAM3 score threshold (0.30).
- Inpainter endpoints or retry budgets.
