-- Redesign provider flags. NB-Pro edit is the default redesign; turning
-- redesign_nb_pro_default off sends every render back to the V3 pipeline.
-- render_two_variants (NB-Pro + depth-ControlNet, user picks) starts off.

INSERT INTO feature_flags (key, enabled, percent_rollout, environment, description) VALUES
  ('redesign_nb_pro_default', true, 100, 'all', 'Redesign with fal-ai/nano-banana-pro/edit; off = V3 pipeline (kill switch)'),
  ('render_two_variants', false, 0, 'all', 'Render NB-Pro + depth-ControlNet variants in parallel; user picks')
ON CONFLICT (key) DO NOTHING;
