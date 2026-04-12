// Shared style-matching primitives used by the fingerprint API route and the
// upcoming "Tweak My Style" feature. Extracted from the route file so
// softmaxStyleMatch can be exported without conflicting with Next.js's
// requirement that API route files only export HTTP-handler symbols.

export const NEUTRAL_MIDPOINT = 0.5;

// Per-dimension weights for weighted cosine style matching. Tuned so that
// the most discriminative anchor dimensions (color, light, material, era)
// dominate the similarity metric.
export const DIMENSION_MATCH_WEIGHTS: number[] = [
  1.5, 1.2, 1.1, 0.9, 1.0, 1.3, 0.9, 1.0, 0.9, 1.4, 1.2, 0.8,
];

export interface StyleDefinition {
  name: string;
  chips: string[];
  center: number[];
}

// 9 named anchor styles. Vectors follow DIMENSION_ORDER from the route:
// colorTemperature, colorSaturation, density, formality, era, material,
// texture, pattern, lineQuality, lightPreference, nature, culturalInfluence
export const STYLES: StyleDefinition[] = [
  {
    name: "Warm Japandi",
    chips: [
      "warm neutrals",
      "organic textures",
      "natural materials",
      "minimal layers",
    ],
    center: [0.8, 0.25, 0.3, 0.4, 0.45, 0.85, 0.55, 0.1, 0.75, 0.65, 0.6, 0.25],
  },
  {
    name: "Dark Moody Glam",
    chips: [
      "dramatic depth",
      "velvet richness",
      "brass accents",
      "jewel tones",
    ],
    center: [0.25, 0.8, 0.65, 0.85, 0.35, 0.25, 0.8, 0.55, 0.2, 0.1, 0.05, 0.3],
  },
  {
    name: "Coastal Bright",
    chips: [
      "airy whites",
      "natural rattan",
      "sea breeze palette",
      "sun-filled",
    ],
    center: [0.5, 0.2, 0.35, 0.25, 0.4, 0.7, 0.3, 0.2, 0.6, 0.95, 0.75, 0.2],
  },
  {
    name: "Industrial Loft",
    chips: ["raw concrete", "aged leather", "matte black steel", "urban grit"],
    center: [
      0.15, 0.3, 0.55, 0.5, 0.3, 0.05, 0.45, 0.05, 0.05, 0.5, 0.05, 0.15,
    ],
  },
  {
    name: "Maximalist Eclectic",
    chips: [
      "bold pattern",
      "layered color",
      "global influences",
      "curated chaos",
    ],
    center: [0.6, 0.9, 0.95, 0.3, 0.5, 0.6, 0.85, 0.95, 0.7, 0.6, 0.65, 0.9],
  },
  {
    name: "Heritage Traditional",
    chips: ["mahogany panel", "tufted leather", "ornate detail", "old library"],
    center: [
      0.55, 0.45, 0.7, 0.95, 0.95, 0.8, 0.8, 0.85, 0.25, 0.45, 0.2, 0.35,
    ],
  },
  {
    name: "Pure Minimal White",
    chips: [
      "architectural calm",
      "pristine white",
      "zero clutter",
      "silent space",
    ],
    center: [0.3, 0.05, 0.05, 0.55, 0.1, 0.2, 0.05, 0.0, 0.1, 0.9, 0.15, 0.1],
  },
  {
    name: "Biophilic Jungle",
    chips: [
      "floor-to-ceiling plants",
      "natural stone",
      "wood beams",
      "living walls",
    ],
    center: [0.65, 0.55, 0.75, 0.2, 0.25, 0.95, 0.7, 0.3, 0.8, 0.7, 1.0, 0.5],
  },
  {
    name: "Retro Mid-Century",
    chips: [
      "walnut tapered legs",
      "avocado and ochre",
      "sunburst motif",
      "1960s vibe",
    ],
    center: [0.7, 0.65, 0.45, 0.6, 0.75, 0.65, 0.4, 0.7, 0.35, 0.65, 0.35, 0.3],
  },
];

export interface StyleMatch {
  style: StyleDefinition;
  similarity: number; // cosine similarity, centered
  weight: number; // softmax weight 0-1
}

// Softmax-weighted blend that produces both pure styles and hybrid
// combinations. Replaces the single-winner matchStyle() approach.
export function softmaxStyleMatch(fp: number[]): {
  matches: StyleMatch[];
  primaryStyle: StyleDefinition;
  secondaryStyle: StyleDefinition | null;
  blendRatio: number; // primary style's softmax weight 0-1
  isNeutral: boolean; // true when all similarities floor to 0 (genuinely neutral fingerprint)
} {
  const fpCentered = fp.map((v) => v - NEUTRAL_MIDPOINT);

  // Step 1: compute weighted cosine similarity to all 9 styles
  const rawSimilarities: { style: StyleDefinition; sim: number }[] = [];

  for (const style of STYLES) {
    const styleCentered = style.center.map((v) => v - NEUTRAL_MIDPOINT);

    let dot = 0;
    let fpNorm = 0;
    let styleNorm = 0;
    for (let i = 0; i < fpCentered.length; i++) {
      const w = DIMENSION_MATCH_WEIGHTS[i] ?? 1.0;
      dot += (fpCentered[i] ?? 0) * (styleCentered[i] ?? 0) * w;
      fpNorm += (fpCentered[i] ?? 0) ** 2 * w;
      styleNorm += (styleCentered[i] ?? 0) ** 2 * w;
    }

    const sim =
      fpNorm === 0 || styleNorm === 0
        ? 0
        : dot / (Math.sqrt(fpNorm) * Math.sqrt(styleNorm));

    // Floor at 0 — styles pointing opposite direction get 0 weight
    rawSimilarities.push({ style, sim: Math.max(0, sim) });
  }

  // Step 2: softmax with temperature T=4.5
  // Tuned to give clean pure-style blendRatios (>0.60) for clearly dominant fps
  // while keeping genuinely mixed fps as hybrids. Higher T sharpens the peak;
  // values above ~6 collapse near-tied hybrids (e.g. Test 5) to pure.
  const T = 4.5;
  const expSims = rawSimilarities.map((s) => ({
    style: s.style,
    sim: s.sim,
    exp: Math.exp(s.sim * T),
  }));
  const expSum = expSims.reduce((acc, s) => acc + s.exp, 0);

  const matches: StyleMatch[] = expSims
    .map((s) => ({
      style: s.style,
      similarity: s.sim,
      weight: s.exp / expSum,
    }))
    .filter((s) => s.weight > 0.15) // only styles with >15% weight
    .sort((a, b) => b.weight - a.weight);

  // All similarities floored to 0 — genuinely neutral fingerprint
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
