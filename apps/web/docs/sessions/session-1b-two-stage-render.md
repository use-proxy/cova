# Session 1b — Two-Stage Render Pipeline

**Date:** 2026-04-05
**Milestone:** M8 (Commerce)

## Problem

`flux-kontext-pro` is instruction-based only — it does not support mask-based
inpainting. The previous implementation stored the mask in the prediction input
as a no-op, meaning kept items were never actually preserved pixel-perfectly.

## Solution: Two-Stage Pipeline

When a keep mask exists (user marked items `keep: true`):

**Stage 1** — `flux-kontext-pro` generates a full AI redesign (no mask).
**Stage 2** — `flux-fill-pro` takes Stage 1 output + inpainting mask,
regenerates only white (non-kept) regions, preserves black (kept) regions
pixel-perfectly.

When no keep mask: single-stage `flux-kontext-pro` as before.

## Implementation

### `apps/web/app/api/render/route.ts`

- Branched on `inpaintingMaskUrl` presence
- Two-stage path: creates Stage 1 prediction, then writes to `rooms` table:
  - `inpainting_mask_url` — mask PNG URL
  - `pipeline_cost_log` — JSON with `two_stage: true`, `stage1_prediction_id`,
    `stage2_pending: true`, `positive_prompt`, `style_strength`
- Single-stage path: unchanged behavior

### `apps/web/app/api/render/status/route.ts`

Three cases on `status === 'succeeded'`:

1. **Stage 1 just completed** (`two_stage && stage2_pending && !stage2_prediction_id`):
   - Fires `flux-fill-pro` Stage 2 prediction
   - Updates `pipeline_cost_log` with `stage2_prediction_id`, `stage2_pending: false`
   - Returns `{ status: 'processing' }` — client keeps polling

2. **Stage 2 in progress** (`two_stage && stage2_prediction_id`):
   - Polls Stage 2 prediction directly
   - On success: writes `render_sessions` + `rooms.render_url` from Stage 2 output
   - Returns `{ status: 'complete', render_url }` when done

3. **Single-stage** (no `two_stage` in cost_log):
   - Existing behavior unchanged

## flux-fill-pro Input Schema

```
image: string          — Stage 1 output URL (base image)
mask: string           — mask PNG URL (white=regenerate, black=preserve)
prompt: string         — positive prompt from Stage 1
steps: 28
guidance: 30
output_format: 'jpg'
output_quality: 90
safety_tolerance: 2
```

Mask convention from `lib/ai/inpainting.ts`:
- Black (0) = preserve (kept items)
- White (255) = regenerate

This matches `flux-fill-pro` convention. No changes to `inpainting.ts` needed.

## Acceptance Criteria Status

- [x] Two-stage fires when `inpaintingMaskUrl` exists
- [x] Single-stage unchanged when no mask
- [x] Status route orchestrates Stage 2 when Stage 1 completes
- [x] Final render URL from Stage 2 written to `rooms` + `render_sessions`
- [x] Single-stage final render URL path unchanged
