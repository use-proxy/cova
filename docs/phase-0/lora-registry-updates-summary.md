# Phase 0 — LoRA Registry Updates Summary

Date: 2026-04-19
Prompt: Phase 0 Prompt 5

## Commits

| # | Sub-task | Commit SHA | Verification |
|---|----------|------------|--------------|
| 1 | Backup URL patch → `apps/web/lib/ai/lora-registry.ts` | `ac3c213` | PASS |
| 2 | Canonical archetype map → `apps/web/lib/ai/canonical-archetypes.ts` | `94b5786` | PASS |
| 3 | Scale-range migration → `supabase/migrations/20260419000004_lora_default_scales.sql` | `e90f8c3` | PASS |
| 4 | Forbidden name audit → `docs/phase-0/forbidden-name-audit.md` | `37a3578` | PASS |
| 5 | This summary doc | (this commit) | PASS |

All 4 prior commits pushed to `main`. All 4 passed `scripts/verify-before-commit.sh` (baseline 14 failures / current 14 failures — no regression).

## Sub-task 1 — Backup URL patch

Applied `docs/audit/lora-registry.backup-urls.patch` to `apps/web/lib/ai/lora-registry.ts`:
- Added optional `backupUrl?: string` to `LoraConfig` interface.
- Added `BACKUP_URLS` map (10 COVA LoRAs → Supabase `lora-backups` bucket URLs).
- Wired `backupUrl` into the returned LoraConfig in `getLorasForStyle`.
- Primary `url` field unchanged. Additive, non-breaking.

Note: `getLorasFromFluxPrompt` (second resolver, added later) was NOT patched — the supplied patch targets only `getLorasForStyle`. If Phase 3 consolidates the two resolvers, re-wire `backupUrl` in the flux-prompt path too.

## Sub-task 2 — Canonical archetype map

New file `apps/web/lib/ai/canonical-archetypes.ts` exports:
- `CANONICAL_ARCHETYPE_MAP` — legacy `COVA*` → canonical archetype name.
- `getCanonicalArchetype(key)` — safe lookup with default.
- `CANONICAL_ARCHETYPES` — the 9 v9 names as a const tuple.
- `CanonicalArchetype` — TS type union.

No existing code consumes it yet. Phase 3 (Director rewrite) wires it in.

## Sub-task 3 — Scale ranges

Default scales live in Supabase `style_loras.recommended_scale` (not hardcoded). Migration `supabase/migrations/20260419000004_lora_default_scales.sql` written **file-only** (not applied). Apply via `supabase db push` or dashboard after review.

| LoRA | Before | After | Reason |
|------|-------:|------:|--------|
| COVAJAPANDI     | 0.88 | 0.78 | middle of 0.7–0.85 |
| COVAINDUSTRIAL  | 0.80 | 0.85 | genuinely excellent higher (0.7–1.0) |
| COVABOHEMIAN    | 0.78 | 1.10 | needs overactivation for density (1.0–1.2) |
| COVABIOPHILIC   | 0.92 | 0.95 | middle of 0.9–1.0 |
| COVASCANDINAV   | 0.88 | 0.78 | middle of 0.7–0.85 |
| COVAMINIMAL     | 0.95 | 0.78 | REVISED DOWN — was overfitting |
| COVAMIDCENTURY  | 0.85 | 0.75 | middle of 0.65–0.85 |
| COVACOASTAL     | 0.85 | 0.75 | middle of 0.65–0.85 |
| COVAFARMHOUSE   | 0.85 | 0.75 | middle of 0.65–0.85 |
| COVAARTDECO     | 0.82 | 0.75 | middle of 0.65–0.85 |

The code-level fallback in `lora-registry.ts` (`cvwmn → 0.85`, else `0.75`) was left untouched — it only runs when Supabase returns a null `recommended_scale`, which post-migration is not the case.

## Sub-task 4 — canonical-archetypes.json

Written locally to `lora-backups/canonical-archetypes.json` (gitignored alongside the safetensors). JSON is valid.

**Upload status: PENDING (follow-up required).**

The Supabase upload script used for the `.meta.json` files during the original backup task was not available in this session. The JSON is on disk and will be picked up by the next backup operation. Flag: upload `lora-backups/canonical-archetypes.json` to the `lora-backups` Supabase bucket under the same path before Phase 3 consumers rely on it.

## Sub-task 5 — Forbidden name audit

See `docs/phase-0/forbidden-name-audit.md`.

- 104 total hits across 6 forbidden names.
- 7 user-facing hits (all low-complexity to fix in Phase 3).
- 97 internal hits (tests, scripts, guard-rail prompts, comments — leave alone).
- Hot-spot: 5 of the 7 user-facing hits are in `apps/web/app/design/step-3b/page.tsx` display-name map. Migrating that single map to `getCanonicalArchetype()` is the highest-leverage Phase 3 action.

No hits were fixed in this PR (Phase 3 scope).

## Verification gate

Baseline failures: 14 (per `docs/phase-0/baseline-state.md`).
Post-each-commit failures: 14. No regression.

Build: passing.
tsc (edited files only): clean.

## Final main HEAD SHA

After this summary commit — reported in final response.

## Follow-ups

1. Upload `lora-backups/canonical-archetypes.json` to Supabase `lora-backups` bucket.
2. Apply migration `20260419000004_lora_default_scales.sql` via `supabase db push` or dashboard.
3. Phase 3: migrate the 7 user-facing forbidden-name hits per `forbidden-name-audit.md`.
4. Phase 3: consider wiring `backupUrl` into `getLorasFromFluxPrompt` if the two resolvers are consolidated.
