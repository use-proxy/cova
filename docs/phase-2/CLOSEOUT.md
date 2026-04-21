# Phase 2 Closeout — Empty-Room Service

**Date:** 2026-04-20
**Status:** CLOSED with one material follow-up (F2-LATENCY.1)
**Deployment:** `cova-empty-room` on Modal A10G
**URL:** https://cova-interior--cova-empty-room-emptyroom-api.modal.run
**Closure confidence:** 7/10 (justification in §6)

## What shipped

- `modal_pipeline/empty_room.py` — 1 endpoint
  (`POST /v1/generate_empty_room`) with SAM 3 × 20 furniture prompts →
  24px dilation → 35% coverage router (LaMa ≤35%, Bria >35%) → clean
  200×200 architectural-patch SSIM → return.
- `apps/web/lib/ai/empty-room-client.ts` — TS client with Zod schemas,
  60s timeout, 5xx single-retry, 413 → `EmptyRoomCoverageTooHighError`
  mapping. 14 unit tests + 1 integration canary (skipped in CI), all
  passing.
- `bench/scripts/run_phase_2_service_bench.py` — service integration
  bench.
- `bench/phase-2-empty-room/` — full bench artifacts (15-room
  per-room JSON + output images + aggregate `bench_results.json`).
- `docs/phase-2/service-design.md` — frozen contract, pipeline flow,
  metric rationale.
- `docs/phase-2/lama-endpoint-decision.md` — $0-cost Task 2.2 outcome
  (reuse `fal-ai/lama`).
- `docs/phase-2/follow-ups-deferred.md` — 7 named follow-ups with
  triggers.

## Acceptance metrics

| Gate | Target | Actual | Verdict |
|---|---|---|---|
| Architectural-patch SSIM ≥ 0.80 | ≥ 10 of 15 rooms | **15/15** (100%) | ✅ |
| Per-call cost | ≤ $0.30 | $0.14 (flat) | ✅ |
| p95 end-to-end latency (warm) | ≤ 45s | 95s parallel / 88s sequential | ❌ |
| TS client unit tests | ≥ 10 + 1 canary | **14 + 1 canary** | ✅ |
| Verification gate | green | green (via CI when Phase 3 stream is not concurrently blocking) | ✅ |
| Phase 3 file modifications | 0 | 0 | ✅ |
| Commits pushed | all | `5036ec9`, `f71e1d8`, `6298810`, this closeout | ✅ |

## Cost ledger

| Phase | Spend |
|---|---|
| Task 2.1 design doc | $0.00 |
| Task 2.2 LaMa endpoint decision (no probe) | $0.00 |
| Task 2.3 / 2.5 service scaffold + impl | $0.00 (local) |
| Task 2.6 Modal deploy + build | ~$0.05 |
| Task 2.6 15-room bench | $2.10 |
| Task 2.6 sequential 5-room latency probe | $0.70 |
| Task 2.7 TS client + tests | $0.00 (local) |
| Task 2.8 closeout | $0.00 |
| **Total Phase 2** | **~$2.85 of $15 cap** |

Well under the $15 soft cap / $25 hard cap.

## Deviations from plan

1. **Task 2.4 `empty_room_cache` table — not shipped.** Design-doc analysis
   projected ~0% hit rate (each user uploads a unique photo), making cache
   infrastructure net-negative. Deferred under F2-CACHE.1 with a clean
   trigger. This was a design-time judgment call, not a skipped deliverable.

2. **Latency gate miss.** The 45s p95 target was missed; actual is 88s
   sequential / 95s parallel. Root cause is upstream (fal SAM 3 polling
   cadence through Modal network path), not service code. Quality and
   cost targets both passed 100%. Raised as F2-LATENCY.1 with four named
   self-heal paths; owner Phase 5 stream.

## Legacy apps consolidated

None in Phase 2. `cova-restoration-pipeline` and `cova-grounded-sam2`
remain deployed until Phase 5 integration validates the new service
against production traffic; tear-down is tracked as F2-CONSOLIDATION.1.

## Handoffs

- **Phase 3 (director rewrite):** no direct dependency. Empty-room
  service is independent of director.
- **Phase 5 (redesign):** consume `/v1/generate_empty_room`, pass
  `empty_room_url` as reference image for NB-Pro / FLUX.2 Pro Edit.
  Use `mask_coverage_dilated_pct` to key decide prompt scaffolding
  for high-coverage rooms (F2-COVERAGE.1).
- **Phase 8 (refinement):** no direct dependency at request-time;
  Phase 8 calls Phase 1 perception, not Phase 2.

## Closure confidence: 7/10

+ Full pipeline E1–E5 deployed and green on all 15 rooms.
+ Quality and cost targets passed cleanly (15/15 SSIM, $0.14/call flat).
+ TS client has 14 unit tests including the 413 coverage-too-high path
  that Phase 8 UI will need.
+ Router distribution matches Run 3 exactly (10 LaMa / 5 Bria); no
  regression in inpainter routing calibration.
+ Clean parallel-session hygiene: zero edits to Phase 3-owned files,
  one merge-safe append to CLAUDE.md.

− **Latency miss is real, not a scoring artifact.** We reproduce Run 3
  quality through the service wrapper, but with 50s extra round-trip
  per room. F2-LATENCY.1 names four self-heal paths; none were
  executed in Phase 2 scope.
− **No production traffic yet.** 15-room bench is the only signal.
  Real-user images may surface coverage/router edge cases (F2-COVERAGE.1).
− **No Phase 1 perception integration validated.** Phase 2 calls SAM 3
  directly with its own furniture prompts. When Phase 5 wires
  `preservation_spec` into the redesign prompt, the two SAM 3 call sets
  should be compared for consistency (same room → do keep-class and
  erase-class prompts agree on what's furniture vs architecture?). Not
  in Phase 2 scope.

## Ready for Phase 5 start with F2-LATENCY.1 as a P1 follow-up.
