# Phase 3 — Director LoRA Migration Design Doc

**Author:** Claude Code (autonomous, Opus 4.7)
**Commit at start:** `9a9bb3d` (Phase 1 closeout + Phase 0.5 probe artifacts)
**Status:** DRAFT — two proposals below flagged for confirmation per Phase 3 autonomy contract.

---

## 1. Current output schema

`apps/web/lib/ai/design-director.ts` (owner) emits a `DesignBrief` with
`style_weights: { primary_lora: string; primary_scale: number; secondary_lora?: string; secondary_scale?: number }`.

Persistence: `rooms.design_brief` is `Json | null` (see
`apps/web/lib/types/supabase.ts:1303`). No column constraints exist on the
embedded LoRA structure — the whole brief is opaque JSON to Postgres. Same for
`style_fingerprints.style_weights` (`Json`).

Active reader: `apps/web/lib/ai/prompt-compiler.ts` at two sites
(`:109` validation, `:144` message assembly) reads
`brief.style_weights?.primary_lora`. Both are nullable lookups.

Other `primary_lora`/`style_weights` references in the repo:
- `supabase/functions/match-products/index.ts`, `supabase/functions/render-room/index.ts` — **FROZEN Edge Functions** per CLAUDE.md Rule 12. Cannot modify. They read JSON fields opportunistically.
- `apps/mobile/` — **FROZEN**. No touch.
- `apps/web/scripts/seed-phase-b.ts:205` — seed writes `style_weights: {}` (empty). Unchanged.
- `packages/shared/src/types/index.ts` — shared types. Will be checked during cascade.

## 2. Target output schema

Additive, non-breaking:

```ts
style_weights: {
  primary_lora: string;            // KEPT — back-compat
  primary_scale: number;           // KEPT — back-compat
  secondary_lora?: string;         // KEPT — back-compat
  secondary_scale?: number;        // KEPT — back-compat
  loras?: Record<string, number>;  // NEW — weighted blend, sum = 1.0
}
```

The new `loras` field is **additive**. `primary_lora` remains populated and
continues to equal the dominant entry's key. Frozen Edge Functions that read
`primary_lora` continue to work unchanged. The renderer (Phase 5 consumer)
will prefer `loras` when present, else synthesize `{[primary_lora]: 1.0}`.

## 3. PROPOSAL A — Weight semantics (PAUSE POINT)

**Options considered:**

1. **Enforce sum == 1.0 with auto-normalization.** Any weights provided by
   internal logic get divided by their sum. No hard errors; output is always
   self-consistent. Matches prompt §3.3 requirement: "Weight sum must equal
   1.0 (not just ≤ — normalize if necessary)".
2. Enforce sum ≤ 1.0; reject otherwise. Caller's responsibility to size weights.
3. Emit raw weights; let consumers normalize.

**Recommendation: Option 1 (normalize to 1.0).** Prompt §3.3 mandates this;
caller errors become silent bugs otherwise. Normalizer runs in Director
(pre-output) and again in a preflight check at schema validation time (Zod
refine). If input sum is 0 or all-negative, fall back to `{primary_lora: 1.0}`.

**Caps:**
- Max 3 LoRAs (research §5.5 — research cites 3-LoRA stack as quality ceiling).
- Any weight < 0.10 after normalization is dropped and the remainder
  re-normalized (consumer semantics: a LoRA at weight 0.05 is noise, not blend).

## 4. PROPOSAL B — Back-compat policy (PAUSE POINT)

**Options considered:**

1. **Dual-field write (keep primary_lora; add loras).** No DB migration. No
   Edge Function changes. Existing stored rows are readable unchanged. New
   rows carry both. Direct hit on prompt §3 "back-compat for existing user
   data — coerce `primary_lora` to `{[primary_lora]: 1.0}`".
2. Hard swap (remove primary_lora; add loras). Breaks frozen Edge Functions.
3. Feature-flagged dual-path (`cova_director_v2_blending`) — adds flag
   infrastructure for a migration that has no user-visible behavior change.

**Recommendation: Option 1 (dual-field, always-write).** Phase 0 D-3 already
accepted this. Zero Edge Function risk. Zero DB migration. Read-side coercion
in `prompt-compiler.ts` handles legacy rows: if `brief.style_weights.loras`
absent, synthesize `{[primary_lora]: 1.0}` into a local variable for
downstream use.

## 5. Downstream consumer impact

| Consumer | Change |
| --- | --- |
| `apps/web/lib/ai/prompt-compiler.ts` | Add loras-aware read helper; validation unchanged (still checks primary_lora embed). |
| `apps/web/lib/ai/design-director.ts` | Owner. Writes `loras`. Override logic (line 1113) writes both. |
| `rooms.design_brief` Postgres JSONB | No schema change. |
| Frozen Edge Functions | No change; they ignore `loras`. |
| Phase 5 redesign consumer | Prefer `loras` when present; per handoff note in CLOSEOUT. |
| Phase 4 LoRA training | Trigger names in `loras` keys must match `cv*` registry in `apps/web/lib/styles/lora-registry.ts:94` (COVA_TO_DNA_TRIGGER). Phase 3 keeps invariant. |

## 6. Blend math — how FLUX consumes weights

Research §5.5 references FLUX LoRA stacks where per-LoRA scale ∈ [0, ~1.0] with
combined cap 1.2. The new `loras` map emits **blend proportions** (sum = 1.0),
not raw FLUX scales. The Phase 5 renderer multiplies each proportion by its
LoRA's `default_scale` (from `apps/web/lib/styles/lora-registry.ts`), then
applies the existing `MAX_COMBINED_LORA_SCALE = 1.2` cap. This separates
"which archetypes blend and how much" (Director responsibility) from "how hard
FLUX applies each one" (renderer responsibility, style-intensity slider, etc.).

## 7. Test coverage plan

New: `apps/web/tests/ai/lora-weighted-blending.test.ts`
- Single-archetype fingerprint → `{cvX: 1.0}`
- 2-archetype borderline → sum 1.0, 2 entries
- 3-archetype diffuse → max 3 entries, sum 1.0
- Ambiguous (all equal) → single dominant fallback
- Normalizer: input sum 0.8 → output sum 1.0
- Normalizer: input sum 1.5 → output sum 1.0
- Weight < 0.10 drop-and-renormalize
- 9 archetype→trigger mapping assertions (cvwmn, cvjpd-alias for cvwmn, cvind,
  cvmax, cvdco, cvlux, cvboh, cvscn, cvmcm) — note: Cova uses `cvwmn` for Japandi
  (see STYLE_DNA_BLOCKS). The spec's `cvjpd` archetype is an alias — flag in
  follow-ups if it needs a real key.
- Legacy `primary_lora`-only brief → reader synthesizes `{[primary_lora]: 1.0}`

## 8. Rollback plan

Zero-risk: `loras` is additive. If bad output is observed in prod:
1. Renderer (Phase 5) ignores `loras` and reads only `primary_lora`. Behavior reverts to pre-Phase-3.
2. No DB rollback needed; JSON field tolerates unknown keys.

## 9. F3.1 RBF kernel — included or deferred?

**Deferred.** softmaxStyleMatch currently operates at the quiz/fingerprint API
level, not inside the Director. The Director receives a resolved `loraTrigger`
string from upstream. Introducing RBF in Phase 3 would require rewiring how the
Director computes blend weights from the fingerprint — non-trivial and outside
the chartered scope. Phase 3 instead computes blend weights from a **supplied
`styleBlend: Record<string, number>`** (already produced by
`fingerprintToStyleBlend` in `style-archetypes.ts`, which is the quiz
confirmation output used by step-3b). This is already an archetype-weighted
distribution and is the natural input for `loras`.

RBF replacement remains on F3-RBF.1 (deferred), triggered by Phase 5 bench data.

## 10. Open questions (will be resolved during implementation)

- Does `fingerprintToStyleBlend` (style-archetypes.ts) return COVA* keys or cv*
  triggers? If COVA*, the Director maps via `COVA_TO_DNA_TRIGGER`.
- Does `DesignDirectorInput.loraTrigger` remain the authoritative primary, or
  do we now consume `context.style_blend` from RenderContext? Minimal-change
  stance: loraTrigger stays primary (current behavior); if `context.style_blend`
  is present on input, use it to populate `loras`.

---

## Decisions requested from operator

1. **Proposal A:** approve normalize-to-1.0 with 3-LoRA cap + 0.10 drop threshold? (yes/no/modify)
2. **Proposal B:** approve dual-field always-write back-compat? (yes/no/modify)

Both defaults are what Phase 0 D-3 already accepted and what the Phase 3 prompt §3.3 / §3.1 specify — this doc is the explicit surface before irreversible work begins.
