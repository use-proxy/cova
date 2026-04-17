// Shared style-matching primitives used by the fingerprint API route and the
// upcoming "Tweak My Style" feature. Extracted from the route file so
// softmaxStyleMatch can be exported without conflicting with Next.js's
// requirement that API route files only export HTTP-handler symbols.

export const NEUTRAL_MIDPOINT = 0.5;

// ── V2 6-dimension system ─────────────────────────────────────────────────────
// Collapsed from 12 dims for better signal-to-noise in the quiz. The 6 merged
// dims are stored in the first 6 slots of the existing 12-dim DB columns.
//
// V2 dimension order (maps to existing field names):
//   0 = warmth           → colorTemperature slot
//   1 = visual_complexity → colorSaturation slot
//   2 = organicness      → formality slot       (NOTE: swapped with density)
//   3 = density          → density slot
//   4 = traditionalism   → era slot
//   5 = character        → material slot

export const V2_DIM_COUNT = 6;

// Per-dimension weights for weighted cosine style matching in V2.
export const V2_DIMENSION_MATCH_WEIGHTS: number[] = [
  1.4, // warmth — highly discriminative
  1.3, // visual_complexity — key separator
  1.2, // organicness — material identity
  1.1, // density — sparse vs layered
  1.0, // traditionalism
  0.9, // character
];

// Mapping from old 12-dim pair dimension names to V2 dim index + weight.
// Used by fingerprint/route.ts to route Phase B pair deltas to the right V2 dim.
export const OLD_DIM_TO_V2: Record<
  string,
  Array<{ v2Index: number; weight: number }>
> = {
  colorTemperature: [{ v2Index: 0, weight: 0.6 }], // warmth
  lightPreference: [{ v2Index: 0, weight: 0.4 }], // warmth
  colorSaturation: [{ v2Index: 1, weight: 0.5 }], // visual_complexity
  pattern: [{ v2Index: 1, weight: 0.5 }], // visual_complexity
  material: [{ v2Index: 2, weight: 0.4 }], // organicness
  texture: [{ v2Index: 2, weight: 0.3 }], // organicness
  nature: [{ v2Index: 2, weight: 0.3 }], // organicness
  density: [{ v2Index: 3, weight: 1.0 }], // density
  formality: [{ v2Index: 4, weight: 0.5 }], // traditionalism
  era: [{ v2Index: 4, weight: 0.5 }], // traditionalism
  lineQuality: [{ v2Index: 5, weight: 0.6 }], // character
  culturalInfluence: [{ v2Index: 5, weight: 0.6 }], // character
};

// Which old 12-dim pair dimensions feed into each V2 dim.
// Used by next-pair/route.ts to select pairs that test a specific V2 dim.
export const V2_DIM_TO_OLD_DIMS: string[][] = [
  ["colorTemperature", "lightPreference"], // warmth
  ["colorSaturation", "pattern"], // visual_complexity
  ["material", "texture", "nature"], // organicness
  ["density"], // density
  ["formality", "era"], // traditionalism
  ["lineQuality", "culturalInfluence"], // character
];

export const V2_DIM_NAMES = [
  "warmth",
  "visual_complexity",
  "organicness",
  "density",
  "traditionalism",
  "character",
] as const;

export type V2DimName = (typeof V2_DIM_NAMES)[number];

// ── Legacy V1 weights (kept for backward compat) ─────────────────────────────
export const DIMENSION_MATCH_WEIGHTS: number[] = [
  1.5, 1.2, 1.1, 0.9, 1.0, 1.3, 0.9, 1.0, 0.9, 1.4, 1.2, 0.8,
];

// ── V3 12-dimension system ───────────────────────────────────────────────────
// New 12-dim system for the 10-style quiz. Dimensions are named differently
// from V1. See style-archetypes.ts for canonical definitions.
import {
  DIMENSION_ORDER as V3_DIMENSION_ORDER,
  type DimensionName as V3DimensionName,
  type StyleName as V3StyleName,
} from '@/lib/quiz/style-archetypes';

export { V3_DIMENSION_ORDER, type V3DimensionName, type V3StyleName };
export const V3_DIM_COUNT = 12;

export interface StyleDefinition {
  name: string;
  chips: string[];
  center: number[]; // V1: 12-dim | V2: 6-dim
  v2Center: number[]; // Always 6-dim
  v3Center?: number[]; // V3: 12-dim (DIMENSION_ORDER from style-archetypes)
}

// 10 named anchor styles. V2 centers follow V2_DIM_NAMES order:
// warmth, visual_complexity, organicness, density, traditionalism, character
export const STYLES: StyleDefinition[] = [
  {
    name: "Warm Japandi",
    chips: ["warm neutrals", "organic textures", "natural materials", "minimal layers"],
    center: [0.8, 0.25, 0.3, 0.4, 0.45, 0.85, 0.55, 0.1, 0.75, 0.65, 0.6, 0.25],
    v2Center: [0.75, 0.20, 0.80, 0.25, 0.30, 0.70],
    v3Center: [0.60, 0.25, 0.50, 0.80, 0.30, 0.65, 0.35, 0.10, 0.60, 0.30, 0.25, 0.55], // COVAJAPANDI
  },
  {
    name: "Dark Moody Glam",
    chips: ["dramatic depth", "velvet richness", "brass accents", "jewel tones"],
    center: [0.25, 0.8, 0.65, 0.85, 0.35, 0.25, 0.8, 0.55, 0.2, 0.1, 0.05, 0.3],
    v2Center: [0.25, 0.75, 0.30, 0.70, 0.65, 0.80],
    v3Center: [0.65, 0.75, 0.85, 0.10, 0.70, 0.80, 0.85, 0.75, 0.25, 0.90, 0.90, 0.05], // COVAARTDECO
  },
  {
    name: "Coastal Bright",
    chips: ["airy whites", "natural rattan", "sea breeze palette", "sun-filled"],
    center: [0.5, 0.2, 0.35, 0.25, 0.4, 0.7, 0.3, 0.2, 0.6, 0.95, 0.75, 0.2],
    v2Center: [0.65, 0.20, 0.55, 0.25, 0.25, 0.25],
    v3Center: [0.45, 0.25, 0.30, 0.60, 0.35, 0.50, 0.10, 0.20, 0.95, 0.50, 0.40, 0.35], // COVACOASTAL
  },
  {
    name: "Industrial Loft",
    chips: ["raw concrete", "aged leather", "matte black steel", "urban grit"],
    center: [0.15, 0.3, 0.55, 0.5, 0.3, 0.05, 0.45, 0.05, 0.05, 0.5, 0.05, 0.15],
    v2Center: [0.20, 0.65, 0.15, 0.55, 0.35, 0.40],
    v3Center: [0.20, 0.40, 0.35, 0.15, 0.20, 0.65, 0.75, 0.15, 0.30, 0.70, 0.40, 0.10], // COVAINDUSTRIAL
  },
  {
    name: "Maximalist Eclectic",
    chips: ["bold pattern", "layered color", "global influences", "curated chaos"],
    center: [0.6, 0.9, 0.95, 0.3, 0.5, 0.6, 0.85, 0.95, 0.7, 0.6, 0.65, 0.9],
    v2Center: [0.65, 0.90, 0.65, 0.85, 0.30, 0.85],
    v3Center: [0.75, 0.90, 0.10, 0.70, 0.80, 0.90, 0.45, 0.90, 0.40, 0.15, 0.10, 0.70], // COVABOHEMIAN
  },
  {
    name: "Heritage Traditional",
    chips: ["mahogany panel", "tufted leather", "ornate detail", "old library"],
    center: [0.55, 0.45, 0.7, 0.95, 0.95, 0.8, 0.8, 0.85, 0.25, 0.45, 0.2, 0.35],
    v2Center: [0.70, 0.70, 0.65, 0.75, 0.90, 0.35],
    v3Center: [0.80, 0.55, 0.20, 0.65, 0.35, 0.70, 0.30, 0.30, 0.60, 0.35, 0.35, 0.40], // COVAFARMHOUSE
  },
  {
    name: "Pure Minimal White",
    chips: ["architectural calm", "pristine white", "zero clutter", "silent space"],
    center: [0.3, 0.05, 0.05, 0.55, 0.1, 0.2, 0.05, 0.0, 0.1, 0.9, 0.15, 0.1],
    v2Center: [0.30, 0.10, 0.25, 0.10, 0.40, 0.15],
    v3Center: [0.25, 0.05, 0.60, 0.20, 0.10, 0.10, 0.10, 0.00, 0.90, 0.80, 0.60, 0.05], // COVAMINIMAL
  },
  {
    name: "Biophilic Jungle",
    chips: ["floor-to-ceiling plants", "natural stone", "wood beams", "living walls"],
    center: [0.65, 0.55, 0.75, 0.2, 0.25, 0.95, 0.7, 0.3, 0.8, 0.7, 1.0, 0.5],
    v2Center: [0.60, 0.40, 0.90, 0.65, 0.20, 0.70],
    v3Center: [0.55, 0.50, 0.25, 0.95, 0.45, 0.75, 0.20, 0.15, 0.80, 0.20, 0.20, 0.95], // COVABIOPHILIC
  },
  {
    name: "Retro Mid-Century",
    chips: ["walnut tapered legs", "avocado and ochre", "sunburst motif", "1960s vibe"],
    center: [0.7, 0.65, 0.45, 0.6, 0.75, 0.65, 0.4, 0.7, 0.35, 0.65, 0.35, 0.3],
    v2Center: [0.70, 0.55, 0.40, 0.50, 0.55, 0.75],
    v3Center: [0.70, 0.50, 0.55, 0.50, 0.65, 0.55, 0.50, 0.45, 0.55, 0.60, 0.50, 0.25], // COVAMIDCENTURY
  },
  {
    name: "Nordic Scandi",
    chips: ["light birch", "soft whites", "cozy wool", "gentle minimalism"],
    center: [0.35, 0.20, 0.40, 0.45, 0.25, 0.40, 0.15, 0.10, 0.85, 0.65, 0.45, 0.30],
    v2Center: [0.55, 0.15, 0.45, 0.20, 0.25, 0.45],
    v3Center: [0.35, 0.20, 0.40, 0.45, 0.25, 0.40, 0.15, 0.10, 0.85, 0.65, 0.45, 0.30], // COVASCANDINAV
  },
];

export interface StyleMatch {
  style: StyleDefinition;
  similarity: number; // cosine similarity, centered
  weight: number; // softmax weight 0-1
}

// Softmax-weighted blend that produces both pure styles and hybrid
// combinations. Supports V1 (12-dim), V2 (6-dim), and V3 (12-dim new) fingerprints.
export function softmaxStyleMatch(fp: number[], version: "v1" | "v2" | "v3" = "v1"): {
  matches: StyleMatch[];
  primaryStyle: StyleDefinition;
  secondaryStyle: StyleDefinition | null;
  blendRatio: number; // primary style's softmax weight 0-1
  isNeutral: boolean; // true when all similarities floor to 0
} {
  const useV2 = version === "v2";
  const useV3 = version === "v3";
  const weights = useV3
    ? Array(V3_DIM_COUNT).fill(1.0) as number[] // V3: uniform weights (style-archetypes handles weighting)
    : useV2 ? V2_DIMENSION_MATCH_WEIGHTS : DIMENSION_MATCH_WEIGHTS;
  const fpCentered = fp.map((v) => v - NEUTRAL_MIDPOINT);

  // Step 1: compute weighted cosine similarity to all styles
  const rawSimilarities: { style: StyleDefinition; sim: number }[] = [];

  for (const style of STYLES) {
    const center = useV3 ? style.v3Center : useV2 ? style.v2Center : style.center;
    if (!center) continue; // skip styles without v3Center in V3 mode
    const styleCentered = center.map((v) => v - NEUTRAL_MIDPOINT);

    let dot = 0;
    let fpNorm = 0;
    let styleNorm = 0;
    for (let i = 0; i < fpCentered.length; i++) {
      const w = weights[i] ?? 1.0;
      dot += (fpCentered[i] ?? 0) * (styleCentered[i] ?? 0) * w;
      fpNorm += (fpCentered[i] ?? 0) ** 2 * w;
      styleNorm += (styleCentered[i] ?? 0) ** 2 * w;
    }

    const sim =
      fpNorm === 0 || styleNorm === 0
        ? 0
        : dot / (Math.sqrt(fpNorm) * Math.sqrt(styleNorm));

    rawSimilarities.push({ style, sim });
  }

  // Step 2: asymmetric softmax with temperature T=4.5
  // Denominator floors similarities at 0 so opposing styles don't dilute the
  // winner's weight. Numerator allows full negative similarities through so
  // opposing styles get suppressed (exp of large negative ≈ 0).
  const T = 4.5;
  const expSims = rawSimilarities.map((s) => ({
    style: s.style,
    sim: s.sim,
    expNum: Math.exp(s.sim * T),
    expDen: Math.exp(Math.max(0, s.sim) * T),
  }));
  const expSum = expSims.reduce((acc, s) => acc + s.expDen, 0);

  const matches: StyleMatch[] = expSims
    .map((s) => ({
      style: s.style,
      similarity: s.sim,
      weight: s.expNum / expSum,
    }))
    .filter((s) => s.weight > 0.10) // only styles with >10% weight
    .sort((a, b) => b.weight - a.weight);

  // All similarities near-zero or all equal — genuinely neutral fingerprint
  if (matches.length === 0) {
    return {
      matches: [],
      primaryStyle: STYLES[0]!,
      secondaryStyle: null,
      blendRatio: 1.0,
      isNeutral: true,
    };
  }

  const primaryMatch = matches[0]!;
  const secondaryMatch = matches[1] ?? null;

  return {
    matches,
    primaryStyle: primaryMatch.style,
    secondaryStyle: secondaryMatch?.style ?? null,
    blendRatio: primaryMatch.weight,
    isNeutral: false,
  };
}

// ── V2 fingerprint helpers ──────────────────────────────────────────────────

/** Merge a 12-dim anchor vector into a 6-dim V2 vector. */
export function mergeToV2(v12: Record<string, number>): number[] {
  const ct = v12.colorTemperature ?? 0.5;
  const cs = v12.colorSaturation ?? 0.5;
  const dn = v12.density ?? 0.5;
  const fm = v12.formality ?? 0.5;
  const er = v12.era ?? 0.5;
  const mt = v12.material ?? 0.5;
  const tx = v12.texture ?? 0.5;
  const pt = v12.pattern ?? 0.5;
  const lq = v12.lineQuality ?? 0.5;
  const lp = v12.lightPreference ?? 0.5;
  const nt = v12.nature ?? 0.5;
  const ci = v12.culturalInfluence ?? 0.5;

  return [
    0.6 * ct + 0.4 * lp, // warmth
    0.5 * cs + 0.5 * pt, // visual_complexity
    0.4 * mt + 0.3 * tx + 0.3 * nt, // organicness
    dn, // density
    0.5 * fm + 0.5 * er, // traditionalism
    0.6 * lq + 0.4 * ci, // character
  ];
}

/** Expand a V2 fingerprint to semantically-correct approximate 12 dims for
 *  prompt generation. Unlike expandV2ToDimensions (which maps to DB slots),
 *  this maps each V2 dim back to ALL its constituent 12-dim fields so that
 *  existing DESCRIPTORS/getMaterialPalette/etc. produce correct output.
 *
 *  E.g. warmth=0.74 → colorTemperature=0.74, lightPreference=0.74 */
export function expandV2ForPrompt(v6: number[]): Record<string, number> {
  const warmth = v6[0] ?? 0.5;
  const visComplex = v6[1] ?? 0.5;
  const organicness = v6[2] ?? 0.5;
  const density = v6[3] ?? 0.5;
  const traditionalism = v6[4] ?? 0.5;
  const character = v6[5] ?? 0.5;

  return {
    colorTemperature: warmth,
    colorSaturation: visComplex,
    density,
    formality: traditionalism, // traditionalism ≈ formality + era
    era: traditionalism,
    material: organicness, // organicness ≈ material + texture + nature
    texture: organicness,
    pattern: visComplex, // visual_complexity ≈ saturation + pattern
    lineQuality: character, // character ≈ lineQuality + culturalInfluence
    lightPreference: warmth, // warmth ≈ colorTemp + lightPref
    nature: organicness,
    culturalInfluence: character,
  };
}

/** Expand a V2/V3 fingerprint's dimensions for prompt generation.
 *  Detects fingerprint_version and applies appropriate expansion. */
export function expandForPrompt(
  fp: { dimensions: Record<string, number>; fingerprint_version?: string },
): Record<string, number> {
  if (fp.fingerprint_version === "v3") {
    // V3 dimensions are already in the new V3 dim names — expand to legacy names
    return expandV3ForPrompt(fp.dimensions as Record<V3DimensionName, number>);
  }
  if (fp.fingerprint_version === "v2") {
    const d = fp.dimensions;
    // Extract V2 values from DB slots
    const v6 = [
      d.colorTemperature ?? 0.5, // warmth
      d.colorSaturation ?? 0.5, // visual_complexity
      d.formality ?? 0.5, // organicness (stored in formality slot)
      d.density ?? 0.5, // density
      d.era ?? 0.5, // traditionalism
      d.material ?? 0.5, // character
    ];
    return expandV2ForPrompt(v6);
  }
  // V1: dimensions are already in correct semantic slots
  return { ...fp.dimensions };
}

/** Expand a 6-dim V2 vector back to 12-dim for DB storage.
 *  V2 order: [warmth, visual_complexity, organicness, density, traditionalism, character]
 *  Stored in first 6 DB column slots; remaining 6 are 0.5 (neutral). */
export function expandV2ToDimensions(v6: number[]): Record<string, number> {
  return {
    colorTemperature: v6[0] ?? 0.5, // warmth
    colorSaturation: v6[1] ?? 0.5, // visual_complexity
    density: v6[3] ?? 0.5, // density (v6 index 3)
    formality: v6[2] ?? 0.5, // organicness (v6 index 2)
    era: v6[4] ?? 0.5, // traditionalism
    material: v6[5] ?? 0.5, // character
    texture: 0.5,
    pattern: 0.5,
    lineQuality: 0.5,
    lightPreference: 0.5,
    nature: 0.5,
    culturalInfluence: 0.5,
  };
}

// ── V3 adapters ─────────────────────────────────────────────────────────────

/** Convert a V2 6-dim fingerprint to V3 12-dim. Unknown dims default to 0.5. */
export function v2ToV3(v6: number[]): Record<V3DimensionName, number> {
  const warmth = v6[0] ?? 0.5;
  const visComplex = v6[1] ?? 0.5;
  const organicness = v6[2] ?? 0.5;
  // v6[3] = density — maps to complexity in V3
  const traditionalism = v6[4] ?? 0.5;
  const character = v6[5] ?? 0.5;

  return {
    warmth,
    complexity: v6[3] ?? 0.5, // V2 density → V3 complexity
    formality: traditionalism,
    natureMateriality: organicness,
    colorSaturation: visComplex,
    textureRichness: organicness,
    lightingDrama: 0.5, // no V2 equivalent
    pattern: visComplex,
    lightPreference: warmth,
    lineQuality: character,
    symmetryPreference: traditionalism,
    plantPresence: organicness > 0.6 ? organicness * 0.8 : 0.5, // rough heuristic
  };
}

/** Convert a V3 12-dim Record to a V3 number array (DIMENSION_ORDER). */
export function v3RecordToArray(rec: Record<V3DimensionName, number>): number[] {
  return V3_DIMENSION_ORDER.map(d => rec[d]);
}

/** Convert a V3 number array to a V3 Record (DIMENSION_ORDER). */
export function v3ArrayToRecord(arr: number[]): Record<V3DimensionName, number> {
  const rec = {} as Record<V3DimensionName, number>;
  for (let i = 0; i < V3_DIMENSION_ORDER.length; i++) {
    rec[V3_DIMENSION_ORDER[i]] = arr[i] ?? 0.5;
  }
  return rec;
}

/** Expand V3 dimensions for prompt generation. V3 dims map to the legacy
 *  12-dim DESCRIPTORS table used by flux.ts buildFluxPrompt(). */
export function expandV3ForPrompt(dims: Record<V3DimensionName, number>): Record<string, number> {
  return {
    colorTemperature: dims.warmth,
    colorSaturation: dims.colorSaturation,
    density: dims.complexity,
    formality: dims.formality,
    era: dims.formality, // formality and symmetry map to era/tradition
    material: dims.natureMateriality,
    texture: dims.textureRichness,
    pattern: dims.pattern,
    lineQuality: dims.lineQuality,
    lightPreference: dims.lightPreference,
    nature: dims.plantPresence,
    culturalInfluence: dims.natureMateriality, // nature-materiality maps to cultural influence
  };
}
