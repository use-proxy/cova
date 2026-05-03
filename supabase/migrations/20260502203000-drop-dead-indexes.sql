-- P01a M1 step 1 — drop 12 unused indexes (rows lost: 0).
-- Pre-drop snapshot at cova-plan/snapshots/P01a-pre-drop-*.sql.
-- Cross-reference: docs/audit/SCHEMA_AUDIT.md §11.3 + idx_scan=0 pg_stat_user_indexes.

DROP INDEX IF EXISTS public.products_v1_clip_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.products_v1_fusion_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.idx_products_clip_embedding;
DROP INDEX IF EXISTS public.rooms_generation_seed_idx;
DROP INDEX IF EXISTS public.idx_pairs_is_anchor;
DROP INDEX IF EXISTS public.idx_quiz_comparison_pairs_anchor;
DROP INDEX IF EXISTS public.style_loras_style_name_idx;
DROP INDEX IF EXISTS public.idx_style_fingerprints_room_type;
DROP INDEX IF EXISTS public.idx_redesign_feedback_user_room;
DROP INDEX IF EXISTS public.idx_renders_composite_score;
DROP INDEX IF EXISTS public.idx_renders_laion_high;
DROP INDEX IF EXISTS public.idx_renders_laion_score;
