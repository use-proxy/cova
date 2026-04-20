import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { StyleFingerprint } from "@/types/fingerprint";
import {
  V2_DIM_COUNT,
  V2_DIM_TO_OLD_DIMS,
  V2_DIMENSION_MATCH_WEIGHTS,
  STYLES,
  mergeToV2,
} from "@/lib/ai/style-match";
import {
  type BayesianState,
  needsBonusSwipes,
} from "@/lib/quiz/bayes";

// ── /api/quiz/next-pair ──────────────────────────────────────────────────────
// Phase B selector (V2). Returns one validated comparison pair from
// quiz_comparison_pairs, or quizComplete=true when responseCount >= TOTAL_PAIRS.
//
// V2 uses 6 merged dimensions. Pairs in the DB are tagged with old 12-dim
// names. The selector maps V2 target dims to old dim names to find pairs.
//
// Selection logic:
//   • responses 0-3: spread across V2 dims where Phase A signal is STRONG
//     (or where competing styles most disagree). Confirms/corrects the
//     Phase A signal before exploring weak dims.
//   • responses 4+: Bayesian entropy-minimizing selector — pick the V2 dim
//     with the highest weighted entropy (most uncertain), capped at
//     MAX_PER_DIM responses per dim. Resolved dims (entropy below
//     RESOLVED_ENTROPY_THRESHOLD) are only chosen if every other dim is
//     also resolved.
//   • Always exclude any id in completedPairIds.
//   • Return null + quizComplete=true when responseCount >= TOTAL_PAIRS
//     or library exhausted.

interface NextPairRequest {
  completedPairIds?: string[];
  currentFingerprint?: Record<string, number> | StyleFingerprint | null;
  responseCount?: number;
  room_type?: string;
  competing_styles?: string[]; // raw style names from softmaxStyleMatch e.g. ["biophilic_jungle", "coastal_bright"]
  /** V3 anchor prior from step-2. When present, activates V3 Bayesian pair selection. */
  anchor_prior?: Record<string, number>;
  /** V3 Bayesian state passed from client for stateless updates. */
  bayesian_state?: BayesianState;
  /** Whether the user already accepted bonus swipes. */
  in_bonus_phase?: boolean;
}

interface PairRow {
  id: string;
  dimension: string;
  dimension_index: number;
  image_a_url: string;
  image_b_url: string;
  image_a_vector: Record<string, number>;
  image_b_vector: Record<string, number>;
}

// ── Upgrade 4: swipe budget ─────────────────────────────────────────────
// Raised from 12 → 24 so each V2 dimension can receive the full 4 responses
// required to drive its per-dim confidence (count/4) to 1.0. 6 dims × 4 = 24.
const TOTAL_PAIRS = 24;
// Per-dim response cap. Matches TOTAL_PAIRS / V2_DIM_COUNT so a fully
// balanced quiz gives every dim exactly MAX_PER_DIM responses.
const MAX_PER_DIM = 4;

// ── Upgrade 2: entropy-based refinement ─────────────────────────────────
// When |fpValue - 0.5| is small, the dimension is uncertain — entropy is
// near its maximum of 1.0 at p=0.5. As the value pins toward 0 or 1 the
// entropy collapses, signalling a resolved dim that no longer needs
// additional swipes. A resolved-threshold of 0.3 corresponds to p ≈ 0.05
// or p ≈ 0.95, i.e. a strongly committed signal.
const RESOLVED_ENTROPY_THRESHOLD = 0.3;
const REFINEMENT_MIN_RESPONSES = 4;

function dimEntropy(fpValue: number): number {
  const p = Math.max(0.001, Math.min(0.999, fpValue));
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/** Extract V2 dims from a fingerprint (which may be V1 or V2 format). */
function extractV2Dims(
  fp: Record<string, number> | StyleFingerprint,
): number[] | null {
  if ("dimensions" in fp) {
    const sfp = fp as StyleFingerprint;
    if (sfp.fingerprint_version === "v2") {
      const d = sfp.dimensions;
      return [
        d.colorTemperature, // warmth
        d.colorSaturation, // visual_complexity
        d.formality, // organicness
        d.density, // density
        d.era, // traditionalism
        d.material, // character
      ];
    }
    // V1 fingerprint — merge to V2
    return mergeToV2(sfp.dimensions as unknown as Record<string, number>);
  }
  // Plain dims object — try to merge
  return mergeToV2(fp);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NextPairRequest;
    const completedPairIds = body.completedPairIds ?? [];
    const currentFingerprint = body.currentFingerprint;
    const responseCount = body.responseCount ?? completedPairIds.length;
    const competingStyleNames = body.competing_styles ?? [];
    console.log('[next-pair] competing_styles received:', competingStyleNames);
    console.log('[next-pair] all STYLES names:', STYLES.map(s => s.name));

    // If we have exactly 2 competing styles, find the V2 dims where they
    // disagree the most — those are the only dims worth asking about.
    let contestedV2Dims: number[] | null = null;
    if (competingStyleNames.length >= 1) {
      // Try exact match first, then fuzzy match via display name reverse lookup
      const DISPLAY_TO_RAW: Record<string, string> = {
        "Japandi": "Warm Japandi",
        "Dark & Moody": "Dark Moody Glam",
        "Coastal Light": "Coastal Bright",
        "Urban Industrial": "Industrial Loft",
        "Maximalist Eclectic": "Maximalist Eclectic",
        "Classic Traditional": "Heritage Traditional",
        "Minimalist": "Pure Minimal White",
        "Biophilic": "Biophilic Jungle",
        "Mid-Century Modern": "Retro Mid-Century",
      };
      const resolveStyle = (name: string) =>
        STYLES.find(s => s.name === name) ??
        STYLES.find(s => s.name === DISPLAY_TO_RAW[name]);

      const styleA = resolveStyle(competingStyleNames[0] ?? "");
      const styleB = competingStyleNames.length >= 2
        ? resolveStyle(competingStyleNames[1] ?? "")
        : null;

      console.log('[next-pair] resolved styleA:', styleA?.name, 'styleB:', styleB?.name);

      if (styleA && styleB) {
        contestedV2Dims = Array.from({ length: 6 }, (_, i) =>
          Math.abs((styleA.v2Center[i] ?? 0.5) - (styleB.v2Center[i] ?? 0.5))
        );
        console.log('[next-pair] contestedV2Dims:', contestedV2Dims);
      } else if (styleA) {
        // Single dominant style — target dims where current fp deviates from it
        contestedV2Dims = null; // let normal flow handle it
      }
    }
    // ── V3 Bayesian bonus swipe check ─────────────────────────────────────
    const isV3 = body.anchor_prior != null;
    const inBonusPhase = body.in_bonus_phase ?? false;
    const BONUS_SWIPES = 4;
    const maxSwipes = inBonusPhase ? TOTAL_PAIRS + BONUS_SWIPES : TOTAL_PAIRS;

    // Quiz complete by count
    if (responseCount >= maxSwipes) {
      return NextResponse.json({ pair: null, quizComplete: true });
    }

    // At the 24-swipe boundary for V3: check if bonus swipes needed
    if (isV3 && responseCount >= TOTAL_PAIRS && !inBonusPhase) {
      const bayesState = body.bayesian_state;
      if (bayesState && needsBonusSwipes(bayesState)) {
        return NextResponse.json({
          pair: null,
          quizComplete: false,
          bonusSwipesNeeded: true,
          uncertainDimCount: Object.values(bayesState.variance).filter(
            v => Math.sqrt(v) > 0.25,
          ).length,
        });
      }
      // No bonus needed — quiz complete
      return NextResponse.json({ pair: null, quizComplete: true });
    }

    const admin = createAdminSupabaseClient();

    // 1. Count per-old-dimension responses from completed pairs
    const oldDimCounts: Record<string, number> = {};
    for (const oldDims of V2_DIM_TO_OLD_DIMS) {
      for (const d of oldDims) {
        oldDimCounts[d] = 0;
      }
    }
    const coveredOldDims = new Set<string>();
    // Improvement 5: track which pair_index (dimension_index) has already
    // been shown for each old-dim so the selector avoids redundant pairs
    // that cover the same sub-aspect of a dimension.
    const usedDimIndicesByDim: Record<string, Set<number>> = {};

    if (completedPairIds.length > 0) {
      const { data: completedRows, error: completedErr } = await admin
        .from("quiz_comparison_pairs")
        .select("dimension, dimension_index")
        .in("id", completedPairIds);
      if (completedErr) {
        return NextResponse.json(
          { error: completedErr.message },
          { status: 500 },
        );
      }
      for (const r of completedRows ?? []) {
        const d = r.dimension as string;
        coveredOldDims.add(d);
        oldDimCounts[d] = (oldDimCounts[d] ?? 0) + 1;
        const di = r.dimension_index as number | null;
        if (di !== null && di !== undefined) {
          if (!usedDimIndicesByDim[d]) usedDimIndicesByDim[d] = new Set();
          usedDimIndicesByDim[d]!.add(di);
        }
      }
    }

    // Aggregate to V2 dim response counts
    const v2DimCounts: number[] = V2_DIM_TO_OLD_DIMS.map((oldDims) =>
      oldDims.reduce((sum, d) => sum + (oldDimCounts[d] ?? 0), 0),
    );

    // 2. Choose target V2 dimension → map to old dim names for DB query
    let targetOldDims: string[];

    const hasFingerprint =
      currentFingerprint != null && typeof currentFingerprint === "object";

    if (hasFingerprint && responseCount >= REFINEMENT_MIN_RESPONSES) {
      // Adaptive refine phase: pick the V2 dim with the highest Bayesian
      // entropy, i.e. the dim where the fingerprint is most uncertain.
      // Entropy peaks at p=0.5 (maximum information gain from a swipe) and
      // collapses toward 0 as the dim pins to 0 or 1. Dimensions below the
      // RESOLVED_ENTROPY_THRESHOLD are considered determined and are only
      // selected if every other dim is also resolved.
      const v2Dims = currentFingerprint ? extractV2Dims(currentFingerprint) : null;
      let chosenV2Idx = 0;

      if (v2Dims) {
        const dimInfo = Array.from({ length: V2_DIM_COUNT }, (_, i) => {
          const rawEntropy = dimEntropy(v2Dims[i] ?? 0.5);
          return {
            idx: i,
            rawEntropy,
            weightedEntropy:
              rawEntropy * (V2_DIMENSION_MATCH_WEIGHTS[i] ?? 1.0),
            count: v2DimCounts[i] ?? 0,
          };
        }).filter((d) => d.count < MAX_PER_DIM);

        // Prefer unresolved dims; only touch resolved ones if nothing else
        // has room.
        const unresolved = dimInfo.filter(
          (d) => d.rawEntropy >= RESOLVED_ENTROPY_THRESHOLD,
        );
        const pool = unresolved.length > 0 ? unresolved : dimInfo;

        if (pool.length > 0) {
          pool.sort((a, b) => b.weightedEntropy - a.weightedEntropy);
          const top = pool[0]!.weightedEntropy;
          const tied = pool.filter(
            (d) => Math.abs(d.weightedEntropy - top) < 0.01,
          );
          chosenV2Idx = tied[Math.floor(Math.random() * tied.length)]!.idx;
        } else {
          // All dims at cap — fall back to lowest count
          let minCount = Infinity;
          for (let i = 0; i < V2_DIM_COUNT; i++) {
            if ((v2DimCounts[i] ?? 0) < minCount) minCount = v2DimCounts[i] ?? 0;
          }
          const tied = Array.from({ length: V2_DIM_COUNT }, (_, i) => i).filter(
            (i) => (v2DimCounts[i] ?? 0) === minCount,
          );
          chosenV2Idx = tied[Math.floor(Math.random() * tied.length)] ?? 0;
        }
      } else {
        // No extractable dims — fall back to lowest count
        let minCount = Infinity;
        for (let i = 0; i < V2_DIM_COUNT; i++) {
          if ((v2DimCounts[i] ?? 0) < minCount) minCount = v2DimCounts[i] ?? 0;
        }
        const tied = Array.from({ length: V2_DIM_COUNT }, (_, i) => i).filter(
          (i) => (v2DimCounts[i] ?? 0) === minCount,
        );
        chosenV2Idx = tied[Math.floor(Math.random() * tied.length)] ?? 0;
      }

      targetOldDims = V2_DIM_TO_OLD_DIMS[chosenV2Idx] ?? [];
    } else {
      // Spread phase (first 4): prioritize V2 dims where Phase A is STRONG
      const v2Dims = hasFingerprint && currentFingerprint
        ? extractV2Dims(currentFingerprint)
        : null;

      if (v2Dims) {
        // If we have contested dims, prefer those — they resolve ambiguity fastest
        const ranked = Array.from({ length: V2_DIM_COUNT }, (_, i) => ({
          idx: i,
          dev: contestedV2Dims
            ? (contestedV2Dims[i] ?? 0)                  // disagreement between competing styles
            : Math.abs((v2Dims[i] ?? 0.5) - 0.5),       // fallback: Phase A signal strength
          count: v2DimCounts[i] ?? 0,
        }))
          .filter((d) => d.count === 0) // uncovered first
          .sort((a, b) => b.dev - a.dev); // most contested / strongest signal first

        // Pick from top 3 strong uncovered dims randomly
        const topCandidates = ranked.slice(0, 3);
        if (topCandidates.length > 0) {
          const chosen =
            topCandidates[Math.floor(Math.random() * topCandidates.length)]!;
          targetOldDims = V2_DIM_TO_OLD_DIMS[chosen.idx] ?? [];
        } else {
          // All V2 dims covered — fall back to lowest count
          let minCount = Infinity;
          for (let i = 0; i < V2_DIM_COUNT; i++) {
            if ((v2DimCounts[i] ?? 0) < minCount)
              minCount = v2DimCounts[i] ?? 0;
          }
          const tied = Array.from({ length: V2_DIM_COUNT }, (_, i) => i).filter(
            (i) => (v2DimCounts[i] ?? 0) === minCount,
          );
          const chosenIdx =
            tied[Math.floor(Math.random() * tied.length)] ?? 0;
          targetOldDims = V2_DIM_TO_OLD_DIMS[chosenIdx] ?? [];
        }
      } else {
        // No fingerprint — pick random V2 dim's old dims
        const idx = Math.floor(Math.random() * V2_DIM_COUNT);
        targetOldDims = V2_DIM_TO_OLD_DIMS[idx] ?? [];
      }
    }

    // 3. Query validated pairs for any of the target old dimensions
    const { data: candidates, error: candErr } = await admin
      .from("quiz_comparison_pairs")
      .select(
        "id, dimension, dimension_index, image_a_url, image_b_url, image_a_vector, image_b_vector",
      )
      .in("dimension", targetOldDims)
      .eq("is_validated", true)
      .ilike("image_a_url", "%new-pairs%")
      .or('room_type.eq.' + (body.room_type ?? 'any') + ',room_type.eq.any');

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 });
    }

    // Improvement 5: first attempt — exclude pairs already shown by id AND
    // pairs whose dimension_index was already used for that old-dim in this
    // session. This pushes the selector toward a new sub-aspect of the dim.
    const filterCandidates = (
      rows: PairRow[],
      respectDimIndex: boolean,
    ): PairRow[] =>
      rows.filter((c) => {
        if (completedPairIds.includes(c.id)) return false;
        if (respectDimIndex) {
          const used = usedDimIndicesByDim[c.dimension];
          if (used && used.has(c.dimension_index)) return false;
        }
        return true;
      });

    let pool = filterCandidates((candidates ?? []) as PairRow[], true);
    // If the strict dim-index filter exhausted the pool, fall back to the
    // classic completedPairIds-only filter so the quiz still progresses.
    if (pool.length === 0) {
      pool = filterCandidates((candidates ?? []) as PairRow[], false);
    }

    // 4. Fallback: if target dims are exhausted, pick from ANY validated pair
    if (pool.length === 0) {
      const { data: anyValidated, error: anyErr } = await admin
        .from("quiz_comparison_pairs")
        .select(
          "id, dimension, dimension_index, image_a_url, image_b_url, image_a_vector, image_b_vector",
        )
        .eq("is_validated", true)
        .ilike("image_a_url", "%new-pairs%")
        .or('room_type.eq.' + (body.room_type ?? 'any') + ',room_type.eq.any');
      if (anyErr) {
        return NextResponse.json({ error: anyErr.message }, { status: 500 });
      }
      pool = filterCandidates((anyValidated ?? []) as PairRow[], true);
      if (pool.length === 0) {
        pool = filterCandidates((anyValidated ?? []) as PairRow[], false);
      }
    }

    if (pool.length === 0) {
      return NextResponse.json({ pair: null, quizComplete: true });
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)] as PairRow;
    return NextResponse.json({
      pair: {
        id: chosen.id,
        dimension: chosen.dimension,
        dimension_index: chosen.dimension_index,
        image_a_url: chosen.image_a_url,
        image_b_url: chosen.image_b_url,
        image_a_vector: chosen.image_a_vector,
        image_b_vector: chosen.image_b_vector,
      },
      quizComplete: false,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
