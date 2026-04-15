import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { StyleFingerprint } from "@/types/fingerprint";
import {
  V2_DIM_COUNT,
  V2_DIM_TO_OLD_DIMS,
  V2_DIMENSION_MATCH_WEIGHTS,
  STYLES,
  NEUTRAL_MIDPOINT,
  mergeToV2,
} from "@/lib/ai/style-match";

// ── /api/quiz/next-pair ────────���─────────────────────────────────────────────
// Phase B selector (V2). Returns one validated comparison pair from
// quiz_comparison_pairs, or quizComplete=true when responseCount >= 18.
//
// V2 uses 6 merged dimensions. Pairs in the DB are tagged with old 12-dim
// names. The selector maps V2 target dims to old dim names to find pairs.
//
// Selection logic:
//   • responses 1-4: spread across V2 dims where Phase A signal is STRONG
//     (|val-0.5| >= 0.2), sorted by deviation descending. Confirms/corrects
//     the Phase A signal before exploring weak dims.
//   • responses 5-18: pick the V2 dim with highest "correction urgency"
//     (distance from leading style's v2Center × dim weight), capped at 4
//     responses per dim. Falls back to lowest count when all dims are equal.
//   • Always exclude any id in completedPairIds.
//   • Return null + quizComplete=true when responseCount >= 18 or library exhausted.

interface NextPairRequest {
  completedPairIds?: string[];
  currentFingerprint?: Record<string, number> | StyleFingerprint | null;
  responseCount?: number;
  room_type?: string;
  competing_styles?: string[]; // raw style names from softmaxStyleMatch e.g. ["biophilic_jungle", "coastal_bright"]
}

const ROOM_SLUG_MAP: Record<string, string> = {
  living_room: "living-room",
  bedroom: "bedroom",
  dining_room: "dining-room",
  kitchen: "kitchen",
  bathroom: "bathroom",
  home_office: "home-office",
};

const STORAGE_BASE =
  "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/comparisons";

function getRoomImageUrls(
  dimension: string,
  roomSlug: string,
): { image_a_url: string; image_b_url: string } {
  const rA = Math.floor(Math.random() * 5) + 1;
  const rB = Math.floor(Math.random() * 5) + 1;
  return {
    image_a_url: `${STORAGE_BASE}/${dimension}/${dimension}-high-${roomSlug}-r${rA}.webp`,
    image_b_url: `${STORAGE_BASE}/${dimension}/${dimension}-low-${roomSlug}-r${rB}.webp`,
  };
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

const TOTAL_PAIRS = 6; // 4 targeted pairs after NLP questions in step-2

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
    const roomSlug =
      body.room_type && body.room_type in ROOM_SLUG_MAP
        ? ROOM_SLUG_MAP[body.room_type]
        : null;

    // Quiz complete by count
    if (responseCount >= TOTAL_PAIRS) {
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

    if (completedPairIds.length > 0) {
      const { data: completedRows, error: completedErr } = await admin
        .from("quiz_comparison_pairs")
        .select("dimension")
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

    if (hasFingerprint && responseCount >= TOTAL_PAIRS) {
      // Adaptive refine phase: prioritize V2 dims that most DISAGREE with
      // the leading style's v2Center, weighted by dimension importance.
      // This corrects dimensions that Phase A got wrong (e.g. warmth stuck
      // HIGH when the leading style needs warmth LOW).
      const v2Dims = currentFingerprint ? extractV2Dims(currentFingerprint) : null;
      let chosenV2Idx = 0;

      if (v2Dims) {
        // Find leading style via lightweight cosine similarity (same math as softmaxStyleMatch)
        const fpCentered = v2Dims.map((v) => v - NEUTRAL_MIDPOINT);
        let bestSim = -Infinity;
        let leadingCenter: number[] = STYLES[0]!.v2Center;

        for (const style of STYLES) {
          const sc = style.v2Center.map((v) => v - NEUTRAL_MIDPOINT);
          let dot = 0, fpN = 0, sN = 0;
          for (let i = 0; i < fpCentered.length; i++) {
            const w = V2_DIMENSION_MATCH_WEIGHTS[i] ?? 1.0;
            dot += (fpCentered[i] ?? 0) * (sc[i] ?? 0) * w;
            fpN += (fpCentered[i] ?? 0) ** 2 * w;
            sN += (sc[i] ?? 0) ** 2 * w;
          }
          const sim = fpN === 0 || sN === 0 ? 0 : dot / (Math.sqrt(fpN) * Math.sqrt(sN));
          if (sim > bestSim) {
            bestSim = sim;
            leadingCenter = style.v2Center;
          }
        }

        // Compute correction urgency per V2 dim:
        //   urgency = |currentFp[i] - leadingStyle.v2Center[i]| × weight
        // Only consider dims that still have room (count < 4)
        const MAX_PER_DIM = 4;
        const urgencies = Array.from({ length: V2_DIM_COUNT }, (_, i) => ({
          idx: i,
          urgency:
            Math.abs((v2Dims[i] ?? 0.5) - (leadingCenter[i] ?? 0.5)) *
            (V2_DIMENSION_MATCH_WEIGHTS[i] ?? 1.0),
          count: v2DimCounts[i] ?? 0,
        })).filter((d) => d.count < MAX_PER_DIM);

        if (urgencies.length > 0) {
          // Pick the highest-urgency dim; break ties randomly
          urgencies.sort((a, b) => b.urgency - a.urgency);
          const topUrgency = urgencies[0]!.urgency;
          const tied = urgencies.filter((d) => Math.abs(d.urgency - topUrgency) < 0.01);
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
      .eq("is_validated", true);

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 });
    }

    let pool = (candidates ?? []).filter(
      (c) => !completedPairIds.includes(c.id as string),
    );

    // 4. Fallback: if target dims are exhausted, pick from ANY validated pair
    if (pool.length === 0) {
      const { data: anyValidated, error: anyErr } = await admin
        .from("quiz_comparison_pairs")
        .select(
          "id, dimension, dimension_index, image_a_url, image_b_url, image_a_vector, image_b_vector",
        )
        .eq("is_validated", true);
      if (anyErr) {
        return NextResponse.json({ error: anyErr.message }, { status: 500 });
      }
      pool = (anyValidated ?? []).filter(
        (c) => !completedPairIds.includes(c.id as string),
      );
    }

    if (pool.length === 0) {
      return NextResponse.json({ pair: null, quizComplete: true });
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)] as PairRow;
    const roomUrls = roomSlug
      ? getRoomImageUrls(chosen.dimension, roomSlug)
      : null;
    return NextResponse.json({
      pair: {
        id: chosen.id,
        dimension: chosen.dimension,
        dimension_index: chosen.dimension_index,
        image_a_url: roomUrls ? roomUrls.image_a_url : chosen.image_a_url,
        image_b_url: roomUrls ? roomUrls.image_b_url : chosen.image_b_url,
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
