# Phase 2 — Empty-Room Service Design

**Date:** 2026-04-20
**Status:** Design locked, implementation in progress
**Modal app (to deploy):** `cova-empty-room` (A10G, Python 3.10)
**Upstream dependency:** `cova-perception` (Phase 1, deployed)
**Owners:** Phase 2 stream (daksh)

This document freezes the contract, flow, and acceptance metric for the
production empty-room service. It is derived from the Phase 0.5 Run 3 locked
configuration (see [bench/PHASE_0_5_CLOSEOUT.md](../../bench/PHASE_0_5_CLOSEOUT.md)).

---

## 1. Endpoint contract

`POST /v1/generate_empty_room`

### Request

```jsonc
{
  "image_url": "https://...",         // required. source room photo
  "image_hash": "sha256-hex",         // optional. if absent, server computes
  "user_id": "uuid",                  // optional. used for logging/attribution
  "force_inpainter": "lama" | "bria"  // optional. bypass router (diagnostics)
}
```

### Response (200)

```jsonc
{
  "schema_version": "1.0",
  "empty_room_url": "https://...",
  "image_hash": "sha256-hex",
  "image_width": 1536,
  "image_height": 1024,
  "mask_coverage_raw_pct": 18.2,      // undilated furniture mask area
  "mask_coverage_dilated_pct": 27.4,  // +24px dilation
  "inpainter_used": "lama" | "bria",
  "router_threshold_pct": 35.0,
  "architectural_patch_ssim": 0.984,  // acceptance metric
  "patch_coordinates": { "x": 123, "y": 42, "size": 200 },
  "partial_failures": [],             // propagated from perception + soft-fails
  "latency_ms": 28_430,
  "cost_usd": 0.19,
  "generated_at_iso": "2026-..."
}
```

### Errors

| Code | Meaning |
|---|---|
| 400 | image fetch failed / image unreadable / `force_inpainter` unknown |
| 413 | coverage > 90% — room too cluttered to erase (client should show "photo too cluttered" UX — F2-COVERAGE.1) |
| 422 | response failed Pydantic validation |
| 502 | upstream (perception / fal LaMa / fal Bria) hard-failed after retries |
| 504 | service timeout (hard cap 90s end-to-end) |

---

## 2. Pipeline flow (E1 → E5)

```
 image_url
   │
   ▼
 ┌───────────────────────────────────────────────┐
 │ E1. Furniture mask (SAM 3, 20 prompts, ||)    │   ← direct fal call (see §3)
 │     score_threshold = 0.30                    │
 │     union of per-prompt top-1 masks           │
 └───────────────────────────────────────────────┘
   │  union mask (uint8 HxW)
   ▼
 ┌───────────────────────────────────────────────┐
 │ E2. Morphological dilation +24px              │   (Phase 0.5 locked value)
 └───────────────────────────────────────────────┘
   │  dilated mask + coverage_pct
   ▼
 ┌───────────────────────────────────────────────┐
 │ E3. Router                                    │
 │     coverage_pct ≤ 35% → LaMa (fal-ai/lama)  │
 │     35% < coverage  ≤ 90% → Bria (fal-ai/bria/eraser)
 │     coverage > 90% → 413                      │
 │     coverage < 1% → short-circuit, return 200 │
 │                      with empty_room_url = input_url
 └───────────────────────────────────────────────┘
   │  output_image_url
   ▼
 ┌───────────────────────────────────────────────┐
 │ E4. Architectural-patch SSIM                  │   (acceptance metric)
 │     200×200 patch in upper-third, mask<5%     │
 │     std-min among clean candidates            │
 └───────────────────────────────────────────────┘
   │
   ▼
 ┌───────────────────────────────────────────────┐
 │ E5. Assemble response, return                 │
 └───────────────────────────────────────────────┘
```

Parallelism: E1 dispatches all 20 SAM 3 prompts via a `ThreadPoolExecutor`
(`max_workers=6`, same as Run 3 bench). E4 is local CPU.

---

## 3. Why we call SAM 3 directly instead of reusing Phase 1

Phase 1's `/detect_preservation_spec` returns **keep-class** masks
(architectural elements to preserve). Phase 2 needs **furniture** masks (things
to erase). The two prompt sets are disjoint:

- Keep (Phase 1 — 15 prompts): ceiling fan, framed photograph, picture frame,
  mirror, fireplace, crown molding, exposed brick, exposed beam, wainscoting,
  arched doorway, bay window, built-in bookshelf, wall letters, wall text,
  radiator.
- Erase (Phase 2 — 20 prompts): sofa, chair, table, bed, lamp, rug, cabinet,
  plant, dresser, desk, tv, ottoman, bookshelf, curtains, artwork, mirror,
  fireplace insert, radiator, media unit, bench.

"Option A" in the task spec (re-run SAM 3 with furniture prompts) is the
explicit choice. Rationale:

1. **Explicit > implicit.** Taking the complement of keep-classes + background
   leaks edge cases (shadow on wall misclassified as furniture) and couples us
   to whatever Phase 1 happens to return, which Phase 1 may evolve.
2. **Mirrors Phase 0.5 bench.** The Run 3 harness (`run_empty_room_bench.py`)
   calls SAM 3 directly with these 20 prompts; our service must reproduce that
   behavior byte-for-byte to inherit the locked acceptance numbers.
3. **Cost is acceptable.** 20 prompts × $0.005 = $0.10 per call. The
   "intersection overlap" prompts (mirror, radiator, fireplace insert) show up
   on both keep and erase lists — that is intentional in the research doc:
   Phase 5's preservation spec will re-instate them as keep-class *inputs to
   the redesign prompt*, separate from the erase step.
4. **Deferred.** F2-PERCEPTION.1 tracks the cost-optimization path of adding
   a `/detect_furniture_spec` endpoint to the perception service so both
   phases share one container. Not in Phase 2 scope.

We **do still call** `/detect_preservation_spec` when the caller passes
`preservation_spec_override` or when downstream Phase 5 needs to pair
empty-room output with a preservation spec. In the standalone Phase 2 path we
skip it — the keep-class masks do not influence erase.

---

## 4. Acceptance metric: architectural-patch SSIM

**Metric:** SSIM on a 200×200 grayscale patch, selected from the upper third
of the image, with < 5% overlap with the dilated furniture mask, choosing
the candidate with the lowest texture std (cleanest wall/ceiling region).

**Threshold:** `architectural_patch_ssim ≥ 0.80`.

**Why not whole-image SSIM-unmasked?** Phase 0.5 Run 3 established that
whole-image SSIM-unmasked false-classifies rooms 04 and 07 as failures — the
unmasked region leaks into preserved-furniture boundary pixels and VP-shift
artifacts in ceiling pixels inflate the error. Architectural-patch SSIM
samples a clean structural region and correctly classifies both as passing.
See `bench/run-3-empty-room/vp-diagnostic/5-room-patch-audit.md` (verdict A,
committed `e027d8c`).

**Implementation:** ported 1:1 from `bench/scripts/lama_patch_audit.py`:

- 8 candidate top-left corners (upper-third center, TL, TR, 4-fraction band,
  mid-upper).
- Dedup within 10px buckets.
- Prefer lowest `texture_std` among candidates with `mask_overlap < 0.05`.
- Fall back to lowest `mask_overlap` if no clean candidate (rare — only
  applies to rooms with >90% coverage, which we reject at E3 anyway).

---

## 5. Budget & latency targets

| Target | Phase 2 budget | Hard cap |
|---|---|---|
| p95 end-to-end latency (warm) | ≤ 30s | 45s |
| Cold start | ≤ 30s | 60s |
| Per-call cost | ~$0.20 | $0.30 |

### Cost breakdown per call (typical)

| Component | Cost | Notes |
|---|---|---|
| SAM 3 × 20 furniture prompts | $0.100 | $0.005/prompt, fal |
| LaMa or Bria inpainter | $0.040 | flat, fal |
| Modal A10G compute (~30s warm) | $0.020 | $0.000611/s |
| Patch-SSIM local | $0.000 | CPU only |
| **Total (LaMa path, no perception)** | **$0.160** | |
| + optional perception call (if caller requests) | $0.046 | Phase 1 cost |

Upper bound per call: $0.21 (Bria path + perception). Well under $0.30 cap.

### Bench cost projection

15 rooms × $0.16 average = $2.40 for a full bench run. Well under the $15
soft cap / $25 hard cap.

---

## 6. Caching decision — we will NOT ship `empty_room_cache`

**Deferred to a follow-up (F2-CACHE.1).** Rationale:

1. The input-image hash collision rate in production will be ~0: every user
   uploads a different photo. Shared-reference caching (Phase 1's SAM 2
   embeddings) has a real hit pattern (the same photo gets encoded once for
   SAM cache and again for tap-to-SAM refinement). Empty-room outputs have
   no such symmetry — each room is generated once per upload and consumed by
   the subsequent redesign step.
2. Cost is low enough ($0.16/call) that write-side caching overhead (RLS
   check, Supabase round-trip, 30-day TTL cleanup edge function) is probably
   neutral or negative on aggregate cost.
3. Caching is strictly additive. Ship without it; add when/if Phase 5 or
   Phase 8 analytics show a material hit-rate signal.

If we need to reverse this, the follow-up is scoped and small
(~200 LOC + migration).

---

## 7. Error semantics

| Class | Surfacing |
|---|---|
| Hard | `partial_failures` is empty; raise HTTP 4xx / 5xx |
| Soft | Propagate `partial_failures` from perception (if consulted) plus per-prompt SAM 3 failures (`"sam3:<prompt>:<err>"`). Pipeline proceeds if union mask is non-empty. |

**Specific soft-failures we tolerate:**
- Up to 4 of 20 SAM 3 prompts erroring (any more → 502, union is unreliable).
- Empty Run 3-style union mask → short-circuit to "no furniture detected"
  (return input as empty_room_url with `mask_coverage_raw_pct = 0`). This
  handles legitimately empty rooms (room-06, room-14).

---

## 8. Container & dependencies

- Base image: `modal.Image.debian_slim(python_version="3.10")`
- GPU: **A10G** (same tier as perception; cheap inference, room for LaMa
  self-host fallback if fal goes dark).
- Warm replicas: `min_containers=0` during bench, `min_containers=1` after
  Phase 5 wiring.
- Concurrency: default (single worker per container).
- Startup timeout: 60s (no SAM weight load — we call fal; only cold imports).
- Invocation timeout: 120s.
- Secrets:
  - `supabase-secrets` — for future cache + attribution logging
  - `fal-secrets` — SAM 3, LaMa, Bria calls

Python packages: `fastapi`, `pydantic`, `requests`, `fal-client`, `Pillow`,
`numpy`, `opencv-python-headless`, `scikit-image` (for `skimage.metrics.ssim`).

No ML weights baked in; no SAM 2 / MediaPipe / PaddleOCR (unlike perception).
Cold start is dominated by Python + fastapi import (~2-3s).

---

## 9. Deprecation targets (F2-CONSOLIDATION.1)

Phase 0 audit flagged two Modal apps that overlap with Phase 2 scope:

- `cova-restoration-pipeline` — earlier per-room inpainter wrapper; superseded.
- `cova-grounded-sam2` — Grounded-SAM2 mask endpoint; superseded by SAM 3 +
  the Phase 1 perception service.

Both remain deployed through Phase 5 integration to avoid a flag-day
migration. Remove once `cova-empty-room` is consumed by step-6 in production.

---

## 10. Handoffs

- **Phase 5 (redesign):** call `/v1/generate_empty_room`, pass the resulting
  `empty_room_url` as the reference image for NB-Pro / FLUX.2 Pro Edit. Use
  `mask_coverage_dilated_pct` to decide whether to apply extra prompt
  scaffolding for high-coverage rooms (F2-COVERAGE.1).
- **Phase 8 (refinement):** if the user requests a "keep this object" after
  seeing the redesign, Phase 8 will call Phase 1 `/encode_sam2_for_cache` on
  the empty-room output and run tap-to-SAM client-side. No direct Phase 2
  dependency.

---

## 11. Out of scope (documented non-goals)

- **High-coverage room UX gate.** Rooms with dilated coverage > 50% still
  degrade (Phase 0.5 limitation #1). We return the best we can; Phase 8 UI
  will show the "photo too cluttered" message (F2-COVERAGE.1).
- **Ghost post-processing.** Phase 0.5 identified residual ghost furniture
  from SAM 3 detection ceiling on heavy clutter. Not fixed here; deferred to
  Phase 1 hardening.
- **High-frequency texture drift.** Stacked-stone / plank-floor drift
  (F2-TEXTURE.1). Acceptable limitation.
- **Custom LaMa self-host on Modal.** Only if fal-ai/lama goes dark
  (pause-and-report trigger).
