# Calibration Notes — Anchor-Derived Style Rulebooks

**Generated:** Phase 0 of Render v2 rebuild (2026-04-21)
**Artifact scope:** `/tmp/style-rules/*.json`, `/tmp/style-rules/*-pass1.txt`, `/tmp/style-rules/*-pass2.txt`
**Anchors scope:** `/tmp/anchors/<slug>/<room>.webp` — 9 styles × 6 rooms = 54 anchors

---

## Phase 0A — Smell test of 3 canary JSONs

### Warm Japandi — PASS WITH NOTE

| Axis | Expected (spec) | Anchor-derived | Delta | Verdict |
|---|---|---|---|---|
| wall_decor | 2-4 pieces, single statement or asymmetric pair | 0-1 pieces, single statement | -50% on low end | Defensible — Japandi walls often are fully bare. |
| surface_styling | 2-3 objects per surface, restrained | 2-4 objects per surface | +25% high end | Within bounds. |
| plants | 1-2, in natural vessels | 1-2, stoneware / ceramic / terracotta | exact | PASS |
| density_axis | "material" (texture, wood tone) OR "object" (low) | derived: **material** | — | PASS |
| wall coverage | <25% | 3-8% | — | PASS |
| dominant wood tone | light (oak, walnut) | light oak, linen | — | PASS |

**Note:** wall_decor 0-1 is at the LOW end of spec expectations. Acceptable because the spec explicitly allows "single statement" — 1 piece is a single statement, 0 pieces is bare. Anchor images likely feature minimal or no wall art. Not a regeneration trigger.

### Maximalist Eclectic — PASS

| Axis | Expected | Anchor-derived | Verdict |
|---|---|---|---|
| wall_decor | 10-14 pieces, salon hang | 8-20 pieces, salon hang | PASS (brackets expected) |
| surface_styling | 5-8 objects per surface | 5-12 objects per surface | PASS (at / above high end) |
| plants | 4-6 | 5-10 | PASS |
| density_axis | "object" | derived: **object** | PASS |
| wall coverage | 60-80% | 40-70% | PASS (~20% delta, within 30%) |

### Biophilic Jungle — PASS

| Axis | Expected | Anchor-derived | Verdict |
|---|---|---|---|
| wall_decor | 0-2 pieces (often none) | 0-1 pieces | PASS |
| plants | 12-20 | 12-20 | **EXACT** |
| density_axis | "plant" | derived: **plant** | PASS |
| wall coverage | dominated by plants, not frames | 60-90% living green wall | PASS |

**Phase 0A verdict:** All 3 canaries pass the smell test. No regeneration required.

---

## Phase 0B — Pass 2 fragment specificity

Spot-checked 3 fragments:

- **warm-japandi-pass2.txt:** "1-2 ceramic vases with branches per room, 2-4 objects per surface including wooden bowls and stoneware vessels, 2-4 linen pillows, single jute or wool area rug, paper globe pendant light, 1-2 floor plants in terracotta or rattan" — **SPECIFIC** (names materials: jute, wool, linen, terracotta; names objects: ceramic vases, wooden bowls, stoneware, globe pendant).

- **heritage-traditional-pass2.txt:** "3-6 objects per surface including stacked leather-bound books, fresh floral arrangements in ceramic urns, brass candlesticks, 4-6 pillows per seat, single Persian or Oriental rug, 1-3 plants in white ceramic or brass vessels, large gilded-frame landscape painting above mantel" — **SPECIFIC** (names objects, materials, arrangement).

- **biophilic-jungle-pass2.txt:** "12-20 plants in terracotta and woven vessels on floor clusters and shelves, living green wall covering 60-90% of one wall with cascading vines, 3-5 textured pillows in cream and green tones, jute area rug, 2-4 ceramic and wooden objects per surface" — **SPECIFIC** (named vessels, named wall treatment, density numbers).

**Phase 0B verdict:** All 3 fragments pass the "specific not generic" bar. They read as editorial briefs, not as "add art and plants" placeholder text.

**Note:** Fragments are editorial-brief level, not "interior designer mood board" level (e.g., spec example referenced "hand-dyed indigo washi paper in raw-oak frame" — that's mood-board level). Current fragments are a full grade above generic but one grade below the mood-board ideal. Acceptable for v2; a potential later polish pass (F-V2-FRAGMENT-POLISH.1).

---

## Phase 0C — Pure Minimal White confidence caveat

**Anchor size audit** (bytes per webp):

| Style | Avg | Range | Relative |
|---|---|---|---|
| pure-minimal-white | 57,744 | 38,164 – 90,990 | 1.0× (baseline) |
| warm-japandi | 149,109 | 94,908 – 207,756 | 2.6× |
| heritage-traditional | 246,488 | 115,732 – 332,872 | 4.3× |
| maximalist-eclectic | 371,810 | 260,758 – 464,418 | 6.4× |
| biophilic-jungle | 393,852 | 315,038 – 507,016 | 6.8× |

PMW anchor files are **2.6× to 6.8× smaller** than the other four styles audited. This is consistent with either (a) lower source resolution, (b) higher webp compression due to uniform near-white imagery, or both. In practice, both mean **reduced signal for the critic when using PMW anchors** as the target for aesthetic match.

**Action:** set pipeline flag `PMW_MANUAL_REVIEW_FIRST_N = 5`. The first 5 Pure Minimal White renders in production after the v2 ship must be manually reviewed before being shown to users. This catches calibration drift before it affects users.

---

## Phase 0D — Density axis classification (9 styles)

The `density_axis` field was **missing from all 9 JSONs** produced in the calibration run. It is required by Phase 3's axis-aware Pass 2 templates (object / plant / material / lighting / ornamentation). Derived from anchor numeric data:

| Style | density_tier | density_axis | Rationale |
|---|---|---|---|
| warm-japandi | low | **material** | Density = material richness (light oak, linen, ceramic, stone, paper lantern). Object counts are low across the board (0-1 wall, 2-4 surface, 1-2 plants). The aesthetic commitment lives in material/texture, not object count. |
| maximalist-eclectic | high | **object** | Object counts peak across every axis: 8-20 wall pieces, 5-12 per surface, 5-10 plants. Canonical object-axis density. |
| biophilic-jungle | high | **plant** | 12-20 plants dominate. Wall decor 0-1, surface 2-4 — low outside plants. Matches spec-hinted plant-axis. **Requires dedicated Pass 2B plant sub-pass.** |
| heritage-traditional | high | **ornamentation** | Hero list leans architectural: "ornate marble fireplace mantel," "raised-panel cabinetry with glass doors," "built-in floor-to-ceiling bookcase," "carved mahogany four-poster bed." Negatives explicitly reject "bright white walls without molding" — molding is a positive. Density is crown-molding-density, wainscoting, carved detail, heavy drapery with tassels. |
| dark-moody-glam | medium | **lighting** | lighting.avg_sources_per_room = 3-5 including candles. pass2 fragment explicitly prioritizes "warm pendant and sconce lighting." Mood/drama comes from multiple warm-temp light sources, not object count (3-5 per surface is moderate). |
| industrial-loft | medium | **material** | JSON notes: "exposed brick and concrete surfaces serve as primary visual texture." Material-forward density: exposed brick, concrete, reclaimed wood, black metal, polished concrete. Object count is moderate (3-6 surface) but not the density driver. |
| coastal-bright | low | **object** | Low-tier object axis. Surfaces 2-4, walls 0-1, plants 2-4. Density comes from a small number of tactile small objects (ceramic vessels, woven baskets). |
| pure-minimal-white | low | **object** | Lowest density across the board. Object-axis with minimal count (1-3 per surface, 0-1 wall). Negative density is the aesthetic goal. |
| retro-mid-century | medium | **object** | Moderate object count (3-5 per surface, 1-2 wall with iconic statement pieces). Saturated color accents are material, but density lives in object count and arrangement. |

**Phase 0D verdict:** 9/9 styles classified. Field written to each JSON via `density_axis` key in the commit alongside this file.

### Styles requiring non-object Pass 2 templates

- **biophilic-jungle → plant template + 2A/2B sub-pass** (Pass 2A: sparse decor on non-plant territory; Pass 2B: plant-dedicated inpaint on floor corners + ceiling hang + window sills + surfaces).
- **warm-japandi → material template** (fewer, heavier, more materially interesting objects; object count targets tightened).
- **industrial-loft → material template** (exposed-brick/concrete texture emphasis, not object stack).
- **heritage-traditional → ornamentation template** (crown molding, wainscoting, carved details, layered trim, ornate hardware).
- **dark-moody-glam → lighting template** (multiple practical warm sources, candles, sconces, picture lights; lighting-density drives drama).

All other 4 styles (maximalist-eclectic, coastal-bright, pure-minimal-white, retro-mid-century) route to the standard object template with their tier's strength.

---

## Gate — Phase 0 ready to close?

- [x] 0A: 3 canary JSONs audited; all pass smell test.
- [x] 0B: 3 Pass 2 fragments audited; all pass specificity bar.
- [x] 0C: PMW confidence caveat documented; `PMW_MANUAL_REVIEW_FIRST_N = 5` flag noted for pipeline implementation.
- [x] 0D: density_axis derived for all 9 styles and written into JSONs.

**Gate: PASS.** Ready to proceed to Phase 1 (empty-room hardening) once user confirms scope of autonomous work.
