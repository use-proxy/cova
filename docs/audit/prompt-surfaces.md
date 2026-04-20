# Prompt Surfaces Audit — Phase 0 Extension

**Audit date:** 2026-04-20
**Auditor:** Claude Code (autonomous, Opus 4.7)
**Commit at audit start:** `d364576` (Phase 0 closure of Director audit)
**Status:** **PARTIAL** — all active outbound prompt/DB surfaces patched; two pre-existing user-facing UI copy surfaces surfaced as BLOCKERs for product judgment.
**Phase 0 closure status:** Closes Phase 0 for outbound (fal/Modal/DB) leaks. Two user-facing UI string decisions (step-3b, step-7d) deferred with BLOCKER entries.

---

## Executive summary

The prior Phase 0 audit covered only the `runDesignDirector` → `prompt-compiler.ts` path (the v9 Director hot path). This extension audits every OTHER active prompt-building surface. Three outbound leaks were found and patched autonomously:

1. `buildFluxPromptFromContext` (Area 2 consumer path — 6 active API route consumers) returned its output unsanitized at both exit sites. Sanitizer now applied at both returns.
2. `quiz/style-preview/route.ts` builds a prompt from a LOCAL `KONTEXT_STYLE_DESCRIPTORS` dict containing bare `bohemian layered interior` and `pure scandinavian minimalism` and pipes it to fal.ai via `submitRender` unsanitized. Sanitizer wired just before `submitRender`.
3. `modal_pipeline/generation.py`'s `generate_design_brief` + `_fallback_design_brief` + Stage 1.5 vision-aware director emit DesignBriefs containing bare "Japandi sanctuary", "Bohemian retreat", "Mid-Century Modern bedroom", "Minimalist bedroom". These flow to fal.ai and `rooms.flux_prompt`. Added Python `sanitize_forbidden_names()` mirroring the TS sanitizer; wired at three exit points (Sonnet return, fallback return, final `styled_fill_prompt`).

Additionally, `design-director.ts` system-prompt assembly emitted a bare `MINIMALIST` token into the Sonnet system prompt (lines 580 + 881) whenever `lifestyle.density === "minimalist"`. With B-3's Zod refine patched last commit, any Sonnet echo would fail the render. Renamed the internal system-prompt token to `RESTRAINED` while keeping the DB/UI value `"minimalist"` (backward-compat). No data migration required.

`apps/web/lib/stylePrompt.ts` (dead — zero importers) deleted.

Remaining unexplained hits in the final grep all fall into: sanitizer/defense implementations, forbidden-name registry (canonical reference), chat system prompts instructing LLMs to AVOID the tokens, or internal DB/UI routing values that never flow outbound. The two exceptions are user-facing copy (step-3b DISPLAY_NAMES and step-7d suggestion chip) — flagged as BLOCKERs because rewriting them is a product copy decision, not a mechanical scrub.

## Dead code removed

- `apps/web/lib/stylePrompt.ts` (400 LOC, 16268 bytes) — zero importers confirmed via grep. Deleted.

## Active prompt-building surfaces inventoried

| Surface | Location | Destination | Defense status | Action taken |
| --- | --- | --- | --- | --- |
| `runDesignDirector` → `compilePrompt` (v9 hot path) | `apps/web/lib/ai/design-director.ts:1015`, `prompt-compiler.ts:219` | fal.ai, rooms.flux_prompt | B-3 patch (Zod refine + sanitizer) | Already covered by prior audit |
| `buildFluxPrompt(params)` | `apps/web/lib/ai/flux.ts:428` | fal.ai via 5 consumers (swap, render, render/previews, quiz/validation-renders, etc.) | Sanitizer wired at both return sites (589, 592) | Verified |
| `buildAnchorFallbackPrompt` | `apps/web/lib/ai/flux.ts:876` | fal.ai via pipeline/redesign fallback + test-pipeline | Sanitizer wired at both return sites (1121, 1123) | Verified |
| `buildFluxPromptFromContext(ctx)` | `apps/web/lib/ai/flux.ts:1152` | fal.ai via 3 consumers (render/from-context, area2Store, renderContext/assembler) | **Unsanitized — LEAK** | **Patched** — sanitizer applied at both returns (1576, 1589) |
| `quiz/style-preview` prompt assembly | `apps/web/app/api/quiz/style-preview/route.ts:106-121` | fal.ai via `submitRender` | **Unsanitized; local KONTEXT_STYLE_DESCRIPTORS contains bare `bohemian`, `scandinavian`** | **Patched** — `sanitizeForbiddenStyleNames(prompt)` before `submitRender` |
| `generateDesignBrief` system prompt (density=minimalist branch) | `apps/web/lib/ai/design-director.ts:580, 881-882` | Claude Sonnet system prompt → `design_rationale` → Zod refine → render fail | **Self-inflicted Zod failure risk** | **Patched** — internal token renamed to `RESTRAINED`; DB/UI value preserved |
| Python `generate_design_brief` | `modal_pipeline/generation.py:715` | fal.ai, rooms.flux_prompt | **Unsanitized** | **Patched** — `sanitize_forbidden_names()` at Sonnet return, fallback return, final `styled_fill_prompt` |
| Python `_fallback_design_brief` | `modal_pipeline/generation.py:796` | fal.ai (via parent) | **Unsanitized; template literals embed "Japandi/Bohemian/Coastal/Mid-Century Modern/Minimalist bedroom"** | **Patched** via parent's sanitizer call |
| Python Stage 1.5 vision director | `modal_pipeline/generation.py:1421` | fal.ai, rooms.flux_prompt | **Unsanitized** | **Patched** — sanitizer applied at vision-director return + final styled_fill_prompt |
| `app/api/quiz/tweak/route.ts` Claude prompt | line 339 | Claude (internal scoring) | Contains defensive NEVER-name instruction; output scored server-side, not shown raw | No action — instructive use |
| `app/api/match/route.ts` tool schema description | line 264 | Claude tool-use schema → internal product-match output | Output stored as internal `style` field for matching, not user-rendered | No action — internal taxonomy |
| `app/api/pipeline/furniture-match/route.ts:109` regex scrub | — | defense | `.replace(/\b(japandi|...)/gi, "")` strips forbidden tokens | No action — defense |
| `lib/unsplash.ts` search keyword arrays | lines 34, 151-164, 178-179 | Unsplash search API (keyword query) | Unsplash returns photos; its input is not an image-gen prompt and is not rendered to the user | No action — internal search |
| `modal_pipeline/furniture_matching_pipeline.py` | lines 163-440 | Google Shopping / SerpAPI search queries | Search queries to Google Shopping, not image-gen prompts; output is product matches | No action — internal search taxonomy |
| `modal_pipeline/embed_catalog*.py` | product style-tag classifier | DB `products.style_tags` JSON | Stored as internal filter tags, not user-facing strings | No action — internal taxonomy |
| `chat/systemPrompts.ts:144` | chat system prompt | Claude chat | Contains NEVER-mention-these-names instruction (defensive) | No action — defense |
| `anchor-display.ts`, `forbidden-names.ts`, `canonical-archetypes.ts` | registry + comments | — | Canonical forbidden-name references | No action — defense |

## Patches applied

### P1. `apps/web/lib/ai/flux.ts:1576, 1589` — buildFluxPromptFromContext
Added `sanitizeForbiddenStyleNames(...)` wrapping the two return statements. Consumer list impacted: `app/api/render/from-context/route.ts:87`, `lib/stores/area2Store.ts:442`, `lib/ai/renderContext/assembler.ts:116`.

### P2. `apps/web/app/api/quiz/style-preview/route.ts`
Imported `sanitizeForbiddenStyleNames` from `@/lib/ai/flux`. Applied to the assembled `prompt` just before `submitRender`. Leak path scrubbed: local `KONTEXT_STYLE_DESCRIPTORS` dict contained bare `bohemian layered interior` (cvboh) and `pure scandinavian minimalism` (cvscn) — sanitizer rewrites these to descriptive phrases before fal.ai submission.

### P3. `apps/web/lib/ai/design-director.ts:580, 881-882`
Renamed internal density system-prompt token from `minimalist`/`MINIMALIST` to `restrained`/`RESTRAINED`. The UI `step-7g` and DB `personalization_context.lifestyle.density` value remains `"minimalist"` for backward compatibility; only the string sent to Sonnet changed. This prevents Sonnet from echoing a forbidden token into `design_rationale` and failing the B-3 Zod refine.

### P4. `modal_pipeline/generation.py`
Added `sanitize_forbidden_names(prompt: str) -> str` helper (mirror of TS `sanitizeForbiddenStyleNames`) with word-boundary regex replacements. Wired at three exit points:
- `generate_design_brief` Sonnet success path (line 757)
- `generate_design_brief` fallback path (line 761)
- Stage 1.5 vision-aware director output (line 1477)
- Final `styled_fill_prompt` before fal.ai submit (belt-and-suspenders, line 1519)

## Regression tests added

- `apps/web/tests/ai/prompt-surfaces.test.ts` — 4 tests covering: buildFluxPromptFromContext default + leak-injection, style-preview sanitizer, design-director source-level assertion that `MINIMALIST` token is gone and `RESTRAINED` is present.
- `tests/python/stages/test_forbidden_names.py` — 5 tests covering: `sanitize_forbidden_names` strips bare tokens, preserves+rewrites qualified forms, is idempotent, handles empty input, and `_fallback_design_brief` output is clean after sanitization.

## Surfaces verified clean (no action needed)

- `buildFluxPrompt` (legacy) — already sanitizes at both returns.
- `buildAnchorFallbackPrompt` — already sanitizes at both returns.
- `prompt-compiler.ts compilePrompt` — covered by B-3 patch (Zod refine + sanitizer).
- `chat/systemPrompts.ts` line 144 — defensive instruction to Claude.
- `forbidden-names.ts`, `anchor-display.ts`, `canonical-archetypes.ts` — registry / defense.
- `app/api/match/route.ts:264` — internal tool schema description; output not user-visible.
- `app/api/quiz/tweak/route.ts:339` — defensive NEVER-name instruction.
- `app/api/pipeline/furniture-match/route.ts:109` — defensive regex strip.
- `lib/unsplash.ts` style-keyword arrays — Unsplash search keywords, not image-gen prompts.
- `modal_pipeline/furniture_matching_pipeline.py` — Google Shopping queries (internal).
- `modal_pipeline/embed_catalog*.py` — product style-tag classification (internal DB taxonomy).
- `modal_pipeline/clip_text_embed.py:14` — docstring example.

## Remaining deferred items

- **F1.1** Python Director parity (HTTP bridge / delete Python / content sync) — unchanged from Phase 0 B-3. Sanitizer wiring here is a defense patch, not a parity fix. When F1.1 is resolved (Phase 3 Session 1), the deferred STYLE_ARCHETYPES content decision remains.
- **F3.1** softmaxStyleMatch → RBF kernel — unchanged.
- **F6.1 / F6.2 / F6.5 / F6.6** — codebase hygiene follow-ups from the prior audit; all deferred to Phase 3 hygiene session.

## Open BLOCKERs (user-facing UI copy — product decisions)

```
BLOCKER: step-3b quiz display renders bare forbidden style names to the user
WHERE: apps/web/app/design/step-3b/page.tsx:17-28 (DISPLAY_NAMES) and :220 (render site)
EVIDENCE: DISPLAY_NAMES maps COVAJAPANDI→"Japandi", COVABOHEMIAN→"Bohemian",
  COVAMINIMAL→"Minimalist", COVACOASTAL→"Coastal", COVAMIDCENTURY→"Mid-Century".
  Line 220 renders {DISPLAY_NAMES[entry.style]} directly in the UI. This is
  a literal violation of CLAUDE.md Rule 8 ("NEVER show style names to the
  user in any string").
HYPOTHESIS: Pre-existing leak from an earlier design generation where anchor
  names were intended as the user-facing product labels.
SELF-HEAL ATTEMPTED: none — rewriting these requires a product copy pass
  (what descriptive labels replace "Japandi" etc. in the user's view of
  their own picked anchors?), not a mechanical scrub.
PROPOSED RESOLUTIONS:
  1. Route through toDisplayName() / anchor-display.ts canonical-qualified
     forms: "Warm Japandi"→"Warm & Grounded", "Coastal"→"Coastal Bright",
     etc. (The canonical product mapping already exists in
     apps/web/lib/ai/anchor-display.ts — this is the quickest fix.)
  2. Rename DISPLAY_NAMES entries to generic descriptors
     ("Japandi"→"Warm & Minimal") and propagate through step-3b copy.
  3. Explicitly accept Rule 8 exception for the user's own anchor picks
     (i.e., the user DID pick "Japandi" as a label, so showing it back is
     fair). This requires updating Rule 8.
STATE PRESERVED: no code changes made to step-3b or DISPLAY_NAMES.

BLOCKER: step-7d suggestion chip contains "Scandinavian"
WHERE: apps/web/app/design/step-7d/page.tsx:72
EVIDENCE: SUGGESTION_CHIPS.all includes "Clean and Scandinavian-inspired"
  as a clickable chip the user may send as chat input. If clicked, the
  string flows into the chat history → the Director's personalization_context
  → Sonnet system prompt → B-3 Zod refine → potential render failure.
HYPOTHESIS: Pre-existing copy.
SELF-HEAL ATTEMPTED: none — changing user-facing suggestion chip copy is
  a product decision.
PROPOSED RESOLUTIONS:
  1. Rewrite to "Clean Nordic-inspired" or "Bright and airy with pale wood".
  2. Add a pre-send scrub on the chat input path that sanitizes chip text
     before the Director sees it.
STATE PRESERVED: no code changes to step-7d.
```

Both BLOCKERs are scope-boundary items — they were not introduced by this audit and do not affect the outbound-prompt leaks this audit was chartered to close. They can be resolved in Phase 3 hygiene or in a dedicated copy sweep.

## Self-heals performed

- stylePrompt.ts dead-code deletion (confirmed zero importers).
- Sanitizer wiring on 3 outbound paths (buildFluxPromptFromContext, style-preview route, Python generation).
- Design-director density=minimalist token rename (internal-only; no DB migration).
- Python-side sanitizer helper added (mirror of TS implementation).

## Final cross-surface grep

Run at closure:
```
grep -rniE "\b(japandi|bohemian|mid[-\s]century\s+modern|minimalist|scandinavian)\b" \
  --include='*.ts' --include='*.tsx' --include='*.py' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  --exclude-dir=tests --exclude-dir=docs --exclude-dir=experiments \
  apps/web/lib/ apps/web/app/ modal_pipeline/ \
  | grep -viE "warm\s+japandi|coastal\s+bright|retro\s+mid[-\s]century"
```

All remaining hits fall into the four documented categories (defense implementations, forbidden-name registry, defensive LLM instructions, internal DB/UI routing taxonomy that doesn't reach outbound APIs). The two user-facing UI surfaces are flagged as BLOCKERs above.
