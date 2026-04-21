# Phase 1 — Codebase Audit (pipeline fix)

Date: 2026-04-21

## 1. Empty-room furniture prompts (20)

Hardcoded in `modal_pipeline/empty_room.py:47-68`:
```
sofa, chair, table, bed, lamp, rug, cabinet, plant, dresser, desk, tv,
ottoman, bookshelf, curtains, artwork, mirror, fireplace insert,
radiator, media unit, bench
```
**Gap:** no clothes/laundry, no backpack, no boxes, no electronics
(monitor, keyboard), no string lights, no shoes, no nightstand,
no cardboard, no pillows/bedding, no general "furniture/clutter".
A messy bedroom with backpacks, clothes on floor, string lights, and
a desk lamp will leave 50%+ of furniture unmasked. The bench rooms
are stratified-clean (popcorn ceiling + cat + 1 bed + 1 dresser);
target room is real-world messy.

## 2. Dilation + routing thresholds

- `DILATION_PX = 24` (empty_room.py:73)
- `SAM3_SCORE_THRESHOLD = 0.30` (line 72)
- `COVERAGE_ROUTER_THRESHOLD_PCT = 35.0` — ≤35% LaMa, >35% Bria (line 74)
- `COVERAGE_REJECT_THRESHOLD_PCT = 90.0` — >90% returns 413
- `COVERAGE_SHORT_CIRCUIT_PCT = 1.0` — **<1% returns the input image unchanged.**

## 3. SAM 3 zero-mask behavior

`empty_room.py:585-603`: if raw coverage < 1.0%, the service builds a
`EmptyRoomResponse` with `inpainter_used="short_circuit"` and
`empty_room_url=req.image_url` — i.e. **returns the original room
unchanged**. This is the catastrophic failure mode for the target room
if SAM 3 misses most of the furniture. **No exception is raised.**

A second silent-pass mode: > 4 hard SAM3 failures raises (line 568),
but partial-prompt failures (timeouts, 1-3 prompts erroring) just get
appended to `partial_failures` and ignored.

## 4. Redesign strength

`redesign.py:49`: `FLUX_STRENGTH = 0.82`. Bench used 0.82, hit 14/15
above gate but room-02 (the only piano+MCM living room) was also
the only room scored as architecturally damaged — strong evidence
that 0.82 is the lift-vs-preserve fault line and that any noisy
input (= our new target with imperfect empty-room) will tilt to the
wrong side.

## 5. Redesign prompt template (verbatim)

`redesign.py:475-532`. Composition:
```
{trigger} interior {trigger} interior {trigger} interior
{typed_prose: BASE_PROSE with "a well-designed {room_phrase}"}
, {ARCHETYPE_VOCAB[archetype]}
, preserve original room architecture
, {room_clause}{budget_fragment}{lifestyle_fragment}
{trigger} interior {trigger} interior
```
Where `BASE_PROSE` = `a well-designed {room_phrase}, photorealistic
interior photography, Architectural Digest editorial quality, 35mm
lens, natural daylight, sharp focus, high resolution`.

NEGATIVE_PROMPT (line 209): `blurry, low quality, distorted,
unrealistic proportions, floating objects, bad lighting, overexposed,
flat, cartoon, illustration, 3d render, CGI, watermark, text,
signature, ugly, poor composition, duplicate furniture`.

**Gap:** the negative prompt does not include "different room",
"different walls", "different perspective", "wall color change",
"changed architecture". The arch-lock clause `preserve original
room architecture` is buried mid-prompt and is single-token weight.

## 6. LoRA loading

URLs are **hardcoded** in `redesign.py:91-142` (mirrored from
`apps/web/lib/styles/lora-registry.ts`). Failure handling: any
`fal-ai/flux-general` failure (HTTP, timeout, invalid response)
falls back to `nano-banana-pro/edit` **without LoRAs at all**
(redesign.py:758-767). NB-Pro fallback is silent-degrade — the
caller is told via `provider_fallback_reason` but the service
still returns 200 OK. There is no per-LoRA download validation;
fal handles that internally.

## 7. Validation between stages

**None.** `apps/web/lib/ai/redesign-client.ts` calls
`/v1/generate_redesign` with whatever URL it receives. The empty-room
service can return the unmodified original (short-circuit case) and
the redesign service will dutifully process it as if it were empty.
No coverage check, no SSIM check, no "is this actually empty"
gate before pushing to redesign.

## 8. Why the 15 bench rooms passed

The bench rooms are **stratified-clean indoor scenes** sourced from
Pexels-style stock libraries:
- room-01: bedroom + bed + dresser + cat. Coverage ≈ 19% raw, 25%
  dilated → LaMa path → patch SSIM 1.0.
- All 15 rooms have < 35% dilated coverage → all routed to LaMa.
- Furniture matches the 20-prompt vocabulary nearly 1:1.
- No clothing piles, no string lights, no monitors/keyboards, no
  cardboard boxes, no backpacks.
- Lighting is even / soft (the stratification axis includes "harsh
  directional" but only 1 room has it).

The target room is the inverse: heavily cluttered student bedroom
with a bed, dresser, office chair, monitor + keyboard + cables,
clothes on the floor, backpack, string lights with hanging photos,
a "DAKSH" wall-letter prop, mounted ceiling fan and visible blinds.
The 20-prompt vocabulary covers maybe 6-7 of those 15+ items.

## 9. Conclusions / fix surface

1. **Expand FURNITURE_PROMPTS** based on Phase 3 SAM3 diagnostic
   to ≥ 35 prompts that actually fire on the target room.
2. **Lower SAM3_SCORE_THRESHOLD** from 0.30 → 0.10. Low-confidence
   detections are still real furniture; cost is identical.
3. **Add morphological close before dilate** — current code only
   dilates, leaving holes inside furniture masks.
4. **Increase DILATION_PX** 24 → 32 to cover edge halos consistently.
5. **Remove the silent short-circuit** — coverage < 2% should raise,
   not return the input. Surface as 422 to caller.
6. **Reduce FLUX_STRENGTH** 0.82 → 0.68 for noisy-input mode.
   Better preservation, slightly weaker LoRA bite (compensated by
   stronger trigger repetition).
7. **Strengthen NEGATIVE_PROMPT** with architectural-drift terms.
8. **Add explicit arch-lock clause at prompt head** instead of mid.
9. **No code changes to bench rooms needed** — they should still pass
   with stricter prompt list.
