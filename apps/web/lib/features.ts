/**
 * Feature flag: empty-room render pipeline version.
 *
 * Precedence (first match wins):
 *   1. COVA_RENDER_PIPELINE hard-pin ("v3" | "v2") — forces the same
 *      version for every user. Used for staging / tests / rollback.
 *      Server-only (no NEXT_PUBLIC_ prefix) so rollback is env-var-only
 *      and does not require a client-bundle rebuild.
 *   2. ADMIN_TEST_USER_IDS list → always v3.
 *   3. COVA_V3_ROLLOUT_PERCENTAGE (0-100) → deterministic per-user hash bucket.
 *   4. Default → v2 (existing production pipeline, stays live).
 *
 * Keep this function pure and cheap — it's called on every render request.
 * Caller must be server-side (API route, Server Component, or middleware);
 * calling from a Client Component will always fall through to default (v2)
 * because process.env values without the NEXT_PUBLIC_ prefix are stripped
 * from the client bundle at build time.
 */

export type RenderPipelineVersion = "v2" | "v3";

/** Stable non-crypto hash for user bucketing (deterministic across calls). */
function simpleHash(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a basis
  for (let i = 0; i < input.length; i++) {
    h = (h ^ input.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function getRenderPipelineVersion(userId?: string): RenderPipelineVersion {
  // 1. Hard pin (staging / rollback)
  const hard = process.env.COVA_RENDER_PIPELINE;
  if (hard === "v3") return "v3";
  if (hard === "v2") return "v2";

  // 2. Admin test users → always v3
  const adminIds = (process.env.ADMIN_TEST_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (userId && adminIds.includes(userId)) return "v3";

  // 3. Percentage rollout
  const pct = parseFloat(process.env.COVA_V3_ROLLOUT_PERCENTAGE || "0");
  if (userId && Number.isFinite(pct) && pct > 0) {
    const bucket = simpleHash(userId) % 100;
    if (bucket < pct) return "v3";
  }

  // 4. Default — stay on v2
  return "v2";
}

/** Exported for tests. */
export const _internal_simpleHash = simpleHash;
