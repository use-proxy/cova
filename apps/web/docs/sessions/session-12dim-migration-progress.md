# Session A — 12-dimension fingerprint migration

**Date:** 2026-04-08
**Branch:** main
**Goal:** Migrate the entire fingerprint system from 10-dim `[-1, 1]` to 12-dim `[0, 1]`. No image generation. No Replicate spend. Get `npx tsc --noEmit` and `npm run build` clean before closing.

This session is the prerequisite for **Session B** (quiz image library generation), which requires the new schema in place before any Replicate calls fire.

---

## Outcome

- `npx tsc --noEmit` — **clean (zero errors)**
- `npm run build` — **clean (compiled successfully, no Failed-to-compile, only pre-existing warnings)**
- Legacy quiz tables wiped: `style_fingerprints` (17 rows), `swipe_cards` (1292 rows), `style_references` (15 rows)
- Replicate spend in this session: **$0**

---

## What changed

### New 12-dim fingerprint shape

`apps/web/types/fingerprint.ts` now defines:

```ts
dimensions: {
  colorTemperature  // [0, 1]  cool slate → warm amber
  colorSaturation   // [0, 1]  achromatic → vivid
  density           // [0, 1]  sparse → layered
  formality         // [0, 1]  casual → formal
  era               // [0, 1]  ultra-contemporary → heritage
  material          // [0, 1]  manufactured → organic
  texture           // [0, 1]  smooth → tactile
  pattern           // [0, 1]  pattern-free → pattern-rich
  lineQuality       // [0, 1]  geometric → organic
  lightPreference   // [0, 1]  cozy lamps → bright daylight
  nature            // [0, 1]  urban → biophilic
  culturalInfluence // [0, 1]  Western → globally eclectic
}
covariance: number[][]  // 12×12
```

Neutral midpoint is `0.5`. The "strong" / directional band is `|v - 0.5| > 0.2` (i.e. `v < 0.3` or `v > 0.7`).

### Style anchor list reduced from 12 → 9

Per the user's call (option a): the legacy 12 named styles are dropped and replaced with the 9 anchor styles from the quiz library spec, each with an authoritative 12-dim center vector. Names live only in the DB / prompts and remain hidden from user-facing UI strings (CLAUDE.md hard rule #8).

The 9 anchors:

1. Warm Japandi
2. Dark Moody Glam
3. Coastal Bright
4. Industrial Loft
5. Maximalist Eclectic
6. Heritage Traditional
7. Pure Minimal White
8. Biophilic Jungle
9. Retro Mid-Century

### Files migrated

**Production source:**

- `apps/web/types/fingerprint.ts` — full rewrite (12-dim, [0,1])
- `apps/web/lib/ai/flux.ts` — `DESCRIPTORS` table replaced; `getMaterialPalette`, `getLightingInstruction`, `dominantDescriptors` rewritten for `[0,1]` semantics; `NEUTRAL_BAND` now means `|v - 0.5|` band
- `apps/web/lib/ai/clip.ts` — `fingerprintToStyleTags` rewritten with new dim names and `>= 0.5` thresholds
- `apps/web/app/api/quiz/fingerprint/route.ts` — full rewrite. New `DIMENSION_ORDER`, 9-anchor `STYLES` list, `DIMENSION_MATCH_WEIGHTS` (12 entries), `PAIR_DEFINITIONS` updated to reference new dim names, `computeRawVector` returns `[0,1]`, `toStyleFingerprint` no longer rescales, `neutralDims()` (was `zeroDims`) returns `0.5`s, clamp range `[0,1]`, `identityCov(scale)` is now 12×12, `DIM_LABELS` rewritten, style detection now uses weighted Euclidean distance to the 9 anchors
- `apps/web/app/api/quiz/next-pair/route.ts` — `DIM_KEYS` list and fallback updated
- `apps/web/app/api/match/accessories/route.ts` — `getFingerprintAccessoryTerms` migrated from `> 0.3 / < -0.3` to `> 0.7 / < 0.3`, dim names updated
- `apps/web/app/api/design-dna/card/route.ts` — `DIMENSION_META` rewritten, `buildDnaCard` rewritten for `[0,1]` semantics with `0.5` midpoint
- `apps/web/app/design/step-3/page.tsx` — `DimKey` union, `DIM_KEYS`, `DIM_COUNT`, `makeIdentityCov` (12×12), `makeNeutralDims` (was `makeZeroDims`), Phase B clamp range `[0,1]`
- `apps/web/app/design/step-4/page.tsx` — `generateSwatches` rewritten for `[0,1]` colorTemperature / lightPreference / colorSaturation
- `apps/web/lib/dashboard/colorUtils.ts` — key reads renamed to `colorTemperature`, `colorSaturation`, `lightPreference`

**Type-only consumers (no semantic change needed — just propagate via `StyleFingerprint['dimensions']`):**

- `apps/web/app/api/render/route.ts`
- `apps/web/app/api/match/route.ts`
- `apps/web/app/api/match/coherence/route.ts`
- `apps/web/app/api/swap/route.ts`
- `apps/web/app/api/style-references/match/route.ts`
- `apps/web/lib/ai/style-references.ts`
- `apps/web/types/supabase.ts`
- `apps/web/lib/store/fingerprint.ts`

**Tests updated:**

- `apps/web/tests/ai/flux.test.ts` — fixture and per-dim test cases rewritten (`luminosity` → `lightPreference`, `temperature` → `colorTemperature`, etc., 12 dims, 12×12 covariance)
- `apps/web/tests/stores/fingerprint.test.ts` — fixture updated
- `apps/web/tests/ai/clip.test.ts` — fixture + tests updated
- `apps/web/tests/types/supabase.test.ts` — `style_fingerprints` row literal rewritten
- `apps/web/tests/api/contracts.test.ts` — `SAMPLE_FINGERPRINT`, `requiredDims`, range assertions, bohemian/minimalist threshold assertions all migrated to `[0,1]`

**Tests deleted:**

- `apps/web/tests/lib/quiz-data.test.ts` — tested the 6-dim legacy `computeFingerprintFromPairs` from `lib/ai/quiz-data` which is now archived

**Archived (renamed, kept for reference):**

- `apps/web/lib/ai/quiz-data.ts` → `apps/web/lib/ai/quiz-data.deprecated.ts` (`@ts-nocheck` + eslint-disable so the file stays in the repo without blocking compilation; nothing in `apps/web/` imports it any more)

**Out of scope (excluded from `apps/web/tsconfig.json` so they did not need to compile):**

- `tests/e2e/**` (Playwright tests — `render-pipeline.spec.ts`, `e2e/api-contracts.test.ts`)
- `apps/web/scripts/**` (verify-match-live, populate-dimension-labels, seed-phase-b, seed-style-references, verify-quiz-personalization, test-prompt) — these still reference the old dim names but the tsconfig excludes them. They should be migrated whenever they are next touched (Session B will likely rewrite the seeders entirely).

### DB wipe (one-shot)

`apps/web/scripts/wipe-quiz-tables.ts` — new utility that DELETEs every row from `style_fingerprints`, `swipe_cards`, and `style_references`. Run once during this session:

```
style_fingerprints: 17 → 0
swipe_cards:        1292 → 0
style_references:   15 → 0
```

The schemas are left in place; only rows were removed. Session B will repopulate these (or supersede them with the new `quiz_anchor_images` / `quiz_comparison_pairs` tables).

---

## What is intentionally broken at end of session

The runtime quiz UX is **expected to be non-functional** until Session B:

- `/api/quiz/next-card` will return zero cards (swipe_cards is empty)
- `/api/quiz/next-pair` will return 404 (no pairwise cards)
- `/api/style-references/match` will return an empty list
- `/design/step-3` (Phase A) will show empty image grids

This is intentional and safe — there are no production users. The TypeScript and build are clean, so deploys won't fail; the quiz simply has no data until Session B seeds it.

---

## Verification gates passed

| Gate                                                  | Result                                         |
| ----------------------------------------------------- | ---------------------------------------------- |
| `npx tsc --noEmit`                                    | ✅ exit 0, zero errors                         |
| `npm run build`                                       | ✅ Compiled successfully, no Failed-to-compile |
| Replicate spend                                       | ✅ $0 (per Session A scope)                    |
| `quiz_anchor_images` / `quiz_comparison_pairs` schema | ⏸ deferred to Session B                        |
| Quiz library generation                               | ⏸ deferred to Session B                        |

---

## Session B handoff — what comes next

1. Create `quiz_anchor_images` and `quiz_comparison_pairs` tables + RLS in Supabase.
2. Create `quiz-images` public storage bucket (10MB, jpeg/png/webp).
3. Write `scripts/generate-quiz-library.ts` (use `npx tsx`, not `ts-node` — matches existing convention).
4. Generate Phase A (9 anchors), Phase B (12 base rooms), Phase C (60 comparison pairs), Phase D (Claude Sonnet livability validation), Phase E (DB seed + verify).
5. Update `apps/web/scripts/seed-phase-b.ts` and `seed-style-references.ts` to read from the new `quiz_anchor_images` / `quiz_comparison_pairs` tables and re-seed `swipe_cards` / `style_references` with 12-dim labels — OR, if the simpler choice, deprecate those tables entirely and point the quiz routes (`/api/quiz/next-card`, `/api/quiz/next-pair`, `/api/style-references/match`) directly at `quiz_anchor_images` / `quiz_comparison_pairs`.
6. Budget ceiling: **$20** (per user). Stop and report if retries push past it.
