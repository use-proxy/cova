/**
 * Phase 3 — LoRA weighted blending.
 *
 * Converts a fingerprint-derived archetype distribution (COVA* keys) into the
 * Director output shape `loras: Record<cv-trigger, number>` with proportions
 * summing to 1.0.
 *
 * Contract (per docs/phase-3/director-migration-design.md):
 *  - Max 3 LoRAs per brief.
 *  - Weights below 0.10 are dropped. Rationale: weights below 0.10 contribute
 *    less than user-perceptible aesthetic influence and are dropped to avoid
 *    wasting inference cost.
 *  - Output sum == 1.0 after normalization.
 *  - Zero / negative / empty input → `{ [primaryTrigger]: 1.0 }` fallback.
 *  - Duplicate cv-triggers (COVAMINIMAL and COVASCANDINAV both resolve to
 *    cvscn) are merged by addition before the top-3 cut.
 */

import { COVA_TO_DNA_TRIGGER, type CovaStyleKey } from "@/lib/styles/lora-registry";

const MAX_LORAS = 3;
const MIN_WEIGHT = 0.10;

export interface BlendResult {
  loras: Record<string, number>;
  primary: string;
}

/**
 * Build a `loras` map from an already-normalized archetype distribution
 * keyed by COVA* keys (the output shape of `fingerprintToStyleBlend`).
 * Input weights are merged by cv-trigger, truncated to top-3, dropped under
 * MIN_WEIGHT, then re-normalized to sum 1.0.
 */
export function buildLorasFromBlend(
  blend: Record<string, number> | null | undefined,
  fallbackTrigger: string,
): BlendResult {
  const fallback = (): BlendResult => ({
    loras: { [fallbackTrigger]: 1.0 },
    primary: fallbackTrigger,
  });

  if (!blend) return fallback();

  const merged: Record<string, number> = {};
  for (const [key, weight] of Object.entries(blend)) {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) continue;
    const trigger = resolveTrigger(key);
    if (!trigger) continue;
    merged[trigger] = (merged[trigger] ?? 0) + weight;
  }

  const entries = Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LORAS);
  if (entries.length === 0) return fallback();

  return normalizeEntries(entries, fallbackTrigger);
}

/**
 * Public normalizer used by the Director's post-call override and by tests.
 * Accepts arbitrary cv-trigger weight maps (possibly unnormalized, possibly
 * empty) and returns a normalized, top-3, > MIN_WEIGHT blend — or the
 * fallback single-primary map.
 */
export function normalizeLoras(
  raw: Record<string, number> | null | undefined,
  fallbackTrigger: string,
): BlendResult {
  if (!raw) return { loras: { [fallbackTrigger]: 1.0 }, primary: fallbackTrigger };

  const entries = Object.entries(raw)
    .filter(([, w]) => typeof w === "number" && Number.isFinite(w) && w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LORAS);

  if (entries.length === 0) {
    return { loras: { [fallbackTrigger]: 1.0 }, primary: fallbackTrigger };
  }

  return normalizeEntries(entries, fallbackTrigger);
}

function normalizeEntries(
  entries: Array<[string, number]>,
  fallbackTrigger: string,
): BlendResult {
  // First pass normalization to unit sum.
  let sum = entries.reduce((s, [, w]) => s + w, 0);
  if (sum <= 0) {
    return { loras: { [fallbackTrigger]: 1.0 }, primary: fallbackTrigger };
  }
  let normalized: Array<[string, number]> = entries.map(([t, w]) => [t, w / sum]);

  // Drop sub-threshold weights, then re-normalize. If dropping empties the
  // map (rare: everything was < 0.10) fall back to the single-dominant entry
  // before drop.
  const aboveThreshold = normalized.filter(([, w]) => w >= MIN_WEIGHT);
  if (aboveThreshold.length === 0) {
    const top = normalized[0]!;
    return { loras: { [top[0]]: 1.0 }, primary: top[0] };
  }

  sum = aboveThreshold.reduce((s, [, w]) => s + w, 0);
  normalized = aboveThreshold.map(([t, w]) => [t, w / sum]);

  // Guard against floating-point drift: nudge the largest entry to absorb
  // any residual so the sum is exactly 1.0.
  const rawSum = normalized.reduce((s, [, w]) => s + w, 0);
  const drift = 1.0 - rawSum;
  if (Math.abs(drift) > 1e-9 && normalized.length > 0) {
    normalized[0] = [normalized[0]![0], normalized[0]![1] + drift];
  }

  const loras: Record<string, number> = {};
  for (const [t, w] of normalized) loras[t] = w;
  return { loras, primary: normalized[0]![0] };
}

function resolveTrigger(key: string): string | null {
  // Already a cv-trigger? Pass through.
  if (/^cv[a-z]{2,5}$/i.test(key)) return key.toLowerCase();
  // COVA* archetype key? Map via registry.
  if (key in COVA_TO_DNA_TRIGGER) return COVA_TO_DNA_TRIGGER[key as CovaStyleKey];
  return null;
}

/**
 * Back-compat reader: given a DesignBrief.style_weights shape (which may or
 * may not carry a `loras` map on older rows), returns a normalized loras map.
 * If `loras` is absent, synthesizes `{ [primary_lora]: 1.0 }`.
 */
export function readLoras(styleWeights: {
  primary_lora?: string;
  loras?: Record<string, number>;
} | null | undefined): Record<string, number> {
  if (!styleWeights) return {};
  if (styleWeights.loras && Object.keys(styleWeights.loras).length > 0) {
    return styleWeights.loras;
  }
  if (styleWeights.primary_lora) {
    // Strip any trailing class descriptor ("cvwmn interior" → "cvwmn").
    const trigger = styleWeights.primary_lora.split(/\s+/)[0]!.toLowerCase();
    return { [trigger]: 1.0 };
  }
  return {};
}
