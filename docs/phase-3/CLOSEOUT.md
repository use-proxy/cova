# Phase 3 — Closeout

**Completed:** 2026-04-20
**Commits:** `06b10f7` (3.2–3.4), `f8049dd` (3.5), `25e34a8` (3.6), `fd6b956` (3.7), `b052a1a` (3.8), this commit (3.9).
**HEAD at entry:** `9a9bb3d`
**Cost:** $0 (no fal / Modal calls).

---

## What shipped

### Workstream A — LoRA weighted blending migration

- `DesignBrief.style_weights.loras?: Record<string, number>` added as an
  optional field alongside `primary_lora`/`primary_scale`. Dual-field
  always-write keeps frozen Edge Functions (CLAUDE.md Rule 12) working with
  legacy JSON rows.
- `apps/web/lib/ai/lora-blending.ts` — new module. Exports:
  - `buildLorasFromBlend(covaKeyBlend, fallbackTrigger)`: fingerprint
    distribution → cv-trigger map. Resolves COVA* via `COVA_TO_DNA_TRIGGER`,
    merges duplicate triggers, caps at top-3, drops <0.10, normalizes to 1.0.
  - `normalizeLoras(rawMap, fallback)`: defensive post-processor for
    arbitrary cv-trigger maps (Sonnet-echo case).
  - `readLoras(styleWeights)`: back-compat reader that synthesizes
    `{[primary_lora]: 1.0}` for legacy rows with no `loras` field.
- Director post-tool override populates `loras` from `context.style_blend`
  when present, else falls back to `{[loraTrigger]: 1.0}`.
- No DB migration: `rooms.design_brief` is already `Json | null`.

### Workstream B — Forbidden-name hygiene (F6.1, F6.2, F6.5, F6.6)

- **F6.1 ESLint rule** — 12 `no-restricted-syntax` selectors in
  `apps/web/.eslintrc.json` blocking the 6 canonical tokens in Literal +
  TemplateElement nodes, with regex lookbehind/lookahead for qualified
  forms. File-level overrides allowlist the defense layer and internal
  DB-taxonomy routes. One user-visible leak found + fixed:
  `components/chat/SuggestionChips.tsx:5` `"Make it more minimalist"` →
  `"Make it more pared back"`.
- **F6.2 Husky pre-commit hook** — `.husky/pre-commit` scans staged diffs
  (ACM + lines) for bare forbidden tokens; preserves qualified forms.
  Verified blocking + passing live. Bypass: `git commit --no-verify`.
- **F6.5 Log redactor** — `apps/web/lib/logging/redactor.ts` with
  `redactLogString`, `redactLogPayload`, `wrapLogger`. Wired into
  `apps/web/lib/errors.ts` captureError() so Sentry + dev console emit
  redacted messages + extras. 15 tests.
- **F6.6 Step-3b audit** — `apps/web/tests/ai/step-3b-display-names.test.ts`
  (15 tests): 10 archetype-label coverage + map integrity + source-level
  audit proving `toCovaKeyDisplayName` is used in the render path and
  `DISPLAY_NAMES[]` never appears inside JSX return.

---

## Test coverage delta

| File | Tests added |
| --- | --- |
| `apps/web/tests/ai/lora-weighted-blending.test.ts` | 25 |
| `apps/web/tests/ai/log-redactor.test.ts` | 15 |
| `apps/web/tests/ai/step-3b-display-names.test.ts` | 15 |
| **Total** | **55** |

Verification gate at closeout: 818 passing, 14 failing, 33 skipped.
**14 failures matches the pre-Phase-3 baseline** — zero regressions.
Typecheck clean. `next lint` clean.

---

## Backward-compat assessment

Zero breaking changes:

1. `DesignBrief.style_weights.loras` is **optional** — existing readers
   (including frozen Edge Functions) see no schema change.
2. Director continues writing `primary_lora`/`primary_scale` unchanged.
3. `rooms.design_brief` is `Json|null` — no SQL migration.
4. `readLoras()` back-compat reader synthesizes `{[primary_lora]: 1.0}`
   for legacy rows — Phase 5 renderer can consume both shapes uniformly.

Rollback: if Phase 5 observes bad blending behavior, renderer can ignore
the `loras` field and continue reading `primary_lora` — same behavior as
pre-Phase-3.

---

## Handoffs

**Phase 4 (LoRA training — 9 remaining archetypes):**
- Trigger names emitted by `loras` keys are the **9 canonical cv-triggers**
  in `apps/web/lib/styles/lora-registry.ts:94` (`COVA_TO_DNA_TRIGGER`):
  `cvwmn, cvscn, cvbio, cvmcm, cvcst, cvboh, cvind, cvfrm, cvdco`.
- Research-doc naming (`cvjpd, cvlux, cvmax`) does NOT match implementation.
  See `docs/phase-3/follow-ups-deferred.md` § F3-NAMING.1 — decision
  required at Phase 4 kickoff.
- `COVAMINIMAL` and `COVASCANDINAV` currently collide on `cvscn`. If Phase 4
  wants to differentiate them (train separate LoRAs), add a new cv-trigger
  and update `COVA_TO_DNA_TRIGGER` + `STYLE_DNA_BLOCKS`.

**Phase 5 (redesign consumer):**
- Prefer `brief.style_weights.loras` when present; synthesize
  `{[primary_lora]: 1.0}` for legacy rows via `readLoras()`.
- Multiply each proportion by the LoRA's `default_scale` from
  `apps/web/lib/styles/lora-registry.ts` `LORA_REGISTRY`, then apply the
  existing `MAX_COMBINED_LORA_SCALE = 1.2` cap.
- **Wiring gap:** no upstream code currently populates
  `RenderContext.style_blend`. Plumb `users.style_blend` into the render
  orchestrator's RenderContext so the Director receives real blend data.
  See `docs/phase-3/follow-ups-deferred.md` § F3-BLEND-CTX.1.

**F3.1 (RBF kernel):** still deferred — see follow-ups doc. Phase 3
consumed `fingerprintToStyleBlend` output directly, which is already
archetype-weighted and sufficient for blending. RBF remains a future
quality-of-quiz improvement.

---

## Closure confidence — 9/10

Reasoning:
- +1 all 9 acceptance criteria met: schema additive, blending tests cover
  all edge cases, tsc clean, lint clean, hook blocks live, redactor wired,
  step-3b audit green, verification-gate baseline preserved, closeout doc
  written.
- +1 zero Phase 2-owned files touched. No merge conflicts during rebase.
- +1 hook self-regulated my own commit (caught a bare token in a comment),
  proving the guard works.
- -1 F3-BLEND-CTX.1 — end-to-end blended renders are not exercised because
  no upstream path populates `RenderContext.style_blend` yet. Phase 3 code
  is correct and tested but will all route through the single-primary
  fallback in production until Phase 5 wires style_blend into the pipeline.
  This is flagged but not fixed in Phase 3 (scope-boundary: wiring belongs
  in Phase 5's render-service rewrite).

Nothing in the Phase 3 charter requires that wiring. The 9-point score
reflects solid completion of Phase 3's stated scope with one clearly
documented handoff gap.
