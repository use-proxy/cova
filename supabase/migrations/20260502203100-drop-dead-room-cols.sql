-- P01a M1 step 2 — drop 28 dead columns from `rooms` (data loss documented).
-- Cross-reference: docs/audit/SCHEMA_AUDIT.md §11.2 Group A + Group B + Group D.
-- Pre-drop snapshot at cova-plan/snapshots/P01a-pre-drop-*.sql.
-- Per-column data-loss row counts (snapshot of 308 total rooms at audit time):
--   splat_path: 4 rows non-null
--   marble_spz_url_500k: 4 rows
--   keep_mask: 87 rows  ← review before dropping; verifier confirms
--   inpainting_mask_url: 2 rows
--   ALL OTHERS: 0–10 rows (legacy data only)

ALTER TABLE rooms
  -- Group A — Marble / 3D / video / depth (retired by CLAUDE.md):
  DROP COLUMN IF EXISTS splat_path,
  DROP COLUMN IF EXISTS marble_mini_world_id,
  DROP COLUMN IF EXISTS marble_mini_spz_url,
  DROP COLUMN IF EXISTS marble_spz_url_500k,
  DROP COLUMN IF EXISTS marble_spz_url_100k,
  DROP COLUMN IF EXISTS marble_plus_thumbnail_url,
  DROP COLUMN IF EXISTS plus_eligible,
  DROP COLUMN IF EXISTS plus_started_at,
  DROP COLUMN IF EXISTS plus_completed_at,
  DROP COLUMN IF EXISTS plus_upgrade_ready,
  DROP COLUMN IF EXISTS pipeline_mode,
  DROP COLUMN IF EXISTS pipeline_cost_log,
  DROP COLUMN IF EXISTS modal_job_id,
  DROP COLUMN IF EXISTS calibration_data,
  DROP COLUMN IF EXISTS scene_state,
  DROP COLUMN IF EXISTS flythrough_video_url,
  DROP COLUMN IF EXISTS flythrough_ready,
  DROP COLUMN IF EXISTS flythrough_duration_seconds,
  DROP COLUMN IF EXISTS perspective_render_url,
  DROP COLUMN IF EXISTS depth_map_url,
  DROP COLUMN IF EXISTS depth_map_url_v2,
  DROP COLUMN IF EXISTS depth_map_quality_score,
  DROP COLUMN IF EXISTS depth_conditioning_method,
  -- Group B — V1 capture / professionalization (retired):
  DROP COLUMN IF EXISTS video_url,
  DROP COLUMN IF EXISTS capture_photo_urls,
  DROP COLUMN IF EXISTS capture_mode,
  DROP COLUMN IF EXISTS inpainting_mask_url,
  -- Group D — personalization legacy (V1 director branch):
  DROP COLUMN IF EXISTS personalization_context;
