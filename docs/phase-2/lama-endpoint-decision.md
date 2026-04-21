# LaMa Endpoint Decision (Phase 2 Task 2.2)

**Date:** 2026-04-20
**Decision:** Use `fal-ai/lama` on fal.ai.
**Cost for this decision task:** $0.00 (no new probes required).

## Context

Phase 2 Task 2.2 asked us to verify LaMa availability on fal, with a fallback
probe of Replicate `cjwbw/lama` and self-host on Modal as a last resort.

## Evidence — fal-ai/lama already validated in Phase 0.5

No new probe is needed. The LaMa endpoint was exercised extensively during
Phase 0.5:

| Source | Evidence |
|---|---|
| `bench/probe-lama/cost-log.json` (commit `a424364`) | 3-room LaMa probe, $0.24 total, all 3 calls succeeded |
| `bench/run-3-empty-room/cost-log.json` (commit `5411f5d`) | 15-room Run 3 bench; `fal-ai/lama` routed on all coverage ≤35% rooms without endpoint failures |
| `bench/scripts/run_empty_room_bench.py:211-241` | Working client helper `lama_eraser(image_url, mask_url)` with retry logic, confirmed schema `{"image": {"url": str}}` |
| `bench/PHASE_0_5_CLOSEOUT.md:16` | Locked configuration: "Coverage <= 35%: LaMa inpainter" |

### Endpoint contract (reconfirmed from bench code)

```python
fal_client.subscribe(
    "fal-ai/lama",
    arguments={
        "image_url": "<url>",
        "mask_image_url": "<url>",  # white = erase, black = preserve
    },
)
# → { "image": { "url": "..." } }
```

Cost: $0.04 per call (same tier as Bria).

### Known limits (accepted)

- Drifts on dark wood plank + stacked-stone textures (F2-TEXTURE.1).
- Collapses on > 40% furniture coverage (routed to Bria at 35%).

## Decision

**Adopt `fal-ai/lama` for Phase 2.** No Replicate probe, no self-host.

Reasoning:
1. Zero-risk — 18 LaMa calls already ran in Phase 0.5 probes + Run 3 against
   this endpoint with the exact payload shape we will use.
2. Cost-efficient — $0.04/call is consistent with the budget ($0.16/call
   total for Phase 2, see `service-design.md` §5).
3. Fallback path documented — if fal-ai/lama begins hard-failing in Phase 2
   bench or production, the pause-and-report trigger "LaMa NOT available on
   fal AND Replicate is also unavailable" applies; Replicate `cjwbw/lama`
   probe can be run in < 1 hour with < $0.02 spend.
4. The fal endpoint reuses our existing `fal-secrets` Modal secret and
   `fal_client` SDK — no new dependencies, no new credentials.

## Cost ledger for Task 2.2

| Item | Spend |
|---|---|
| Review of existing bench artifacts | $0.00 |
| New probes | $0.00 |
| **Total** | **$0.00** |

Task-2.2 cost cap was $0.50 — came in at $0.00.
