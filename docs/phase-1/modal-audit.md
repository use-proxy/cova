# Phase 1 — Modal Perception Audit & Consolidation Plan

Generated: 2026-04-20
Author: Claude Code, Phase 1 Task 1.1
Sources: `docs/audit/modal.md` (Phase 0), direct source inspection of
`modal_pipeline/*.py`, live `modal app list` (11 apps deployed),
`docs/cova-v9-research.pdf` §3.3 / §9.2 / §10.

---

## 1. Executive summary

Phase 1 as scoped in `docs/cova-v9-research.pdf` §10 specifies a single
unified perception service (`cova-perception`, A10G) exposing three
endpoints: `/detect_preservation_spec`, `/encode_sam2_for_cache`,
`/depth_anything_v2`.

The audit finds that **two active production Modal apps already implement
~70% of Phase 1's perception surface**, and both are called from live web
app API routes. Naive consolidation (folding them into `cova-perception`
and dormant-tagging the originals) would break production.

Recommendation: **additive deployment** — ship `cova-perception` as a new
app alongside `cova-segmentation` and `cova-structural-extraction`, and
defer consumer migration + dormant-tagging of the legacy apps to a
separate milestone once Phase 2 / Phase 5 / Phase 8 have cut over.

---

## 2. Per-app findings (overlapping with Phase 1 scope)

### 2.1 `cova-segmentation` — KEEP (do not touch in Phase 1)

- **File:** `modal_pipeline/segmentation.py` (569 LOC)
- **Loaded models:** OneFormer (ADE20K panoptic), SAM 3 (via fal),
  Depth-Anything-V2 (via fal)
- **Produces:** 4-layer mask set — arch (wall/ceiling/floor/window/door),
  furniture instances, ceiling-ROI fixtures, depth map
- **Overlap with Phase 1:** SAM 3 architectural detection is the same
  backbone as the research doc's §9.1-6 preservation_spec step 1.
  Depth-Anything-V2 is identical to Phase 1's `/depth_anything_v2`.
- **Production callers (verified via grep):**
  - `apps/web/app/api/pipeline/segment-masks/route.ts` (live route)
  - `apps/web/__tests__/pipeline.test.ts`
  - Referenced by env var `LAYERED_SEGMENTATION_URL`
- **Decision:** KEEP as-is. Do not fold into `cova-perception`.
  Rationale: rewriting the consumer in Phase 1's scope is out-of-scope;
  breaking it would block the redesign pipeline orchestrator.
- **Future consolidation path (out of Phase 1):** after Phase 2
  (empty-room service) switches its perception source to
  `cova-perception`, revisit whether the segmentation-layer-C ceiling-ROI
  functionality needs to remain separate or can migrate.

### 2.2 `cova-structural-extraction` — KEEP (do not touch in Phase 1)

- **File:** `modal_pipeline/structural_extraction.py` (255 LOC)
- **Loaded models:** calls `fal-ai/imageutils/depth` (Depth-Anything-V2)
  and OpenCV Canny
- **Produces:** depth map URL + Canny edge URL
- **Overlap with Phase 1:** depth output is exactly what
  `/depth_anything_v2` would return.
- **Production callers:** invoked by the orchestrator (`redesign_pipeline.py`)
  which is called from `apps/web/app/api/pipeline/redesign/route.ts` via
  `REDESIGN_PIPELINE_WEBHOOK_URL`.
- **Decision:** KEEP as-is. Phase 1's `/depth_anything_v2` endpoint will
  initially forward to the same fal endpoint (`fal-ai/imageutils/depth`)
  rather than co-hosting the model on-GPU in `cova-perception` — it is
  cheaper, it matches the existing pattern, and it avoids cold-start
  cost on a model that's already served externally.
- **Deviation from research doc:** research §4.2 names
  `depth-anything/Depth-Anything-V2-Metric-Indoor-Large-hf` (HF, 335M
  params). Using fal instead trades provider independence for zero
  additional Modal cold-start cost and no container weight. If future
  phases need raw metric-indoor-large depth (fal is the generic variant)
  we revisit.

### 2.3 `cova-pre-detection` — KEEP (out of Phase 1 scope)

- **File:** `modal_pipeline/pre_detection_pipeline.py` (308 LOC)
- **Produces:** Claude Vision furniture azimuth detection from first
  capture photo.
- **Overlap with Phase 1:** none — preservation_spec uses SAM 3 +
  MediaPipe + PaddleOCR, not Claude Vision.
- **Decision:** untouched.

### 2.4 `cova-grounded-sam2` — DORMANT candidate (not in Phase 1 path)

- **File:** `modal_pipeline/grounded_sam2_pipeline.py` (414 LOC)
- Role: last-resort fallback behind `LAYERED_SEGMENTATION_URL` via
  env var `GROUNDED_SAM2_URL`.
- Already flagged DEAD-candidate in `docs/audit/modal.md` §Dead Code.
- **Decision:** do not delete in Phase 1. Confirm via grep that the
  fallback env var is unset in production before any future deletion.
  Tagging as DORMANT is out of Phase 1 scope — add to Phase 1 follow-ups.

### 2.5 `cova-generation` — out of Phase 1 scope

Uses SAM 3 internally but is a design-rendering service; unrelated to the
perception audit. Untouched.

---

## 3. `cova-perception` — what it must actually add

Net-new capabilities vs. existing Modal surface:

| Capability | Exists? | Source |
|---|---|---|
| SAM 3 text-prompted mask over keep-classes | existing | `cova-segmentation` via fal |
| Depth-Anything-V2 depth map | existing | `cova-structural-extraction` via fal |
| **SAM 2 embedding cache (<2MB)** for client tap-to-SAM | **NEW** | Phase 1 net-new |
| **PaddleOCR wall-text detection** | **NEW** | Phase 1 net-new |
| **MediaPipe face detection** inside picture-frame bboxes | **NEW** | Phase 1 net-new |
| **Unified `preservation_spec.json` schema** (§9.1-6.4) | **NEW** | Phase 1 net-new |

So the minimum viable `cova-perception` does not need to host SAM 3 or
Depth-Anything-V2 on-GPU. It can:

1. Call fal SAM 3 (as `cova-segmentation` already does) for keep-class masks.
2. Call fal depth (as `cova-structural-extraction` already does) for
   `/depth_anything_v2` (pass-through).
3. Load **only** SAM 2, PaddleOCR, and MediaPipe as on-container models.
4. Expose the unified `/detect_preservation_spec` endpoint that fuses
   SAM 3 + OCR + face-detect into one spec per research §9.1-6.4.
5. Expose `/encode_sam2_for_cache` — the single on-GPU hot path
   justifying A10G.

This is cheaper, faster to ship, and carries no production risk. If
future measurement shows fal SAM 3 latency blocks p95<3s acceptance, we
revisit self-hosting (documented in §5 escalation path).

---

## 4. Endpoint mapping (final plan)

| Phase 1 endpoint | Implementation | Backing model / provider |
|---|---|---|
| `POST /detect_preservation_spec` | new, in `modal_pipeline/perception.py` | SAM 3 (fal) + MediaPipe (container) + PaddleOCR (container) |
| `POST /encode_sam2_for_cache` | new, in `modal_pipeline/perception.py` | SAM 2 hiera-large (container, A10G) |
| `POST /depth_anything_v2` | new, pass-through wrapper | fal-ai/imageutils/depth |

Python 3.10 per CLAUDE.md. GPU = A10G per research §10.

---

## 5. Escalation path if acceptance fails

If `/detect_preservation_spec` p95 exceeds 3s (research §10 acceptance):

- **Attempt 1:** remove unnecessary round-trips — parallelize SAM 3 +
  OCR + face calls (they have no ordering dependency).
- **Attempt 2:** move PaddleOCR to CPU-only container to free A10G for
  SAM 2 cold-start amortization.
- **Attempt 3 (escalate):** self-host SAM 3 on A10G. Per research §3.3
  this is the second-choice route (commercial-use license confirmed on
  `facebook/sam3` HF repo). This raises Modal cold-start and container
  memory but removes fal latency.

The self-host path is not taken by default — it is held in reserve.

---

## 6. Legacy app disposition

| App | Disposition in Phase 1 | Rationale |
|---|---|---|
| `cova-segmentation` | KEEP ACTIVE | Production consumer at /api/pipeline/segment-masks |
| `cova-structural-extraction` | KEEP ACTIVE | Production consumer via orchestrator |
| `cova-pre-detection` | KEEP ACTIVE | Out of Phase 1 scope |
| `cova-grounded-sam2` | KEEP (audit follow-up) | Fallback path; deletion deferred |
| `cova-generation` / orchestrator et al. | KEEP ACTIVE | Out of Phase 1 scope |

**No legacy apps are deleted or DORMANT-tagged in Phase 1.** Follow-up
recorded in `docs/phase-0/follow-ups-deferred.md` style (to be added at
closeout).

---

## 7. Production-risk summary

Grep confirms the only Modal-app references in `apps/web/` for perception
scope are:

- `LAYERED_SEGMENTATION_URL` → `cova-segmentation` (untouched)
- `PRE_DETECTION_WEBHOOK_URL` → `cova-pre-detection` (untouched)
- `GROUNDED_SAM2_URL` → `cova-grounded-sam2` fallback (untouched)

No active web-app route references `cova-perception` yet — it is a
greenfield addition with a new TS client (`apps/web/lib/ai/perception-client.ts`,
Task 1.7). Zero production-path blast radius.

---

## 8. Proceed/blocker status

Task 1.1 produces this plan without touching code, Modal, Supabase, or
spending money.

**No blockers.** The plan is purely additive and avoids the one failure
mode called out in the Phase 1 autonomy contract ("Breaking change
required to an existing Modal app that's called by other production code
paths outside Phase 1's scope"). Ready to proceed to Task 1.2.
