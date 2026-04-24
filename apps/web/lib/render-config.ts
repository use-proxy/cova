/**
 * V3 empty-room retry + token economics. Single source of truth —
 * retry route, render route, and UI all import from here.
 *
 * Changing any value here without bumping pipeline_version in the cache
 * will cause stale cached rows to keep serving under the new policy, so
 * ratchet `CACHE_PIPELINE_VERSION` whenever retry shape changes.
 */

export const RENDER_CONFIG = {
  FREE_RETRIES_PER_RENDER: 1,
  PAID_RETRY_TOKEN_COST: 2,
  MAX_PAID_RETRIES_PER_RENDER: 5,
  MAX_RETRIES_PER_HOUR: 5,
  BASE_RENDER_TOKEN_COST: 5,
  CACHE_TTL_DAYS: 30,
  /** Bump when retry/cache schema or prompt changes so cached rows invalidate. */
  CACHE_PIPELINE_VERSION: "v3.0",
  /** Claude audit score threshold below which we set quality_warning=true. */
  QUALITY_WARNING_SCORE_THRESHOLD: 7,
} as const;

export type RenderConfig = typeof RENDER_CONFIG;
