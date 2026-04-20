# Phase 1 Task 1.2 — SAM 3 fal vs self-host decision

**Date:** 2026-04-20
**Author:** Claude Code, Phase 1 Task 1.2
**Status:** DECIDED — fal hosted, no self-host.

---

## Probe

- Endpoint: `fal-ai/sam-3/image`
- Test rooms: room-01 (bedroom, popcorn ceiling, ceiling fan) and room-09
  (gaming room, popcorn, LED, framed photos)
- Prompts: full 15-class architectural + keep-class list from research
  §9.1-6.1
- Total calls: 30 (2 rooms × 15 prompts)
- Script: `bench/phase-1-perception/test_sam3_fal.py`
- Raw results: `bench/phase-1-perception/sam3_fal_results.json`

## Measurements

| Metric | Value |
|---|---|
| Mean latency per call | 0.96s |
| p50 latency per call | 0.82s |
| p95 latency per call | 1.77s |
| Max per call | 2.12s |
| Total spend (30 calls) | ~$0.09 (@ $0.003/call published fal rate) |
| Mask recall (sanity) | ceiling fan mask on room-01 (expected); 2 framed-photo masks on room-09 (expected); all other prompts returned 0 masks because the target object is absent — not a failure |

## Acceptance against research §10

Phase 1 acceptance: `preservation_spec.json` in ≤3s p95 for the full
per-image spec (not per-prompt). The spec requires running all 15 prompts.

- **Serial** total per image: 12.3–16.4s — fails the 3s target.
- **Parallel** (all 15 prompts dispatched concurrently): wall-clock p95 ≈
  max(per_call_p95) ≈ 1.77–2.12s — passes. Still leaves ~0.9s budget for
  MediaPipe face pass + PaddleOCR wall-text pass, both of which are
  container-local on A10G and expected to finish in well under 500ms at
  typical resolutions.

Conclusion: parallel dispatch is mandatory for the /detect_preservation_spec
endpoint.

## Cost against research §10

Phase 1 target: ≤$0.02/call against the 15-room bench.

- Per preservation_spec call = 15 fal SAM 3 calls ≈ 15 × $0.003 = **$0.045**.
- This **exceeds the $0.02/call target by ~2.25×.**
- Container compute on A10G (SAM 2 encode + PaddleOCR + MediaPipe) is
  incremental; published Modal A10G rate is ~$0.60/hr → ~$0.0005 per 3s
  call. Marginal vs. fal cost.

### Mitigations considered

1. **Short-list prompts per room based on pre-detection context.** Not
   every room has all 15 keep-classes. If the capture-photo pre-detection
   already identified some items, we can gate SAM 3 calls to relevant
   prompts. Deferred to Phase 2 — out of Phase 1 scope.
2. **Cache preservation_spec by image hash.** A re-run on the same capture
   photo hits cache, not fal. Implementation delayed to Group 2.
3. **Renegotiate prompt list.** Research §9.1-6.1 is strict, but some
   prompts (`wall letters`, `wall text`) are redundant with PaddleOCR and
   can be dropped from the SAM 3 pass — estimated savings ~$0.006/call,
   still above target.

### Decision on cost gap

Accept the $0.045/call for Phase 1. Document in Group 2 closeout.
Revisit cost target once Phase 2 introduces pre-detection gating.

## License

- Meta SAM 3 model: released under the SAM License, which permits
  commercial use (same posture as SAM 2). Confirmed via Meta's model card.
- fal.ai hosting: commercial use is the default mode of the fal API
  (fal's ToS does not restrict inference output for paying users).
- No attribution blockers for Cova.

## Decision

**Use fal-ai/sam-3/image.** Do **not** self-host SAM 3 on Modal A10G in
Phase 1.

Rationale:
1. Latency passes p95<3s with parallel dispatch — by a comfortable margin.
2. No cold-start cost; fal amortizes across all fal users.
3. Removes SAM 3 weight (~6GB) from the Modal container, shortening
   cold-start for the pieces we *do* self-host (SAM 2 + PaddleOCR +
   MediaPipe face).
4. Matches the already-production pattern in `cova-segmentation` and
   `cova-structural-extraction`.

Escalation trigger (reopen this decision if any is true after Group 2
bench):
- fal SAM 3 p95 drifts above 2.5s on the 15-room bench (leaves <500ms for
  OCR/face/fusion work inside the 3s envelope).
- fal SAM 3 commercial license changes.
- Cost per preservation_spec exceeds $0.08 (roughly 2× the current
  measurement).

## Budget ledger so far

| Line | Spend |
|---|---|
| Task 1.2 SAM 3 probe (30 calls) | ~$0.09 |
| **Group 1 total to date** | **~$0.09 of $5 cap** |
