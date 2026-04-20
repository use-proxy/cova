-- Phase 0: update LoRA default scales per quality eval + spot test findings
--
-- Source: docs/audit/lora-quality-eval.md, docs/audit/lora-spot-test.md
-- Date: 2026-04-19
--
-- NOTE: File-only. Not applied in this commit. Apply via Supabase dashboard or
-- `supabase db push` after review.

-- COVAJAPANDI: 0.88 -> 0.78 (middle of 0.7-0.85 range)
UPDATE style_loras SET recommended_scale = 0.78 WHERE style_name = 'COVAJAPANDI';

-- COVAINDUSTRIAL: 0.80 -> 0.85 (middle of 0.7-1.0 range; genuinely excellent higher)
UPDATE style_loras SET recommended_scale = 0.85 WHERE style_name = 'COVAINDUSTRIAL';

-- COVABOHEMIAN: 0.78 -> 1.10 (middle of 1.0-1.2 range; needs overactivation for maximalist density)
UPDATE style_loras SET recommended_scale = 1.10 WHERE style_name = 'COVABOHEMIAN';

-- COVABIOPHILIC: 0.92 -> 0.95 (middle of 0.9-1.0 range)
UPDATE style_loras SET recommended_scale = 0.95 WHERE style_name = 'COVABIOPHILIC';

-- COVASCANDINAV: 0.88 -> 0.78 (middle of 0.7-0.85 range)
UPDATE style_loras SET recommended_scale = 0.78 WHERE style_name = 'COVASCANDINAV';

-- COVAMINIMAL: 0.95 -> 0.78 (REVISED DOWN, was too high causing overfit)
UPDATE style_loras SET recommended_scale = 0.78 WHERE style_name = 'COVAMINIMAL';

-- COVAMIDCENTURY: 0.85 -> 0.75 (middle of 0.65-0.85 range)
UPDATE style_loras SET recommended_scale = 0.75 WHERE style_name = 'COVAMIDCENTURY';

-- COVACOASTAL: 0.85 -> 0.75 (middle of 0.65-0.85 range)
UPDATE style_loras SET recommended_scale = 0.75 WHERE style_name = 'COVACOASTAL';

-- COVAFARMHOUSE: 0.85 -> 0.75 (middle of 0.65-0.85 range)
UPDATE style_loras SET recommended_scale = 0.75 WHERE style_name = 'COVAFARMHOUSE';

-- COVAARTDECO: 0.82 -> 0.75 (middle of 0.65-0.85 range)
UPDATE style_loras SET recommended_scale = 0.75 WHERE style_name = 'COVAARTDECO';
