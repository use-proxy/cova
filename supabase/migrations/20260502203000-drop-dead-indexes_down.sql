-- Reverse step 1. Definitions reconstructed from cova-plan/snapshots/P01a-pre-drop-*.sql.
CREATE INDEX IF NOT EXISTS products_v1_clip_embedding_hnsw_idx ON public.products_v1
  USING hnsw (clip_embedding extensions.vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX IF NOT EXISTS products_v1_fusion_embedding_hnsw_idx ON public.products_v1
  USING hnsw (clip_fusion_embedding extensions.vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX IF NOT EXISTS idx_products_clip_embedding ON public.products
  USING ivfflat (clip_embedding_data extensions.vector_cosine_ops) WITH (lists='100');
CREATE INDEX IF NOT EXISTS rooms_generation_seed_idx ON public.rooms USING btree (generation_seed) WHERE (generation_seed IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pairs_is_anchor ON public.quiz_comparison_pairs USING btree (is_anchor);
CREATE INDEX IF NOT EXISTS idx_quiz_comparison_pairs_anchor ON public.quiz_comparison_pairs USING btree (is_anchor, room_type) WHERE (is_anchor = true);
CREATE INDEX IF NOT EXISTS style_loras_style_name_idx ON public.style_loras USING btree (style_name);
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_room_type ON public.style_fingerprints USING btree (room_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_redesign_feedback_user_room ON public.redesign_feedback USING btree (user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_renders_composite_score ON public.renders USING btree (composite_score);
CREATE INDEX IF NOT EXISTS idx_renders_laion_high ON public.renders USING btree (laion_score) WHERE (laion_score > (6.0)::double precision);
CREATE INDEX IF NOT EXISTS idx_renders_laion_score ON public.renders USING btree (laion_score);
