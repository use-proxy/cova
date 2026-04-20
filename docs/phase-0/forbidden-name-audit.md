# Forbidden Name Audit — Phase 0

Date: 2026-04-19
Scope: `apps/web/` (`*.ts`, `*.tsx`)
Source command: see SUB-TASK 5 in Phase 0 Prompt 5.

Forbidden style names (per CLAUDE.md hard rule #8): **Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist, Scandinavian**. Canonical replacements already in use ("Warm Japandi", "Coastal Bright", "Pure Minimal White", etc.) were excluded from the grep via `grep -v`.

This audit catalogs the remaining standalone hits. **No hits are fixed in this PR.** Phase 3 (Director rewrite) will migrate user-facing hits to canonical archetype names.

## Summary stats

| Forbidden name | Total hits | User-facing | Internal |
|----------------|-----------:|------------:|---------:|
| Japandi        | 15         | 2           | 13       |
| Bohemian       | 20         | 1           | 19       |
| Coastal        | 19         | 1           | 18       |
| Mid-Century Modern | 9      | 0           | 9        |
| Minimalist     | 18         | 1           | 17       |
| Scandinavian   | 23         | 2           | 21       |
| **Totals**     | **104**    | **7**       | **97**   |

## Classification legend

- **USER-FACING**: string reaches the user (UI label, API response copy, prompt template that Claude will echo verbatim, capture-page string).
- **INTERNAL**: code comment, variable name, log line, test fixture, script fixture, guard-rail prompt that instructs the model NOT to use the name (meta-mention), LoRA trigger-word mapping key.

Guard-rail strings that mention forbidden names as negative instructions (e.g. "NEVER mention Japandi, Bohemian...") are classified INTERNAL — removing them would weaken the guard rail. They are necessary mentions.

## User-facing hits (fix in Phase 3)

| File:Line | Snippet | Classification | Notes |
|-----------|---------|----------------|-------|
| apps/web/app/design/step-3b/page.tsx:18 | `COVASCANDINAV: "Scandinavian"` | USER-FACING | Display-name map. Replace value with "Pure Minimal White". |
| apps/web/app/design/step-3b/page.tsx:19 | `COVAJAPANDI: "Japandi"` | USER-FACING | Replace with "Warm Japandi". |
| apps/web/app/design/step-3b/page.tsx:21 | `COVAMINIMAL: "Minimalist"` | USER-FACING | Replace with "Pure Minimal White". |
| apps/web/app/design/step-3b/page.tsx:23 | `COVACOASTAL: "Coastal"` | USER-FACING | Replace with "Coastal Bright". |
| apps/web/app/design/step-3b/page.tsx:24 | `COVABOHEMIAN: "Bohemian"` | USER-FACING | Replace with "Maximalist Eclectic". |
| apps/web/app/design/step-7d/page.tsx:72 | `"Clean and Scandinavian-inspired"` | USER-FACING | Personalization option label. Rewrite without cultural-style name (e.g. "Clean and pared-back"). |
| apps/web/app/design/step-7g/page.tsx:9 | `Q3: Minimalist or collector?` | USER-FACING | Comment in quiz page — likely influences adjacent copy. Verify whether user-visible string nearby also uses "Minimalist"; rewrite if so. |

**Priority recommendation for Phase 3:**
1. `step-3b/page.tsx` display map — highest impact (5 of 7 user-facing hits, all on one screen).
2. `step-7d/page.tsx:72` — single personalization chip label, quick win.
3. `step-7g/page.tsx:9` — verify whether the comment leaks into nearby UI copy.

Once `step-3b` is migrated, all 5 forbidden display-names in the dropdown are gone. Phase 3 should import `getCanonicalArchetype` from `apps/web/lib/ai/canonical-archetypes.ts` (added in commit `94b5786`).

## Internal hits (acceptable as-is)

Grouped by category; raw lines in the `/tmp/forbidden-audit.txt` snapshot used to generate this doc.

### Guard-rail prompts (keep — they enforce the rule)
- `apps/web/lib/ai/chat/systemPrompts.ts:144` — "NEVER mention specific interior-design style names like Japandi, Bohemian…"
- `apps/web/app/api/quiz/tweak/route.ts:339` — "Do not name any specific style (no Japandi, Bohemian, Coastal…)"
- `apps/web/lib/ai/anchor-display.ts:3-4` — comment documenting CLAUDE.md rule #8
- `apps/web/lib/ai/canonical-archetypes.ts:4-5` — docstring (added this PR) cataloging the list.

### LoRA trigger-word map key (keep — internal lookup)
- `apps/web/lib/ai/lora-registry.ts:23` — `"Scandinavian": "cvnrd interior"` (key; never displayed)

### Quiz/tweak route hybrid parsing (comments + non-user-facing logic)
- `apps/web/app/api/quiz/tweak/route.ts:285, 290` — code comments describing hybrid parsing.
- `apps/web/app/api/quiz/next-pair/route.ts:130` / `tweak/route.ts:70` — reverse-map entries `"Mid-Century Modern": "Retro Mid-Century"` used to convert *incoming* legacy data to canonical names. These are migration-path code, not leaks.

### Tests and test fixtures (INTERNAL — not shipped)
- `apps/web/__tests__/area1/anchor-display.test.ts:27,29,31,36` — tests asserting forbidden names are NOT present in display output.
- `apps/web/__tests__/area2/room-analysis.test.ts:624-628` — fixture array of legacy names.
- `apps/web/__tests__/area3/flux-prompt.test.ts:231, 839` — Scandinavian cultural-reference test.
- `apps/web/tests/ai/llm-judge.test.ts:259` — LLM-judge rubric listing forbidden names (guard-rail test).
- `apps/web/tests/ai/flux.test.ts:206` — fixture string stuffed with forbidden names (negative test input).
- `apps/web/tests/api/contracts.test.ts:233, 238` — comments describing fingerprint dimension ranges.
- `apps/web/tests/e2e/visual-checks.spec.ts:145-149, 152` — E2E fixtures (legacy name list).
- `apps/web/tests/e2e/autonomous-healer.ts:683` — description string in a healer scenario.
- `apps/web/tests/integration/data-flow.test.ts:187, 433` — `culturalReference: "Scandinavian"` fixture.
- `apps/web/tests/stores/fingerprint.test.ts:137` — prediction fixture label.
- `apps/web/tests/seed/test-products.ts:87` — product fixture "Minimalist Dining Table" (product-name, not style-name).

### Scripts (INTERNAL — dev-only, not shipped)
- `apps/web/scripts/verify-quiz-personalization.ts` (lines 50, 57, 64, 126-137, 165-174) — user-persona fixtures.
- `apps/web/scripts/generate-missing-anchors.ts` (62-78) — prompt templates for anchor image generation, used offline.
- `apps/web/scripts/test-design-director.ts:6` — comment.
- `apps/web/scripts/test-flux-prompts.ts` (137, 198, 207, 210, 223, 233, 244) — dev harness fixtures.
- `apps/web/scripts/test-area3-integration.ts:197, 362` — `culturalReference` fixture.
- `apps/web/scripts/generate-quiz-library.ts:746` — "Scandinavian-American" phrase inside a prompt sent to image-generation; dev-only library generator.

### Internal prompt fragments (LLM-facing, not user-facing) — review in Phase 3
- `apps/web/lib/ai/design-director.ts:143` — `cvcst: "Coastal bright interior. …"`
- `apps/web/lib/ai/design-director.ts:146` — `cvboh: "Bohemian layered interior. …"`
- `apps/web/lib/stylePrompt.ts:55` — `"light wood laminate, clean Scandinavian silhouettes, …"`
- `apps/web/lib/unsplash.ts:34, 178` — `Scandinavian:` keys in Unsplash query map.

These strings are fed INTO the image model as style descriptors. They are not shown to the user, so they are INTERNAL. However Phase 3 should consider whether the forbidden word in the prompt biases the model's output enough to surface in returned content or captions. Low risk, but worth a look during Director rewrite.

## Phase 3 action list

1. Migrate `app/design/step-3b/page.tsx:18-24` display-name map to canonical archetypes via `getCanonicalArchetype()`.
2. Update `app/design/step-7d/page.tsx:72` option label.
3. Audit nearby copy in `app/design/step-7g/page.tsx` for UI leaks of the commented "Minimalist" term.
4. Optional: rename `lib/ai/design-director.ts` trigger descriptions (`cvcst`, `cvboh`) to canonical terms, if Director rewrite touches them.
5. Leave tests, scripts, and guard-rail prompts untouched.
