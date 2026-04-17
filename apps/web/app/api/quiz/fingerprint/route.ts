import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { StyleFingerprint } from "@/types/fingerprint";
import { toDisplayName } from "@/lib/ai/anchor-display";
import {
  NEUTRAL_MIDPOINT,
  softmaxStyleMatch,
  STYLES,
  V2_DIM_COUNT,
  V2_DIM_NAMES,
  V2_DIMENSION_MATCH_WEIGHTS,
  OLD_DIM_TO_V2,
  mergeToV2,
  expandV2ToDimensions,
} from "@/lib/ai/style-match";

// ── V2 6-dimension system ─────────────────────────────────────────────────────
// Merged from 12 dims for better signal-to-noise. See style-match.ts for mapping.
// V2 order: warmth, visual_complexity, organicness, density, traditionalism, character

// Old 12-dim keys — used for V1 compat in Phase C confirmation path
const OLD_DIM_ORDER_KEYS = [
  "colorTemperature",
  "colorSaturation",
  "density",
  "formality",
  "era",
  "material",
  "texture",
  "pattern",
  "lineQuality",
  "lightPreference",
  "nature",
  "culturalInfluence",
];

type V2DimIdx = 0 | 1 | 2 | 3 | 4 | 5;

interface PairwiseResponse {
  pairId: string;
  chosenSide: "A" | "B" | "skip";
  responseTimeMs: number;
}

// Non-visual question responses from step-2b
interface NonVisualResponse {
  questionId: "surfaces" | "materials" | "color";
  choiceIndex: number; // 0-indexed
}

interface GridSelection {
  styleIndex: number;
  styleName: string;
  round: number;
}

interface NewFingerprintRequest {
  phase_a_selections: string[];
  grid_selections?: GridSelection[];
  phase_b_responses: PairwiseResponse[];
  non_visual_responses?: NonVisualResponse[];
  room_type: string;
  household_composition?: string;
  free_text?: string;
  budget_tier?: "budget" | "mid" | "premium" | "luxury" | null;
  phase_c_confirmation?: boolean;
  confirmed_fingerprint?: StyleFingerprint;
  tiebreaker_deltas?: number[] | null;
  /** V3 anchor prior from step-2. When present, activates V3 fingerprint computation. */
  anchor_prior?: Record<string, number>;
  /** V3 anchor question winners */
  q1_winner?: string;
  q2_winner?: string;
  q3_winner?: string;
}

// Raised from 0.2 → 0.28: tighter threshold reduces noise
const STRONG_BAND = 0.28;

// ── Improvement 1: response time weighting ──────────────────────────────────
// Fast decisive swipes carry more genuine signal than slow hesitant ones.
// Weight scales linearly between fast and slow thresholds; clamps outside.
const RESPONSE_TIME_FAST_MS = 800;
const RESPONSE_TIME_SLOW_MS = 3000;
const RESPONSE_TIME_WEIGHT_FAST = 1.8;
const RESPONSE_TIME_WEIGHT_SLOW = 0.5;
const RESPONSE_TIME_WEIGHT_NORMAL = 1.0;

function responseTimeWeight(ms: number): number {
  if (ms < RESPONSE_TIME_FAST_MS) return RESPONSE_TIME_WEIGHT_FAST;
  if (ms > RESPONSE_TIME_SLOW_MS) return RESPONSE_TIME_WEIGHT_SLOW;
  const t =
    (ms - RESPONSE_TIME_FAST_MS) /
    (RESPONSE_TIME_SLOW_MS - RESPONSE_TIME_FAST_MS);
  return (
    RESPONSE_TIME_WEIGHT_FAST +
    t * (RESPONSE_TIME_WEIGHT_SLOW - RESPONSE_TIME_WEIGHT_FAST)
  );
}
void RESPONSE_TIME_WEIGHT_NORMAL;

// ── Improvement 2: repeated phase A style bonus ─────────────────────────────
// A user who picks the same style across rounds 1 and 2 sends a stronger
// signal than a one-off pick — boost that style's contribution.
const PHASE_A_REPEATED_STYLE_MULTIPLIER = 1.5;

// ── Improvement 3: non-visual question weight ───────────────────────────────
// Non-visual answers are less reliable than visual swipes — apply at 0.4 of
// the raw delta magnitude.
const NON_VISUAL_WEIGHT = 0.4;

// ── Improvement 4: contradiction penalty ────────────────────────────────────
const CONTRADICTION_CONFIDENCE_PENALTY = 0.15;
const CONTRADICTION_RATIO_THRESHOLD = 0.3;
// Only apply contradiction penalty when overall per-dim consistency is also
// low — genuine "mixed but coherent" users keep the floor on dims they
// actually care about.
const CONTRADICTION_OVERALL_GATE = 0.65;

// ── Improvement 6: randomness detection ─────────────────────────────────────
const RANDOMNESS_BALANCE_THRESHOLD = 0.40;
const RANDOMNESS_MAX_PENALTY = 0.35;
// Skip the randomness penalty for users whose per-dim consistency is high
// (mixed but coherent) — only randomly-balanced users with no per-dim
// agreement should be penalised.
const RANDOMNESS_CONSISTENCY_GATE = 0.60;

// ── Upgrade 1: strong Phase A prior initialization ──────────────────────────
// Phase A signal is blended with neutral midpoint at a 75/25 weight so the
// anchor/grid selections set a strong starting point that Phase B refines.
// Previously Phase A contributed ~40% of the final fingerprint — with this
// prior Phase A contributes 75%, giving Phase B a meaningful position to
// refine from rather than a near-neutral vector.
const PHASE_A_PRIOR_WEIGHT = 0.75;
const PHASE_A_NEUTRAL_WEIGHT = 1 - PHASE_A_PRIOR_WEIGHT;

// Initial confidence derived from Phase A anchor compatibility. A higher
// compatibility score means the user's Phase A picks agree on more V2 dims,
// which warrants a higher starting confidence before Phase B even begins.
function initialConfidenceFromCompatibility(compat: number): number {
  if (compat >= 0.90) return 0.85;
  if (compat >= 0.70) return 0.65;
  if (compat >= 0.50) return 0.60;
  if (compat >= 0.30) return 0.40;
  return 0.30;
}

// ── Upgrade 3: blended confidence formula ───────────────────────────────────
// Final confidence is a weighted blend of Phase A (initial anchor-compat
// derived value) and Phase B (per-dim response coverage). With many
// responses Phase B dominates; early in the quiz Phase A carries more weight.
const PHASE_A_CONF_WEIGHT_LOW_RESPONSES = 0.40;
const PHASE_A_CONF_WEIGHT_HIGH_RESPONSES = 0.30;
const PHASE_B_DOMINANCE_RESPONSE_THRESHOLD = 16;

// Maximum lift Phase B can deliver above the Phase A anchor confidence
// before any consistency/randomness adjustments. Prevents a weak anchor
// (compat 0.5) from piggybacking on a perfectly-correlated phase B run
// and producing decisive-user-level confidence.
const PHASE_B_MAX_LIFT_OVER_A = 0.22;

// Phase B per-dim consistency scoring. Raw response count alone doesn't
// tell us whether the user's swipes actually agreed on a direction for a
// given V2 dim — a well-covered but oscillating dim has just as many
// responses as a well-covered decisive one. We measure consistency by
// summing the sign of each response's rawDelta on dim i (only counting
// responses where |rawDelta_i| exceeds PHASE_B_INFORMATIVE_DELTA_THRESHOLD,
// so uninformative off-axis updates don't pollute the signal) and taking
// |sum| / count. A perfectly consistent dim scores 1.0; a perfectly split
// one scores 0.0.
const PHASE_B_INFORMATIVE_DELTA_THRESHOLD = 0.1;
// Floor for per-dim consistency so a single stray disagreement doesn't
// completely zero out a dim's contribution.
const PHASE_B_CONSISTENCY_FLOOR = 0.2;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function neutralV2(): number[] {
  return Array(V2_DIM_COUNT).fill(NEUTRAL_MIDPOINT) as number[];
}

function identityCov6(scale: number): number[][] {
  return Array.from({ length: V2_DIM_COUNT }, (_, i) =>
    Array.from({ length: V2_DIM_COUNT }, (__, j) => (i === j ? scale : 0)),
  );
}

// ── Non-visual question adjustments ─────────────────────────────────────────
// V2 indices: 0=warmth, 1=visual_complexity, 2=organicness, 3=density, 4=traditionalism, 5=character
const NON_VISUAL_ADJUSTMENTS: Record<
  string,
  Array<Array<{ dim: V2DimIdx; delta: number }>>
> = {
  surfaces: [
    // A: "Clear and minimal"
    [
      { dim: 3, delta: -0.3 },
      { dim: 1, delta: -0.2 },
    ],
    // B: "Some thoughtful objects"
    [], // neutral — no adjustments
    // C: "Layered with things I love"
    [
      { dim: 3, delta: 0.3 },
      { dim: 1, delta: 0.2 },
    ],
  ],
  materials: [
    // A: "Natural wood, stone, plants"
    [{ dim: 2, delta: 0.35 }],
    // B: "Clean white, glass, metal"
    [
      { dim: 2, delta: -0.25 },
      { dim: 0, delta: -0.1 },
    ],
    // C: "Rich fabrics, velvet, brass"
    [
      { dim: 1, delta: 0.2 },
      { dim: 0, delta: 0.15 },
    ],
    // D: "Mix of everything"
    [{ dim: 5, delta: 0.2 }],
  ],
  color: [
    // A: "Neutrals only"
    [
      { dim: 1, delta: -0.3 },
      { dim: 0, delta: 0.1 },
    ],
    // B: "One accent color, rest neutral"
    [{ dim: 1, delta: -0.1 }],
    // C: "Bold color as a statement"
    [{ dim: 1, delta: 0.25 }],
    // D: "Color everywhere"
    [{ dim: 1, delta: 0.35 }],
  ],
};

// ── Debug types ─────────────────────────────────────────────────────────────
interface DebugStyleScore {
  styleName: string;
  rawCosineSimilarity: number;
  postSoftmaxWeight: number;
}

interface DebugData {
  fingerprintVersion: "v2";
  v2DimsAfterPhaseA: number[];
  v2DimsAfterNonVisual: number[];
  v2DimsAfterPhaseB: number[];
  anchorCompatibility: number;
  styleScores: DebugStyleScore[];
  phaseBResponses: Array<{
    pairId: string;
    oldDimension: string;
    v2Targets: Array<{ dimIndex: number; dimName: string; weight: number }>;
    chosenSide: string;
  }>;
}

async function computeNewFingerprint(
  body: NewFingerprintRequest,
  collectDebug = false,
): Promise<{
  fingerprint: StyleFingerprint;
  styleName: string;
  styleTags: string[];
  competingStyles: string[];
  blendRatio: number;
  styleBlend: Record<string, number>;
  primaryStyle: string | null;
  secondaryStyle: string | null;
  primaryWeight: number;
  secondaryWeight: number;
  debug?: DebugData;
}> {
  const { phase_b_responses } = body;

  // ── Step 1 — Phase A warm start (in V2 6-dim space) ────────────────────────
  const phaseAIds = body.phase_a_selections ?? [];
  const v2Dims = neutralV2();
  const covariance = identityCov6(0.5);
  let confidence = 0.3;
  let anchorCompatibility = 0;
  let hasPhaseASignal = false;

  // ── Phase A: smart merge from grid selections ─────────────────────
  if (body.grid_selections && body.grid_selections.length > 0) {
    // Count picks per styleIndex
    const pickCounts: Record<number, number> = {};
    for (const sel of body.grid_selections) {
      pickCounts[sel.styleIndex] = (pickCounts[sel.styleIndex] ?? 0) + 1;
    }

    const totalPicks = body.grid_selections.length; // always 6
    const pickedStyles = Object.entries(pickCounts)
      .map(([idxStr, count]) => {
        // Improvement 2: a style picked across multiple rounds is a stronger
        // signal than a one-off pick — boost its blend weight.
        const repeatBonus =
          count >= 2 ? PHASE_A_REPEATED_STYLE_MULTIPLIER : 1.0;
        return {
          style: STYLES[Number(idxStr)]!,
          count,
          weight: (count / totalPicks) * repeatBonus,
        };
      })
      .filter((x) => x.style);

    // For each V2 dim, use pick-count-weighted max-deviation merge:
    // - Find the value furthest from neutral among all chosen styles
    // - Weight that value by its style's pick share
    // - If two styles conflict on a dim (one HIGH one LOW), the one with
    //   more picks wins. If tied, the dim stays near-neutral (NLP resolves it).
    for (let d = 0; d < V2_DIM_COUNT; d++) {
      let weightedSum = 0;
      let totalWeight = 0;

      for (const { style, weight } of pickedStyles) {
        const val = style.v2Center[d] ?? NEUTRAL_MIDPOINT;
        const deviation = val - NEUTRAL_MIDPOINT;
        // Weight the deviation by pick share AND by how extreme the value is
        // This means a style that STRONGLY expresses a dim gets more influence
        const signalStrength = Math.abs(deviation) * weight;
        weightedSum += deviation * signalStrength;
        totalWeight += signalStrength;
      }

      // If no style has a strong opinion on this dim, stay neutral
      v2Dims[d] = totalWeight < 0.01
        ? NEUTRAL_MIDPOINT
        : clamp(NEUTRAL_MIDPOINT + (weightedSum / totalWeight), 0, 1);
    }

    // Compatibility proxy for grid selections: concentration of picks on a
    // single dominant style. 1.0 when all 6 picks go to one style.
    const maxPickShare = Math.max(...Object.values(pickCounts)) / totalPicks;
    anchorCompatibility = maxPickShare;
    hasPhaseASignal = true;
  } else if (phaseAIds.length > 0) {
    const admin = createAdminSupabaseClient();
    const { data: selectedAnchors } = await admin
      .from("quiz_anchor_images")
      .select("style_vector")
      .in("id", phaseAIds)
      .not("style_vector", "is", null);

    if (selectedAnchors && selectedAnchors.length > 0) {
      hasPhaseASignal = true;
      // Merge each 12-dim anchor to 6-dim V2
      const anchorV2s = selectedAnchors.map((a) =>
        mergeToV2(a.style_vector as Record<string, number>),
      );

      if (anchorV2s.length === 1) {
        const sv = anchorV2s[0]!;
        for (let i = 0; i < V2_DIM_COUNT; i++) v2Dims[i] = sv[i]!;
        // Single anchor — fully self-consistent by definition.
        anchorCompatibility = 1.0;
      } else {
        // Two anchors — max-deviation merge per V2 dimension
        const vecA = anchorV2s[0]!;
        const vecB = anchorV2s[1]!;
        let agreeCount = 0;

        for (let i = 0; i < V2_DIM_COUNT; i++) {
          const devA = vecA[i]! - NEUTRAL_MIDPOINT;
          const devB = vecB[i]! - NEUTRAL_MIDPOINT;

          if (Math.sign(devA) === Math.sign(devB) || devA === 0 || devB === 0) {
            v2Dims[i] = NEUTRAL_MIDPOINT + (devA + devB) / 2;
            if (Math.sign(devA) === Math.sign(devB) && devA !== 0) {
              agreeCount++;
            }
          } else {
            const dominant = Math.abs(devA) >= Math.abs(devB) ? devA : devB;
            v2Dims[i] = NEUTRAL_MIDPOINT + dominant * 0.7;
          }
        }

        anchorCompatibility = agreeCount / V2_DIM_COUNT;
      }

      // Amplify Phase A signal: push deviations 40% further from neutral
      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const deviation = v2Dims[i]! - NEUTRAL_MIDPOINT;
        v2Dims[i] = clamp(NEUTRAL_MIDPOINT + deviation * 1.4, 0, 1);
      }
    }
  }

  // ── Upgrade 1: apply strong Phase A prior blend ─────────────────────────
  // Only applies when Phase A produced some signal — otherwise v2Dims is
  // already the neutral midpoint and the blend would be a no-op.
  if (hasPhaseASignal) {
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      v2Dims[i] = clamp(
        PHASE_A_PRIOR_WEIGHT * v2Dims[i]! +
          PHASE_A_NEUTRAL_WEIGHT * NEUTRAL_MIDPOINT,
        0,
        1,
      );
    }
    // Initial confidence from anchor compatibility — used both as the pre-B
    // confidence and as the Phase A contribution to the blended final score.
    confidence = initialConfidenceFromCompatibility(anchorCompatibility);
  }

  // Phase A confidence snapshot for Upgrade 3 blend.
  const phaseAConfidence = confidence;

  const debugData: DebugData | undefined = collectDebug
    ? {
        fingerprintVersion: "v2",
        v2DimsAfterPhaseA: [...v2Dims],
        v2DimsAfterNonVisual: [],
        v2DimsAfterPhaseB: [],
        anchorCompatibility,
        styleScores: [],
        phaseBResponses: [],
      }
    : undefined;

  // ── Step 1b-pre — Apply tie-breaker deltas (direct V2 adjustments) ────────
  // These come from Q1 tie-breaker options and bypass the NON_VISUAL_ADJUSTMENTS
  // mapping entirely — they move specific V2 dims by calibrated amounts.
  console.log('[fingerprint] tiebreaker_deltas received:', body.tiebreaker_deltas);
  if (body.tiebreaker_deltas && body.tiebreaker_deltas.length === V2_DIM_COUNT) {
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      v2Dims[i] = clamp(v2Dims[i]! + (body.tiebreaker_deltas[i] ?? 0), 0, 1);
    }
    console.log('[fingerprint] v2Dims after tiebreaker:', [...v2Dims]);
  }

  // ── Step 1b — Apply non-visual question adjustments ────────────────────────
  if (body.non_visual_responses && body.non_visual_responses.length > 0) {
    for (const nvr of body.non_visual_responses) {
      const adjustments = NON_VISUAL_ADJUSTMENTS[nvr.questionId];
      if (!adjustments) continue;
      const choice = adjustments[nvr.choiceIndex];
      if (!choice) continue;
      for (const adj of choice) {
        // Improvement 3: non-visual answers are less reliable than visual
        // swipes — apply at a discounted weight.
        v2Dims[adj.dim] = clamp(
          v2Dims[adj.dim]! + adj.delta * NON_VISUAL_WEIGHT,
          0,
          1,
        );
      }
    }
  }

  if (debugData) {
    debugData.v2DimsAfterNonVisual = [...v2Dims];
  }

  // ── Step 2 — Apply Phase B updates (map old-dim pairs to V2 dims) ─────────
  const responsesPerV2Dim: number[] = Array(V2_DIM_COUNT).fill(0) as number[];

  if (phase_b_responses.length > 0) {
    const admin = createAdminSupabaseClient();
    const pairIds = Array.from(
      new Set(phase_b_responses.map((r) => r.pairId).filter(Boolean)),
    );

    const { data: pairRows } = await admin
      .from("quiz_comparison_pairs")
      .select("id, dimension, image_a_vector, image_b_vector")
      .in("id", pairIds);

    const pairsById = new Map<
      string,
      {
        dimension: string;
        image_a_vector: Record<string, number>;
        image_b_vector: Record<string, number>;
      }
    >();
    for (const row of pairRows ?? []) {
      pairsById.set(row.id as string, {
        dimension: row.dimension as string,
        image_a_vector: row.image_a_vector as Record<string, number>,
        image_b_vector: row.image_b_vector as Record<string, number>,
      });
    }

    // Momentum tracking per V2 dim
    const dimMomentum: number[] = Array(V2_DIM_COUNT).fill(0) as number[];
    const dimLastDirection: number[] = Array(V2_DIM_COUNT).fill(0) as number[];
    // Per-dim consistency tracking (Upgrade 3): sum of rawDelta signs and
    // count of informative responses, used to weight per-dim phase B conf.
    // With Improvement 1 these are weighted by response-time weight so slow
    // hesitant swipes contribute less effective coverage than fast ones.
    const dimSignSum: number[] = Array(V2_DIM_COUNT).fill(0) as number[];
    const dimInformativeCount: number[] = Array(V2_DIM_COUNT).fill(0) as number[];
    // Per-dim coverage tracking (Improvement 1): effective coverage scales
    // with response-time weight — slow swipes count as fewer units of cov.
    // Fast → ~1.32 per swipe, slow → ~0.8 per swipe.
    const dimEffCoverage: number[] = Array(V2_DIM_COUNT).fill(0) as number[];
    // Raw (unweighted) counts for Improvement 4 contradiction detection.
    // Using raw counts here keeps the contradiction ratio interpretable
    // even when rtWeights vary across responses.
    const dimRawSignSum: number[] = Array(V2_DIM_COUNT).fill(0) as number[];
    const dimRawCount: number[] = Array(V2_DIM_COUNT).fill(0) as number[];

    for (const resp of phase_b_responses) {
      if (resp.chosenSide === "skip") continue;
      const pair = pairsById.get(resp.pairId);
      if (!pair) continue;

      const chosenVec =
        resp.chosenSide === "A" ? pair.image_a_vector : pair.image_b_vector;
      const rejectedVec =
        resp.chosenSide === "A" ? pair.image_b_vector : pair.image_a_vector;

      const lambda = Math.min(4, 1 + 600 / Math.max(resp.responseTimeMs, 100));
      // Improvement 1: fast decisive swipes carry more signal than slow
      // hesitant ones. This multiplier is applied to dim-delta updates AND
      // to effective-coverage tracking so slow users see reduced confidence.
      const rtWeight = responseTimeWeight(resp.responseTimeMs);

      // Merge chosen/rejected to V2 and compute delta in V2 space
      const chosenV2 = mergeToV2(chosenVec);
      const rejectedV2 = mergeToV2(rejectedVec);

      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const rawDelta = chosenV2[i]! - rejectedV2[i]!;

        // Consistency tracking — only count responses where the pair
        // actually carries signal on dim i, so off-axis noise doesn't
        // wash out the direction-agreement signal.
        if (Math.abs(rawDelta) >= PHASE_B_INFORMATIVE_DELTA_THRESHOLD) {
          dimSignSum[i]! += Math.sign(rawDelta) * rtWeight;
          dimInformativeCount[i]! += rtWeight;
          // Scaled effective coverage: a fast swipe contributes more to
          // coverage than a slow one, but even a slow swipe counts for
          // ~0.8 so Profile 6-style hesitant-but-consistent users still
          // accumulate meaningful confidence.
          dimEffCoverage[i]! += 0.6 + 0.4 * rtWeight;
          // Raw (unweighted) counts for contradiction detection.
          dimRawSignSum[i]! += Math.sign(rawDelta);
          dimRawCount[i]! += 1;
        }

        // Momentum
        const direction = Math.sign(rawDelta);
        if (direction !== 0) {
          if (direction === Math.sign(dimLastDirection[i]!)) {
            dimMomentum[i] = Math.min(dimMomentum[i]! + 1, 5);
          } else {
            dimMomentum[i] = 0;
          }
          dimLastDirection[i] = direction;
        }
        const momentumMultiplier = 1.0 + dimMomentum[i]! * 0.15;

        v2Dims[i] = clamp(
          v2Dims[i]! +
            rawDelta *
              (Math.abs((v2Dims[i] ?? 0.5) - 0.5) > 0.25 ? 0.04 : 0.25) *
              lambda *
              momentumMultiplier *
              rtWeight,
          0,
          1,
        );
      }

      // Partial negative push in V2 space
      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const rejVal = rejectedV2[i]!;
        if (Math.abs(rejVal - NEUTRAL_MIDPOINT) > 0.2) {
          const pushAway = -(rejVal - NEUTRAL_MIDPOINT) * 0.1;
          v2Dims[i] = clamp(v2Dims[i]! + pushAway, 0, 1);
        }
      }

      // Map old pair dimension to V2 dim(s) for response counting
      const v2Targets = OLD_DIM_TO_V2[pair.dimension] ?? [];
      for (const target of v2Targets) {
        responsesPerV2Dim[target.v2Index] =
          (responsesPerV2Dim[target.v2Index] ?? 0) + 1;
      }

      // Debug
      if (debugData) {
        debugData.phaseBResponses.push({
          pairId: resp.pairId,
          oldDimension: pair.dimension,
          v2Targets: v2Targets.map((t) => ({
            dimIndex: t.v2Index,
            dimName: V2_DIM_NAMES[t.v2Index] ?? "unknown",
            weight: t.weight,
          })),
          chosenSide: resp.chosenSide,
        });
      }
    }

    // Per-dim confidence: coverage × consistency.
    //   coverage    = min(1, effectiveCoverage / 4)    — weighted coverage
    //   consistency = |weighted sign sum| / weighted informed count
    // Dims with no informative responses fall back to the bare coverage
    // number so we don't over-penalize dims that simply weren't probed.
    //
    // Improvement 4: dims with contradictory rawDelta history (e.g. user
    // chose B twice and A twice) get a confidence penalty, but only when
    // the user is OVERALL not consistent — a genuinely "mixed but coherent"
    // user who contradicts on 1-2 dims shouldn't be penalized.
    // First pass: compute overall consistency across all informed dims so
    // the contradiction gate knows whether to fire.
    let globalAbsSign = 0;
    let globalInformed = 0;
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      const informed = dimInformativeCount[i] ?? 0;
      if (informed > 0) {
        globalAbsSign += Math.abs(dimSignSum[i] ?? 0);
        globalInformed += informed;
      }
    }
    const overallConsistency =
      globalInformed > 0 ? globalAbsSign / globalInformed : 0;

    let confSum = 0;
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      const effCov = dimEffCoverage[i] ?? 0;
      const coverage = Math.min(1, effCov / 4);
      covariance[i]![i] = 1 - coverage;
      const informed = dimInformativeCount[i] ?? 0;
      const consistency =
        informed > 0
          ? Math.max(
              PHASE_B_CONSISTENCY_FLOOR,
              Math.abs(dimSignSum[i] ?? 0) / informed,
            )
          : 1.0;
      let dimConf = coverage * consistency;

      // Improvement 4: contradiction penalty, gated by overall consistency.
      const rawInformed = dimRawCount[i] ?? 0;
      if (rawInformed >= 2 && overallConsistency < CONTRADICTION_OVERALL_GATE) {
        const rs = dimRawSignSum[i] ?? 0;
        const up = (rawInformed + rs) / 2;
        const down = (rawInformed - rs) / 2;
        const contradictionRatio = Math.min(up, down) / rawInformed;
        if (contradictionRatio > CONTRADICTION_RATIO_THRESHOLD) {
          dimConf -= CONTRADICTION_CONFIDENCE_PENALTY;
        }
      }

      confSum += Math.max(0, dimConf);
    }
    const phaseBConfidence = confSum / V2_DIM_COUNT;

    // ── Upgrade 3: blended Phase A / Phase B confidence ───────────────────
    const totalResponses = phase_b_responses.length;
    const phaseAWeight =
      totalResponses >= PHASE_B_DOMINANCE_RESPONSE_THRESHOLD
        ? PHASE_A_CONF_WEIGHT_HIGH_RESPONSES
        : PHASE_A_CONF_WEIGHT_LOW_RESPONSES;
    const phaseBWeight = 1 - phaseAWeight;
    confidence =
      phaseAWeight * phaseAConfidence + phaseBWeight * phaseBConfidence;

    // Cap the pre-boost confidence relative to Phase A. A weak Phase A
    // anchor (e.g. mixed grid picks with compat 0.5) should not be able
    // to reach decisive-user confidence purely because Phase B happened
    // to be internally consistent — users with genuinely clear single-
    // style preferences are what earn the top end of the range.
    const phaseALiftCeiling = phaseAConfidence + PHASE_B_MAX_LIFT_OVER_A;
    if (confidence > phaseALiftCeiling) confidence = phaseALiftCeiling;

    // Consistency boost: if the user strongly favored one side across responses,
    // that reflects a decisive preference — raise confidence accordingly.
    // Applied AFTER the Phase A/B blend so both signals are rewarded.
    let sideACount = 0;
    let sideBCount = 0;
    for (const resp of phase_b_responses) {
      if (resp.chosenSide === "A") sideACount++;
      else if (resp.chosenSide === "B") sideBCount++;
    }
    const totalDecisive = sideACount + sideBCount;
    if (totalDecisive > 0) {
      const maxShare = Math.max(sideACount, sideBCount) / totalDecisive;
      if (maxShare > 0.7) {
        confidence = Math.min(1.0, confidence * 1.4);
      }
    }

    // ── Improvement 6: randomness detection ───────────────────────────────
    // If the user's global A/B choices are nearly balanced AND their per-dim
    // consistency is low, they're behaving randomly — scale confidence down.
    // The per-dim consistency gate prevents penalizing genuinely mixed but
    // coherent users (Profile 5) who happen to pick ~50/50 because their
    // preferred target crosses the neutral axis on several dims.
    if (phase_b_responses.length >= 8 && totalDecisive > 0) {
      const balanceRatio =
        Math.min(sideACount, sideBCount) / totalDecisive;
      if (balanceRatio > RANDOMNESS_BALANCE_THRESHOLD) {
        let totalCons = 0;
        let dimsWithSignal = 0;
        for (let i = 0; i < V2_DIM_COUNT; i++) {
          const informed = dimInformativeCount[i] ?? 0;
          if (informed > 0) {
            totalCons += Math.abs(dimSignSum[i] ?? 0) / informed;
            dimsWithSignal++;
          }
        }
        const avgCons = dimsWithSignal > 0 ? totalCons / dimsWithSignal : 0;
        if (avgCons < RANDOMNESS_CONSISTENCY_GATE) {
          const randomnessPenalty = Math.min(
            1,
            (balanceRatio - RANDOMNESS_BALANCE_THRESHOLD) / 0.1,
          );
          confidence = confidence * (1 - RANDOMNESS_MAX_PENALTY * randomnessPenalty);
        }
      }
    }
  }

  if (debugData) {
    debugData.v2DimsAfterPhaseB = [...v2Dims];
  }

  // ── Step 3 — Build fingerprint (expand V2 to 12-dim for DB compat) ─────────
  const dimensions = expandV2ToDimensions(v2Dims);
  const fingerprint: StyleFingerprint = {
    dimensions: dimensions as StyleFingerprint["dimensions"],
    covariance,
    confidence,
    fingerprint_version: "v2",
  };

  // ── Step 4 — Style name from V2 softmax ────────────────────────────────────
  console.log('[fingerprint] v2Dims final (before style match):', [...v2Dims]);
  const strongV2Dims = v2Dims.filter(
    (v) => Math.abs(v - NEUTRAL_MIDPOINT) > STRONG_BAND,
  );

  let styleName: string;
  let competingStyles: string[] = [];
  let blendRatio = 1.0;
  const styleBlend: Record<string, number> = {};
  let primaryStyleName: string | null = null;
  let secondaryStyleName: string | null = null;
  let primaryWeight = 0;
  let secondaryWeight = 0;
  if (strongV2Dims.length === 0) {
    styleName = "Your Unique Style";
  } else {
    const result = softmaxStyleMatch(v2Dims, "v2");
    blendRatio = result.blendRatio;
    // Build styleBlend as {styleDisplayName: weight} keeping only matches > 0.05
    for (const m of result.matches) {
      if (m.weight > 0.05) {
        styleBlend[toDisplayName(m.style.name)] = Math.round(m.weight * 100) / 100;
      }
    }
    if (result.isNeutral) {
      styleName = "Your Unique Style";
    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
      competingStyles = [result.primaryStyle.name]; // raw internal name for next-pair matching
      primaryStyleName = toDisplayName(result.primaryStyle.name);
      primaryWeight = result.matches[0]?.weight ?? result.blendRatio;
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = `${primaryName} · ${secondaryName}`;
      competingStyles = [result.primaryStyle.name, result.secondaryStyle.name]; // raw internal names
      primaryStyleName = primaryName;
      secondaryStyleName = secondaryName;
      primaryWeight = result.matches[0]?.weight ?? result.blendRatio;
      secondaryWeight = result.matches[1]?.weight ?? 0;
    }
  }

  // ── Step 5 — Style tags from V2 dims ───────────────────────────────────────
  const V2_DIM_LABELS: Array<[string, string]> = [
    ["Cool Palette", "Warm Tones"], // warmth
    ["Visual Simplicity", "Bold & Complex"], // visual_complexity
    ["Manufactured", "Natural & Organic"], // organicness
    ["Clean & Spare", "Richly Layered"], // density
    ["Ultra-Modern", "Heritage Craft"], // traditionalism
    ["Geometric Lines", "Organic Character"], // character
  ];

  const NEUTRAL_FILLERS = [
    "Balanced Style",
    "Versatile Space",
    "Open to Ideas",
    "Your Taste",
  ];

  const strong = v2Dims
    .map((v, i) => ({ idx: i, dev: v - NEUTRAL_MIDPOINT, mag: Math.abs(v - NEUTRAL_MIDPOINT) }))
    .filter((x) => x.mag > STRONG_BAND)
    .sort((a, b) => b.mag - a.mag);

  const styleTags: string[] = strong.slice(0, 4).map(({ idx, dev }) => {
    const labels = V2_DIM_LABELS[idx]!;
    return dev > 0 ? labels[1] : labels[0];
  });

  let fillerIdx = 0;
  while (styleTags.length < 4 && fillerIdx < NEUTRAL_FILLERS.length) {
    styleTags.push(NEUTRAL_FILLERS[fillerIdx]!);
    fillerIdx++;
  }

  // ── Debug: style scores ────────────────────────────────────────────────────
  if (debugData) {
    const fpCentered = v2Dims.map((v) => v - NEUTRAL_MIDPOINT);
    const T = 4.5;
    const rawSims: { name: string; sim: number }[] = [];

    for (const style of STYLES) {
      const sc = style.v2Center.map((v) => v - NEUTRAL_MIDPOINT);
      let dot = 0,
        fpN = 0,
        sN = 0;
      for (let i = 0; i < fpCentered.length; i++) {
        const w = V2_DIMENSION_MATCH_WEIGHTS[i] ?? 1.0;
        dot += (fpCentered[i] ?? 0) * (sc[i] ?? 0) * w;
        fpN += (fpCentered[i] ?? 0) ** 2 * w;
        sN += (sc[i] ?? 0) ** 2 * w;
      }
      const sim =
        fpN === 0 || sN === 0 ? 0 : dot / (Math.sqrt(fpN) * Math.sqrt(sN));
      rawSims.push({ name: style.name, sim });
    }

    const expSims = rawSims.map((s) => ({
      ...s,
      expNum: Math.exp(s.sim * T),
      expDen: Math.exp(Math.max(0, s.sim) * T),
    }));
    const expSum = expSims.reduce((acc, s) => acc + s.expDen, 0);

    debugData.styleScores = expSims.map((s) => ({
      styleName: s.name,
      rawCosineSimilarity: Math.round(s.sim * 10000) / 10000,
      postSoftmaxWeight: Math.round((s.expNum / expSum) * 10000) / 10000,
    }));
  }

  return {
    fingerprint,
    styleName,
    styleTags,
    competingStyles,
    blendRatio,
    styleBlend,
    primaryStyle: primaryStyleName,
    secondaryStyle: secondaryStyleName,
    primaryWeight,
    secondaryWeight,
    debug: debugData,
  };
}

function fingerprintToStyleTags(fp: StyleFingerprint): string[] {
  const d = fp.dimensions;
  if (fp.fingerprint_version === "v2") {
    // V2: first 6 slots are meaningful
    return [
      d.colorTemperature >= NEUTRAL_MIDPOINT ? "warm" : "cool", // warmth
      d.colorSaturation >= NEUTRAL_MIDPOINT ? "complex" : "simple", // visual_complexity
      d.formality >= NEUTRAL_MIDPOINT ? "organic" : "manufactured", // organicness (in formality slot)
      d.density >= NEUTRAL_MIDPOINT ? "layered" : "minimal", // density
    ];
  }
  // V1 fallback
  return [
    d.colorTemperature >= NEUTRAL_MIDPOINT ? "warm" : "cool",
    d.colorSaturation >= NEUTRAL_MIDPOINT ? "colorful" : "muted",
    d.density >= NEUTRAL_MIDPOINT ? "layered" : "minimal",
    d.formality >= NEUTRAL_MIDPOINT ? "formal" : "casual",
    d.era >= NEUTRAL_MIDPOINT ? "traditional" : "modern",
    d.material >= NEUTRAL_MIDPOINT ? "natural" : "manufactured",
  ];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rawBody = (await request.json()) as Record<string, unknown>;

    {
      const url = new URL(request.url);
      const isDebug = url.searchParams.get("debug") === "true";
      const body = rawBody as unknown as NewFingerprintRequest;
      if (!body.room_type) {
        return NextResponse.json(
          { error: "room_type required" },
          { status: 400 },
        );
      }

      // ── V3 Fast Path ─────────────────────────────────────────────────────
      // When anchor_prior is present, build a V3 12-dim fingerprint from the
      // anchor question results. This bypasses the V2 grid/NLP logic entirely.
      if (body.anchor_prior && Object.keys(body.anchor_prior).length > 0) {
        const { initPosterior, posteriorToFingerprint } = await import("@/lib/quiz/bayes");
        const { fingerprintToStyleBlend, DIMENSION_ORDER: V3_DIMS } = await import("@/lib/quiz/style-archetypes");
        // v3RecordToArray available from style-match if needed for array conversion

        // Build V3 posterior from anchor prior
        const v3Prior = body.anchor_prior as Record<string, number>;
        const bayesState = initPosterior(v3Prior as Partial<Record<string, number>>);
        const v3Dims = posteriorToFingerprint(bayesState);

        // Compute style blend
        const v3Blend = fingerprintToStyleBlend(v3Dims);
        const sortedBlend = Object.entries(v3Blend).sort(([, a], [, b]) => b - a);

        // Build fingerprint
        const v3Fp = {
          dimensions: v3Dims as unknown as StyleFingerprint["dimensions"],
          covariance: V3_DIMS.map(() => V3_DIMS.map(() => 0)),
          confidence: 0.6, // initial confidence from anchors
          fingerprint_version: "v3" as const,
        };

        const v3PrimaryStyle = sortedBlend[0]?.[0] ?? "COVAJAPANDI";
        const v3SecondaryStyle = sortedBlend[1]?.[0] ?? null;
        const v3PrimaryWeight = sortedBlend[0]?.[1] ?? 1.0;
        const v3SecondaryWeight = sortedBlend[1]?.[1] ?? 0;
        const v3Competing = sortedBlend.slice(0, 2).map(([s]) => s);

        // Derive style tags from strongest V3 dimensions
        const v3Tags: string[] = [];
        const dimEntries = Object.entries(v3Dims).sort(
          ([, a], [, b]) => Math.abs(b - 0.5) - Math.abs(a - 0.5),
        );
        for (const [dim, val] of dimEntries.slice(0, 4)) {
          if (val > 0.65) v3Tags.push(`High ${dim}`);
          else if (val < 0.35) v3Tags.push(`Low ${dim}`);
        }

        // Build style blend for DB
        const v3StyleBlend: Record<string, number> = {};
        for (const [style, weight] of sortedBlend) {
          v3StyleBlend[style] = Math.round(weight * 100) / 100;
        }

        // Save to DB if authenticated
        if (user) {
          const adminClient = createAdminSupabaseClient();
          try {
            await (adminClient.from("style_fingerprints") as ReturnType<typeof adminClient.from>)
              .insert({
                user_id: user.id,
                dimensions: v3Dims,
                covariance: v3Fp.covariance,
                confidence: v3Fp.confidence,
                fingerprint_version: "v3",
                room_type: body.room_type,
              });
            await (adminClient.from("users") as ReturnType<typeof adminClient.from>)
              .update({
                style_blend: v3StyleBlend,
                primary_style: v3PrimaryStyle,
                secondary_style: v3SecondaryStyle,
                primary_weight: v3PrimaryWeight,
                secondary_weight: v3SecondaryWeight,
                style_fingerprint: v3Fp,
              })
              .eq("id", user.id);
          } catch (dbErr) {
            console.error("[fingerprint] V3 DB save error:", dbErr);
          }
        }

        return NextResponse.json({
          fingerprint: v3Fp,
          style_name: v3PrimaryStyle,
          style_tags: v3Tags,
          competing_styles: v3Competing,
          blend_ratio: v3PrimaryWeight,
          style_blend: v3StyleBlend,
          primary_style: v3PrimaryStyle,
          secondary_style: v3SecondaryStyle,
          fingerprint_version: "v3",
        });
      }

      let fingerprint: StyleFingerprint;
      let styleName: string;
      let styleTags: string[];
      let competingStyles: string[] = [];
      let blendRatio = 1.0;
      let styleBlend: Record<string, number> = {};
      let primaryStyleName: string | null = null;
      let secondaryStyleName: string | null = null;
      let primaryWeight = 0;
      let secondaryWeight = 0;

      if (body.phase_c_confirmation && body.confirmed_fingerprint) {
        fingerprint = body.confirmed_fingerprint;
        const version = fingerprint.fingerprint_version ?? "v1";
        const d = fingerprint.dimensions;

        // For V2, use the first 6 slots for style matching
        let confirmResult;
        if (version === "v2") {
          const v2Vec = [
            d.colorTemperature, d.colorSaturation, d.formality,
            d.density, d.era, d.material,
          ];
          confirmResult = softmaxStyleMatch(v2Vec, "v2");
        } else {
          const fpVec = OLD_DIM_ORDER_KEYS.map(
            (k) => (d as Record<string, number>)[k] ?? NEUTRAL_MIDPOINT,
          );
          confirmResult = softmaxStyleMatch(fpVec, "v1");
        }

        for (const m of confirmResult.matches) {
          if (m.weight > 0.05) {
            styleBlend[toDisplayName(m.style.name)] = Math.round(m.weight * 100) / 100;
          }
        }

        if (confirmResult.isNeutral) {
          styleName = "Your Unique Style";
        } else if (confirmResult.blendRatio >= 0.60 || confirmResult.secondaryStyle === null) {
          styleName = toDisplayName(confirmResult.primaryStyle.name);
          primaryStyleName = toDisplayName(confirmResult.primaryStyle.name);
          primaryWeight = confirmResult.matches[0]?.weight ?? confirmResult.blendRatio;
        } else {
          styleName = `${toDisplayName(confirmResult.primaryStyle.name)} · ${toDisplayName(confirmResult.secondaryStyle.name)}`;
          primaryStyleName = toDisplayName(confirmResult.primaryStyle.name);
          secondaryStyleName = toDisplayName(confirmResult.secondaryStyle.name);
          primaryWeight = confirmResult.matches[0]?.weight ?? confirmResult.blendRatio;
          secondaryWeight = confirmResult.matches[1]?.weight ?? 0;
        }
        blendRatio = confirmResult.blendRatio ?? 1.0;
        styleTags = fingerprintToStyleTags(fingerprint).slice(0, 4);
      } else {
        const result = await computeNewFingerprint(body, isDebug);
        fingerprint = result.fingerprint;
        styleName = result.styleName;
        styleTags = result.styleTags;
        competingStyles = result.competingStyles ?? [];
        blendRatio = result.blendRatio ?? 1.0;
        styleBlend = result.styleBlend ?? {};
        primaryStyleName = result.primaryStyle ?? null;
        secondaryStyleName = result.secondaryStyle ?? null;
        primaryWeight = result.primaryWeight ?? 0;
        secondaryWeight = result.secondaryWeight ?? 0;
        if (isDebug && result.debug) {
          (body as unknown as Record<string, unknown>).__debug = result.debug;
        }
      }

      // Pre-auth path
      if (!user) {
        const sessionToken =
          request.headers.get("x-cova-session-token") ??
          (rawBody as Record<string, unknown>).session_token;
        if (
          !sessionToken ||
          (typeof sessionToken === "string" && sessionToken.trim() === "")
        ) {
          return NextResponse.json(
            { success: false, error: "unauthenticated" },
            { status: 401 },
          );
        }
        return NextResponse.json({
          fingerprint,
          style_name: styleName,
          style_tags: styleTags,
          competing_styles: competingStyles,
          blend_ratio: blendRatio,
          persisted: false,
          ...(isDebug && (body as unknown as Record<string, unknown>).__debug
            ? { _debug: (body as unknown as Record<string, unknown>).__debug }
            : {}),
        });
      }

      // Save to DB
      try {
        const admin = createAdminSupabaseClient();

        const { data: userExists } = await admin
          .from("users")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!userExists) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin.from("users") as any).upsert(
            {
              id: user.id,
              email: user.email ?? "",
              full_name:
                user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
              created_at: new Date().toISOString(),
            },
            { onConflict: "id", ignoreDuplicates: true },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sfTable = admin.from("style_fingerprints") as any;
        const { data: inserted, error: insertErr } = await sfTable
          .insert({
            user_id: user.id,
            dimensions: fingerprint.dimensions,
            covariance: fingerprint.covariance,
            confidence: fingerprint.confidence,
            style_name: styleName,
            room_type: body.room_type,
            budget_tier: body.budget_tier ?? null,
            quiz_responses: body.phase_b_responses ?? [],
            entry_path: "pairs",
          })
          .select("id")
          .single();
        if (insertErr) {
          console.error(
            "[fingerprint] style_fingerprints insert failed:",
            JSON.stringify(insertErr),
            "user_id:",
            user.id,
            "code:",
            insertErr.code,
          );
          return NextResponse.json(
            {
              success: false,
              error: "fingerprint_save_failed",
              detail: insertErr.message,
            },
            { status: 500 },
          );
        }
        console.warn("[fingerprint] saved to DB:", {
          userId: user.id,
          styleId: inserted?.id ?? null,
          styleName,
        });

        // Mirror onto users row
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: userErr } = await (admin.from("users") as any)
          .update({
            style_fingerprint: fingerprint,
            style_blend: styleBlend,
            primary_style: primaryStyleName,
            secondary_style: secondaryStyleName,
            primary_weight: primaryWeight,
            secondary_weight: secondaryWeight,
          })
          .eq("id", user.id);
        if (userErr) {
          console.error(
            `[fingerprint-save] users update error: ${JSON.stringify(userErr)}`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[fingerprint-save] ERROR: ${JSON.stringify({ message: msg })}`,
        );
        return NextResponse.json(
          { success: false, error: "fingerprint_save_failed", detail: msg },
          { status: 500 },
        );
      }

      return NextResponse.json({
        fingerprint,
        style_name: styleName,
        style_tags: styleTags,
        competing_styles: competingStyles,
        blend_ratio: blendRatio,
        ...(isDebug && (body as unknown as Record<string, unknown>).__debug
          ? { _debug: (body as unknown as Record<string, unknown>).__debug }
          : {}),
      });
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

