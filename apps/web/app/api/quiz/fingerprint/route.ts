import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { StyleFingerprint } from "@/types/fingerprint";
import { toDisplayName } from "@/lib/ai/anchor-display";
import { NEUTRAL_MIDPOINT, softmaxStyleMatch } from "@/lib/ai/style-match";

// ── 12-dimension system ───────────────────────────────────────────────────────
// All dimensions are in [0, 1] with 0.5 as the neutral midpoint.
// Indices:
//   0=colorTemperature  1=colorSaturation  2=density          3=formality
//   4=era               5=material         6=texture          7=pattern
//   8=lineQuality       9=lightPreference  10=nature          11=culturalInfluence

interface PairwiseResponse {
  /** quiz_comparison_pairs.id (single id, post-Session-C). */
  pairId: string;
  /** Which image of the pair the user picked. 'skip' = no preference. */
  chosenSide: "A" | "B" | "skip";
  responseTimeMs: number;
}

// New 3-phase API format
interface NewFingerprintRequest {
  phase_a_selections: string[];
  phase_b_responses: PairwiseResponse[];
  room_type: string;
  household_composition?: string;
  free_text?: string;
  budget_tier?: "budget" | "mid" | "premium" | "luxury" | null;
  // When true, the client has confirmed a (possibly tweaked) fingerprint
  // from the Phase C validation-render flow. When set together with
  // confirmed_fingerprint, the route skips recomputation and saves the
  // client-confirmed vector directly.
  phase_c_confirmation?: boolean;
  confirmed_fingerprint?: StyleFingerprint;
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

const DIM_COUNT = DIMENSION_ORDER.length; // 12

const STRONG_BAND = 0.2; // |v - 0.5| > 0.2 → directional

// ── New 3-phase fingerprint computation ───────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function neutralDims(): Record<DimKey, number> {
  const d = {} as Record<DimKey, number>;
  for (const k of DIMENSION_ORDER) d[k] = NEUTRAL_MIDPOINT;
  return d;
}

function identityCov(scale: number): number[][] {
  return Array.from({ length: DIM_COUNT }, (_, i) =>
    Array.from({ length: DIM_COUNT }, (__, j) => (i === j ? scale : 0)),
  );
}

async function computeNewFingerprint(body: NewFingerprintRequest): Promise<{
  fingerprint: StyleFingerprint;
  styleName: string;
  styleTags: string[];
}> {
  const { phase_a_selections, phase_b_responses } = body;

  // ── Step 1 — Phase A warm start ───────────────────────────────────────────
  const meanDims = neutralDims();
  const covariance = identityCov(0.5);
  let confidence = 0.3;

  if (phase_a_selections.length > 0) {
    // Phase A selections are now quiz_anchor_images.id values (Session C
    // wiring). Read the 12-dim style_vector for each selected anchor and
    // average them as the warm start.
    const admin = createAdminSupabaseClient();
    const { data: selectedAnchors } = await admin
      .from("quiz_anchor_images")
      .select("style_vector")
      .in("id", phase_a_selections)
      .not("style_vector", "is", null);

    if (selectedAnchors && selectedAnchors.length > 0) {
      // Reset to 0 before averaging actual vectors
      for (const k of DIMENSION_ORDER) meanDims[k] = 0;
      for (const anchor of selectedAnchors) {
        const sv = anchor.style_vector as Record<string, number>;
        for (const k of DIMENSION_ORDER) {
          meanDims[k] += (sv[k] ?? NEUTRAL_MIDPOINT) / selectedAnchors.length;
        }
      }

      // Change 4 — Amplify Phase A anchor signal: push deviations 40% further
      // from neutral so strong anchor selections give a warm start that pairwise
      // can build on rather than having to escape a near-neutral starting point.
      for (const k of DIMENSION_ORDER) {
        const deviation = meanDims[k] - NEUTRAL_MIDPOINT;
        meanDims[k] = clamp(NEUTRAL_MIDPOINT + deviation * 1.4, 0, 1);
      }
    }
  }

  // ── Step 2 — Apply Phase B updates ───────────────────────────────────────
  const responsesPerDim: Record<DimKey, number> = Object.fromEntries(
    DIMENSION_ORDER.map((d) => [d, 0]),
  ) as Record<DimKey, number>;

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

    // Change 2 — Momentum tracking: consecutive same-direction pushes compound.
    const dimMomentum: Record<DimKey, number> = Object.fromEntries(
      DIMENSION_ORDER.map((d) => [d, 0]),
    ) as Record<DimKey, number>;
    const dimLastDirection: Record<DimKey, number> = Object.fromEntries(
      DIMENSION_ORDER.map((d) => [d, 0]),
    ) as Record<DimKey, number>;

    for (const resp of phase_b_responses) {
      if (resp.chosenSide === "skip") continue;
      const pair = pairsById.get(resp.pairId);
      if (!pair) continue;

      const chosenVec =
        resp.chosenSide === "A" ? pair.image_a_vector : pair.image_b_vector;
      const rejectedVec =
        resp.chosenSide === "A" ? pair.image_b_vector : pair.image_a_vector;

      // Change 3 — Wider lambda range: fast/confident choices (< 200ms) get ≈4
      const lambda = Math.min(4, 1 + 600 / Math.max(resp.responseTimeMs, 100));

      for (const k of DIMENSION_ORDER) {
        // Change 1 — Stronger base learning rate: 0.25 instead of 0.15
        const rawDelta =
          (chosenVec[k] ?? NEUTRAL_MIDPOINT) -
          (rejectedVec[k] ?? NEUTRAL_MIDPOINT);

        // Change 2 — Apply momentum multiplier for consecutive same-direction pushes
        const direction = Math.sign(rawDelta);
        if (direction !== 0) {
          if (direction === Math.sign(dimLastDirection[k])) {
            dimMomentum[k] = Math.min(dimMomentum[k] + 1, 5);
          } else {
            dimMomentum[k] = 0;
          }
          dimLastDirection[k] = direction;
        }
        const momentumMultiplier = 1.0 + dimMomentum[k] * 0.15;

        meanDims[k] = clamp(
          meanDims[k] + rawDelta * 0.25 * lambda * momentumMultiplier,
          0,
          1,
        );
      }

      // Increment per-dim response counter for the pair's primary dimension.
      if (pair.dimension && pair.dimension in responsesPerDim) {
        responsesPerDim[pair.dimension as DimKey] += 1;
      }
    }

    // Confidence encoding: cov[i][i] = 1 - min(1, count / 4)
    let confSum = 0;
    for (let i = 0; i < DIMENSION_ORDER.length; i++) {
      const k = DIMENSION_ORDER[i]!;
      const dimConfidence = Math.min(1, responsesPerDim[k] / 4);
      covariance[i]![i] = 1 - dimConfidence;
      confSum += dimConfidence;
    }
    confidence = confSum / DIM_COUNT;
  }

  const fingerprint: StyleFingerprint = {
    dimensions: { ...meanDims } as StyleFingerprint["dimensions"],
    covariance,
    confidence,
  };

  // ── Step 3 — Style name from softmax-weighted blend ──────────────────────
  const d = fingerprint.dimensions;
  const fpVec = DIMENSION_ORDER.map((k) => d[k]);
  const strongDims = DIMENSION_ORDER.filter(
    (k) => Math.abs(d[k] - NEUTRAL_MIDPOINT) > STRONG_BAND,
  );

  let styleName: string;
  if (strongDims.length === 0) {
    styleName = "Your Unique Style";
  } else {
    const result = softmaxStyleMatch(fpVec);
    if (result.isNeutral) {
      styleName = "Your Unique Style";
    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = `${primaryName} · ${secondaryName}`;
    }
  }

  // ── Step 4 — Style tags (only directional dimensions) ─────────────────────
  const DIM_LABELS: Record<DimKey, [string, string]> = {
    colorTemperature: ["Cool Palette", "Warm Tones"],
    colorSaturation: ["Neutral Palette", "Bold Color"],
    density: ["Clean & Spare", "Richly Layered"],
    formality: ["Casual & Relaxed", "Formal & Structured"],
    era: ["Ultra-Modern", "Heritage Craft"],
    material: ["Manufactured", "Natural & Organic"],
    texture: ["Sleek Surfaces", "Tactile Rich"],
    pattern: ["Pattern-Free", "Pattern-Rich"],
    lineQuality: ["Geometric Lines", "Organic Forms"],
    lightPreference: ["Cozy & Intimate", "Sun-Drenched"],
    nature: ["Urban Edge", "Biophilic Warmth"],
    culturalInfluence: ["Western Modern", "Globally Eclectic"],
  };

  const NEUTRAL_FILLERS = [
    "Balanced Style",
    "Versatile Space",
    "Open to Ideas",
    "Your Taste",
  ];

  const strong = DIMENSION_ORDER.map((k) => ({
    key: k,
    dev: d[k] - NEUTRAL_MIDPOINT,
    mag: Math.abs(d[k] - NEUTRAL_MIDPOINT),
  }))
    .filter((x) => x.mag > STRONG_BAND)
    .sort((a, b) => b.mag - a.mag);

  const styleTags: string[] = strong.slice(0, 4).map(({ key, dev }) => {
    const labels = DIM_LABELS[key];
    return dev > 0 ? labels[1] : labels[0];
  });

  // Fill remaining slots with neutral tags
  let fillerIdx = 0;
  while (styleTags.length < 4 && fillerIdx < NEUTRAL_FILLERS.length) {
    styleTags.push(NEUTRAL_FILLERS[fillerIdx]!);
    fillerIdx++;
  }

  return { fingerprint, styleName, styleTags };
}

function fingerprintToStyleTags(fp: StyleFingerprint): string[] {
  const d = fp.dimensions;
  return [
    d.colorTemperature >= NEUTRAL_MIDPOINT ? "warm" : "cool",
    d.colorSaturation >= NEUTRAL_MIDPOINT ? "colorful" : "muted",
    d.density >= NEUTRAL_MIDPOINT ? "layered" : "minimal",
    d.formality >= NEUTRAL_MIDPOINT ? "formal" : "casual",
    d.era >= NEUTRAL_MIDPOINT ? "traditional" : "modern",
    d.material >= NEUTRAL_MIDPOINT ? "natural" : "manufactured",
    d.texture >= NEUTRAL_MIDPOINT ? "textured" : "smooth",
    d.pattern >= NEUTRAL_MIDPOINT ? "patterned" : "plain",
    d.lineQuality >= NEUTRAL_MIDPOINT ? "organic" : "geometric",
    d.lightPreference >= NEUTRAL_MIDPOINT ? "bright" : "moody",
    d.nature >= NEUTRAL_MIDPOINT ? "biophilic" : "urban",
    d.culturalInfluence >= NEUTRAL_MIDPOINT ? "global" : "western",
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
      // ── 3-phase format ────────────────────────────────────────────────────
      const body = rawBody as unknown as NewFingerprintRequest;
      if (!body.room_type) {
        return NextResponse.json(
          { error: "room_type required" },
          { status: 400 },
        );
      }

      // Phase C confirmation path: the client has already confirmed a
      // (possibly tweaked) fingerprint from the validation-render flow.
      // Skip recomputation and save the client-confirmed vector directly —
      // still re-derives style name and tags from that vector for display.
      let fingerprint: StyleFingerprint;
      let styleName: string;
      let styleTags: string[];

      if (body.phase_c_confirmation && body.confirmed_fingerprint) {
        fingerprint = body.confirmed_fingerprint;
        const d = fingerprint.dimensions;
        const strongDims = DIMENSION_ORDER.filter(
          (k) =>
            Math.abs((d[k] ?? NEUTRAL_MIDPOINT) - NEUTRAL_MIDPOINT) >
            STRONG_BAND,
        );
        if (strongDims.length === 0) {
          styleName = "Your Unique Style";
        } else {
          const fpVec = DIMENSION_ORDER.map((k) => d[k] ?? NEUTRAL_MIDPOINT);
          const result = softmaxStyleMatch(fpVec);
          if (result.isNeutral) {
            styleName = "Your Unique Style";
          } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
            styleName = toDisplayName(result.primaryStyle.name);
          } else {
            const primaryName = toDisplayName(result.primaryStyle.name);
            const secondaryName = toDisplayName(result.secondaryStyle.name);
            styleName = `${primaryName} · ${secondaryName}`;
          }
        }
        styleTags = fingerprintToStyleTags(fingerprint).slice(0, 4);
      } else {
        const result = await computeNewFingerprint(body);
        fingerprint = result.fingerprint;
        styleName = result.styleName;
        styleTags = result.styleTags;
      }

      // Pre-auth path: if no authenticated user, allow fingerprint computation
      // if the client provides a session token (any non-empty string). The
      // fingerprint is returned but NOT written to DB (requires real user.id).
      // The client stores it in the cova_anon_fingerprint cookie, and the OAuth
      // callback persists it after login.
      if (!user) {
        const sessionToken =
          request.headers.get("x-cova-session-token") ??
          (rawBody as Record<string, unknown>).session_token;
        if (!sessionToken || (typeof sessionToken === "string" && sessionToken.trim() === "")) {
          return NextResponse.json(
            { success: false, error: "unauthenticated" },
            { status: 401 },
          );
        }
        // Return computed fingerprint without DB persistence
        return NextResponse.json({
          fingerprint,
          style_name: styleName,
          style_tags: styleTags,
          persisted: false,
        });
      }

      // Save to DB
      try {
        const admin = createAdminSupabaseClient();

        // Guard against FK violation
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

        // Mirror the fingerprint onto the users row
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
      });
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
