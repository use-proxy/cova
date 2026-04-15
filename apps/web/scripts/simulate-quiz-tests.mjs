#!/usr/bin/env node
/**
 * simulate-quiz-tests.mjs — Automated test harness for the quiz fingerprint system.
 *
 * Replicates the math from:
 *   - apps/web/app/api/quiz/fingerprint/route.ts (computeNewFingerprint)
 *   - apps/web/lib/ai/style-match.ts (softmaxStyleMatch, mergeToV2, etc.)
 *
 * Runs 30 test cases covering pure styles, compatible hybrids, incompatible
 * anchors, Phase B overrides, non-visual question impact, and edge cases.
 */

// ── Constants from style-match.ts ──────────────────────────────────────────

const NEUTRAL_MIDPOINT = 0.5;
const V2_DIM_COUNT = 6;

const V2_DIMENSION_MATCH_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9];

const V2_DIM_NAMES = [
  "warmth",
  "visual_complexity",
  "organicness",
  "density",
  "traditionalism",
  "character",
];

const OLD_DIM_TO_V2 = {
  colorTemperature: [{ v2Index: 0, weight: 0.6 }],
  lightPreference: [{ v2Index: 0, weight: 0.4 }],
  colorSaturation: [{ v2Index: 1, weight: 0.5 }],
  pattern: [{ v2Index: 1, weight: 0.5 }],
  material: [{ v2Index: 2, weight: 0.4 }],
  texture: [{ v2Index: 2, weight: 0.3 }],
  nature: [{ v2Index: 2, weight: 0.3 }],
  density: [{ v2Index: 3, weight: 1.0 }],
  formality: [{ v2Index: 4, weight: 0.5 }],
  era: [{ v2Index: 4, weight: 0.5 }],
  lineQuality: [{ v2Index: 5, weight: 0.6 }],
  culturalInfluence: [{ v2Index: 5, weight: 0.6 }],
};

const V2_DIM_TO_OLD_DIMS = [
  ["colorTemperature", "lightPreference"],
  ["colorSaturation", "pattern"],
  ["material", "texture", "nature"],
  ["density"],
  ["formality", "era"],
  ["lineQuality", "culturalInfluence"],
];

// ── Style definitions (from style-match.ts) ────────────────────────────────

const STYLES = [
  {
    name: "Warm Japandi",
    center: [0.8, 0.25, 0.3, 0.4, 0.45, 0.85, 0.55, 0.1, 0.75, 0.65, 0.6, 0.25],
    v2Center: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80],
  },
  {
    name: "Dark Moody Glam",
    center: [0.25, 0.8, 0.65, 0.85, 0.35, 0.25, 0.8, 0.55, 0.2, 0.1, 0.05, 0.3],
    v2Center: [0.15, 0.80, 0.15, 0.80, 0.80, 0.15],
  },
  {
    name: "Coastal Bright",
    center: [0.5, 0.2, 0.35, 0.25, 0.4, 0.7, 0.3, 0.2, 0.6, 0.95, 0.75, 0.2],
    v2Center: [0.80, 0.15, 0.15, 0.15, 0.15, 0.15],
  },
  {
    name: "Industrial Loft",
    center: [0.15, 0.3, 0.55, 0.5, 0.3, 0.05, 0.45, 0.05, 0.05, 0.5, 0.05, 0.15],
    v2Center: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15],
  },
  {
    name: "Maximalist Eclectic",
    center: [0.6, 0.9, 0.95, 0.3, 0.5, 0.6, 0.85, 0.95, 0.7, 0.6, 0.65, 0.9],
    v2Center: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80],
  },
  {
    name: "Heritage Traditional",
    center: [0.55, 0.45, 0.7, 0.95, 0.95, 0.8, 0.8, 0.85, 0.25, 0.45, 0.2, 0.35],
    v2Center: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15],
  },
  {
    name: "Pure Minimal White",
    center: [0.3, 0.05, 0.05, 0.55, 0.1, 0.2, 0.05, 0.0, 0.1, 0.9, 0.15, 0.1],
    v2Center: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15],
  },
  {
    name: "Biophilic Jungle",
    center: [0.65, 0.55, 0.75, 0.2, 0.25, 0.95, 0.7, 0.3, 0.8, 0.7, 1.0, 0.5],
    v2Center: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80],
  },
  {
    name: "Retro Mid-Century",
    center: [0.7, 0.65, 0.45, 0.6, 0.75, 0.65, 0.4, 0.7, 0.35, 0.65, 0.35, 0.3],
    v2Center: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80],
  },
];

// Display name mapping (from anchor-display.ts)
const STYLE_DISPLAY_NAMES = {
  "Warm Japandi": "Japandi",
  "Dark Moody Glam": "Dark & Moody",
  "Coastal Bright": "Coastal Light",
  "Industrial Loft": "Urban Industrial",
  "Maximalist Eclectic": "Maximalist Eclectic",
  "Heritage Traditional": "Classic Traditional",
  "Pure Minimal White": "Minimalist",
  "Biophilic Jungle": "Biophilic",
  "Retro Mid-Century": "Mid-Century Modern",
};

function toDisplayName(name) {
  return STYLE_DISPLAY_NAMES[name] ?? name;
}

// Short test-case aliases → internal anchor names
const ALIAS_TO_INTERNAL = {
  Japandi: "Warm Japandi",
  Minimal: "Pure Minimal White",
  Maximalist: "Maximalist Eclectic",
  Biophilic: "Biophilic Jungle",
  Coastal: "Coastal Bright",
  Industrial: "Industrial Loft",
  Traditional: "Heritage Traditional",
  MidCentury: "Retro Mid-Century",
  DarkMoody: "Dark Moody Glam",
};

function lookupStyle(alias) {
  const internalName = ALIAS_TO_INTERNAL[alias] ?? alias;
  return STYLES.find((s) => s.name === internalName);
}

// ── Math primitives ────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function mergeToV2(v12) {
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
    0.6 * ct + 0.4 * lp,
    0.5 * cs + 0.5 * pt,
    0.4 * mt + 0.3 * tx + 0.3 * nt,
    dn,
    0.5 * fm + 0.5 * er,
    0.6 * lq + 0.4 * ci,
  ];
}

function expandV2ToDimensions(v6) {
  return {
    colorTemperature: v6[0] ?? 0.5,
    colorSaturation: v6[1] ?? 0.5,
    density: v6[3] ?? 0.5,
    formality: v6[2] ?? 0.5,
    era: v6[4] ?? 0.5,
    material: v6[5] ?? 0.5,
    texture: 0.5,
    pattern: 0.5,
    lineQuality: 0.5,
    lightPreference: 0.5,
    nature: 0.5,
    culturalInfluence: 0.5,
  };
}

function softmaxStyleMatch(fp) {
  const weights = V2_DIMENSION_MATCH_WEIGHTS;
  const fpCentered = fp.map((v) => v - NEUTRAL_MIDPOINT);

  const rawSimilarities = [];
  for (const style of STYLES) {
    const styleCentered = style.v2Center.map((v) => v - NEUTRAL_MIDPOINT);
    let dot = 0, fpNorm = 0, styleNorm = 0;
    for (let i = 0; i < fpCentered.length; i++) {
      const w = weights[i] ?? 1.0;
      dot += (fpCentered[i] ?? 0) * (styleCentered[i] ?? 0) * w;
      fpNorm += (fpCentered[i] ?? 0) ** 2 * w;
      styleNorm += (styleCentered[i] ?? 0) ** 2 * w;
    }
    const sim = fpNorm === 0 || styleNorm === 0 ? 0 : dot / (Math.sqrt(fpNorm) * Math.sqrt(styleNorm));
    rawSimilarities.push({ style, sim });
  }

  const T = 4.5;
  const expSims = rawSimilarities.map((s) => ({
    style: s.style,
    sim: s.sim,
    expNum: Math.exp(s.sim * T),
    expDen: Math.exp(Math.max(0, s.sim) * T),
  }));
  const expSum = expSims.reduce((acc, s) => acc + s.expDen, 0);

  const matches = expSims
    .map((s) => ({
      style: s.style,
      similarity: s.sim,
      weight: s.expNum / expSum,
    }))
    .filter((s) => s.weight > 0.10)
    .sort((a, b) => b.weight - a.weight);

  if (matches.length === 0) {
    return { matches: [], primaryStyle: STYLES[0], secondaryStyle: null, blendRatio: 1.0, isNeutral: true };
  }

  return {
    matches,
    primaryStyle: matches[0].style,
    secondaryStyle: matches[1]?.style ?? null,
    blendRatio: matches[0].weight,
    isNeutral: false,
  };
}

// ── Non-visual question adjustments (from fingerprint/route.ts) ────────────

const NON_VISUAL_ADJUSTMENTS = {
  surfaces: [
    [{ dim: 3, delta: -0.3 }, { dim: 1, delta: -0.2 }],    // clear/minimal
    [],                                                        // some thoughtful
    [{ dim: 3, delta: 0.3 }, { dim: 1, delta: 0.2 }],       // layered
  ],
  materials: [
    [{ dim: 2, delta: 0.35 }],                                // wood/stone/plants
    [{ dim: 2, delta: -0.25 }, { dim: 0, delta: -0.1 }],    // glass/metal
    [{ dim: 1, delta: 0.2 }, { dim: 0, delta: 0.15 }],      // velvet/brass
    [{ dim: 5, delta: 0.2 }],                                 // mix
  ],
  color: [
    [{ dim: 1, delta: -0.3 }, { dim: 0, delta: 0.1 }],     // neutrals
    [{ dim: 1, delta: -0.1 }],                                // one accent
    [{ dim: 1, delta: 0.25 }],                                // bold
    [{ dim: 1, delta: 0.35 }],                                // color everywhere
  ],
};

// NV shorthand: "clear"=0, "some"=1, "layered"=2 (surfaces)
//               "wood"=0, "glass"=1, "velvet"=2, "mixed"=3 (materials)
//               "neutral"=0, "accent"=1, "bold"=2, "coloreverywhere"=3 (color)
const NV_ALIASES = {
  surfaces: { clear: 0, some: 1, layered: 2 },
  materials: { wood: 0, glass: 1, velvet: 2, mixed: 3 },
  color: { neutral: 0, accent: 1, bold: 2, coloreverywhere: 3 },
};

// ── Synthetic pair generation ──────────────────────────────────────────────
// Each pair has a 12-dim `dimension` name, plus high/low image vectors.
// 18 pairs distributed: 3 per V2 dim.

const OLD_DIM_KEYS = [
  "colorTemperature", "colorSaturation", "density", "formality", "era",
  "material", "texture", "pattern", "lineQuality", "lightPreference",
  "nature", "culturalInfluence",
];

function make12DimVec(overrides = {}) {
  const vec = {};
  for (const k of OLD_DIM_KEYS) vec[k] = 0.5;
  Object.assign(vec, overrides);
  return vec;
}

/** Create 18 synthetic pairs, 3 per V2 dim. Side A = high, Side B = low. */
function generatePairs() {
  const pairs = [];
  for (let v2Idx = 0; v2Idx < V2_DIM_COUNT; v2Idx++) {
    const oldDims = V2_DIM_TO_OLD_DIMS[v2Idx];
    for (let rep = 0; rep < 3; rep++) {
      const oldDim = oldDims[rep % oldDims.length];
      const highVec = make12DimVec({ [oldDim]: 0.9 });
      const lowVec = make12DimVec({ [oldDim]: 0.1 });
      pairs.push({
        id: `sim-pair-v2d${v2Idx}-r${rep}`,
        dimension: oldDim,
        image_a_vector: highVec,
        image_b_vector: lowVec,
        v2DimIndex: v2Idx,
      });
    }
  }
  return pairs;
}

const SYNTHETIC_PAIRS = generatePairs();

// ── Phase B response simulation ────────────────────────────────────────────

/**
 * For a given style alias, determine the preferred side for each pair.
 * "A" = high on that dimension, "B" = low.
 * Decision: if the style's v2Center[pairV2Dim] > 0.5, choose A (high), else B (low).
 */
function preferredSide(styleAlias, pair) {
  const style = lookupStyle(styleAlias);
  if (!style) return "A";
  const v2Val = style.v2Center[pair.v2DimIndex];
  return v2Val > 0.5 ? "A" : "B";
}

function oppositeSide(side) {
  return side === "A" ? "B" : "A";
}

/**
 * Generate 18 Phase B responses.
 * mode:
 *   { type: "all", style: "Japandi" } — all pairs lean toward style
 *   { type: "split", styles: ["Japandi", "Coastal"] } — alternate
 *   { type: "skip" } — all skipped
 *   { type: "override", style: "Minimal" } — override toward a different style
 */
function generatePhaseBResponses(mode) {
  const responseTimeMs = 500;
  return SYNTHETIC_PAIRS.map((pair, idx) => {
    if (mode.type === "skip") {
      return { pairId: pair.id, chosenSide: "skip", responseTimeMs };
    }
    if (mode.type === "all") {
      return { pairId: pair.id, chosenSide: preferredSide(mode.style, pair), responseTimeMs };
    }
    if (mode.type === "split") {
      const styleIdx = idx % mode.styles.length;
      return { pairId: pair.id, chosenSide: preferredSide(mode.styles[styleIdx], pair), responseTimeMs };
    }
    if (mode.type === "override") {
      return { pairId: pair.id, chosenSide: preferredSide(mode.style, pair), responseTimeMs };
    }
    return { pairId: pair.id, chosenSide: "A", responseTimeMs };
  });
}

// ── Core fingerprint computation (replicates route.ts) ─────────────────────

const STRONG_BAND = 0.28;

function computeFingerprint({ anchors, nv, phaseB }) {
  // Step 1 — Phase A warm start
  const v2Dims = Array(V2_DIM_COUNT).fill(NEUTRAL_MIDPOINT);
  let anchorCompatibility = 0;

  if (anchors.length > 0) {
    const anchorStyles = anchors.map((a) => lookupStyle(a));
    // Use 12-dim centers as "style_vector" from DB, merge to V2
    const anchorV2s = anchorStyles.map((s) => {
      const v12 = {};
      OLD_DIM_KEYS.forEach((k, i) => { v12[k] = s.center[i]; });
      return mergeToV2(v12);
    });

    if (anchorV2s.length === 1) {
      for (let i = 0; i < V2_DIM_COUNT; i++) v2Dims[i] = anchorV2s[0][i];
    } else {
      const vecA = anchorV2s[0];
      const vecB = anchorV2s[1];
      let agreeCount = 0;

      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const devA = vecA[i] - NEUTRAL_MIDPOINT;
        const devB = vecB[i] - NEUTRAL_MIDPOINT;

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

    // Amplify Phase A: push deviations 40% further
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      const deviation = v2Dims[i] - NEUTRAL_MIDPOINT;
      v2Dims[i] = clamp(NEUTRAL_MIDPOINT + deviation * 1.4, 0, 1);
    }
  }

  const v2AfterA = [...v2Dims];

  // Step 1b — Non-visual adjustments
  if (nv) {
    for (const [questionId, choiceKey] of Object.entries(nv)) {
      const choiceIndex = NV_ALIASES[questionId]?.[choiceKey];
      if (choiceIndex === undefined) continue;
      const adjustments = NON_VISUAL_ADJUSTMENTS[questionId];
      if (!adjustments) continue;
      const choice = adjustments[choiceIndex];
      if (!choice) continue;
      for (const adj of choice) {
        v2Dims[adj.dim] = clamp(v2Dims[adj.dim] + adj.delta, 0, 1);
      }
    }
  }

  const v2AfterNV = [...v2Dims];

  // Step 2 — Phase B
  const responsesPerV2Dim = Array(V2_DIM_COUNT).fill(0);

  if (phaseB && phaseB.length > 0) {
    const pairsById = new Map();
    for (const p of SYNTHETIC_PAIRS) {
      pairsById.set(p.id, p);
    }

    const dimMomentum = Array(V2_DIM_COUNT).fill(0);
    const dimLastDirection = Array(V2_DIM_COUNT).fill(0);

    for (const resp of phaseB) {
      if (resp.chosenSide === "skip") continue;
      const pair = pairsById.get(resp.pairId);
      if (!pair) continue;

      const chosenVec = resp.chosenSide === "A" ? pair.image_a_vector : pair.image_b_vector;
      const rejectedVec = resp.chosenSide === "A" ? pair.image_b_vector : pair.image_a_vector;

      const lambda = Math.min(4, 1 + 600 / Math.max(resp.responseTimeMs, 100));

      const chosenV2 = mergeToV2(chosenVec);
      const rejectedV2 = mergeToV2(rejectedVec);

      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const rawDelta = chosenV2[i] - rejectedV2[i];

        const direction = Math.sign(rawDelta);
        if (direction !== 0) {
          if (direction === Math.sign(dimLastDirection[i])) {
            dimMomentum[i] = Math.min(dimMomentum[i] + 1, 5);
          } else {
            dimMomentum[i] = 0;
          }
          dimLastDirection[i] = direction;
        }
        const momentumMultiplier = 1.0 + dimMomentum[i] * 0.15;

        v2Dims[i] = clamp(v2Dims[i] + rawDelta * 0.25 * lambda * momentumMultiplier, 0, 1);
      }

      // Partial negative push
      for (let i = 0; i < V2_DIM_COUNT; i++) {
        const rejVal = rejectedV2[i];
        if (Math.abs(rejVal - NEUTRAL_MIDPOINT) > 0.2) {
          const pushAway = -(rejVal - NEUTRAL_MIDPOINT) * 0.1;
          v2Dims[i] = clamp(v2Dims[i] + pushAway, 0, 1);
        }
      }

      const v2Targets = OLD_DIM_TO_V2[pair.dimension] ?? [];
      for (const target of v2Targets) {
        responsesPerV2Dim[target.v2Index] = (responsesPerV2Dim[target.v2Index] ?? 0) + 1;
      }
    }
  }

  const v2Final = [...v2Dims];

  // Step 3 — Style name
  const strongV2Dims = v2Dims.filter((v) => Math.abs(v - NEUTRAL_MIDPOINT) > STRONG_BAND);
  let styleName;
  let blendRatio;
  let matchResult;

  if (strongV2Dims.length === 0) {
    styleName = "Your Unique Style";
    blendRatio = 1.0;
    matchResult = { matches: [], isNeutral: true };
  } else {
    matchResult = softmaxStyleMatch(v2Dims);
    if (matchResult.isNeutral) {
      styleName = "Your Unique Style";
      blendRatio = 1.0;
    } else if (matchResult.blendRatio >= 0.60 || matchResult.secondaryStyle === null) {
      styleName = toDisplayName(matchResult.primaryStyle.name);
      blendRatio = matchResult.blendRatio;
    } else {
      const primaryName = toDisplayName(matchResult.primaryStyle.name);
      const secondaryName = toDisplayName(matchResult.secondaryStyle.name);
      styleName = `${primaryName} \u00b7 ${secondaryName}`;
      blendRatio = matchResult.blendRatio;
    }
  }

  // Top 3 style weights
  const top3 = (matchResult.matches || []).slice(0, 3).map((m) => ({
    name: toDisplayName(m.style.name),
    weight: m.weight,
    similarity: m.similarity,
  }));

  return {
    styleName,
    blendRatio,
    top3,
    v2Final,
    v2AfterA,
    v2AfterNV,
    anchorCompatibility,
  };
}

// ── Test case definitions ──────────────────────────────────────────────────

const TEST_CASES = [
  // --- PURE STYLE TESTS ---
  {
    id: "T01", label: "Pure Japandi",
    anchors: ["Japandi", "Japandi"],
    nv: { surfaces: "some", materials: "wood", color: "neutral" },
    pb: { type: "all", style: "Japandi" },
    expect: { styleName: "Japandi", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T02", label: "Pure Minimalist",
    anchors: ["Minimal", "Minimal"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Minimal" },
    expect: { styleName: "Minimalist", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T03", label: "Pure Maximalist",
    anchors: ["Maximalist", "Maximalist"],
    nv: { surfaces: "layered", materials: "mixed", color: "coloreverywhere" },
    pb: { type: "all", style: "Maximalist" },
    expect: { styleName: "Maximalist Eclectic", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T04", label: "Pure Biophilic",
    anchors: ["Biophilic", "Biophilic"],
    nv: { surfaces: "layered", materials: "wood", color: "neutral" },
    pb: { type: "all", style: "Biophilic" },
    expect: { styleName: "Biophilic", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T05", label: "Pure Coastal",
    anchors: ["Coastal", "Coastal"],
    nv: { surfaces: "clear", materials: "wood", color: "neutral" },
    pb: { type: "all", style: "Coastal" },
    expect: { styleName: "Coastal Light", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T06", label: "Pure Industrial",
    anchors: ["Industrial", "Industrial"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Industrial" },
    expect: { styleName: "Urban Industrial", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T07", label: "Pure Traditional",
    anchors: ["Traditional", "Traditional"],
    nv: { surfaces: "layered", materials: "mixed", color: "neutral" },
    pb: { type: "all", style: "Traditional" },
    expect: { styleName: "Classic Traditional", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T08", label: "Pure Mid-Century",
    anchors: ["MidCentury", "MidCentury"],
    nv: { surfaces: "some", materials: "wood", color: "bold" },
    pb: { type: "all", style: "MidCentury" },
    expect: { styleName: "Mid-Century Modern", blendRatioMin: 0.60, pure: true },
  },
  {
    id: "T09", label: "Pure Dark & Moody",
    anchors: ["DarkMoody", "DarkMoody"],
    nv: { surfaces: "layered", materials: "velvet", color: "bold" },
    pb: { type: "all", style: "DarkMoody" },
    expect: { styleName: "Dark & Moody", blendRatioMin: 0.60, pure: true },
  },

  // --- COMPATIBLE HYBRID TESTS ---
  {
    id: "T10", label: "Japandi+Biophilic hybrid",
    anchors: ["Japandi", "Biophilic"],
    nv: { surfaces: "clear", materials: "wood", color: "neutral" },
    pb: { type: "split", styles: ["Japandi", "Biophilic"] },
    expect: { containsAny: ["Japandi", "Biophilic"], blendRatioMax: 0.60, hybrid: true },
  },
  {
    id: "T11", label: "Japandi+Coastal hybrid",
    anchors: ["Japandi", "Coastal"],
    nv: { surfaces: "clear", materials: "wood", color: "neutral" },
    pb: { type: "split", styles: ["Japandi", "Coastal"] },
    expect: { containsAny: ["Japandi", "Coastal Light"], blendRatioMax: 0.60, hybrid: true },
  },
  {
    id: "T12", label: "Maximalist+MidCentury hybrid",
    anchors: ["Maximalist", "MidCentury"],
    nv: { surfaces: "layered", materials: "mixed", color: "bold" },
    pb: { type: "split", styles: ["Maximalist", "MidCentury"] },
    expect: { containsAny: ["Maximalist Eclectic", "Mid-Century Modern"], hybrid: true },
  },
  {
    id: "T13", label: "Coastal+Biophilic hybrid",
    anchors: ["Coastal", "Biophilic"],
    nv: { surfaces: "clear", materials: "wood", color: "neutral" },
    pb: { type: "split", styles: ["Coastal", "Biophilic"] },
    expect: { notGhost: true },
  },
  {
    id: "T14", label: "Traditional+DarkMoody hybrid",
    anchors: ["Traditional", "DarkMoody"],
    nv: { surfaces: "layered", materials: "velvet", color: "bold" },
    pb: { type: "split", styles: ["Traditional", "DarkMoody"] },
    expect: { containsAny: ["Classic Traditional", "Dark & Moody"], hybrid: true },
  },
  {
    id: "T15", label: "Industrial+Minimal hybrid",
    anchors: ["Industrial", "Minimal"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "split", styles: ["Industrial", "Minimal"] },
    expect: { containsAny: ["Urban Industrial", "Minimalist"], hybrid: true },
  },

  // --- INCOMPATIBLE ANCHOR TESTS ---
  {
    id: "T16", label: "Japandi+Maximalist incompatible",
    anchors: ["Japandi", "Maximalist"],
    nv: { surfaces: "some", materials: "mixed", color: "accent" },
    pb: { type: "split", styles: ["Japandi", "Maximalist"] },
    expect: { notGhost: true, blendRatioMax: 0.60 },
  },
  {
    id: "T17", label: "Minimal+Traditional incompatible",
    anchors: ["Minimal", "Traditional"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "split", styles: ["Minimal", "Traditional"] },
    expect: { notGhost: true },
  },
  {
    id: "T18", label: "Industrial+Biophilic incompatible",
    anchors: ["Industrial", "Biophilic"],
    nv: { surfaces: "clear", materials: "wood", color: "neutral" },
    pb: { type: "split", styles: ["Industrial", "Biophilic"] },
    expect: { notGhost: true },
  },
  {
    id: "T19", label: "Coastal+DarkMoody incompatible",
    anchors: ["Coastal", "DarkMoody"],
    nv: { surfaces: "some", materials: "mixed", color: "accent" },
    pb: { type: "split", styles: ["Coastal", "DarkMoody"] },
    expect: { notGhost: true },
  },
  {
    id: "T20", label: "Minimal+Maximalist incompatible",
    anchors: ["Minimal", "Maximalist"],
    nv: { surfaces: "some", materials: "mixed", color: "accent" },
    pb: { type: "split", styles: ["Minimal", "Maximalist"] },
    expect: { notGhost: true, notSoleStyle: ["Minimalist", "Maximalist Eclectic"] },
  },

  // --- PHASE B OVERRIDE TESTS ---
  {
    id: "T21", label: "Biophilic anchors, sparse/urban PB",
    anchors: ["Biophilic", "Biophilic"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Minimal" },
    expect: { overrideShift: true, shiftAway: "Biophilic", shiftToward: ["Minimalist", "Urban Industrial"] },
  },
  {
    id: "T22", label: "Minimal anchors, busy/layered PB",
    anchors: ["Minimal", "Minimal"],
    nv: { surfaces: "layered", materials: "mixed", color: "coloreverywhere" },
    pb: { type: "all", style: "Maximalist" },
    expect: { overrideShift: true, shiftToward: ["Maximalist Eclectic"] },
  },
  {
    id: "T23", label: "Traditional anchors, contemporary PB",
    anchors: ["Traditional", "Traditional"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Minimal" },
    expect: { overrideShift: true, shiftAway: "Classic Traditional" },
  },

  // --- NON-VISUAL QUESTION IMPACT TESTS ---
  {
    id: "T24", label: "Compatible anchors, contradicting NV",
    anchors: ["Japandi", "Coastal"],
    nv: { surfaces: "layered", materials: "velvet", color: "bold" },
    pb: { type: "split", styles: ["Japandi", "Coastal"] },
    expect: { nvImpact: true, nvPushToward: ["Maximalist Eclectic", "Classic Traditional", "Dark & Moody"] },
  },
  {
    id: "T25", label: "Maximalist anchors, dampening NV",
    anchors: ["Maximalist", "Maximalist"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Maximalist" },
    expect: { nvDampen: true },
  },

  // --- EDGE CASES ---
  {
    id: "T26", label: "Japandi+Minimal, sparse PB → Minimalist",
    anchors: ["Japandi", "Minimal"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Minimal" },
    expect: { styleName: "Minimalist", blendRatioMin: 0.60 },
  },
  {
    id: "T27", label: "Biophilic+Maximalist shared dims",
    anchors: ["Biophilic", "Maximalist"],
    nv: { surfaces: "layered", materials: "wood", color: "bold" },
    pb: { type: "split", styles: ["Biophilic", "Maximalist"] },
    expect: { containsAny: ["Biophilic", "Maximalist Eclectic"], hybrid: true },
  },
  {
    id: "T28", label: "All Phase B skipped",
    anchors: ["Japandi", "Biophilic"],
    nv: { surfaces: "some", materials: "wood", color: "neutral" },
    pb: { type: "skip" },
    expect: { notGhost: true, hasStyle: true },
  },
  {
    id: "T29", label: "Japandi+Biophilic, NV+PB override organic",
    anchors: ["Japandi", "Biophilic"],
    nv: { surfaces: "clear", materials: "glass", color: "neutral" },
    pb: { type: "all", style: "Minimal" },
    expect: { overrideShift: true, shiftAway: "Biophilic" },
  },
  {
    id: "T30", label: "MidCentury+Traditional shared traditionalism",
    anchors: ["MidCentury", "Traditional"],
    nv: { surfaces: "some", materials: "wood", color: "neutral" },
    pb: { type: "split", styles: ["MidCentury", "Traditional"] },
    expect: { containsAny: ["Mid-Century Modern", "Classic Traditional"], hybrid: true },
  },
];

// ── Test runner ────────────────────────────────────────────────────────────

function evaluateExpectation(tc, result) {
  const e = tc.expect;
  const reasons = [];
  let pass = true;

  // styleName exact match
  if (e.styleName) {
    if (!result.styleName.includes(e.styleName) && result.styleName !== e.styleName) {
      pass = false;
      reasons.push(`expected style "${e.styleName}", got "${result.styleName}"`);
    }
  }

  // blendRatio minimum
  if (e.blendRatioMin !== undefined) {
    if (result.blendRatio < e.blendRatioMin) {
      pass = false;
      reasons.push(`blendRatio ${result.blendRatio.toFixed(3)} < min ${e.blendRatioMin}`);
    }
  }

  // blendRatio maximum (hybrid should be < threshold)
  if (e.blendRatioMax !== undefined) {
    // Soft check — log warning but don't fail
    if (result.blendRatio >= e.blendRatioMax) {
      reasons.push(`WARN: blendRatio ${result.blendRatio.toFixed(3)} >= max ${e.blendRatioMax} (not a true hybrid)`);
    }
  }

  // containsAny — style name should contain at least one of the expected
  if (e.containsAny) {
    const found = e.containsAny.some((s) => result.styleName.includes(s));
    if (!found) {
      pass = false;
      reasons.push(`expected one of [${e.containsAny.join(", ")}] in "${result.styleName}"`);
    }
  }

  // notGhost — should not be "Your Unique Style"
  if (e.notGhost) {
    if (result.styleName === "Your Unique Style") {
      pass = false;
      reasons.push("ghost style: 'Your Unique Style' — no strong dims");
    }
  }

  // hasStyle — must produce some named style
  if (e.hasStyle) {
    if (result.styleName === "Your Unique Style") {
      pass = false;
      reasons.push("expected a named style, got 'Your Unique Style'");
    }
  }

  // notSoleStyle — should not be purely one of these
  if (e.notSoleStyle) {
    for (const blocked of e.notSoleStyle) {
      if (result.styleName === blocked) {
        pass = false;
        reasons.push(`should not default to sole "${blocked}"`);
      }
    }
  }

  // overrideShift — Phase B should shift output
  if (e.overrideShift) {
    if (e.shiftAway) {
      // Primary style should NOT be the anchor style
      if (result.styleName === e.shiftAway) {
        pass = false;
        reasons.push(`expected shift away from "${e.shiftAway}" but it's still primary`);
      }
    }
    if (e.shiftToward) {
      const found = e.shiftToward.some((s) => result.styleName.includes(s));
      // Soft — just note if not shifted fully
      if (!found) {
        reasons.push(`WARN: expected shift toward [${e.shiftToward.join(", ")}], got "${result.styleName}"`);
      }
    }
  }

  // nvImpact — NV questions should influence toward certain styles
  if (e.nvImpact) {
    if (e.nvPushToward) {
      const anyMatch = e.nvPushToward.some((s) =>
        result.top3.some((t) => t.name.includes(s)),
      );
      if (!anyMatch) {
        reasons.push(`WARN: NV push expected toward [${e.nvPushToward.join(", ")}] in top3`);
      }
    }
  }

  // nvDampen — with contradicting NV, output should be less dominant
  if (e.nvDampen) {
    // We compare blendRatio — a dampened signal should have lower blend
    if (result.blendRatio >= 0.85) {
      reasons.push(`WARN: NV dampening expected but blendRatio=${result.blendRatio.toFixed(3)} still very high`);
    }
  }

  return { pass, reasons };
}

function formatDims(dims) {
  return dims.map((v, i) => `${V2_DIM_NAMES[i]}=${v.toFixed(3)}`).join(", ");
}

// ── Run all tests ──────────────────────────────────────────────────────────

console.log("=" .repeat(90));
console.log("  COVA QUIZ FINGERPRINT TEST HARNESS");
console.log("  30 simulated user sessions against the V2 6-dim fingerprint system");
console.log("=" .repeat(90));
console.log();

let totalPass = 0;
let totalFail = 0;
const primaryStyleCounts = {};
const pureBlendRatios = [];
const hybridBlendRatios = [];

for (const tc of TEST_CASES) {
  const phaseBResponses = generatePhaseBResponses(tc.pb);
  const result = computeFingerprint({
    anchors: tc.anchors,
    nv: tc.nv,
    phaseB: phaseBResponses,
  });

  const { pass, reasons } = evaluateExpectation(tc, result);

  if (pass) totalPass++;
  else totalFail++;

  // Track primary style appearances
  const primaryDisplay = result.styleName.split(" \u00b7 ")[0];
  primaryStyleCounts[primaryDisplay] = (primaryStyleCounts[primaryDisplay] ?? 0) + 1;

  // Track blend ratios
  if (tc.expect.pure) pureBlendRatios.push(result.blendRatio);
  if (tc.expect.hybrid) hybridBlendRatios.push(result.blendRatio);

  const status = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tc.id} [${status}] ${tc.label}`);
  console.log(`  Style:      ${result.styleName}`);
  console.log(`  BlendRatio: ${result.blendRatio.toFixed(4)}`);
  if (result.top3.length > 0) {
    console.log(`  Top 3:      ${result.top3.map((t) => `${t.name} (${(t.weight * 100).toFixed(1)}%)`).join("  |  ")}`);
  }
  console.log(`  Fingerprint: [${formatDims(result.v2Final)}]`);
  if (reasons.length > 0) {
    for (const r of reasons) {
      const isWarn = r.startsWith("WARN:");
      console.log(`  ${isWarn ? "\x1b[33m" : "\x1b[31m"}${r}\x1b[0m`);
    }
  }
  console.log();
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log("=" .repeat(90));
console.log("  SUMMARY");
console.log("=" .repeat(90));
console.log();
console.log(`  Total: ${TEST_CASES.length}  |  \x1b[32mPASS: ${totalPass}\x1b[0m  |  \x1b[31mFAIL: ${totalFail}\x1b[0m`);
console.log();

// Style suppression check
const allDisplayNames = Object.values(STYLE_DISPLAY_NAMES);
const neverPrimary = allDisplayNames.filter((name) => !primaryStyleCounts[name]);
if (neverPrimary.length > 0) {
  console.log(`  \x1b[33mPOTENTIAL SUPPRESSION:\x1b[0m These styles never appear as primary output:`);
  for (const s of neverPrimary) console.log(`    - ${s}`);
  console.log();
}

// Dominance check
const dominanceThreshold = Math.floor(TEST_CASES.length * 0.4);
const dominant = Object.entries(primaryStyleCounts).filter(([_, count]) => count > dominanceThreshold);
if (dominant.length > 0) {
  console.log(`  \x1b[33mPOTENTIAL DOMINANCE:\x1b[0m These styles appear as primary in >40% of tests:`);
  for (const [name, count] of dominant) {
    console.log(`    - ${name}: ${count}/${TEST_CASES.length} (${((count / TEST_CASES.length) * 100).toFixed(0)}%)`);
  }
  console.log();
}

// Blend ratio averages
const avgPure = pureBlendRatios.length > 0
  ? pureBlendRatios.reduce((a, b) => a + b, 0) / pureBlendRatios.length
  : 0;
const avgHybrid = hybridBlendRatios.length > 0
  ? hybridBlendRatios.reduce((a, b) => a + b, 0) / hybridBlendRatios.length
  : 0;

console.log(`  Avg blendRatio (pure tests):   ${avgPure.toFixed(4)} (n=${pureBlendRatios.length})`);
console.log(`  Avg blendRatio (hybrid tests): ${avgHybrid.toFixed(4)} (n=${hybridBlendRatios.length})`);
console.log();

// Primary style distribution
console.log("  Style distribution across all tests:");
const sorted = Object.entries(primaryStyleCounts).sort((a, b) => b[1] - a[1]);
for (const [name, count] of sorted) {
  const bar = "\u2588".repeat(count * 3);
  console.log(`    ${name.padEnd(24)} ${bar} ${count}`);
}
console.log();
console.log("=" .repeat(90));
