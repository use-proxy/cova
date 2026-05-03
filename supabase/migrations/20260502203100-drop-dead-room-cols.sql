-- P01a M1 step 2 — drop dead columns from `rooms` (data loss documented).
-- Cross-reference: docs/audit/SCHEMA_AUDIT.md §11.2 Group A + Group B + Group D.
-- Pre-drop snapshot at cova-plan/snapshots/P01a-pre-drop-*.sql.
--
-- TIGHTENED 2026-05-02 (round 2) per back-bug
-- `cova-plan/back-bugs/P01a-m2-m4-active-refs.md`. Original 28-column drop
-- list was halted in session 2 because ~15 production routes still
-- read/write 11 of those columns. This tightened version drops only the
-- truly-dead subset (flythrough_*, plus_*, marble_*, splat_path, depth_*).
-- Load-bearing column drops are deferred to the phase that owns their
-- consuming code (see back-bug for the per-column owner mapping).
--
-- Per-column data-loss row counts (snapshot of 308 total rooms at audit time):
--   splat_path: 4 rows non-null
--   marble_spz_url_500k: 4 rows
--   ALL OTHERS in this tightened list: 0–10 rows (legacy data only)

ALTER TABLE rooms
  -- Group A1 — Marble / 3D / video / depth (retired by CLAUDE.md, no active refs):
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
  DROP COLUMN IF EXISTS flythrough_video_url,
  DROP COLUMN IF EXISTS flythrough_ready,
  DROP COLUMN IF EXISTS flythrough_duration_seconds,
  DROP COLUMN IF EXISTS depth_map_url,
  DROP COLUMN IF EXISTS depth_map_url_v2,
  DROP COLUMN IF EXISTS depth_map_quality_score,
  DROP COLUMN IF EXISTS depth_conditioning_method;

-- 11 columns deferred to consuming-code phase (see back-bug §"Suggested fix sequence"):
--   pipeline_mode, pipeline_cost_log, modal_job_id, calibration_data, scene_state,
--   perspective_render_url, video_url, capture_photo_urls, capture_mode,
--   inpainting_mask_url, personalization_context.
