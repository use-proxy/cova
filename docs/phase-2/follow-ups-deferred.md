# Phase 2 — Deferred Follow-Ups

Carried forward from Phase 2 closeout. Each entry names the trigger that
should re-open it and the owning phase.

---

## F2-LATENCY.1 — Service latency 2× target (PARTIALLY RESOLVED 2026-04-21)

**Status:** PARTIALLY RESOLVED in Phase 2.5. 88-95s p95 → 42.6s warm p95 /
53.3s cold p95 via `SAM3_MAX_WORKERS` 6→20, `client_timeout=40s`, and
parallel mask downloads. See [CLOSEOUT.md §Phase 2.5 addendum](./CLOSEOUT.md)
and [`bench/phase-2-empty-room/results-v2.md`](../../bench/phase-2-empty-room/results-v2.md).
Target <30s not fully met; residual is fal SAM3 per-call tail via
Modal→fal network, which is a server-side ceiling.

**Trigger (for remaining gap):** Phase 5 integration surfaces user-visible
latency complaints, OR cost/throughput constraints force self-hosted SAM3.

**Evidence:** Phase 2 bench shows p95 end-to-end latency of 95s (parallel)
and 88s (sequential) vs the 45s acceptance target. Per-room breakdown is
50–95s in the service path vs 12–22s in the Phase 0.5 Run 3 local bench
harness (see [`bench/phase-2-empty-room/results.md`](../../bench/phase-2-empty-room/results.md)).

The delta is consistent across rooms and does not correlate with
furniture density, routed inpainter, or output size. Every room-level
metric (SSIM, cost, routing) faithfully reproduces Run 3.

**Suspected cause:** fal-client long-poll cadence from inside the Modal
container. `fal_client.subscribe` polls every 1–5s for completion; 20
concurrent polls per room (one per SAM 3 prompt) through the Modal →
fal edge appears to serialize more than it does from a laptop →
fal edge, most likely due to connection pooling or per-IP rate limits
on fal's status endpoint.

**Self-heal paths:**

1. ~~Replace `fal_client.subscribe` with submit + explicit polling~~ —
   inspected: `subscribe` already uses submit + 100ms polling. Not the
   bottleneck. Applied `client_timeout=40s` instead to bound the tail.
2. Reduce SAM 3 prompt set from 20 to 10 — still deferred; closeout
   §Non-goals rejects any prompt-set reduction without a quality
   re-bench.
3. Co-locate a lightweight SAM 3 proxy/cache on Modal to dedupe prompt
   requests (costly, high scope — reject unless Phase 5 wiring reveals
   hot-path SSIM regressions).
4. Increase `max_containers` and Modal concurrency to absorb parallel
   room dispatch without in-container contention.
5. **Applied in Phase 2.5:** bump `SAM3_MAX_WORKERS` from 6 to 20 —
   serializes 1 wave instead of 4. This was the dominant win (~40%
   reduction on its own).
6. **Applied in Phase 2.5:** parallel Stage-B mask PNG downloads
   (`MASK_DOWNLOAD_WORKERS=8`). Minor win (~3-6s per room).
7. **Not applied:** set `min_containers=1` to eliminate cold-start
   penalty (room-01 still 53s cold vs 12.9s warm p50). Deferred to
   operational decision — trades ~$40/mo for cold-start avoidance.

**Non-goals:** do **not** degrade the mask union (fewer prompts) if it
costs us the patch-SSIM pass rate. Any fix must re-run the 15-room bench
and show zero SSIM regression before merging.

**Owner:** Phase 5 stream (or Phase 2b hardening pass if Phase 5 demands
it earlier).

---

## F2-CONSOLIDATION.1 — Deprecate legacy inpainter apps

**Trigger:** `cova-empty-room` consumed by step-6 in production for 7
consecutive days with zero P0 incidents.

**Action:** tear down two Modal apps that are now superseded:

- `cova-restoration-pipeline` (`ap-VKXTzv8eDHjClU7ROZAEYP`) — earlier
  per-room inpainter wrapper.
- `cova-grounded-sam2` (`ap-04N5sACE1YR5ViN2n6HiaZ`) — Grounded-SAM2
  mask endpoint; superseded by SAM 3 + Phase 1 perception.

Keep deployed through Phase 5 integration to avoid flag-day migration.

---

## F2-PERCEPTION.1 — Add `/v1/detect_furniture_spec` to perception

**Trigger:** cost optimization pass, OR when Phase 2 and Phase 5 both
consume perception and the aggregated SAM 3 spend becomes a budget line.

**Context:** Phase 1's `/v1/detect_preservation_spec` returns keep-class
masks (architecture). Phase 2 needs furniture masks and therefore calls
SAM 3 directly — two disjoint SAM 3 call sets per room in the worst
case. Consolidating into one perception service endpoint that runs
both prompt sets (or has a configurable prompt-set parameter) would
save ~$0.10 per room and amortize perception's cold start.

**Why deferred:** the current duplication is cheap ($0.10/room), the
contract is clean (two services, two concerns), and changing perception
requires a schema-version bump. Premature consolidation.

---

## F2-CACHE.1 — `empty_room_cache` Supabase table

**Trigger:** Phase 5 or Phase 8 analytics show ≥ 5% hit rate on input
image hash across active users.

**Action:** schema + RLS per [`service-design.md`](service-design.md)
§6; migration filename:
`supabase/migrations/<timestamp>_empty_room_cache.sql`; TTL edge
function follows Phase 1's `sam_embeddings` pattern.

**Why deferred:** Phase 2 design analysis projected ~0% hit rate — each
user uploads a different photo. Shipping cache infra for a workload
with no collision surface is net-negative.

---

## F2-TEXTURE.1 — High-frequency texture drift

**Trigger:** user-facing reports ("the walls look wrong") OR Phase 5
bench shows degradation below patch SSIM 0.85 on texture-heavy rooms.

**Context:** confirmed Phase 0.5 limitation. LaMa drifts on stacked
stone / plank-floor rooms. Bria is marginally better but not enough to
justify routing heavier textures to Bria (Phase 0.5 closeout §2).
Phase 2 bench re-confirmed on room-14: patch SSIM 0.935 — above the
0.80 gate but visibly drifted.

**Possible fixes (research-phase scope):** ControlNet-conditioned
restoration pass, or post-LaMa texture-tiling step against a
reference texture patch.

---

## F2-COVERAGE.1 — High-coverage UX gate

**Trigger:** Phase 8 UI design, OR when telemetry shows ≥ 2% of uploads
get HTTP 413.

**Action:** in the web capture flow (`apps/web/app/design/step-6`),
detect the 413 response from `generateEmptyRoom()` via the
`EmptyRoomCoverageTooHighError` class and render an "This photo has a
lot of furniture — try a wider shot" message with a retry UX. Do not
block the flow entirely; allow the user to proceed to a degraded
redesign with a warning banner (per Phase 0.5 closeout recommendation
#2).

The client already exposes the `coveragePct` property — no additional
server work required for this follow-up.

---

## F2-HEALTHZ.1 — Health endpoint should probe fal connectivity

**Trigger:** on-call incident where the service returns 200 on /healthz
but all inpainter calls 502.

**Action:** extend `/healthz` to optionally fire a cheap fal call
(e.g., echo endpoint or `fal_client.status()` if exposed) and surface
`fal_healthy: true/false`. Low priority until we see a fal outage that
slipped past synthetic monitoring.
