/**
 * Bayesian Quiz Engine — V3 12-dim system
 *
 * Manages posterior belief over user style dimensions during pairwise
 * comparison phase. Tracks per-dimension uncertainty, contradiction
 * detection, and bonus swipe eligibility.
 *
 * The posterior is a diagonal Gaussian (independent dimensions) for
 * computational simplicity. Each dimension has a mean and variance.
 */

import {
  DIMENSION_ORDER,
  type DimensionName,
  type StyleName,
  STYLE_ARCHETYPES,
} from './style-archetypes';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BayesianState {
  /** Posterior mean for each dimension [0, 1] */
  mean: Record<DimensionName, number>;
  /** Posterior variance for each dimension (diagonal of covariance) */
  variance: Record<DimensionName, number>;
  /** Number of contradiction detections per dimension */
  contradictions: Record<DimensionName, number>;
  /** Number of responses targeting each dimension */
  responsesPerDim: Record<DimensionName, number>;
  /** Total responses so far */
  totalResponses: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_VARIANCE = 0.25; // prior uncertainty per dim
const OBSERVATION_VARIANCE = 0.15; // noise per observation
const MAX_PER_DIM = 4; // cap responses per dimension
const CONTRADICTION_THRESHOLD = 0.7; // |residual| > this triggers flag
const CONTRADICTION_INFLATION = 1.5; // multiply variance by this
const BONUS_SWIPE_UNCERTAINTY_THRESHOLD = 0.25; // sqrt(var) > this = uncertain
const BONUS_SWIPE_DIM_THRESHOLD = 4; // need >4 uncertain dims to trigger bonus

// ── Mapping V3 dims to DB pair dimension names ──────────────────────────────

export const V3_DIM_TO_PAIR_DIMS: Record<DimensionName, string[]> = {
  warmth:             ['colorTemperature', 'lightPreference'],
  complexity:         ['colorSaturation', 'pattern'],
  formality:          ['formality'],
  natureMateriality:  ['material', 'nature'],
  colorSaturation:    ['colorSaturation'],
  textureRichness:    ['texture'],
  lightingDrama:      ['contrast'],
  pattern:            ['pattern'],
  lightPreference:    ['lightPreference'],
  lineQuality:        ['lineQuality'],
  symmetryPreference: ['formality'],
  plantPresence:      ['nature'],
};

/** Reverse mapping: DB pair dimension name → V3 dims it informs */
export const PAIR_DIM_TO_V3: Record<string, DimensionName[]> = {};
for (const [v3Dim, pairDims] of Object.entries(V3_DIM_TO_PAIR_DIMS)) {
  for (const pd of pairDims) {
    if (!PAIR_DIM_TO_V3[pd]) PAIR_DIM_TO_V3[pd] = [];
    PAIR_DIM_TO_V3[pd].push(v3Dim as DimensionName);
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

function neutralState(): BayesianState {
  const mean = {} as Record<DimensionName, number>;
  const variance = {} as Record<DimensionName, number>;
  const contradictions = {} as Record<DimensionName, number>;
  const responsesPerDim = {} as Record<DimensionName, number>;
  for (const d of DIMENSION_ORDER) {
    mean[d] = 0.5;
    variance[d] = INITIAL_VARIANCE;
    contradictions[d] = 0;
    responsesPerDim[d] = 0;
  }
  return { mean, variance, contradictions, responsesPerDim, totalResponses: 0 };
}

/**
 * Initialize posterior from anchor question results.
 *
 * priorWeights: e.g. { COVABIOPHILIC: 0.40, COVAJAPANDI: 0.30, COVAARTDECO: 0.20 }
 * Remaining weight distributed as 0.5 (neutral) across unselected dims.
 */
export function initPosterior(
  priorWeights: Partial<Record<StyleName, number>>,
): BayesianState {
  const state = neutralState();

  // Blend archetype vectors weighted by prior
  for (const d of DIMENSION_ORDER) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [style, weight] of Object.entries(priorWeights)) {
      const archetype = STYLE_ARCHETYPES[style as StyleName];
      if (!archetype) continue;
      weightedSum += archetype[d] * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) {
      // Blend between weighted archetype values and neutral prior
      state.mean[d] = weightedSum / totalWeight;
      // Reduce variance proportional to total prior weight (max confidence = 0.90 of initial)
      state.variance[d] = INITIAL_VARIANCE * (1 - totalWeight * 0.6);
    }
  }

  return state;
}

// ── Bayesian Update ─────────────────────────────────────────────────────────

/**
 * Update posterior after a pairwise comparison choice.
 *
 * @param state Current posterior state
 * @param pairDimension The DB dimension name the pair tests (e.g. 'colorTemperature')
 * @param observedValue The implied dimension value from the user's choice [0, 1]
 *   (side A might map to 0.8 if it's the "high" option, side B to 0.2)
 */
export function updatePosterior(
  state: BayesianState,
  pairDimension: string,
  observedValue: number,
): BayesianState {
  const next = structuredClone(state);
  next.totalResponses++;

  // Find which V3 dims this pair dimension informs
  const targetDims = PAIR_DIM_TO_V3[pairDimension] ?? [];

  for (const dim of targetDims) {
    if (next.responsesPerDim[dim] >= MAX_PER_DIM) continue;

    const priorMean = next.mean[dim];
    const priorVar = next.variance[dim];

    // Bayesian update (Gaussian conjugate)
    const K = priorVar / (priorVar + OBSERVATION_VARIANCE); // Kalman gain
    next.mean[dim] = priorMean + K * (observedValue - priorMean);
    next.variance[dim] = priorVar * (1 - K);

    // Clamp mean to [0, 1]
    next.mean[dim] = Math.max(0, Math.min(1, next.mean[dim]));

    next.responsesPerDim[dim]++;

    // Contradiction detection
    const residual = Math.abs(observedValue - priorMean);
    if (residual > CONTRADICTION_THRESHOLD) {
      next.contradictions[dim]++;
      if (next.contradictions[dim] >= 2) {
        // Inflate variance — we're less sure about this dim
        next.variance[dim] *= CONTRADICTION_INFLATION;
      }
    }
  }

  return next;
}

// ── Dimension Selection ─────────────────────────────────────────────────────

/**
 * Select the next dimension to test based on maximum entropy (uncertainty).
 * Returns the V3 dimension name with highest variance, respecting MAX_PER_DIM.
 * Returns null if all dims are at cap.
 */
export function selectNextDimension(state: BayesianState): DimensionName | null {
  let best: DimensionName | null = null;
  let bestEntropy = -1;

  for (const d of DIMENSION_ORDER) {
    if (state.responsesPerDim[d] >= MAX_PER_DIM) continue;
    // Entropy of a Gaussian is proportional to log(variance)
    const entropy = state.variance[d];
    if (entropy > bestEntropy) {
      bestEntropy = entropy;
      best = d;
    }
  }

  // If all dims at cap, allow dims that had contradictions
  if (best === null) {
    for (const d of DIMENSION_ORDER) {
      if (state.contradictions[d] >= 2 && state.variance[d] > bestEntropy) {
        bestEntropy = state.variance[d];
        best = d;
      }
    }
  }

  return best;
}

/**
 * Get DB pair dimension names to query for a given V3 target dimension.
 */
export function getPairDimsForTarget(targetDim: DimensionName): string[] {
  return V3_DIM_TO_PAIR_DIMS[targetDim] ?? [];
}

// ── Bonus Swipe Logic ───────────────────────────────────────────────────────

/**
 * Returns true if the posterior has too many uncertain dimensions,
 * indicating bonus swipes would improve the fingerprint.
 */
export function needsBonusSwipes(state: BayesianState): boolean {
  const uncertainDims = DIMENSION_ORDER.filter(
    d => Math.sqrt(state.variance[d]) > BONUS_SWIPE_UNCERTAINTY_THRESHOLD,
  );
  return uncertainDims.length > BONUS_SWIPE_DIM_THRESHOLD;
}

/**
 * Get the most uncertain dimensions for targeting bonus swipes.
 * Returns up to `count` dimensions sorted by descending uncertainty.
 */
export function getMostUncertainDims(
  state: BayesianState,
  count: number = 4,
): DimensionName[] {
  return [...DIMENSION_ORDER]
    .sort((a, b) => state.variance[b] - state.variance[a])
    .slice(0, count);
}

// ── Utility ─────────────────────────────────────────────────────────────────

/**
 * Extract the posterior mean as a Record<DimensionName, number>
 * suitable for passing to fingerprintToStyleBlend().
 */
export function posteriorToFingerprint(
  state: BayesianState,
): Record<DimensionName, number> {
  return { ...state.mean };
}
