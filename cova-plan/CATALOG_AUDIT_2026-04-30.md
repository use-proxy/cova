# Cova V1 — Quiz Catalog Audit

_Generated: 2026-05-01T04:45:08.757Z_
_Scope: Option 3 — `swipe-cards` + `showcase` + `quiz-pairs` + `quiz-images/{anchors,base-rooms,new-pairs}` (1492 images)_

## Executive Summary

- **Images audited:** 1492
- **Successful classifications:** 1485
- **Errors / no classification:** 7
- **Useful (useful_for_quiz=true AND quality≥good AND in 12-style/6-room taxonomy):** 1428
- **Coverage cells filled to target (≥6):** 48 / 72 (67%)
- **Total Sonnet 4.5 cost:** $10.2482 (2,643,792 in + 154,457 out tokens)

### By bucket

| bucket | total | classified | useful | rejected | errors |
|---|---|---|---|---|---|
| swipe-cards | 400 | 399 | 398 | 1 | 1 |
| quiz-pairs | 342 | 341 | 338 | 3 | 1 |
| showcase | 129 | 129 | 110 | 19 | 0 |
| quiz-images | 621 | 616 | 616 | 0 | 5 |

## A) Coverage Matrix (useful_for_quiz=true, quality ≥ good)

```
style \ room             living-room       bedroom           kitchen           dining-room       office            bathroom          TOTAL   
---------------------------------------------------------------------------------------------------------------------------------------------
scandinavian             19                6                 5                 12                27                0                 69      
japandi                  107               98                4                 65                59                27                360     
mid-century-modern       29                14                4                 20                24                2                 93      
modern-farmhouse         1                 1                 12                1                 1                 2                 18      
industrial               15                5                 9                 7                 11                9                 56      
traditional              18                25                4                 22                19                9                 97      
contemporary-minimalist  117               65                30                38                44                49                343     
bohemian                 27                26                4                 9                 5                 6                 77      
coastal                  24                21                2                 22                13                2                 84      
mediterranean            5                 1                 4                 7                 0                 0                 17      
art-deco                 7                 6                 5                 5                 4                 6                 33      
organic-modern           59                23                20                26                27                26                181     
---------------------------------------------------------------------------------------------------------------------------------------------
TOTAL                    428               291               103               234               234               138               1428    
```

Target: **6 cards per (style, room)** = 432 total cards.

## B) Gap Analysis

Cells below target sorted by largest gap. 24 cells need more images; 48 are already complete.

| style | room | have | need more |
|---|---|---|---|
| mediterranean | office | 0 | +6 |
| mediterranean | bathroom | 0 | +6 |
| scandinavian | bathroom | 0 | +6 |
| mediterranean | bedroom | 1 | +5 |
| modern-farmhouse | living-room | 1 | +5 |
| modern-farmhouse | bedroom | 1 | +5 |
| modern-farmhouse | dining-room | 1 | +5 |
| modern-farmhouse | office | 1 | +5 |
| coastal | kitchen | 2 | +4 |
| coastal | bathroom | 2 | +4 |
| mid-century-modern | bathroom | 2 | +4 |
| modern-farmhouse | bathroom | 2 | +4 |
| art-deco | office | 4 | +2 |
| bohemian | kitchen | 4 | +2 |
| japandi | kitchen | 4 | +2 |
| mediterranean | kitchen | 4 | +2 |
| mid-century-modern | kitchen | 4 | +2 |
| traditional | kitchen | 4 | +2 |
| art-deco | kitchen | 5 | +1 |
| art-deco | dining-room | 5 | +1 |
| bohemian | office | 5 | +1 |
| industrial | bedroom | 5 | +1 |
| mediterranean | living-room | 5 | +1 |
| scandinavian | kitchen | 5 | +1 |


### Sourcing recommendations

**FLUX-generate candidates (need ≥4 cards, big gaps):** 12

| style | room | have | need |
|---|---|---|---|
| mediterranean | office | 0 | +6 |
| mediterranean | bathroom | 0 | +6 |
| scandinavian | bathroom | 0 | +6 |
| mediterranean | bedroom | 1 | +5 |
| modern-farmhouse | living-room | 1 | +5 |
| modern-farmhouse | bedroom | 1 | +5 |
| modern-farmhouse | dining-room | 1 | +5 |
| modern-farmhouse | office | 1 | +5 |
| coastal | kitchen | 2 | +4 |
| coastal | bathroom | 2 | +4 |
| mid-century-modern | bathroom | 2 | +4 |
| modern-farmhouse | bathroom | 2 | +4 |

**Unsplash top-up candidates (need 1–3 cards):** 12

| style | room | have | need |
|---|---|---|---|
| art-deco | office | 4 | +2 |
| bohemian | kitchen | 4 | +2 |
| japandi | kitchen | 4 | +2 |
| mediterranean | kitchen | 4 | +2 |
| mid-century-modern | kitchen | 4 | +2 |
| traditional | kitchen | 4 | +2 |
| art-deco | kitchen | 5 | +1 |
| art-deco | dining-room | 5 | +1 |
| bohemian | office | 5 | +1 |
| industrial | bedroom | 5 | +1 |
| mediterranean | living-room | 5 | +1 |
| scandinavian | kitchen | 5 | +1 |

## C) Rejection List (23 images)

Marked `useful_for_quiz=false` or `quality=poor`. These should not enter the V1 quiz catalog.

| bucket | path | reason | classified style/room | notes |
|---|---|---|---|---|
| swipe-cards | `living_room/japandi/card-16.jpg` | quality=undefined | japandi/living-room | Clean example of Japandi style with natural wood flooring, neutral palette, mini |
| quiz-pairs | `bedroom/pair-01-a.jpg` | useful_for_quiz=false | contemporary-minimalist/bedroom | Extremely dark monochromatic palette makes the room nearly indistinguishable and |
| quiz-pairs | `dorm-room/pair-01-a.jpg` | useful_for_quiz=false | contemporary-minimalist/bedroom | The extremely dark, moody lighting obscures most style details and would make it |
| quiz-pairs | `studio/pair-14-a.jpg` | quality=undefined | japandi/living-room | Clean example of japandi style with Scandinavian neutral palette, Japanese minim |
| showcase | `showcase/bohemian-layered/studio/0.jpg` | useful_for_quiz=false | mid-century-modern/living-room | Image has significant text overlay obscuring the center of the room, making it d |
| showcase | `showcase/dark-luxe/bedroom/1.jpg` | useful_for_quiz=false | unclear/other | This is a close-up portrait of a craftsman examining a wooden tool rather than a |
| showcase | `showcase/dark-luxe/home_office/0.jpg` | useful_for_quiz=false | contemporary-minimalist/office | Extremely dark and underexposed lighting makes most details difficult to discern |
| showcase | `showcase/dark-luxe/home_office/1.jpg` | useful_for_quiz=false | contemporary-minimalist/living-room | Dark, moody lighting creates atmosphere but obscures style details; exposed bric |
| showcase | `showcase/dark-luxe/living_room/0.jpg` | useful_for_quiz=false | contemporary-minimalist/living-room | Extremely dark and moody lighting obscures details and makes the space difficult |
| showcase | `showcase/dark-luxe/studio/0.jpg` | useful_for_quiz=false | mid-century-modern/living-room | Very dark moody lighting obscures many details and makes the room difficult to s |
| showcase | `showcase/desert-modern/bedroom/1.jpg` | useful_for_quiz=false | unclear/bedroom | Image is dominated by a close-up of a woodworking tool or portafilter being held |
| showcase | `showcase/industrial-edge/home_office/0.jpg` | useful_for_quiz=false | contemporary-minimalist/office | Dark, moody lighting creates atmospheric shot but obscures style details, making |
| showcase | `showcase/industrial-edge/living_room/0.jpg` | useful_for_quiz=false | contemporary-minimalist/living-room | Very dark, moody lighting makes the teal/green velvet sofa difficult to see clea |
| showcase | `showcase/industrial-edge/studio/0.jpg` | useful_for_quiz=false | scandinavian/living-room | Image is extremely dark and underexposed, making it difficult to discern details |
| showcase | `showcase/industrial-edge/studio/2.jpg` | useful_for_quiz=false | contemporary-minimalist/dining-room | Image is severely underexposed with most of the room in darkness, only the moder |
| showcase | `showcase/moody-eclectic/bedroom/2.jpg` | useful_for_quiz=false | traditional/bedroom | Very dark lighting creates a moody atmosphere but obscures style details; the tu |
| showcase | `showcase/moody-eclectic/home_office/0.jpg` | useful_for_quiz=false | bohemian/office | Very dark, moody lighting obscures much of the room detail; the bohemian element |
| showcase | `showcase/moody-eclectic/living_room/2.jpg` | useful_for_quiz=false | traditional/living-room | Very dark lighting dominates the image with only one lamp illuminated, making mo |
| showcase | `showcase/moody-eclectic/studio/0.jpg` | useful_for_quiz=false | bohemian/living-room | Image is severely underexposed with most of the room in near-total darkness, mak |
| showcase | `showcase/moody-eclectic/studio/2.jpg` | useful_for_quiz=false | contemporary-minimalist/dining-room | Image is severely underexposed with very dark lighting that obscures most detail |
| showcase | `showcase/parisian-chic/bedroom/1.jpg` | useful_for_quiz=false | unclear/other | Close-up shot of a person working on a craft or repair project with a lamp and t |
| showcase | `showcase/scandi-hygge/home_office/1.jpg` | useful_for_quiz=false | contemporary-minimalist/other | This appears to be a modern office break room or common area with strong minimal |
| showcase | `showcase/zen-sanctuary/bedroom/1.jpg` | useful_for_quiz=false | unclear/other | Close-up product photograph of an espresso portafilter with wooden handle, not a |

## D) Anomalies (46 images)

Classified as "unclear" for style or room, or hit a parse/API error.

| bucket | path | kind | style | room | notes |
|---|---|---|---|---|---|
| swipe-cards | `living_room/mid_century/card-3.jpg` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |
| quiz-pairs | `dorm-room/pair-02-a.jpg` | unclear_room | contemporary-minimalist | other | Textbook minimalist space with clean white surfaces, strategic natural light, mi |
| quiz-pairs | `outdoor/pair-01-a.jpg` | unclear_room | contemporary-minimalist | exterior | Textbook contemporary minimalist outdoor space with monochromatic dark palette,  |
| quiz-pairs | `outdoor/pair-02-a.jpg` | unclear_room | contemporary-minimalist | exterior | Textbook contemporary minimalist exterior courtyard with clean white geometric w |
| quiz-pairs | `outdoor/pair-01-b.jpg` | unclear_room | contemporary-minimalist | other | Clean, empty space with floor-to-ceiling windows on both sides, minimal plant de |
| quiz-pairs | `outdoor/pair-03-a.jpg` | unclear_room | contemporary-minimalist | exterior | Pristine minimalist balcony/terrace with clean lines, monochromatic gray palette |
| quiz-pairs | `outdoor/pair-03-b.jpg` | unclear_room | mediterranean | exterior | Terracotta walls, exposed wooden beams, and warm earth tones are quintessentiall |
| quiz-pairs | `outdoor/pair-04-a.jpg` | unclear_room | contemporary-minimalist | exterior | Clean architectural lines, monochromatic palette, minimal furnishings with metal |
| quiz-pairs | `outdoor/pair-04-b.jpg` | unclear_room | organic-modern | exterior | Textbook organic-modern outdoor patio with natural materials, neutral palette, a |
| quiz-pairs | `outdoor/pair-05-b.jpg` | unclear_room | contemporary-minimalist | exterior | Modern outdoor patio/balcony with bold green walls and clean-lined furniture; th |
| quiz-pairs | `outdoor/pair-06-a.jpg` | unclear_room | contemporary-minimalist | exterior | Clean modern patio/terrace space with minimalist aesthetic, warm uplighting on p |
| quiz-pairs | `outdoor/pair-05-a.jpg` | unclear_room | japandi | exterior | Textbook example of Japandi aesthetic with neutral palette, clean lines, natural |
| quiz-pairs | `outdoor/pair-07-b.jpg` | unclear_room | japandi | exterior | Beautiful minimalist patio/balcony space with strong Japandi elements including  |
| quiz-pairs | `outdoor/pair-08-b.jpg` | unclear_room | organic-modern | exterior | Textbook example of organic-modern style with natural materials, neutral palette |
| quiz-pairs | `outdoor/pair-08-a.jpg` | unclear_room | japandi | exterior | Textbook example of Japandi style with natural materials, neutral palette, clean |
| quiz-pairs | `outdoor/pair-09-a.jpg` | unclear_room | contemporary-minimalist | exterior | Pristine outdoor terrace space with clean lines, neutral palette, and minimalist |
| quiz-pairs | `outdoor/pair-11-a.jpg` | unclear_room | contemporary-minimalist | exterior | Textbook example of contemporary minimalist outdoor living space with clean line |
| quiz-pairs | `outdoor/pair-10-a.jpg` | unclear_room | contemporary-minimalist | exterior | Stunning outdoor living space with clean lines, neutral palette, and minimalist  |
| quiz-pairs | `outdoor/pair-11-b.jpg` | unclear_room | organic-modern | exterior | Textbook organic modern courtyard with natural materials, neutral palette, curve |
| quiz-pairs | `outdoor/pair-12-a.jpg` | unclear_room | contemporary-minimalist | exterior | Clean-lined modern architecture with minimalist outdoor furniture, neutral color |
| quiz-pairs | `outdoor/pair-12-b.jpg` | unclear_room | contemporary-minimalist | exterior | Beautiful outdoor courtyard with clean lines, neutral palette, and organic moder |
| quiz-pairs | `outdoor/pair-13-a.jpg` | unclear_room | japandi | exterior | Textbook example of Japandi outdoor living space with clean lines, natural mater |
| quiz-pairs | `outdoor/pair-13-b.jpg` | unclear_room | mediterranean | exterior | Textbook Mediterranean courtyard with arched doorways, terracotta/warm orange ac |
| quiz-pairs | `outdoor/pair-14-b.jpg` | unclear_room | organic-modern | exterior | Textbook organic-modern covered patio with natural materials, neutral palette, s |
| quiz-pairs | `outdoor/pair-15-a.jpg` | unclear_room | contemporary-minimalist | exterior | High-quality architectural photograph of a modern outdoor living space with clea |
| quiz-pairs | `outdoor/pair-15-b.jpg` | unclear_room | contemporary-minimalist | exterior | Clean contemporary courtyard with natural elements; slight organic-modern influe |
| quiz-pairs | `outdoor/pair-16-a.jpg` | unclear_room | contemporary-minimalist | exterior | Clean, minimalist outdoor terrace with neutral palette, modern furniture, and st |
| quiz-pairs | `outdoor/pair-16-b.jpg` | unclear_room | mediterranean | exterior | Textbook Mediterranean courtyard with white stucco walls, terracotta planters, n |
| quiz-pairs | `outdoor/pair-17-b.jpg` | unclear_room | japandi | exterior | Textbook example of japandi outdoor/patio design with natural materials, neutral |
| quiz-pairs | `outdoor/pair-17-a.jpg` | unclear_room | contemporary-minimalist | exterior | Pristine outdoor terrace with clean lines, minimalist furniture, large glass doo |
| quiz-pairs | `outdoor/pair-18-a.jpg` | unclear_room | contemporary-minimalist | exterior | Textbook contemporary minimalist outdoor living space with clean lines, neutral  |
| quiz-pairs | `outdoor/pair-18-b.jpg` | unclear_room | organic-modern | exterior | Textbook organic modern design with curved archways, neutral tones, sculptural f |
| quiz-pairs | `outdoor/pair-19-a.jpg` | unclear_room | contemporary-minimalist | exterior | Textbook contemporary minimalist exterior courtyard with clean lines, monochroma |
| quiz-pairs | `studio/pair-02-b.jpg` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |
| showcase | `showcase/coastal-light/home_office/1.jpg` | unclear_room | contemporary-minimalist | hallway | Clean office hallway with industrial-influenced black framed glass partitions an |
| showcase | `showcase/dark-luxe/bedroom/1.jpg` | unclear_both | unclear | other | This is a close-up portrait of a craftsman examining a wooden tool rather than a |
| showcase | `showcase/desert-modern/bedroom/1.jpg` | unclear_style | unclear | bedroom | Image is dominated by a close-up of a woodworking tool or portafilter being held |
| showcase | `showcase/parisian-chic/bedroom/1.jpg` | unclear_both | unclear | other | Close-up shot of a person working on a craft or repair project with a lamp and t |
| showcase | `showcase/scandi-hygge/home_office/1.jpg` | unclear_room | contemporary-minimalist | other | This appears to be a modern office break room or common area with strong minimal |
| showcase | `showcase/zen-sanctuary/bedroom/1.jpg` | unclear_both | unclear | other | Close-up product photograph of an espresso portafilter with wooden handle, not a |
| showcase | `showcase/zen-sanctuary/home_office/1.jpg` | unclear_room | contemporary-minimalist | hallway | High-end commercial or residential space featuring clean lines, muted color pale |
| quiz-images | `anchors/room-specific/phase-a-maximalist-eclectic-home-office-r2.webp` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |
| quiz-images | `anchors/room-specific/phase-a-pure-minimal-white-bedroom.webp` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |
| quiz-images | `anchors/room-specific/phase-a-pure-minimal-white-dining-room.webp` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |
| quiz-images | `anchors/room-specific/phase-a-warm-japandi-home-office-r1.webp` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |
| quiz-images | `new-pairs/dim-5/1-b.png` | no_classification | - | - | 400 {"type":"error","error":{"type":"invalid_request_error","message":"The reque |

## E) Style Purity Distribution

Counts of each purity bucket per style. A style with a high proportion of "weak" or "mixed" examples is poorly represented and should be re-sourced.

| style | pure | primary | mixed | weak | total |
|---|---|---|---|---|---|
| scandinavian | 42 | 28 | 0 | 0 | 70 |
| japandi | 177 | 190 | 0 | 0 | 367 |
| mid-century-modern | 11 | 84 | 0 | 0 | 95 |
| modern-farmhouse | 9 | 9 | 0 | 0 | 18 |
| industrial | 18 | 38 | 0 | 0 | 56 |
| traditional | 65 | 34 | 0 | 0 | 99 |
| contemporary-minimalist | 206 | 164 | 4 | 0 | 374 |
| bohemian | 8 | 71 | 0 | 0 | 79 |
| coastal | 17 | 67 | 0 | 0 | 84 |
| mediterranean | 2 | 18 | 0 | 0 | 20 |
| art-deco | 5 | 28 | 0 | 0 | 33 |
| organic-modern | 68 | 118 | 0 | 0 | 186 |

## F) Cost Summary

- Model: `claude-sonnet-4-5` (vision)
- Total calls: 1492 (7 errored)
- Input tokens: 2,643,792
- Output tokens: 154,457
- Cost: **$10.2482**

## G) Folder-Name Mapping (pre-vision, for reference)

See conversation transcript for the locked-taxonomy mapping of swipe-cards, showcase, and quiz-pairs folder names. Key out-of-scope folders excluded by path:

- `quiz-pairs/{dorm-room,first-apartment,outdoor,studio}` — 152 images, not in 6-room taxonomy.
- `showcase/{archetype}/studio/` — ~33 images, studio not in 6-room taxonomy.
- `quiz-images/pairs/dim-N` and `quiz-images/comparisons/` — fingerprint-axis pairs, not style+room cards. Skipped from this audit (Option 3 scope).

## H) Raw Data Appendix

See `cova-plan/catalog-audit-raw.json` for the full per-image classifications (one entry per image, with bucket, path, public URL, classification, raw model output, token counts, latency).
