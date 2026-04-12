import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { StyleFingerprint } from "@/types/fingerprint";

// ── /api/quiz/next-pair ──────────────────────────────────────────────────────
// Phase B selector. Returns one validated comparison pair from
// quiz_comparison_pairs, or quizComplete=true when responseCount >= 12.
//
// Selection logic (per Session C spec):
//   • responses 1-4: spread across 4 distinct dimensions not yet covered by
//     completedPairIds. Random pick from the validated pool for that dim.
//   • responses 5-12: pick the dimension with the LOWEST confidence in the
//     client's currentFingerprint (= MAX value on the covariance diagonal,
//     under the per-dim confidence encoding `cov[i][i] = 1 - confidence`).
//     Random pick from the validated pool for that dim.
//   • Always exclude any id in completedPairIds.
//   • Return null + quizComplete=true when responseCount >= 12 or there are
//     no remaining unshown validated pairs.
//
// Migrated from swipe_cards in Session C.

interface NextPairRequest {
  completedPairIds?: string[];
  currentFingerprint?: Record<string, number> | StyleFingerprint | null;
  responseCount?: number;
  room_type?: string;
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

const DIMENSION_ORDER = [
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
] as const;
type DimKey = (typeof DIMENSION_ORDER)[number];

const TOTAL_PAIRS = 12;

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)] ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NextPairRequest;
    const completedPairIds = body.completedPairIds ?? [];
    const currentFingerprint = body.currentFingerprint;
    const responseCount = body.responseCount ?? completedPairIds.length;
    const roomSlug =
      body.room_type && body.room_type in ROOM_SLUG_MAP
        ? ROOM_SLUG_MAP[body.room_type]
        : null;

    // Quiz complete by count
    if (responseCount >= TOTAL_PAIRS) {
      return NextResponse.json({ pair: null, quizComplete: true });
    }

    const admin = createAdminSupabaseClient();

    // 1. Discover which dimensions are already covered by completed pairs,
    //    and count per-dimension response counts for adaptive selection.
    const coveredDims = new Set<string>();
    const dimCounts: Record<string, number> = Object.fromEntries(
      DIMENSION_ORDER.map((d) => [d, 0]),
    );
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
        coveredDims.add(d);
        if (d in dimCounts) dimCounts[d] = (dimCounts[d] ?? 0) + 1;
      }
    }

    // 2. Choose target dimension.
    let targetDim: DimKey | null = null;

    const hasFingerprint =
      currentFingerprint != null && typeof currentFingerprint === "object";

    if (hasFingerprint && responseCount >= 4) {
      // Adaptive refine phase: build a live per-dim confidence estimate from
      // the count of completed pairs per dimension. Pick the dim with the
      // LOWEST confidence (= lowest count, most uncertain). Ties are broken
      // randomly. We defer the "has unused pairs available" check to the
      // candidate-pool query + fallback below — if the chosen dim is
      // exhausted, the fallback at step 4 picks from any validated dim.
      let minCount = Infinity;
      for (const d of DIMENSION_ORDER) {
        const c = dimCounts[d] ?? 0;
        if (c < minCount) minCount = c;
      }
      const tied = DIMENSION_ORDER.filter(
        (d) => (dimCounts[d] ?? 0) === minCount,
      );
      targetDim = pickRandom<DimKey>([...tied]) ?? DIMENSION_ORDER[0];
    } else {
      // Spread phase (responseCount < 4 OR no fingerprint): pick a dim NOT
      // yet covered. If all dims are covered, pick any at random.
      const uncoveredDims = DIMENSION_ORDER.filter((d) => !coveredDims.has(d));
      targetDim =
        (uncoveredDims.length > 0
          ? pickRandom<DimKey>([...uncoveredDims])
          : pickRandom<DimKey>([...DIMENSION_ORDER])) ?? DIMENSION_ORDER[0];
    }

    // 3. Query validated pairs for the target dimension, exclude completed.
    //    Filter completedPairIds in JS to avoid PostgREST IN() escaping issues.
    const { data: candidates, error: candErr } = await admin
      .from("quiz_comparison_pairs")
      .select(
        "id, dimension, dimension_index, image_a_url, image_b_url, image_a_vector, image_b_vector",
      )
      .eq("dimension", targetDim)
      .eq("is_validated", true);

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 });
    }

    let pool = (candidates ?? []).filter(
      (c) => !completedPairIds.includes(c.id as string),
    );

    // 4. Fallback: if the target dim has nothing left, pick from ANY validated dim.
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
      // Library exhausted — quiz complete.
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
