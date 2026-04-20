# Design Director Quick Check

**Date:** 2026-04-19
**File:** `apps/web/lib/ai/design-director.ts`
**Companion:** `apps/web/lib/ai/prompt-compiler.ts`

---

## 1. STYLE_DNA_BLOCKS

**Yes, 11 blocks. Hardcoded.**

```
cvwmn, cvmax, cvind, cvlux, cvcst, cvscn, cvmcm, cvboh, cvdco, cvbio, cvfrm
```

Each maps a short trigger token to a ~20-word material-first description block. These are used as style priming in the FLUX prompt's early token positions. Defined at `design-director.ts:138-150`.

Exported and consumed by `prompt-compiler.ts` and `app/api/quiz/style-preview/route.ts`.

---

## 2. 6D Fingerprint Input

**Yes.** The input interface `DesignDirectorInput` accepts `fingerprint: StyleFingerprint` (line 116).

The fingerprint is processed via `extractV2Vector()` which extracts 6 dimensions:
- `colorTemperature` (mapped as `warmth`)
- `colorSaturation` (mapped as `visual_complexity`)
- `formality` (mapped as `organicness`)
- `density`
- `era` (mapped as `traditionalism`)
- `character`

V1 fingerprints are converted to V2 via `mergeToV2()` from `style-match.ts`.

Dimensions are banded into low/moderate/high (thresholds: <0.35, 0.35-0.65, >0.65) and translated to natural language descriptions in `buildFingerprintContext()` (line 648).

---

## 3. Blended vs Discrete

**Hybrid.** The fingerprint dimensions produce continuous guidance (blended), but the style output is driven by a discrete `loraTrigger` string and discrete `styleAnchor`. The system prompt interprets fingerprint deviations from 0.5 as material/density guidance, while the LoRA trigger determines the dominant aesthetic.

The `style_weights` field in DesignBrief supports primary + optional secondary LoRA, but in practice only primary is used.

---

## 4. Prompt Compiler Word Count

**50-80 words.** Defined in `prompt-compiler.ts` CALL2_SYSTEM (line 49): "TARGET: 50-80 words total."

Validated by `validatePrompt()` which errors if < 50 or > 80 words. Uses Claude Haiku 4.5 at temperature=0.3. Retries once on validation failure.

The Python-side `generate_design_brief()` in `generation.py` targets 80-120 words (line 717) for Fill Pro prompts.

---

## 5. Preservation Clauses

**Yes, both negative and affirmative.**

Negative (hard constraints enforced programmatically in `enforceHardConstraints()`, line 935):
- `"keep all walls, windows, door frames, ceiling, and flooring exactly as shown"` (always)
- `"do not replace, obscure, or cover [item]"` (per kept item)
- `"no curtains, drapes, sheers, or valances"` (when blinds/shutters/shades are kept)
- `"no television, no screens, no monitors"` (unless user explicitly requested)
- `"no ceiling fan"` (bedrooms, unless user requested)
- `"do not introduce blue"` (when palette has no blue)

Affirmative (in system prompt CALL1_SYSTEM, line 500):
- Architecture preserved: walls, windows, ceiling height, floor type, camera POV all captured
- `wall_change_requested` / `floor_change_requested` booleans control wall/floor modification (default: false)

---

## 6. Python Mirror

**Yes, partial mirror in `modal_pipeline/generation.py`.**

The Python file contains:
- `STYLE_ARCHETYPES` dict (line 591) — 11 archetypes with mood/materials/palette/philosophy/references
- `generate_design_brief()` function (line 672) — uses Claude Sonnet to generate 80-120 word briefs
- `_fallback_design_brief()` (line 757) — hardcoded template fallback per (style, room_type) pair
- Vision-aware Design Director in the main pipeline (line 1414) — sends Stage 1 empty room to Claude for spatial-aware brief

The Python implementation is simpler — no forced tool_use, no structured DesignBrief schema, just free-text prompt generation. It does NOT have the full design-director.ts feature set (no fingerprint processing, no personalization moments, no object hierarchy enforcement).

---

## 7. LoRA References

**Yes.** The design director:
- Accepts `loraTrigger` in input (line 123)
- Overrides `style_weights.primary_lora` with input loraTrigger (line 1074)
- Does NOT directly import from lora-registry.ts (no import statement)
- STYLE_DNA_BLOCKS keys match the cv* triggers from lora-registry.ts
- The prompt-compiler checks if the trigger is a "trained trigger" (exists in STYLE_DNA_BLOCKS) before requiring it in the compiled prompt

The `getLorasFromFluxPrompt()` function in `lora-registry.ts` extracts cv* triggers FROM the compiled prompt to look up LoRA weights — this is the bridge between director output and LoRA selection.

---

## Archetype and Forbidden Name Grep Results

### 9 Canonical Archetype Names (case-insensitive counts across .ts/.tsx/.py/.json/.md)

| Archetype | Occurrences | Files |
|-----------|-------------|-------|
| Biophilic Jungle | 0 | 0 |
| Coastal Bright | 0 | 0 |
| Dark Moody Glam | 0 | 0 |
| Heritage Traditional | 0 | 0 |
| Industrial Loft | 0 | 0 |
| Maximalist Eclectic | 0 | 0 |
| Pure Minimal White | 0 | 0 |
| Retro Mid-Century | 0 | 0 |
| Warm Japandi | 0 | 0 |

**None of the 9 canonical v9 archetype names appear anywhere in the codebase.** The v9 naming system has not been adopted yet. The codebase uses display names ("Warm & Grounded", "Bold & Eclectic", etc.) and COVA* keys.

### 6 Forbidden Style Names (standalone, in .ts/.tsx/.py files)

| Forbidden Name | Occurrences | Top Files |
|---------------|-------------|-----------|
| Japandi (standalone) | 745 across 114 files | Widespread (quiz, tests, scripts, prompts, CLAUDE.md) |
| Bohemian | 141 across 26 files | furnitureCatalog.ts (105), tests, generation.py |
| Coastal (standalone) | 0 exact matches | Always qualified (Coastal Bright in text or compound uses) |
| Mid-Century Modern | 10 across 10 files | chat-room, anchor-display, tests |
| Minimalist | 135 across 24 files | furnitureCatalog.ts (105), generation.py, tests |
| Scandinavian | 50 across 20 files | generation.py (5), quiz images, lora-registry, tests |

**Note:** The CLAUDE.md rule "NEVER show style names to the user in any string" applies to UI-facing strings. Many of these occurrences are in:
- Internal code comments and variable names (acceptable)
- Test fixtures (acceptable)
- `apps/mobile/` furniture catalog (frozen, not touchable)
- Training prompts and style definitions (acceptable — never user-facing)
- Some quiz and tweak API routes may expose these to users (needs separate audit)
