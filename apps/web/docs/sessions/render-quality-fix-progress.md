# Render quality fix — 2026-04-08

## Problem
Kontext Pro renders against IMG_2093 (Daksh's bedroom) were producing
color-filter outputs rather than actual redesigns:
- Pass 1 kept original clutter and furniture
- Pass 2 changed wall color instead of correcting architecture
- Sideways iPhone photos (EXIF orientation 6) came back sideways

## Root causes
1. **Prompt structure.** `buildFluxPrompt` led with PRESERVE EXACTLY, which
   caused Kontext to anchor on "keep the input" and hedge on changes. Kontext
   needs transformation framing first.
2. **Missing REPLACE directive.** The old prompt said "redesign the
   furniture" without explicit replacement language. Kontext interpreted
   this as "lightly restyle".
3. **EXIF rotation.** iPhone photos store orientation as metadata (6 = 90° CW).
   Kontext preserves pixel orientation exactly — sideways in, sideways out.
   The capture route already handles this; raw uploads to `room-uploads` don't.

## Winning prompt structure
Live tested against IMG_2093:
1. Transformation intent: "Interior design makeover: this bedroom needs a complete redesign"
2. REPLACE clause: "REPLACE all existing furniture, bedding, soft furnishings, rugs, artwork, lamps and decor with new pieces in this style"
3. Style descriptors (active fingerprint dimensions)
4. ADD clause (inclusions from quiz)
5. "Remove all clutter, personal items, backpacks, cords…"
6. PRESERVE clause (Gemini-derived architectural description)
7. Kept items (user step-5 selections)
8. Budget modifier
9. Quality closer

## Scores vs GPT-4o reference bar

| Variant              | Score | Notes                                                          |
| -------------------- | ----- | -------------------------------------------------------------- |
| Pass1 Variant A      | 8/10  | Clean redesign but lost DAKSH wall letters + photo string      |
| Pass1 Variant B      | 9/10  | Preserved DAKSH (as "DAAKSH"), photo string, rattan chairs     |
| Pass2 Variant B      | 9/10  | Correctly left image untouched — architecture already right    |
| Production structure | 8/10  | Matches variant A quality with Gemini-injected preservation    |

**Winner: Variant B structure**, generalized into `buildFluxPrompt`.
The "DAAKSH" misspelling in Variant B is a Kontext OCR quirk that Gemini's
per-room preservation instructions should correct in production once the
actual wall text is captured into `fixedElements`.

## Files touched
- `apps/web/lib/ai/flux.ts` — `buildFluxPrompt` restructured transformation-first
- `apps/web/scripts/fix-and-test-render.mjs` — test harness (A/B/pass2)
- `apps/web/scripts/validate-production-prompt.mjs` — production-path validation

## EXIF rotation
Already handled in `apps/web/app/api/rooms/capture/route.ts:8-17` via
`correctImageOrientation` (sharp `.rotate()`). IMG_2093 was uploaded raw to
the `room-uploads` bucket bypassing this route — `IMG_2093_rotated.jpeg` was
written upright during testing.

## Production output URL (reference)
- Pass1 Variant A: https://replicate.delivery/xezq/t5bj0IF2Ft63DhBEKuWNId8HsFeZeqci0AxyzaSX2Clhm7YWA/tmpi9p12cyu.jpg
- Pass1 Variant B: https://replicate.delivery/xezq/i2YvAvCEznKYEdao1firJ4BpfJUf0Sh1VMvr6fenWSAs1cHzC/tmp0jnq0rj2.jpg
- Pass2 Variant B: https://replicate.delivery/xezq/ifcQ04REwKxtMas0weSMXCrcPuzT8yemvkdJusCHnjXxN3xsA/tmpv1zki2gk.jpg
- Production structure: https://replicate.delivery/xezq/JPxPfeKjh5sCxEE7zfDW3PCUPoyRfCq6ch6HJd2OTZUVnujZB/tmpnv62ppqe.jpg

## Best prompt (full text — production-structure run)
```
Interior design makeover: this bedroom needs a complete redesign. REPLACE all existing furniture, bedding, soft furnishings, rugs, artwork, lamps and decor with new pieces in this style. bright airy space, flooded with natural light, warm amber tones, honey wood, terracotta, organic curves, soft rounded forms, tactile richness, chunky knits, rough linen, natural stone, woven rattan, abundant natural materials, wood grain, stone, live plants, rattan, linen. ADD: rattan accent chair, jute rug, coastal wall art, table lamp. Remove all clutter, personal items, backpacks, cords, laundry and mess so the room looks professionally staged. PRESERVE EXACTLY WITHOUT ANY CHANGES: light sky blue painted walls, beige carpet floor, white ceiling with a white 5-blade ceiling fan with center light, one window on the left wall with white cellular blinds, camera angle (eye-level view looking toward the corner where the bed meets two walls), room layout and proportions, natural daylight from the window, DAKSH wooden letters mounted on the wall above the bed, string of hanging photos on the wall, white bed frame with built-in storage drawers. This must look like the same physical room. quality mid-range furniture, well-made everyday pieces. Result: the same physical room, transformed into a beautifully staged space. Photorealistic interior design photography, professional staging, same lighting as the original photo
```
