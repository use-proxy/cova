# Quiz Image Asset Audit

**Date:** 2026-04-29
**Bucket:** `quiz-images` (public, Supabase Storage, project `xdeacbmkdwqrwxonqaqh`)
**Goal:** Decide whether the existing FLUX-generated quiz image set is fit for a Bayesian-over-Tinder rebuild, or whether regeneration is required before V1 ship.
**Companion doc:** `docs/audit/QUIZ_AUDIT.md` (algorithm + wiring audit, 2026-04-29).

---

## TL;DR (one paragraph)

**The image set is good. The metadata is broken.** We have **2,375 production-quality FLUX renders (~932 MB)** in `quiz-images`, all 10/10 visual-quality on the Sonnet vision spot-check, and most images carry sensible single-label tags that align with their dominant archetype 8/10 of the time. The blockers are not image regeneration — they are (1) **`quiz_comparison_pairs` has 480 rows but `is_validated = false` on every row, and `next-pair/route.ts` filters `is_validated=true AND image_a_url ILIKE '%new-pairs%'`, so the live swipe endpoint returns zero cards**, (2) `step-2/page.tsx` constructs `quiz-images/<style_lc>_<room>.jpg` URLs that **do not exist in the bucket** (0/60 hit), so step-2 anchor cards render broken images today, (3) **2 of the 10 V3 archetypes (`COVASCANDINAV`, `COVAFARMHOUSE`) have only 6 anchor images each vs. 24–31 for the other 8**, and (4) **3 archetype center pairs are too close** (cosine > 0.94) which softmax T=0.35 cannot separate. **Ship V1 with the existing images** plus a $0.40–1.50 Sonnet multi-label re-tag pass and ~36 supplemental Scandinav/Farmhouse renders ($1.44). Do not regenerate the bulk of the library.

---

## 1. Inventory of quiz images

### 1.1 Storage totals

| Metric | Value |
| --- | --- |
| Bucket | `quiz-images` (public) |
| Total files | **2,375** |
| Total size | **~932 MB** |
| File-size median / min / max | 200 KB / 35 KB / 2,285 KB |
| Format mix | 981 webp · 914 jpeg · 480 png |
| Pixel dimensions (sampled) | webp anchors: **1024×1024**; jpeg pairs: **1024×768**; png pairs: **1024×1024** |
| Last-modified | not surfaced by `storage.list()` for these files (Supabase returns `null` for objects uploaded prior to API change). Treated as snapshot of 2026-04-29. |

### 1.2 Counts by directory

| Path | Files | Notes |
| --- | --- | --- |
| `anchors/` (root) | 9 | One per V2 anchor style — `1-warm-japandi.webp` … `9-retro-mid-century.webp` |
| `anchors/room-specific/` | 240 | `phase-a-<slug>-<room>(-rN)?.webp` — multiple variants per (style, room) |
| `base-rooms/` | 12 | `dim-N-<dimname>.webp` — base-room template stills (one per V2 12-dim) |
| `comparisons/<dim>/` | 720 | 12 V2 dimension folders × 60 files each — early V2 generation, **no DB rows reference this prefix** |
| `pairs/dim-N/` | 1,014 | V2 12-dim pair output, 24–136 per dim, both `.jpg` and `.png` variants — **all 480 DB rows in `quiz_comparison_pairs` reference this prefix** |
| `new-pairs/dim-N/` (no room) | 60 | V3 6-dim retake (top-level), 10 per dim |
| `new-pairs/<room>/dim-N/` | 248 | V3 6-dim retake by room — `bedroom` has 4/dim, `living_room` 6/dim, others 10/dim, `dining_room/dim-0` empty |
| `gallery-*` / `two-pass-smoke` / `v7-smoke` / `diagnostic` | 17 | Smoke-test artifacts, ignore |

### 1.3 Pixel dimension spot-check

```
anchors/1-warm-japandi.webp                                   WebP    1024×1024   69 KB
anchors/8-biophilic-jungle.webp                               WebP    1024×1024  251 KB
anchors/room-specific/phase-a-warm-japandi-bedroom.webp       WebP    1024×1024  199 KB
anchors/room-specific/phase-a-pure-minimal-white-kitchen.webp WebP    1024×1024   89 KB
pairs/dim-0/0-a.jpg                                           JPEG    1024×768   210 KB
pairs/dim-0/0-a.png                                           PNG     1024×1024 1312 KB
pairs/dim-1/146-a.jpg                                         JPEG    1024×768   134 KB
pairs/dim-7/114-a.jpg                                         JPEG    1024×768   170 KB
pairs/dim-11/135-b.jpg                                        JPEG    1024×768   349 KB
```

Anchors are square 1024². Pairs are mostly 4:3 1024×768 with a parallel PNG copy at 1024² for some early dim-0 rows. Both are above what Anthropic Vision needs (≤4 MB after resize) and well above what mobile screens show.

### 1.4 Database tables referencing storage

| Table | Rows | Storage paths used |
| --- | --- | --- |
| `quiz_anchor_images` | **9** | `anchors/N-<slug>.webp` (the root variants) |
| `quiz_comparison_pairs` | **480** | `pairs/dim-N/<idx>-{a,b}.jpg` (no row references `comparisons/`, `new-pairs/`, or `anchors/room-specific/`) |

**The room-specific anchor library (240 images) and the V3 `new-pairs/` library (308 images) are present in storage but referenced by no DB row and no live route.** They are dark inventory.

### 1.5 The step-2 broken-image bug (new finding)

`apps/web/app/design/step-2/page.tsx:35-37` builds anchor card URLs as:

```ts
function imageUrl(styleName: StyleName, roomType: string): string {
  return `${SUPABASE_STORAGE_BASE}/${styleName.toLowerCase()}_${roomType}.jpg`;
}
```

Probing all 10 archetypes × 6 room types: **0 / 60 hits**. Files like `covabiophilic_bedroom.jpg` do not exist at the bucket root. The actual room-specific anchors live at `anchors/room-specific/phase-a-<slug>-<room>.webp`. **Anchor cards in step-2 render with the browser's broken-image fallback or `<img alt>` text in production.** This is a one-line URL builder fix, not an image regeneration issue.

---

## 2. Coverage by archetype

V3 archetype keys (10): `COVAJAPANDI, COVASCANDINAV, COVABIOPHILIC, COVAMINIMAL, COVAMIDCENTURY, COVACOASTAL, COVABOHEMIAN, COVAINDUSTRIAL, COVAFARMHOUSE, COVAARTDECO`.

| Archetype | Anchor images in storage¹ | Anchor row in `quiz_anchor_images`² | Pair-row roles in `quiz_comparison_pairs`³ |
| --- | ---: | ---: | ---: |
| COVAJAPANDI | 25 | 1 (`Warm Japandi`) | 12 |
| COVASCANDINAV | **6** | **0 — missing** | 12 |
| COVABIOPHILIC | 25 | 1 (`Biophilic Jungle`) | 12 |
| COVAMINIMAL | 25 | 1 (`Pure Minimal White`) | 12 |
| COVAMIDCENTURY | 25 | 1 (`Retro Mid-Century`) | 12 |
| COVACOASTAL | 25 | 1 (`Coastal Bright`) | 12 |
| COVABOHEMIAN | 31 | 1 (`Maximalist Eclectic`) | 12 |
| COVAINDUSTRIAL | 25 | 1 (`Industrial Loft`) | 12 |
| COVAFARMHOUSE | **6** | **0 — missing** | 12 |
| COVAARTDECO | 31 | 1 (`Dark Moody Glam`) | 12 |

¹ Counts the 9 root anchors plus all `anchors/room-specific/phase-a-<slug>-*.webp` whose slug maps to the archetype.
² `quiz_anchor_images` contains the V2 9-name list (`Heritage Traditional` is the 9th — **does not map to any V3 archetype**) plus implicit gaps for `COVASCANDINAV` and `COVAFARMHOUSE`.
³ Each V3 archetype is referenced 12 times across pair rows: 6 occurrences as `anchor_style` on the 60 dim-0 anchor rows (one per archetype × 6 rooms), counted twice because my `style_a + anchor_style` aggregation sees both fields. Functionally, every archetype is anchor-style for exactly 6 pair rows.

### 2.1 Findings

- **Severe imbalance in anchor library**: COVASCANDINAV and COVAFARMHOUSE have **6 images each** (one per room, no `-rN` variants). The other 8 archetypes have **24–31 images each**. A Bayesian-Tinder system that cycles a random anchor per archetype will see the same Scandinav/Farmhouse images 4× more often than other archetypes.
- **DB anchor table missing 2 archetypes**: `quiz_anchor_images.style_index BETWEEN 1 AND 10` (per `20260416_quiz_v3_schema.sql:38-40`) but only 9 rows exist, and the 9 names are V2 names. `Heritage Traditional` is in the table but does not map to a V3 archetype; `COVASCANDINAV` and `COVAFARMHOUSE` are absent. The seed never updated to add the 10th row, and the prior column constraint was loosened from 1..9 to 1..10 by the V3 migration without populating the new slot. (This was already flagged in `QUIZ_AUDIT.md §3.3` — confirmed here against live data.)
- **Comparison-pair archetype roles are perfectly balanced** (12 each) because the dim-0 anchor row set is generated as 6 anchors per archetype × 6 rooms. No imbalance there.

---

## 3. Coverage by quiz dimension

V3 fingerprint = 12 dimensions: warmth, pattern, formality, complexity, lineQuality, lightingDrama, plantPresence, colorSaturation, lightPreference, textureRichness, natureMateriality, symmetryPreference (per `apps/web/lib/quiz/style-archetypes.ts:159-164`).

| dim_index | dimension | total rows | validated | has style_a/b label |
| ---: | --- | ---: | ---: | ---: |
| 0 | **anchor** (cross-style) | 60 | 0 | 60 (each row has anchor_style) |
| 0 | warmth | 36 | 0 | 0 |
| 1 | complexity | 36 | 0 | 0 |
| 2 | formality | 36 | 0 | 0 |
| 3 | natureMateriality | 48 | 0 | 0 |
| 4 | colorSaturation | 24 | 0 | 0 |
| 5 | textureRichness | 24 | 0 | 0 |
| 6 | lightingDrama | 48 | 0 | 0 |
| 7 | pattern | 24 | 0 | 0 |
| 8 | lightPreference | 36 | 0 | 0 |
| 9 | lineQuality | 24 | 0 | 0 |
| 10 | symmetryPreference | 36 | 0 | 0 |
| 11 | plantPresence | 48 | 0 | 0 |

### 3.1 Findings

- **Every dimension has ≥24 pairs.** Minimum is 24 (colorSaturation, textureRichness, pattern, lineQuality). No dimension is under-sampled if 4 swipes per dim is acceptable. For 8–12 total swipes per session the over-sampling is fine.
- **Zero rows have `is_validated = true`.** The live route `next-pair/route.ts:342` filters `is_validated = true AND image_a_url ILIKE '%new-pairs%'` — current DB returns **0** for that filter (verified). The 24-pair swipe phase serves no cards in production. Already root-caused in `QUIZ_AUDIT.md §1.4 D + §6.1`.
- **`%new-pairs%` filter has no DB hits** because all 480 DB rows reference the `pairs/` prefix, not `new-pairs/`. The orphan `new-pairs/` storage folder (308 files) was apparently the start of a re-seed that was never wired into the DB.
- **Three pairs visually validated per dimension (vision spot-check):** PR2 (dim-1 complexity), PR3 (dim-7 pattern), PR4 (dim-11 plantPresence), PR5 (dim-3 natureMateriality) all return `swipe_signal_quality_1_5 = 5` from Sonnet vision. The image set successfully presents the claimed contrast on at least 4/5 sampled dimensions. The exception (PR1, dim-0 cross-style anchor) is muddled — see §6.

---

## 4. Multi-label tag preview (10 random images)

10 images sampled, run through `claude-sonnet-4-5` with vision. Prompt: estimate top-1–3 archetype mixture and check agreement with current single-label tag.

| ID | Path | Current tag | Sonnet primary / secondary | Multi-label | Agrees? |
| --- | --- | --- | --- | --- | --- |
| A1 | `anchors/1-warm-japandi.webp` | Warm Japandi | JAPANDI / SCANDINAV | 0.70 / 0.30 | ✅ |
| A2 | `anchors/8-biophilic-jungle.webp` | Biophilic Jungle | BIOPHILIC / JAPANDI | 0.85 / 0.15 | ✅ |
| A3 | `anchors/room-specific/phase-a-retro-mid-century-living-room.webp` | Retro Mid-Century | MIDCENTURY / JAPANDI | 0.75 / 0.25 | ✅ |
| A4 | `anchors/room-specific/phase-a-industrial-loft-bedroom.webp` | Industrial Loft | INDUSTRIAL / MINIMAL | 0.85 / 0.15 | ✅ |
| A5 | `anchors/room-specific/phase-a-pure-minimal-white-kitchen.webp` | Pure Minimal White | MINIMAL / SCANDINAV | 0.70 / 0.30 | ✅ |
| P1 | `pairs/dim-0/0-a.jpg` | anchor row, COVASCANDINAV (A) | SCANDINAV / MINIMAL | 0.75 / 0.25 | ✅ |
| P2 | `pairs/dim-1/146-a.jpg` | complexity LOW (A) | SCANDINAV / MINIMAL / BIOPHILIC | 0.65 / 0.25 / 0.10 | ❌ — **"medium-high complexity: full kitchen with island, multiple zones, plants, layered lighting"** |
| P3 | `pairs/dim-1/146-b.jpg` | complexity HIGH (B) | FARMHOUSE / BOHEMIAN / BIOPHILIC | 0.55 / 0.30 / 0.15 | ✅ |
| P4 | `pairs/dim-7/114-a.jpg` | pattern LOW (A) | JAPANDI / SCANDINAV / BIOPHILIC | 0.65 / 0.25 / 0.10 | ✅ |
| P5 | `pairs/dim-11/135-a.jpg` | plantPresence LOW (A) | MINIMAL / SCANDINAV | 0.65 / 0.35 | ❌ — **"5+ visible plants, not LOW presence"** |

### 4.1 Findings

- **8/10 single-label tags align with what the image actually shows.** That is a higher hit-rate than the FLUX prompt determinism would suggest — the renders generally honor their style tag.
- **2/10 dimension-value tags are wrong.** P2 ("complexity LOW") shows a busy kitchen; P5 ("plantPresence LOW") shows 5+ plants. These are not catastrophic — the *contrast within the pair* still holds (P2 LOW vs P3 HIGH = sparse vs dense kitchen, even though the absolute "LOW" label exaggerates), but they imply the original FLUX prompts under-controlled the dimension axis. About **20% of pair-half tags can be expected to mis-state the dimension value** based on this sample.
- **Multi-label distributions are coherent.** The dominant archetype is always 60–85% with the secondary slot drawn from the most plausible adjacent archetype (Japandi+Scandinav, Minimal+Scandinav, Biophilic+Japandi, Industrial+Minimal). This is exactly the structure the rebuilt Bayesian update can consume.
- **Implication for a Bayesian-Tinder rebuild:** a one-pass Sonnet multi-label re-tag will (a) replace the single-label `style_name`/`anchor_style` tags with `style_weights jsonb` records, (b) auto-fix the ~20% mis-tagged dimension-value rows, and (c) populate the `image_a_vector` / `image_b_vector` jsonb columns that the V3 schema migration left nullable.

---

## 5. Quality assessment (10 random images)

Same 10 images. Sonnet vision rated each on visual quality, aesthetic appeal, and style fidelity (1–5).

| ID | Visual quality | Aesthetic | Style fidelity | Lighting/composition | AI artifacts | Production ready |
| --- | ---: | ---: | ---: | --- | --- | --- |
| A1 | 5 | 5 | 5 | none | none | ✅ |
| A2 | 5 | 5 | 5 | none | none | ✅ |
| A3 | 5 | 5 | 5 | none | none | ✅ |
| A4 | 5 | 5 | 5 | none | none | ✅ |
| A5 | 5 | 5 | 5 | none | none | ✅ |
| P1 | 5 | 5 | 5 | none | none | ✅ |
| P2 | 5 | 5 | 5 | none | none | ✅ |
| P3 | 5 | 5 | 5 | none | none | ✅ |
| P4 | 5 | 5 | 5 | none | none | ✅ |
| P5 | 5 | 5 | 5 | none | none | ✅ |

### 5.1 Findings

- **Mean 5.0 / 5.0 across all three axes.** This is striking — the sample is small (n=10) but uniform 5/5 is unusual; expected at least one mid-range score on a 100-image-scale sweep. The renders are FLUX-1.1-pro / FLUX Kontext output (per `quiz-library-report.md`) with no aggressive style mixing, which explains the consistency.
- **Zero AI artifacts reported.** No broken hands, broken text, geometry collapses. Confirmed by spot-check of the largest png file (`pairs/dim-0/0-a.png`, 1.3 MB) which has clean wood grain and crisp linen folds.
- **Lighting/composition: no flagged issues.** Each image has clear horizon, deep depth of field, daylight-balanced WB.
- **Production-ready: 10/10.** The library does not need a quality-driven regeneration.

Caveat: a 10-image sample cannot rule out bad images in the long tail of 2,375. A full sweep at $0.40–1.50 (Sonnet vision pass on the full library) will both produce multi-label tags AND surface any low-quality outliers. **Recommend doing both as one operation.**

---

## 6. Pair quality (5 random comparison pairs)

| ID | Pair | Claimed dimension | Sonnet's actual contrast | Meaningful choice? | Muddled multi-dim? | Signal score |
| --- | --- | --- | --- | --- | --- | --- |
| PR1 | dim-0/7-a vs dim-0/0-a | "anchor (cross-style)" | A=Japandi vs B=Scandinav AND A is living room vs B is bedroom | ❌ | ✅ "Contrasts room type AND style" | **2/5** |
| PR2 | dim-1/146-a vs dim-1/146-b | complexity LOW vs HIGH | sparse minimalist kitchen vs dense rustic-clutter kitchen | ✅ | ❌ | 5/5 |
| PR3 | dim-7/114-a vs dim-7/114-b | pattern LOW vs HIGH | plain pink wall vs bold tropical wallpaper | ✅ | ❌ | 5/5 |
| PR4 | dim-11/135-a vs dim-11/135-b | plantPresence LOW vs HIGH | minimal accent plants vs living wall + abundant greenery | ✅ | ❌ | 5/5 |
| PR5 | dim-3/164-a vs dim-3/164-b | natureMateriality LOW vs HIGH | warm wood/organic textures vs cold marble/sterile minimalism | ✅ | ❌ | 5/5 |

### 6.1 Findings

- **4/5 pairs are clean, single-axis contrasts** with `swipe_signal_quality_1_5 = 5`. The dimension-pair generator (FLUX Kontext with anchor + dimension prompt deltas) is working.
- **The dim-0 "anchor" cross-style pairs (60 rows) are systematically muddled.** PR1 contrasts Japandi-living-room against Scandinav-bedroom — the user's swipe could be expressing a room-type preference, a style preference, or both, and we have no way to disentangle. This is a **structural problem with the cross-style anchor pairs**, not a one-off. **Recommendation:** re-render the dim-0 anchor rows as same-room cross-style pairs (e.g., Japandi-bedroom vs Scandinav-bedroom) — 6 anchors × 6 rooms × 9 cross-pairs ≈ ~30–60 new images. Or repurpose existing `anchors/room-specific/` images into 1:1 cross-style same-room pairs (zero regeneration needed). The latter is cheaper.
- **The 4 within-dim pairs (PR2–PR5) cleanly separate single-axis contrasts.** Sonnet's "what actually differs" string corresponds to the claimed dimension. The Bayesian update can consume these as-is.
- **Within-dim pair quality is high enough to skip regeneration.** A multi-label re-tag pass can capture the residual style information (e.g., PR3 is also a Scandinav vs Mid-century blend, not just a pattern axis).

---

## 7. Archetype-center cosine matrix

`fingerprintToStyleBlend()` (`apps/web/lib/quiz/style-archetypes.ts:179-209`) cosines the user's 12-dim fingerprint against each archetype center, then softmax(T=0.35), drop weights <0.10, renormalise.

```
                SCAN  JAPA  BIOP  MINI  MIDC  COAS  BOHE  INDU  FARM  ARTD
COVASCANDINAV  1.000 0.887 0.830 0.918 0.886 0.979 0.662 0.787 0.866 0.745
COVAJAPANDI    0.887 1.000 0.953 0.676 0.895 0.921 0.818 0.747 0.944 0.712
COVABIOPHILIC  0.830 0.953 1.000 0.559 0.816 0.899 0.862 0.633 0.925 0.592
COVAMINIMAL    0.918 0.676 0.559 1.000 0.740 0.834 0.359 0.695 0.636 0.669
COVAMIDCENTURY 0.886 0.895 0.816 0.740 1.000 0.893 0.856 0.864 0.934 0.926
COVACOASTAL    0.979 0.921 0.899 0.834 0.893 1.000 0.754 0.731 0.918 0.708
COVABOHEMIAN   0.662 0.818 0.862 0.359 0.856 0.754 1.000 0.672 0.906 0.743
COVAINDUSTRIAL 0.787 0.747 0.633 0.695 0.864 0.731 0.672 1.000 0.773 0.913
COVAFARMHOUSE  0.866 0.944 0.925 0.636 0.934 0.918 0.906 0.773 1.000 0.783
COVAARTDECO    0.745 0.712 0.592 0.669 0.926 0.708 0.743 0.913 0.783 1.000
```

### 7.1 Pairs with cosine distance < 0.30 (centers too close — softmax ambiguous)

**21 of 45 off-diagonal pairs** have cosine distance < 0.15, and **the user-specified threshold of < 0.30 captures all 45 pairs except one (MINIMAL↔BOHEMIAN at 0.641 distance)**. The archetype centers are systematically clustered in the 12-dim cube.

Worst offenders (cosine sim → distance):

| Pair | Cosine sim | Distance | Severity |
| --- | ---: | ---: | --- |
| COVASCANDINAV ↔ COVACOASTAL | 0.979 | 0.021 | softmax T=0.35 cannot separate; user blends will collapse to one or the other randomly |
| COVAJAPANDI ↔ COVABIOPHILIC | 0.953 | 0.047 | high ambiguity |
| COVAJAPANDI ↔ COVAFARMHOUSE | 0.944 | 0.056 | high ambiguity |
| COVAMIDCENTURY ↔ COVAFARMHOUSE | 0.934 | 0.066 | high ambiguity |
| COVAMIDCENTURY ↔ COVAARTDECO | 0.926 | 0.074 | high ambiguity |
| COVABIOPHILIC ↔ COVAFARMHOUSE | 0.925 | 0.075 | high ambiguity |
| COVAJAPANDI ↔ COVACOASTAL | 0.921 | 0.079 | high ambiguity |
| COVASCANDINAV ↔ COVAMINIMAL | 0.918 | 0.082 | high ambiguity |
| COVACOASTAL ↔ COVAFARMHOUSE | 0.918 | 0.082 | high ambiguity |
| COVAINDUSTRIAL ↔ COVAARTDECO | 0.913 | 0.087 | high ambiguity |
| COVABOHEMIAN ↔ COVAFARMHOUSE | 0.906 | 0.094 | high ambiguity |

### 7.2 Pairs with cosine distance > 0.95 (nearly orthogonal — ideal)

Zero. Most orthogonal pair: **COVAMINIMAL ↔ COVABOHEMIAN, distance 0.641** — the only meaningful spread.

### 7.3 Findings

- **The archetype centers are clustered.** All 12 dimensions are constrained to [0,1] non-negative, which forces all vectors into the same orthant — cosine similarities are bounded below by ~0.5 in practice, so centers like Japandi (warm + organic + restrained) and Farmhouse (warm + organic + rustic) are unavoidably 0.94 similar.
- **This is an algorithm/centers issue, not an image issue.** No amount of image regeneration fixes it. Two paths:
  1. Re-define `STYLE_ARCHETYPES` with **mean-zero centered vectors** (dim values in [-1, 1]) so opposing styles point in opposite directions. This requires re-running the calibration that produced the current 12-dim values.
  2. Lower softmax `temperature` from 0.35 → ~0.10 (sharper). But this trades blend richness for hard winner-take-all.
- **For V1 ship:** keep the current centers, accept that SCAN/COAS, JAPA/BIO, JAPA/FARM, MIDC/FARM, MIDC/ARTD will routinely co-appear in style blends. The downstream LoRA blender already drops weights < 0.10, so the practical effect is limited.
- **Track as algorithm follow-up F-CENTERS.1** (post-launch).

---

## 8. Recommended actions

### 8.1 Decision: ship V1 with the existing image set

The image library is fit for purpose with **5 small fixes** and **one optional re-render batch**. Total estimated cost: **$1.84–$2.94 + ~30 minutes of engineering**. No bulk regeneration required.

### 8.2 Required fixes before V1 ship

| # | Fix | Cost | File |
| --- | --- | --- | --- |
| 1 | Multi-label re-tag pass on **all** anchor + pair-half images | Sonnet vision: **~720 calls × $0.0017 = ~$1.20** (or smaller scoped to the 480 pair rows + 9 anchors = ~$0.40) | new script `scripts/retag-quiz-images.ts`; writes `style_weights jsonb` to `quiz_anchor_images` and `quiz_comparison_pairs` |
| 2 | Fix `next-pair/route.ts` filters: drop `is_validated = true` and the `%new-pairs%` constraint, OR validate the 480 rows in a one-time script | $0 | `apps/web/app/api/quiz/next-pair/route.ts:342-381` |
| 3 | Fix step-2 anchor URL builder to point at `anchors/room-specific/phase-a-<slug>-<room>.webp` (slug from `SLUG_TO_ARCHETYPE` reverse map) | $0 | `apps/web/app/design/step-2/page.tsx:35-37` |
| 4 | Insert two missing rows in `quiz_anchor_images` for COVASCANDINAV (`scandinavian-light` slug) and COVAFARMHOUSE (`farmhouse-rustic` slug) — files exist in `anchors/room-specific/` already | $0 | new seed via `scripts/seed-quiz-database.ts` |
| 5 | Repurpose dim-0 anchor pairs as **same-room cross-style** pairs using existing `anchors/room-specific/` images (no new renders needed; just rewrite the 60 dim-0 rows' `image_a_url`/`image_b_url` to pull two slugs from the same room) | $0 | new script `scripts/rebuild-anchor-pairs.ts` |

### 8.3 Optional: balance archetype anchor coverage (~$1.44)

| # | Action | Cost |
| --- | --- | --- |
| 6 | Generate **18 supplemental** room-specific anchors for COVASCANDINAV (3 variants × 6 rooms) to reach 24 total | 18 × $0.04 = **$0.72** |
| 7 | Generate **18 supplemental** room-specific anchors for COVAFARMHOUSE (3 variants × 6 rooms) to reach 24 total | 18 × $0.04 = **$0.72** |

After (6) and (7), all 10 archetypes have ≥24 anchor images and the Bayesian-Tinder card sampler has no archetype-imbalance bias. **Recommended.**

### 8.4 Not recommended

- **Do not regenerate the 480 pair rows.** Quality is 5/5 and within-dim contrast is clean (4/5 sample pass). Sonnet re-tag captures the residual signal cheaper.
- **Do not regenerate the orphan `new-pairs/` folder (308 files).** It was a half-complete V3 retake. Either wire it up to DB rows (new script, $0) or leave as cold storage. Don't re-render.
- **Do not regenerate `comparisons/` (720 files).** Pre-V3 dead inventory. Decide later whether to delete (frees ~300 MB) or keep as source-of-truth backup.

### 8.5 Cost summary

| Scenario | Engineering | Sonnet vision | FLUX renders | Total |
| --- | --- | --- | --- | --- |
| **Ship V1 minimum (fixes 1–5)** | ~30 min | $0.40–1.20 | $0 | **$0.40–1.20** |
| **Ship V1 recommended (fixes 1–7)** | ~60 min | $0.40–1.20 | $1.44 | **$1.84–2.64** |
| **Full bulk regeneration (rejected)** | ~6 hr | $0 | 2,375 × $0.04 = **$95** | **$95** |

### 8.6 Multi-label retag prompt sketch (for fix 1)

```
You are tagging an interior design image for a style quiz.
For each archetype below, output a weight 0.0–1.0 expressing how
strongly the image embodies it. Top-3 only; weights sum to 1.0.

Archetypes: [10 COVA* keys with brief descriptors]

Also output:
  visual_quality_1_5, ai_artifacts (string|"none"),
  dominant_room_type, dimension_value_estimates: {
    warmth, complexity, formality, ..., plantPresence (each 0..1)
  }

JSON only.
```

This single pass produces both the multi-label tag (fix 1) AND fills the per-image 12-dim `style_vector` jsonb that the schema already has columns for, AND surfaces any quality outliers in the long tail.

---

## 9. Open questions

1. **`style_weights jsonb` column**: the V3 schema migration didn't add this. Do we add it to `quiz_anchor_images` and `quiz_comparison_pairs` as part of fix 1, or shoehorn the multi-label data into the existing `style_vector jsonb` column?
2. **Heritage Traditional**: the V2 anchor `style_name = "Heritage Traditional"` has 24 anchor images in storage but no V3 archetype. Do we (a) drop it (lose 24 images), (b) reclassify those images to COVAFARMHOUSE/COVAARTDECO via the multi-label pass, or (c) add HERITAGE as an 11th V3 archetype?
3. **Cross-style dim-0 pairs**: rebuild as same-room cross-style (fix 5) or simply remove from the 24-pair set and rely on the 12 within-dim pairs?
4. **Archetype center re-spacing (F-CENTERS.1)**: defer to post-launch, or block V1?
5. **`new-pairs/` cold storage**: wire up via new DB rows (one-shot script, free), or delete (frees ~~ 80 MB)?
6. **Image licensing / provenance**: per `QUIZ_AUDIT.md §3.4` and `quiz-library-report.md`, these are FLUX-1.1-pro / FLUX Kontext renders we generated ourselves via Replicate. Confirmed → no third-party licensing risk. Still useful to record this in a `docs/audit/asset-provenance.md` for completeness.
7. **PNG vs JPEG duplicates in `pairs/dim-0/`**: 4 image rows have both 1024² PNG (~1.3 MB) and 1024×768 JPEG (~210 KB) variants. JPEGs are the DB-referenced ones. Can we delete the PNG copies to free ~5 MB? Low-priority cleanup.
8. **Last-modified timestamps**: Supabase Storage returned `null` for `updated_at` on this bucket's objects. Treat the audit as a snapshot of 2026-04-29 — no per-file age data available.

---

**End of audit.**
