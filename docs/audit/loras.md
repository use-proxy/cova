# LoRA Audit Report

**Date:** 2026-04-19
**Auditor:** Claude Code (Phase 0 audit for v9 research plan)
**Scope:** All LoRA models referenced in the Cova monorepo

---

## Summary

| Metric | Count |
|--------|-------|
| Total LoRAs found | 12 |
| Custom trained (COVA*) | 10 |
| Fallback/utility (HuggingFace) | 2 |
| Local .safetensors files | 0 |
| Base model: FLUX.1-dev | 12 |
| Base model: SDXL/SD1.5 | 0 |
| Deprecated (wrong base) | 0 |
| Quality-evaluated | 0 |
| Verdict: KEEP-CONDITIONAL | 10 |
| Verdict: KEEP (utility) | 2 |
| Verdict: DROPPED | 0 |

**Critical finding:** All 10 custom LoRAs were trained on 2026-04-17 in a single batch via `scripts/train-loras.ts`. Every LoRA received an auto-assigned quality score of 2.5/5.0 with no human review and no automated scoring. The training script's quality gate generates test renders but does not actually score them.

**Pipeline reality check:** The current v8 production pipeline uses `fal-ai/flux-pro/v1/fill` (Fill Pro) which **does not accept LoRA parameters**. The COVA* trigger words are injected as prompt text (prefix 3x + suffix 3x), relying on FLUX's T5 text encoder to activate the style signal. The LoRA `.safetensors` weights are stored in Supabase (`style_loras` table) and in the lora-registry but are **never loaded by Fill Pro**. They would only be loaded by `fal-ai/flux-general` (used in the professionalization pass and quality gate, but not main generation).

---

## Kept Table (KEEP-CONDITIONAL)

All 10 custom LoRAs are FLUX.1-dev based and theoretically compatible with v9. However, none have been quality-evaluated. "KEEP-CONDITIONAL" means: keep the weights but run quality evaluation before committing to reuse in v9.

| Name | Base Model | Steps | Default Scale | Recommended Range | Canonical Archetype | Notes |
|------|-----------|-------|--------------|-------------------|--------------------|----|
| COVAJAPANDI | FLUX.1-dev | 1500 | 0.88 | 0.70-0.85 | Warm Japandi | Primary style. cvwmn trigger has special 0.85 scale in lora-registry.ts |
| COVASCANDINAV | FLUX.1-dev | 1500 | 0.88 | 0.70-0.85 | Pure Minimal White | Shares cvscn DNA trigger with COVAMINIMAL |
| COVABIOPHILIC | FLUX.1-dev | 2000 | 0.92 | 0.75-0.90 | Biophilic Jungle | Higher step count (2000). Plant-heavy style benefits from more training |
| COVAMINIMAL | FLUX.1-dev | 1500 | 0.95 | 0.75-0.90 | Pure Minimal White | Very high default scale. Risk of overfit at 0.95 |
| COVAMIDCENTURY | FLUX.1-dev | 1500 | 0.85 | 0.65-0.80 | Retro Mid-Century | Standard training |
| COVACOASTAL | FLUX.1-dev | 1500 | 0.85 | 0.65-0.80 | Coastal Bright | Standard training |
| COVABOHEMIAN | FLUX.1-dev | 2000 | 0.78 | 0.60-0.75 | Maximalist Eclectic | Lower default scale appropriate for complex layered style |
| COVAINDUSTRIAL | FLUX.1-dev | 2000 | 0.80 | 0.60-0.75 | Industrial Loft | Higher step count (2000) |
| COVAFARMHOUSE | FLUX.1-dev | 1500 | 0.85 | 0.65-0.80 | Heritage Traditional | Maps to Heritage Traditional in v9 archetype system |
| COVAARTDECO | FLUX.1-dev | 1500 | 0.82 | 0.65-0.80 | Dark Moody Glam | Maps to Dark Moody Glam in v9 archetype system |

---

## Dropped Table

None. All LoRAs use FLUX.1-dev base model.

---

## Deprecated Table

None. No SDXL or SD1.5 LoRAs were found.

---

## Utility LoRAs (KEEP)

| Name | Source | Base Model | Default Scale | Purpose |
|------|--------|-----------|--------------|---------|
| detail-enhancer | Shakker-Labs/FLUX.1-dev-LoRA-add-details | FLUX.1-dev | 0.55 | Material texture, surface grain. Style-neutral. |
| realism-lora | XLabs-AI/flux-RealismLora | FLUX.1-dev | 0.25 | Photographic/editorial quality shift. Stacked with style LoRA. |

These form the `FALLBACK_LORA_STACK` used when no custom LoRA is found for a style.

---

## Coverage Analysis: 9 Canonical Archetypes

| # | Canonical Archetype | Matching LoRA | Status |
|---|-------------------|---------------|--------|
| 1 | Biophilic Jungle | COVABIOPHILIC | COVERED (needs eval) |
| 2 | Coastal Bright | COVACOASTAL | COVERED (needs eval) |
| 3 | Dark Moody Glam | COVAARTDECO | COVERED (needs eval) |
| 4 | Heritage Traditional | COVAFARMHOUSE | COVERED (needs eval) |
| 5 | Industrial Loft | COVAINDUSTRIAL | COVERED (needs eval) |
| 6 | Maximalist Eclectic | COVABOHEMIAN | COVERED (needs eval) |
| 7 | Pure Minimal White | COVAMINIMAL + COVASCANDINAV | COVERED x2 (needs eval) |
| 8 | Retro Mid-Century | COVAMIDCENTURY | COVERED (needs eval) |
| 9 | Warm Japandi | COVAJAPANDI | COVERED (needs eval) |

**All 9 archetypes have at least one matching LoRA.** Pure Minimal White has two (COVAMINIMAL and COVASCANDINAV share the cvscn DNA trigger).

---

## Training Recommendation

### Optimistic scenario (if 6+ LoRAs pass quality eval)
- **Reduce Phase 4 scope to gap-fill only.** Retrain only LoRAs that fail quality gate.
- Estimated cost: $20-40 (1-2 retrains) vs $200 full dual-hedge baseline.
- **Dollar savings: $160-180.**

### Pessimistic scenario (if 0-2 LoRAs pass quality eval)
- **Commit to full 9-archetype dual-hedge.** Existing LoRAs were trained with single-trigger words (COVAJAPANDI) rather than the short cv* tokens + "interior" class descriptor that the research pipeline uses. The training script (`train-loras.ts`) used `fal-ai/flux-lora-fast-training` with `trigger_word: styleName` (e.g. "COVASCANDINAV") but the Python training script (`train_loras.py`) correctly uses `full_trigger: "cvwmn interior"` with dual captioning. Only the Python path produces properly conditioned LoRAs.
- **Dollar savings: $0.** Full $200 budget needed.

### Realistic scenario (most likely)
- **The TS-trained LoRAs (all 10) used wrong trigger format.** They trained with `COVASCANDINAV` as trigger but the pipeline expects `cvscn interior`. These triggers exist in FLUX's T5 vocabulary and may conflate with FLUX's prior knowledge. The Python script (`train_loras.py`) has the correct approach with short invented tokens + dual captioning.
- **Recommendation:** Run quality eval on 3 representative LoRAs. If they show clear style signal despite the trigger mismatch, keep them. If not, retrain all 9 using the Python path with proper dual captioning.
- **Estimated cost: $3 eval + $0-180 retraining = $3-183 total.**

---

## Key Risks

1. **Trigger word mismatch.** TS training used `COVAJAPANDI` (natural language token that FLUX already knows) vs Python training's `cvwmn` (invented token that doesn't collide with FLUX's vocabulary). The research best practice is invented tokens.

2. **Quality never evaluated.** All quality scores are 2.5 (auto-assigned). The `runQualityGate()` function in `train-loras.ts` generates comparison renders but assigns a hardcoded `score = 2.5` and says "review renders manually" — this review never happened.

3. **Fill Pro doesn't use LoRA weights.** The production v8 pipeline injects trigger words into prompts but never loads the actual `.safetensors` weights. The LoRAs are only exercised via prompt text, not via model weight merging. This severely limits their impact.

4. **fal.media URL durability.** All 10 LoRAs are hosted at `v3b.fal.media` temporary storage URLs. These may expire. No local copies exist.

---

## File Locations

| Artifact | Path |
|----------|------|
| Primary registry (runtime) | `apps/web/lib/ai/lora-registry.ts` |
| Secondary registry (auto-generated) | `apps/web/lib/styles/lora-registry.ts` |
| Training results | `lora-training/results.json` |
| TS training script | `scripts/train-loras.ts` |
| Python training script (better approach) | `scripts/train_loras.py` |
| Supabase table | `style_loras` |
| Inventory JSON | `experiments/lora_audit/inventory.json` |
| Summary CSV | `experiments/lora_audit/summary.csv` |
