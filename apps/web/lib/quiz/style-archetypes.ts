/**
 * V3 Style Archetypes — 10 named styles with 12-dim vectors
 *
 * This is the canonical source for style definitions in the V3 quiz system.
 * Each archetype is a 12-dimensional vector representing a design style's
 * position across all aesthetic dimensions.
 *
 * Dimension order:
 *   warmth, complexity, formality, natureMateriality, colorSaturation,
 *   textureRichness, lightingDrama, pattern, lightPreference, lineQuality,
 *   symmetryPreference, plantPresence
 */

export const STYLE_ARCHETYPES = {
  COVASCANDINAV: {
    warmth:             0.35,
    complexity:         0.20,
    formality:          0.40,
    natureMateriality:  0.45,
    colorSaturation:    0.25,
    textureRichness:    0.40,
    lightingDrama:      0.15,
    pattern:            0.10,
    lightPreference:    0.85,
    lineQuality:        0.65,
    symmetryPreference: 0.45,
    plantPresence:      0.30,
  },
  COVAJAPANDI: {
    warmth:             0.60,
    complexity:         0.25,
    formality:          0.50,
    natureMateriality:  0.80,
    colorSaturation:    0.30,
    textureRichness:    0.65,
    lightingDrama:      0.35,
    pattern:            0.10,
    lightPreference:    0.60,
    lineQuality:        0.30,
    symmetryPreference: 0.25,
    plantPresence:      0.55,
  },
  COVABIOPHILIC: {
    warmth:             0.55,
    complexity:         0.50,
    formality:          0.25,
    natureMateriality:  0.95,
    colorSaturation:    0.45,
    textureRichness:    0.75,
    lightingDrama:      0.20,
    pattern:            0.15,
    lightPreference:    0.80,
    lineQuality:        0.20,
    symmetryPreference: 0.20,
    plantPresence:      0.95,
  },
  COVAMINIMAL: {
    warmth:             0.25,
    complexity:         0.05,
    formality:          0.60,
    natureMateriality:  0.20,
    colorSaturation:    0.10,
    textureRichness:    0.10,
    lightingDrama:      0.10,
    pattern:            0.00,
    lightPreference:    0.90,
    lineQuality:        0.80,
    symmetryPreference: 0.60,
    plantPresence:      0.05,
  },
  COVAMIDCENTURY: {
    warmth:             0.70,
    complexity:         0.50,
    formality:          0.55,
    natureMateriality:  0.50,
    colorSaturation:    0.65,
    textureRichness:    0.55,
    lightingDrama:      0.50,
    pattern:            0.45,
    lightPreference:    0.55,
    lineQuality:        0.60,
    symmetryPreference: 0.50,
    plantPresence:      0.25,
  },
  COVACOASTAL: {
    warmth:             0.45,
    complexity:         0.25,
    formality:          0.30,
    natureMateriality:  0.60,
    colorSaturation:    0.35,
    textureRichness:    0.50,
    lightingDrama:      0.10,
    pattern:            0.20,
    lightPreference:    0.95,
    lineQuality:        0.50,
    symmetryPreference: 0.40,
    plantPresence:      0.35,
  },
  COVABOHEMIAN: {
    warmth:             0.75,
    complexity:         0.90,
    formality:          0.10,
    natureMateriality:  0.70,
    colorSaturation:    0.80,
    textureRichness:    0.90,
    lightingDrama:      0.45,
    pattern:            0.90,
    lightPreference:    0.40,
    lineQuality:        0.15,
    symmetryPreference: 0.10,
    plantPresence:      0.70,
  },
  COVAINDUSTRIAL: {
    warmth:             0.20,
    complexity:         0.40,
    formality:          0.35,
    natureMateriality:  0.15,
    colorSaturation:    0.20,
    textureRichness:    0.65,
    lightingDrama:      0.75,
    pattern:            0.15,
    lightPreference:    0.30,
    lineQuality:        0.70,
    symmetryPreference: 0.40,
    plantPresence:      0.10,
  },
  COVAFARMHOUSE: {
    warmth:             0.80,
    complexity:         0.55,
    formality:          0.20,
    natureMateriality:  0.65,
    colorSaturation:    0.35,
    textureRichness:    0.70,
    lightingDrama:      0.30,
    pattern:            0.30,
    lightPreference:    0.60,
    lineQuality:        0.35,
    symmetryPreference: 0.35,
    plantPresence:      0.40,
  },
  COVAARTDECO: {
    warmth:             0.65,
    complexity:         0.75,
    formality:          0.85,
    natureMateriality:  0.10,
    colorSaturation:    0.70,
    textureRichness:    0.80,
    lightingDrama:      0.85,
    pattern:            0.75,
    lightPreference:    0.25,
    lineQuality:        0.90,
    symmetryPreference: 0.90,
    plantPresence:      0.05,
  },
} as const;

export type StyleName = keyof typeof STYLE_ARCHETYPES;

export const DIMENSION_ORDER = [
  'warmth', 'complexity', 'formality', 'natureMateriality',
  'colorSaturation', 'textureRichness', 'lightingDrama',
  'pattern', 'lightPreference', 'lineQuality',
  'symmetryPreference', 'plantPresence'
] as const;

export type DimensionName = typeof DIMENSION_ORDER[number];

export function cosineSimilarity(
  a: Record<DimensionName, number>,
  b: Record<DimensionName, number>,
): number {
  const dot = DIMENSION_ORDER.reduce((sum, d) => sum + a[d] * b[d], 0);
  const magA = Math.sqrt(DIMENSION_ORDER.reduce((sum, d) => sum + a[d] ** 2, 0));
  const magB = Math.sqrt(DIMENSION_ORDER.reduce((sum, d) => sum + b[d] ** 2, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

export function fingerprintToStyleBlend(
  fingerprint: Record<DimensionName, number>,
  temperature: number = 0.35,
): Record<StyleName, number> {
  const similarities = Object.entries(STYLE_ARCHETYPES).map(
    ([style, archetype]) => ({
      style: style as StyleName,
      similarity: cosineSimilarity(fingerprint, archetype as Record<DimensionName, number>),
    }),
  );

  // Softmax with temperature
  const expScores = similarities.map(s => ({
    style: s.style,
    exp: Math.exp(s.similarity / temperature),
  }));
  const total = expScores.reduce((sum, s) => sum + s.exp, 0);
  const rawBlend = Object.fromEntries(
    expScores.map(s => [s.style, s.exp / total]),
  ) as Record<StyleName, number>;

  // Filter: keep only styles above 0.10 weight
  const filtered = Object.fromEntries(
    Object.entries(rawBlend).filter(([, w]) => w > 0.10),
  ) as Record<StyleName, number>;

  // Renormalize
  const filteredTotal = Object.values(filtered).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(filtered).map(([s, w]) => [s, w / filteredTotal]),
  ) as Record<StyleName, number>;
}

export function getLoraConfig(blend: Record<StyleName, number>): Array<{
  style: StyleName;
  weight: number;
  scale: number;
}> {
  const DEFAULT_SCALES: Record<StyleName, number> = {
    COVAMINIMAL:    0.95,
    COVAJAPANDI:    0.88,
    COVAMIDCENTURY: 0.85,
    COVABIOPHILIC:  0.92,
    COVACOASTAL:    0.85,
    COVABOHEMIAN:   0.78,
    COVAINDUSTRIAL: 0.80,
    COVAFARMHOUSE:  0.85,
    COVAARTDECO:    0.82,
    COVASCANDINAV:  0.88,
  };

  return Object.entries(blend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3) // max 3 LoRAs
    .map(([style, weight]) => ({
      style: style as StyleName,
      weight,
      scale: DEFAULT_SCALES[style as StyleName] * weight * 0.85,
    }));
}
