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
}

// Raised from 0.2 → 0.28: tighter threshold reduces noise
const STRONG_BAND = 0.28;

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
  debug?: DebugData;
}> {
  const { phase_b_responses } = body;

  // ── Step 1 — Phase A warm start (in V2 6-dim space) ────────────────────────
  const phaseAIds = body.phase_a_selections ?? [];
  const v2Dims = neutralV2();
  const covariance = identityCov6(0.5);
  let confidence = 0.3;
  let anchorCompatibility = 0;

  // ── Phase A: smart merge from grid selections ─────────────────────
  if (body.grid_selections && body.grid_selections.length > 0) {
    // Count picks per styleIndex
    const pickCounts: Record<number, number> = {};
    for (const sel of body.grid_selections) {
      pickCounts[sel.styleIndex] = (pickCounts[sel.styleIndex] ?? 0) + 1;
    }

    const totalPicks = body.grid_selections.length; // always 6
    const pickedStyles = Object.entries(pickCounts).map(([idxStr, count]) => ({
      style: STYLES[Number(idxStr)]!,
      count,
      weight: count / totalPicks,
    })).filter(x => x.style);

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

    // Confidence: higher when picks are concentrated on fewer styles
    const maxPickShare = Math.max(...Object.values(pickCounts)) / totalPicks;
    confidence = 0.5 + 0.5 * maxPickShare;
  } else if (phaseAIds.length > 0) {
    const admin = createAdminSupabaseClient();
    const { data: selectedAnchors } = await admin
      .from("quiz_anchor_images")
      .select("style_vector")
      .in("id", phaseAIds)
      .not("style_vector", "is", null);

    if (selectedAnchors && selectedAnchors.length > 0) {
      // Merge each 12-dim anchor to 6-dim V2
      const anchorV2s = selectedAnchors.map((a) =>
        mergeToV2(a.style_vector as Record<string, number>),
      );

      if (anchorV2s.length === 1) {
        const sv = anchorV2s[0]!;
        for (let i = 0; i < V2_DIM_COUNT; i++) v2Dims[i] = sv[i]!;
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
        v2Dims[adj.dim] = clamp(v2Dims[adj.dim]! + adj.delta, 0, 1);
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

    for (const resp of phase_b_responses) {
      if (resp.chosenSide === "skip") continue;
      const pair = pairsById.get(resp.pairId);
      if (!pair) continue;

      const chosenVec =
        resp.chosenSide === "A" ? pair.image_a_vector : pair.image_b_vector;
      const rejectedVec =
        resp.chosenSide === "A" ? pair.image_b_vector : pair.image_a_vector;

      const lambda = Math.min(4, 1 + 600 / Math.max(resp.responseTimeMs, 100));

      // Merge chosen/rejected to V2 and compute delta in V2 space
      const chosenV2 = mergeToV2(chosenVec);
      const rejectedV2 = mergeToV2(rejectedVec);

      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const rawDelta = chosenV2[i]! - rejectedV2[i]!;

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
          v2Dims[i]! + rawDelta * (Math.abs((v2Dims[i] ?? 0.5) - 0.5) > 0.25 ? 0.04 : 0.25) * lambda * momentumMultiplier,
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

    // Confidence encoding: cov[i][i] = 1 - min(1, count / 4)
    let confSum = 0;
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      const dimConfidence = Math.min(1, (responsesPerV2Dim[i] ?? 0) / 4);
      covariance[i]![i] = 1 - dimConfidence;
      confSum += dimConfidence;
    }
    confidence = confSum / V2_DIM_COUNT;
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
  if (strongV2Dims.length === 0) {
    styleName = "Your Unique Style";
  } else {
    const result = softmaxStyleMatch(v2Dims, "v2");
    blendRatio = result.blendRatio;
    if (result.isNeutral) {
      styleName = "Your Unique Style";
    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
      competingStyles = [result.primaryStyle.name]; // raw internal name for next-pair matching
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = `${primaryName} · ${secondaryName}`;
      competingStyles = [result.primaryStyle.name, result.secondaryStyle.name]; // raw internal names
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

  return { fingerprint, styleName, styleTags, competingStyles, blendRatio, debug: debugData };
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

      let fingerprint: StyleFingerprint;
      let styleName: string;
      let styleTags: string[];
      let competingStyles: string[] = [];
      let blendRatio = 1.0;

      if (body.phase_c_confirmation && body.confirmed_fingerprint) {
        fingerprint = body.confirmed_fingerprint;
        const version = fingerprint.fingerprint_version ?? "v1";
        const d = fingerprint.dimensions;

        // For V2, use the first 6 slots for style matching
        if (version === "v2") {
          const v2Vec = [
            d.colorTemperature, d.colorSaturation, d.formality,
            d.density, d.era, d.material,
          ];
          const result = softmaxStyleMatch(v2Vec, "v2");
          if (result.isNeutral) {
            styleName = "Your Unique Style";
          } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
            styleName = toDisplayName(result.primaryStyle.name);
          } else {
            styleName = `${toDisplayName(result.primaryStyle.name)} · ${toDisplayName(result.secondaryStyle.name)}`;
          }
        } else {
          const fpVec = OLD_DIM_ORDER_KEYS.map(
            (k) => (d as Record<string, number>)[k] ?? NEUTRAL_MIDPOINT,
          );
          const result = softmaxStyleMatch(fpVec, "v1");
          if (result.isNeutral) {
            styleName = "Your Unique Style";
          } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
            styleName = toDisplayName(result.primaryStyle.name);
          } else {
            styleName = `${toDisplayName(result.primaryStyle.name)} · ${toDisplayName(result.secondaryStyle.name)}`;
          }
        }
        styleTags = fingerprintToStyleTags(fingerprint).slice(0, 4);
      } else {
        const result = await computeNewFingerprint(body, isDebug);
        fingerprint = result.fingerprint;
        styleName = result.styleName;
        styleTags = result.styleTags;
        competingStyles = result.competingStyles ?? [];
        blendRatio = result.blendRatio ?? 1.0;
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
            style_blend: fingerprint.dimensions,
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

