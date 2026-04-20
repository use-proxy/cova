# Phase 0 — Deferred Follow-ups

Items intentionally deferred from Phase 0 deployment (2026-04-19). Each entry
has a resolution path + trigger condition for revisiting.

---

## LoRA scales: rewrite migration 20260419000004 OR migrate scale management to code

**Status:** Deferred 2026-04-19. File moved to
`supabase/migrations/_deferred/20260419000004_lora_default_scales.sql.deferred`.

**Problem:** Original migration updates rows `WHERE style_name = 'COVA<X>'`, but
production `style_loras` schema uses display names (`Warm & Grounded`) in
`style_name`, and app code ([apps/web/lib/ai/lora-registry.ts:118](apps/web/lib/ai/lora-registry.ts)) keys lookups on
`trigger_word` (`cvwmn`, `cvscn`, ...). The COVA* values never existed in prod
and never will under current training-script conventions.

**Resolution paths (pick one):**
1. **Rewrite to key on `trigger_word`.** Needs mapping decision — `COVAMINIMAL`
   and `COVASCANDINAV` both map to `cvscn` in the registry, so one scale must
   win or the column semantics must change.
2. **Migrate scale management to `lora-registry.ts` code** (remove DB column
   dependency). Single source of truth; no DB sync needed.

**Trigger to revisit:** Before training LoRAs 2-10, OR before launch if scale
tuning is needed for the single trained LoRA (`cvwmn`).

---

## LoRA training gap: 9 of 10 COVA archetypes have no production DB row

**Status:** Discovered 2026-04-19 during Phase 0 migration 3 investigation.

**Problem:** `style_loras` has 1 row total (`Warm & Grounded` / `cvwmn`, trained
2026-04-14). The other 9 COVA archetypes
(`cvscn`, `cvbio`, `cvmcm`, `cvcst`, `cvboh`, `cvind`, `cvfrm`, `cvdco`,
 and whatever maps to `COVAMINIMAL`) have no DB row, so lookups fall through
to the dual-fallback stack (`detail-enhancer` + `realism-lora`) in
[apps/web/lib/ai/lora-registry.ts](apps/web/lib/ai/lora-registry.ts).

**Consequence:** 9/10 style anchors render via generic fallback, not a trained
style LoRA. Quality ceiling is materially lower for those styles.

**Related patch from Phase 0:** The `BACKUP_URLS` fix (commit 4b0cd80) attaches
backup URLs so `getLorasFromFluxPrompt()` returns a usable `backupUrl` when
fal.media URLs expire — but that only helps `cvwmn` today because it's the only
row in the DB. The other 9 backup URLs in `BACKUP_URLS` point to storage
objects that may or may not exist yet.

**Trigger to revisit:** Before launch. Either train remaining 9 LoRAs, or
accept fallback-quality renders for non-`cvwmn` styles and document that in
product messaging.

---

## Autonomous audit decisions (Phase 0 Director audit, 2026-04-19)

**Status:** Record-only. These are CLOSED decisions from `docs/audit/director.md`
§ Appendix B; kept here as a ledger, not as open items.

- **D-2 (accepted):** LoRA scale source-of-truth = `apps/web/lib/styles/lora-registry.ts`
  (code-as-config). `style_loras.recommended_scale` column is deprecated and
  will not be read by production; see F5.1–F5.3 in the audit doc for cleanup steps.
- **D-3 (accepted):** Phase 3 Director schema will add `style_weights.loras:
  Record<string, number>` as an optional field; `primary_lora`/`primary_scale`
  retained for backward-compat during rollout of feature flag
  `cova_director_v2_blending`. Full migration plan in `docs/audit/director.md` § Deliverable 4.

---

## F1.1 — Python `modal_pipeline/generation.py` Director parity

**Status:** Deferred 2026-04-19 to Phase 3 Session 1. Phase 5 bench will measure
empirically whether the parity gap caps quality; resolution can wait until
then if Phase 5 numbers are acceptable.

**Problem:** Two separate Design Directors run in production:

1. TS: `apps/web/lib/ai/design-director.ts` (Sonnet 4.6, structured DesignBrief → 50–80 word prompt via Haiku 4.5)
2. Python: `modal_pipeline/generation.py` `generate_design_brief()` at line 672 (Sonnet 4.5, free-text 80–120 word prompt, called as Stage 1.5 vision-aware director at line 1482)

`STYLE_DNA_BLOCKS` (TS, 11 short sentences keyed by `cv*`) and `STYLE_ARCHETYPES`
(Python, 11 rich dicts keyed by `COVA*`) have drifted content: e.g. TS `cvwmn`
uses "terracotta clay, brushed brass", Python `COVAJAPANDI` uses "tatami, washi
paper, charcoal accent". A blended-style render produces visibly different
prompts depending on which Director runs.

**Resolution paths (pick one in Phase 3 Session 1):**

1. **Delete Python Director.** Pipe TS `flux_prompt` directly to Modal FLUX call; Modal stops regenerating prompts.
2. **HTTP bridge.** Python Director calls the TS Director endpoint over HTTP. One source-of-truth at the cost of a network hop during render.
3. **Content sync.** CI test regenerates Python `STYLE_ARCHETYPES` from TS `STYLE_DNA_BLOCKS` + archetype records (Phase 3 F4.5 decomposition approach B). Both Directors remain; content cannot drift.

**Trigger to revisit:** Phase 5 render-quality bench. If HPSv2.1 scores ≥ 5.5 mean
across the 20-room bench regardless of parity, option 1 (simplest) is the
recommended resolution. If quality is capped by Python-side generation
differences, pick option 2 or 3.

**Reference:** `docs/audit/director.md` § Deliverable 1.3, § Appendix B D-4.

---

## F3.1 — Replace `softmaxStyleMatch` with RBF kernel for v9 blending

**Status:** Deferred 2026-04-19 to Phase 3 Session 1. **Gates v9 blending implementation.**

**Problem:** Empirical 6D math validation (`tests/director-audit/6d-math.test.mjs`)
showed `softmaxStyleMatch()` at `apps/web/lib/ai/style-match.ts:182` fails 3 of
4 structural checks when evaluated as a potential 6D → archetype-weight mapping:

- Continuity: max L2 delta 0.56 vs 0.02 threshold (singularity at `NEUTRAL=0.5`)
- Monotonicity: 7/10 anchors fail on ≥1 axis
- Reconstruction: mean L2 0.53 vs 0.10 threshold (near-uniform softmax at T=4.5 collapses to anchor centroid)
- Coverage: passes (every anchor reachable ≥ 24% of time)

The function was designed for quiz display-style picking (decisive argmax when
fingerprint leaves neutral zone), not for continuous blending required by v9
§ 5.1 LoRA stack.

**Direction (accepted):** Replace with a Gaussian RBF kernel

```
w_i ∝ exp(-||fp - anchor_i||² / (2σ²))
```

normalized to sum to 1.0. Tune σ against the same 4 checks (targets: continuity
< 0.02, 0 monotonicity violations, reconstruction mean < 0.10, coverage ≥ 3%).
σ ∈ [0.2, 0.4] is the expected range; validate with the Phase 0.5 20-room bench.

**Scope:** ~80 LOC new function in `apps/web/lib/ai/style-match.ts`, plus
wiring into Phase 3 Director blending (see F4.1). `softmaxStyleMatch` may be
retained for quiz display-picking (its original purpose) with a rename to
`pickDisplayStyle()` to signal the distinction.

**Trigger to revisit:** Phase 3 Session 1 before F4.1 schema migration —
blending needs a mathematically sound mapping to produce meaningful
`loras: Record<string, number>` weights.

**Reference:** `docs/audit/director.md` § Deliverable 3, `tests/director-audit/6d-math.results.json`.

---

## Phase 3 codebase-hygiene follow-ups deferred from Phase 0 B-3 patch

These are the forbidden-name defense layers NOT required for the active-leak
patch (layers 3 + 4 were wired; 5 is deferred because it is telemetry
hardening rather than a leak fix; 1 + 2 are developer-time guards).

- **F6.1 — ESLint custom rule `cova/no-forbidden-styles`** over `.ts/.tsx/.md/.json`
  with `allowRegex` for qualified forms. Blocks new forbidden-name introductions
  at PR time. Codebase hygiene, not a leak fix.
- **F6.2 — Husky + lint-staged pre-commit hook** scanning diffs for forbidden
  tokens. Same intent as F6.1, earlier in the dev loop.
- **F6.5 — Log redactor** stripping forbidden substrings before PostHog/Sentry/Datadog
  write. Director logs compiled prompt content; if a token slips past the
  runtime sanitizer (layer 3), telemetry sees the raw string. Phase 3 hardening.
- **F6.6 — Audit `app/api/quiz/style-preview/route.ts`** to verify it does not
  render raw `STYLE_DNA_BLOCKS[trigger]` sentences to users. With the cvboh/cvmcm
  scrub applied (and the full no-bare-forbidden-token CI assertion now in place),
  current DNA blocks are safe to leak, but the route audit is still worth doing
  to confirm no rewrite required.

**Trigger to revisit:** Phase 3 hygiene session, or when adding the 11th style
archetype (good moment to introduce F6.1 lint rule so the new strings comply
from day one).

**Reference:** `docs/audit/director.md` § Deliverable 6, § B-3 resolution.
