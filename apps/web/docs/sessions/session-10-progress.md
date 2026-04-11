# Session 10 Progress — Step 6 Render Loading Screen

## Pre-flight findings

### Render route input fields (`/api/render`)

Interface `RenderRequestBody` defines:

- `photo_url: string` — required
- `depth_map_url: string` — required (but null is passed safely)
- `keep_mask: Array<{type, bbox, confidence, keep, label}> | null` — accepts full KeepMaskItem[]
- **`fingerprint_vector: StyleFingerprint`** — NOT `fingerprint`. The store holds this as `fingerprintStore.fingerprint`
- `room_type: string` — required
- `budget: 'budget' | 'mid' | 'premium' | 'luxury'` — required
- `inclusions: string[]` — required field, but fingerprint store has NO `inclusions` or `constraints` field
- `constraints: string[]` — same: store has no field, pass empty arrays
- `reference_image_urls?: string[]` — optional
- `room_id: string` — required
- Optional room physical context: `room_length`, `room_width`, `ceiling_height`, `natural_light`, `floor_type`, `wall_finish`, `fixed_elements`, `wall_layout`

### Store → API field mapping

| Store field                    | API field              | Notes                                          |
| ------------------------------ | ---------------------- | ---------------------------------------------- |
| `fingerprintStore.fingerprint` | `fingerprint_vector`   | Critical rename                                |
| `fingerprintStore.roomType`    | `room_type`            | Direct                                         |
| `fingerprintStore.budgetTier`  | `budget`               | Direct                                         |
| `roomStore.keepMask`           | `keep_mask`            | Direct                                         |
| `roomStore.depthMapUrl`        | `depth_map_url`        | Direct                                         |
| `roomStore.referenceImageUrls` | `reference_image_urls` | Direct                                         |
| (none)                         | `inclusions`           | Empty array — not in store                     |
| (none)                         | `constraints`          | Empty array — not in store                     |
| (none)                         | `room_analysis`        | Passed as null — API accepts individual fields |

### Render status response shape

`/api/render/status` returns:

- `status: 'processing' | 'failed' | 'complete'`
- `render_url: string` — present when complete
- `render_session_id: string | null` — present when complete
- `error: string` — present when failed
- **NO `preview_url`** — spec assumed Schnell preview; actual API does not return this
- **NO `schnell_prediction_id`** — API only returns `prediction_id` from render POST

### Schnell preview

The API never returns `preview_url` or `schnell_prediction_id`. The code handles the `preview_url` check defensively (if present, crossfade — but it will never be set in practice). The 'preview' stage is effectively skipped: the loading stays in 'firing' state until the full `render_url` arrives.

## Deviations from spec

| Spec assumption                       | Reality                         | How handled                                                               |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Payload field `fingerprint`           | API uses `fingerprint_vector`   | Fixed: use `fingerprint_vector`                                           |
| `inclusions`/`constraints` from store | Store has neither field         | Pass empty arrays `[]`                                                    |
| Schnell preview URL returned          | Not returned                    | `preview_url` check kept but always skips; 'preview' stage is unreachable |
| `room_analysis` object                | API uses individual flat fields | Passed as `null`, unused optional fields                                  |
| `schnell_prediction_id` returned      | Not returned                    | `setPredictionIds` call handles missing arg                               |

## Replicate CDN domains

Already present in `next.config.mjs`:

- `replicate.delivery`
- `pbxt.replicate.delivery`
- `*.replicate.com`

No changes needed.

## Navigation guard

- `if (renderUrl)` → redirect to step-7 (back navigation guard)
- `if (predictionId)` → skip fire (prevents double-fire in React strict mode)
- Retry: clears `predictionId` to `''`, increments `fireCount` to retrigger fire effect

## Interval cleanup

- `intervalRef.current` cleared in all exit branches
- `timeoutRef.current` (800ms nav delay) cleared on unmount
- Unmount cleanup in fire effect: N/A (fetch is fire-and-forget)
- Unmount cleanup in polling effect: `return () => clearInterval(intervalRef.current)`

## Playwright results

- `render-pipeline.spec.ts`: 2/2 passing
- Full suite: **72/72 passing** — zero regressions

## Commit

`8c32171` — session-10: step-6 progressive render loading UI
