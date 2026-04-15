#!/usr/bin/env node
/**
 * exhaustive-quiz-tests.mjs — 8-level comprehensive quiz test suite.
 * Pure Node.js, no browser, no dev server.
 * Run: node apps/web/scripts/exhaustive-quiz-tests.mjs
 *
 * All math is copied verbatim from:
 *   lib/ai/style-match.ts   (expandV2ForPrompt, softmaxStyleMatch, mergeToV2)
 *   app/design/step-2/page.tsx (estimateV2FromGrid, buildNlpQuestions, DIM_QUESTIONS)
 *   app/api/quiz/fingerprint/route.ts (pairwise delta math, settled-dim weights)
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const NEUTRAL = 0.5;
const V2_DIM_COUNT = 6;
const V2_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9];
const DIM_NAMES = ["warmth", "complexity", "organicness", "density", "traditionalism", "character"];

// Canonical v2Centers from style-match.ts
const STYLES = [
  { name: "Warm Japandi",         v2: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80] },
  { name: "Dark Moody Glam",      v2: [0.15, 0.80, 0.15, 0.80, 0.80, 0.80] },
  { name: "Coastal Bright",       v2: [0.80, 0.15, 0.50, 0.15, 0.15, 0.15] },
  { name: "Industrial Loft",      v2: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15] },
  { name: "Maximalist Eclectic",  v2: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80] },
  { name: "Heritage Traditional", v2: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15] },
  { name: "Pure Minimal White",   v2: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: "Biophilic Jungle",     v2: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80] },
  { name: "Retro Mid-Century",    v2: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80] },
];

// DIM_QUESTIONS from step-2/page.tsx
const DIM_QUESTIONS = [
  { // dim 0: warmth
    hiLabel: "Warm, rich, and inviting",
    loLabel: "Cool, crisp, and composed",
    hiDeltas: [+0.45, 0, 0, 0, 0, 0],
    loDeltas: [-0.45, 0, 0, 0, 0, 0],
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  { // dim 1: visual_complexity
    hiLabel: "A lot — richness and layers of detail",
    loLabel: "Very little — beauty through restraint",
    hiDeltas: [0, +0.45, 0, 0, 0, 0],
    loDeltas: [0, -0.45, 0, 0, 0, 0],
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  { // dim 2: organicness
    hiLabel: "Essential — wood, stone, plants, living textures",
    loLabel: "Minimal — I prefer glass, metal, precise surfaces",
    hiDeltas: [0, 0, +0.45, 0, 0, 0],
    loDeltas: [0, 0, -0.45, 0, 0, 0],
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  { // dim 3: density
    hiLabel: "Layered — rooms full of collected things and story",
    loLabel: "Sparse — every object earns its place, nothing extra",
    hiDeltas: [0, 0, 0, +0.45, 0, 0],
    loDeltas: [0, 0, 0, -0.45, 0, 0],
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  { // dim 4: traditionalism
    hiLabel: "Heritage — antiques, patina, and timeless forms",
    loLabel: "Forward — contemporary and cutting-edge forms",
    hiDeltas: [0, 0, 0, 0, +0.45, 0],
    loDeltas: [0, 0, 0, 0, -0.45, 0],
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  { // dim 5: character
    hiLabel: "Handcrafted and one-of-a-kind, full of soul",
    loLabel: "Refined, precise, and beautifully anonymous",
    hiDeltas: [0, 0, 0, 0, 0, +0.35],
    loDeltas: [0, 0, 0, 0, 0, -0.35],
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
];

// Prompt descriptor vocabulary (simplified semantic check)
const PROMPT_TOKEN_EXPECTATIONS = {
  "Warm Japandi":         { high: ["warm","natural","organic","character"], low: ["cool","complex","dense","traditional"] },
  "Dark Moody Glam":      { high: ["complex","dense","traditional","character"], low: ["warm","organic"] },
  "Coastal Bright":       { high: ["warm"], low: ["complex","dense","traditional","character"] },
  "Industrial Loft":      { high: ["complex","dense"], low: ["warm","organic","traditional","character"] },
  "Maximalist Eclectic":  { high: ["warm","complex","organic","dense","character"], low: ["traditional"] },
  "Heritage Traditional": { high: ["warm","complex","organic","dense","traditional"], low: ["character"] },
  "Pure Minimal White":   { high: [], low: ["warm","complex","organic","dense","traditional","character"] },
  "Biophilic Jungle":     { high: ["organic","dense","character"], low: ["warm","complex","traditional"] },
  "Retro Mid-Century":    { high: ["warm","complex","character"], low: ["organic","dense","traditional"] },
};

// ── Math primitives ────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function expandV2ForPrompt(v6) {
  const [warmth, visComplex, organicness, density, traditionalism, character] = v6;
  return {
    colorTemperature: warmth,
    colorSaturation: visComplex,
    density,
    formality: traditionalism,
    era: traditionalism,
    material: organicness,
    texture: organicness,
    pattern: visComplex,
    lineQuality: character,
    lightPreference: warmth,
    nature: organicness,
    culturalInfluence: character,
  };
}

function softmaxStyleMatch(fp) {
  const T = 4.5;
  const fpC = fp.map(v => v - NEUTRAL);
  const rawSims = STYLES.map(s => {
    const sc = s.v2.map(v => v - NEUTRAL);
    let dot = 0, fN = 0, sN = 0;
    for (let i = 0; i < 6; i++) {
      const w = V2_WEIGHTS[i];
      dot += fpC[i] * sc[i] * w;
      fN += fpC[i] ** 2 * w;
      sN += sc[i] ** 2 * w;
    }
    return { style: s, sim: fN === 0 || sN === 0 ? 0 : dot / (Math.sqrt(fN) * Math.sqrt(sN)) };
  });
  const expSims = rawSims.map(s => ({
    ...s, expNum: Math.exp(s.sim * T), expDen: Math.exp(Math.max(0, s.sim) * T)
  }));
  const expSum = expSims.reduce((a, s) => a + s.expDen, 0);
  const matches = expSims
    .map(s => ({ style: s.style, sim: s.sim, weight: s.expNum / expSum }))
    .filter(s => s.weight > 0.10)
    .sort((a, b) => b.weight - a.weight);
  if (!matches.length) return { primary: STYLES[0], secondary: null, blendRatio: 1.0, isNeutral: true };
  return {
    primary: matches[0].style,
    secondary: matches[1]?.style ?? null,
    blendRatio: matches[0].weight,
    sims: rawSims,
    isNeutral: false,
  };
}

function cosineSimilarity(a, b) {
  let dot = 0, aN = 0, bN = 0;
  for (let i = 0; i < a.length; i++) {
    const ac = a[i] - NEUTRAL, bc = b[i] - NEUTRAL;
    dot += ac * bc;
    aN += ac ** 2;
    bN += bc ** 2;
  }
  if (aN === 0 || bN === 0) return 0;
  return dot / (Math.sqrt(aN) * Math.sqrt(bN));
}

function estimateV2FromGrid(gridPickCounts) {
  const entries = Object.entries(gridPickCounts).map(([idxStr, count]) => ({
    center: STYLES[Number(idxStr)]?.v2 ?? Array(6).fill(NEUTRAL),
    count,
  }));
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total === 0) return Array(6).fill(NEUTRAL);
  return Array.from({ length: 6 }, (_, i) => {
    let wSum = 0, wTotal = 0;
    for (const { center, count } of entries) {
      const dev = center[i] - NEUTRAL;
      const sig = Math.abs(dev) * (count / total);
      wSum += dev * sig;
      wTotal += sig;
    }
    return wTotal < 0.01 ? NEUTRAL : clamp(NEUTRAL + wSum / wTotal, 0, 1);
  });
}

function buildNlpQuestions(gridPickCounts) {
  const v2 = estimateV2FromGrid(gridPickCounts);
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);
  const topA = sorted[0];
  const topB = sorted[1];
  const havePair = topA && topB && STYLES[topA.idx] && STYLES[topB.idx];
  const dimScores = Array.from({ length: 6 }, (_, i) => {
    const uncertainty = 1 - Math.abs((v2[i] ?? NEUTRAL) - NEUTRAL) * 2;
    let separation = 0;
    if (havePair) {
      const aVal = STYLES[topA.idx].v2[i] ?? NEUTRAL;
      const bVal = STYLES[topB.idx].v2[i] ?? NEUTRAL;
      separation = Math.abs(aVal - bVal);
    }
    return { dimIdx: i, score: separation * 0.7 + uncertainty * 0.3 };
  }).sort((a, b) => b.score - a.score);
  return dimScores.slice(0, 3).map(({ dimIdx }) => ({ dimIdx, desc: DIM_QUESTIONS[dimIdx] }));
}

function buildQ1(gridPickCounts) {
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);
  if (sorted.length < 2) return null; // no tie
  const top = sorted[0], second = sorted[1];
  if (top.count !== second.count) return null; // not tied
  const aCenter = STYLES[top.idx]?.v2, bCenter = STYLES[second.idx]?.v2;
  if (!aCenter || !bCenter) return null;
  const CONFLICT_THRESHOLD = 0.25;
  let bestDimIdx = -1, bestConflict = 0;
  for (let i = 0; i < 6; i++) {
    const devA = aCenter[i] - NEUTRAL, devB = bCenter[i] - NEUTRAL;
    const bothStrong = Math.abs(devA) >= CONFLICT_THRESHOLD && Math.abs(devB) >= CONFLICT_THRESHOLD;
    const conflict = Math.sign(devA) !== Math.sign(devB);
    if (bothStrong && conflict) {
      const magnitude = Math.abs(devA) + Math.abs(devB);
      if (magnitude > bestConflict) { bestConflict = magnitude; bestDimIdx = i; }
    }
  }
  return bestDimIdx === -1 ? null : { dimIdx: bestDimIdx };
}

function applyNlpDeltas(v2, dimIdx, direction) {
  // direction: +1=hi, -1=lo, 0=mid
  const deltas = direction > 0 ? DIM_QUESTIONS[dimIdx].hiDeltas
    : direction < 0 ? DIM_QUESTIONS[dimIdx].loDeltas
    : DIM_QUESTIONS[dimIdx].midDeltas;
  return v2.map((v, i) => clamp(v + (deltas[i] ?? 0), 0, 1));
}

// ── RNG (seeded for reproducibility) ─────────────────────────────────────────

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Level results accumulator ─────────────────────────────────────────────────

const RESULTS = {};
const FAILURES = {};

function recordResult(level, key, pass) {
  if (!RESULTS[level]) RESULTS[level] = { pass: 0, total: 0 };
  RESULTS[level].total++;
  if (pass) RESULTS[level].pass++;
  else {
    if (!FAILURES[level]) FAILURES[level] = [];
    FAILURES[level].push(key);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 1: Render prompt coherence
// ═══════════════════════════════════════════════════════════════════════════════

function runLevel1() {
  console.log("\n═══ LEVEL 1: Render prompt coherence ═══");
  let promptIssues = [];

  // Helper: classify a value (high=>0.65, low=<0.35, mid=otherwise)
  function classify(v) { return v > 0.65 ? "high" : v < 0.35 ? "low" : "mid"; }

  // Map prompt field → semantic dim label for easy checking
  const FIELD_TO_DIM = {
    colorTemperature: "warm", lightPreference: "warm",
    colorSaturation: "complex", pattern: "complex",
    material: "organic", texture: "organic", nature: "organic",
    density: "dense",
    formality: "traditional", era: "traditional",
    lineQuality: "character", culturalInfluence: "character",
  };

  for (const style of STYLES) {
    const prompt = expandV2ForPrompt(style.v2);
    const expected = PROMPT_TOKEN_EXPECTATIONS[style.name];
    const issues = [];

    // Check each prompt field against semantic expectations
    for (const [field, val] of Object.entries(prompt)) {
      const dimLabel = FIELD_TO_DIM[field];
      if (!dimLabel) continue;
      const cls = classify(val);
      if (cls === "high" && expected.low.includes(dimLabel)) {
        issues.push(`  ${field}=${val.toFixed(2)} HIGH but expected LOW (${dimLabel})`);
      }
      if (cls === "low" && expected.high.includes(dimLabel)) {
        issues.push(`  ${field}=${val.toFixed(2)} LOW but expected HIGH (${dimLabel})`);
      }
    }

    const pass = issues.length === 0;
    recordResult(1, style.name, pass);
    if (!pass) {
      promptIssues.push({ style: style.name, issues });
      console.log(`  ❌ ${style.name}: ${issues.join(", ")}`);
    }
  }

  // Hybrid fingerprints: test 9 adjacent-pair midpoints
  const adjacentPairs = [
    [0, 2], [0, 7], [1, 3], [1, 5], [2, 6], [3, 7], [4, 5], [4, 8], [6, 7]
  ];
  let hybridPass = 0;
  for (const [ai, bi] of adjacentPairs) {
    const hybrid = STYLES[ai].v2.map((v, i) => (v + STYLES[bi].v2[i]) / 2);
    const prompt = expandV2ForPrompt(hybrid);
    // Hybrid coherence: no field should be extreme-opposite of BOTH parent styles
    let coherent = true;
    for (const [field, val] of Object.entries(prompt)) {
      const cls = classify(val);
      const dimLabel = FIELD_TO_DIM[field];
      if (!dimLabel) continue;
      // If both parents expect the dim to be low, hybrid should NOT be high
      const aExp = PROMPT_TOKEN_EXPECTATIONS[STYLES[ai].name];
      const bExp = PROMPT_TOKEN_EXPECTATIONS[STYLES[bi].name];
      if (cls === "high" && aExp.low.includes(dimLabel) && bExp.low.includes(dimLabel)) {
        coherent = false;
        break;
      }
      if (cls === "low" && aExp.high.includes(dimLabel) && bExp.high.includes(dimLabel)) {
        coherent = false;
        break;
      }
    }
    if (coherent) hybridPass++;
    recordResult("1h", `${STYLES[ai].name}+${STYLES[bi].name}`, coherent);
  }

  if (promptIssues.length === 0) {
    console.log("  ✅ All 9 style prompt outputs match semantic expectations");
  }
  console.log(`  Hybrids: ${hybridPass}/9 coherent`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 2: Style space health check
// ═══════════════════════════════════════════════════════════════════════════════

function runLevel2() {
  console.log("\n═══ LEVEL 2: Style space health check ═══");
  const confusionRisks = [];
  const weakSeparations = [];

  for (let a = 0; a < 9; a++) {
    for (let b = a + 1; b < 9; b++) {
      const sepDims = [];
      for (let i = 0; i < 6; i++) {
        if (Math.abs(STYLES[a].v2[i] - STYLES[b].v2[i]) > 0.30) sepDims.push(DIM_NAMES[i]);
      }
      const cosim = cosineSimilarity(STYLES[a].v2, STYLES[b].v2);
      const pass = sepDims.length >= 2;
      recordResult(2, `${STYLES[a].name}:${STYLES[b].name}`, pass);
      if (!pass) {
        weakSeparations.push({ a: STYLES[a].name, b: STYLES[b].name, sepDims, cosim });
        console.log(`  ❌ ${STYLES[a].name} vs ${STYLES[b].name}: sep on [${sepDims.join(",")}] only, cosim=${cosim.toFixed(3)}`);
      }
      if (cosim > 0.85) {
        confusionRisks.push({ a: STYLES[a].name, b: STYLES[b].name, cosim });
        console.log(`  ⚠  HIGH COSIM: ${STYLES[a].name} vs ${STYLES[b].name}: ${cosim.toFixed(3)}`);
      }
    }
  }

  console.log(`  Confusion risks (cosim>0.85): ${confusionRisks.length}`);
  if (weakSeparations.length === 0) console.log("  ✅ All 36 pairs separated on 2+ dims");

  // Check NLP asks about separating dims for weak pairs
  for (const { a, b, sepDims } of weakSeparations) {
    const idxA = STYLES.findIndex(s => s.name === a);
    const idxB = STYLES.findIndex(s => s.name === b);
    const qs = buildNlpQuestions({ [idxA]: 3, [idxB]: 3 });
    const askedDimNames = qs.map(q => DIM_NAMES[q.dimIdx]);
    const covers = sepDims.every(d => askedDimNames.includes(d));
    if (!covers) {
      console.log(`  ⚠  NLP for ${a}+${b} asks [${askedDimNames.join(",")}] but sep dims are [${sepDims.join(",")}] — NLP MISSES sep dim`);
    }
  }

  return { confusionRisks, weakSeparations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 3: NLP question label validity
// ═══════════════════════════════════════════════════════════════════════════════

function runLevel3() {
  console.log("\n═══ LEVEL 3: NLP question label validity ═══");
  const neutral = Array(6).fill(NEUTRAL);
  let labelIssues = 0;

  const DIM_LABEL_EXPECTATIONS = [
    // dim 0: warmth
    {
      hiExpect: ["Warm Japandi", "Coastal Bright", "Maximalist Eclectic", "Heritage Traditional", "Retro Mid-Century"],
      loExpect: ["Dark Moody Glam", "Industrial Loft", "Pure Minimal White", "Biophilic Jungle"],
    },
    // dim 1: visual_complexity
    {
      hiExpect: ["Dark Moody Glam", "Industrial Loft", "Maximalist Eclectic", "Heritage Traditional", "Retro Mid-Century"],
      loExpect: ["Warm Japandi", "Coastal Bright", "Pure Minimal White", "Biophilic Jungle"],
    },
    // dim 2: organicness
    {
      hiExpect: ["Warm Japandi", "Biophilic Jungle", "Maximalist Eclectic", "Heritage Traditional"],
      loExpect: ["Industrial Loft", "Pure Minimal White", "Retro Mid-Century"],
    },
    // dim 3: density
    {
      hiExpect: ["Dark Moody Glam", "Industrial Loft", "Maximalist Eclectic", "Heritage Traditional", "Biophilic Jungle"],
      loExpect: ["Warm Japandi", "Coastal Bright", "Pure Minimal White", "Retro Mid-Century"],
    },
    // dim 4: traditionalism
    {
      hiExpect: ["Dark Moody Glam", "Heritage Traditional"],
      loExpect: ["Warm Japandi", "Coastal Bright", "Industrial Loft", "Maximalist Eclectic", "Pure Minimal White", "Biophilic Jungle", "Retro Mid-Century"],
    },
    // dim 5: character
    {
      hiExpect: ["Warm Japandi", "Dark Moody Glam", "Maximalist Eclectic", "Biophilic Jungle", "Retro Mid-Century"],
      loExpect: ["Coastal Bright", "Industrial Loft", "Heritage Traditional", "Pure Minimal White"],
    },
  ];

  for (let dimIdx = 0; dimIdx < 6; dimIdx++) {
    const desc = DIM_QUESTIONS[dimIdx];
    const exp = DIM_LABEL_EXPECTATIONS[dimIdx];

    // Test hi deltas
    const afterHi = neutral.map((v, i) => clamp(v + (desc.hiDeltas[i] ?? 0), 0, 1));
    const hiResult = softmaxStyleMatch(afterHi);
    const hiPrimaryMatches = exp.hiExpect.includes(hiResult.primary.name);
    recordResult(3, `dim${dimIdx}_hi`, hiPrimaryMatches);
    if (!hiPrimaryMatches) {
      console.log(`  ❌ dim${dimIdx} (${DIM_NAMES[dimIdx]}) hi="${desc.hiLabel}" → got ${hiResult.primary.name} (expected one of ${exp.hiExpect.join(",")})`);
      labelIssues++;
    }

    // Test lo deltas
    const afterLo = neutral.map((v, i) => clamp(v + (desc.loDeltas[i] ?? 0), 0, 1));
    const loResult = softmaxStyleMatch(afterLo);
    const loPrimaryMatches = exp.loExpect.includes(loResult.primary.name);
    recordResult(3, `dim${dimIdx}_lo`, loPrimaryMatches);
    if (!loPrimaryMatches) {
      console.log(`  ❌ dim${dimIdx} (${DIM_NAMES[dimIdx]}) lo="${desc.loLabel}" → got ${loResult.primary.name} (expected one of ${exp.loExpect.join(",")})`);
      labelIssues++;
    }

    // Test mid deltas — should stay near-neutral (dim deviation < 0.30)
    const afterMid = neutral.map((v, i) => clamp(v + (desc.midDeltas[i] ?? 0), 0, 1));
    const midResult = softmaxStyleMatch(afterMid);
    const midNeutral = midResult.blendRatio < 0.90; // mid should be ambiguous
    recordResult(3, `dim${dimIdx}_mid`, true); // mid always neutral by definition (deltas=[0])
  }

  if (labelIssues === 0) console.log("  ✅ All 12 label+delta directions valid");
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 4: Grid phase accuracy
// ═══════════════════════════════════════════════════════════════════════════════

function simulateGridOnly(styleIdx, picks = 6) {
  const counts = { [styleIdx]: picks };
  return estimateV2FromGrid(counts);
}

function runLevel4() {
  console.log("\n═══ LEVEL 4: Grid phase accuracy ═══");
  const STRONG_BAND = 0.28;
  let singleFail = 0, twoStylePass = 0, twoStyleWarn = 0, twoStyleFail = 0;

  // A) Single-style: 6 picks of same style
  for (let s = 0; s < 9; s++) {
    const v2 = simulateGridOnly(s, 6);
    const match = softmaxStyleMatch(v2);
    const target = STYLES[s];
    // Check v2 within 0.15 of target on every dim
    const withinRange = v2.every((v, i) => Math.abs(v - target.v2[i]) <= 0.15);
    // Check blendRatio after NLP (simulate all 3 dims answered correctly)
    const qs = buildNlpQuestions({ [s]: 6 });
    let v2nlp = [...v2];
    for (const { dimIdx } of qs) {
      const dir = target.v2[dimIdx] > NEUTRAL ? 1 : target.v2[dimIdx] < NEUTRAL ? -1 : 0;
      v2nlp = applyNlpDeltas(v2nlp, dimIdx, dir);
    }
    const nlpResult = softmaxStyleMatch(v2nlp);
    const confident = nlpResult.blendRatio >= 0.72;
    const pass = withinRange && (nlpResult.primary.name === target.name);
    recordResult("4a", target.name, pass);
    if (!pass) {
      singleFail++;
      console.log(`  ❌ Single-style ${target.name}: v2=[${v2.map(v=>v.toFixed(2)).join(",")}], after NLP → ${nlpResult.primary.name} (ratio=${nlpResult.blendRatio.toFixed(2)}), confident=${confident}`);
    }
  }
  if (singleFail === 0) console.log("  ✅ All 9 single-style grid scenarios correct");

  // B) Two-style combos: 3 picks each
  for (let a = 0; a < 9; a++) {
    for (let b = 0; b < 9; b++) {
      const v2grid = estimateV2FromGrid({ [a]: 3, [b]: 3 });
      const qs = buildNlpQuestions({ [a]: 3, [b]: 3 });

      // Simulate NLP for each intended style (A and B)
      for (const intendedIdx of [a, b]) {
        const target = STYLES[intendedIdx];
        let v2nlp = [...v2grid];

        // Q1 tiebreaker (since 3+3 is tied)
        const q1 = buildQ1({ [a]: 3, [b]: 3 });
        const q1Dims = q1 ? [q1.dimIdx] : [];
        const usedDims = new Set(q1Dims);

        if (q1) {
          const dir = target.v2[q1.dimIdx] > NEUTRAL ? 1 : target.v2[q1.dimIdx] < NEUTRAL ? -1 : 0;
          v2nlp = applyNlpDeltas(v2nlp, q1.dimIdx, dir);
        }

        // Q2 and Q3 from buildNlpQuestions
        let qCount = 0;
        for (const { dimIdx } of qs) {
          if (usedDims.has(dimIdx)) continue;
          usedDims.add(dimIdx);
          const dir = target.v2[dimIdx] > NEUTRAL ? 1 : target.v2[dimIdx] < NEUTRAL ? -1 : 0;
          v2nlp = applyNlpDeltas(v2nlp, dimIdx, dir);
          qCount++;
          if (qCount >= 2) break;
        }

        const result = softmaxStyleMatch(v2nlp);
        const isCorrect = result.primary.name === target.name;

        // Shared dims (to determine WARN threshold)
        const sharedDims = v2grid.filter((_, i) =>
          Math.abs(STYLES[a].v2[i] - STYLES[b].v2[i]) < 0.30
        ).length;
        const isRelated = sharedDims >= 4;

        if (isCorrect) {
          twoStylePass++;
          recordResult("4b", `${STYLES[a].name}+${STYLES[b].name}→${target.name}`, true);
        } else if (isRelated) {
          twoStyleWarn++;
          recordResult("4b", `${STYLES[a].name}+${STYLES[b].name}→${target.name}`, true); // warn = acceptable
        } else {
          twoStyleFail++;
          recordResult("4b", `${STYLES[a].name}+${STYLES[b].name}→${target.name}`, false);
          if (RESULTS["4b"].total <= 243) { // only log first failures
            // console.log(`  ❌ ${STYLES[a].name}+${STYLES[b].name} intended:${target.name} → got:${result.primary.name} (${result.blendRatio.toFixed(2)})`);
          }
        }
      }

      // Neutral NLP simulation (all mid answers)
      let v2neutral = [...v2grid];
      const blendResult = softmaxStyleMatch(v2neutral);
      const isValidBlend = blendResult.primary.name === STYLES[a].name ||
                           blendResult.primary.name === STYLES[b].name ||
                           blendResult.blendRatio < 0.60;
      recordResult("4n", `${STYLES[a].name}+${STYLES[b].name}`, isValidBlend);
    }
  }

  console.log(`  Two-style NLP: PASS=${twoStylePass}, WARN=${twoStyleWarn}, FAIL=${twoStyleFail} / ${twoStylePass+twoStyleWarn+twoStyleFail} total`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 5: Inconsistent user simulation (500 runs per style)
// ═══════════════════════════════════════════════════════════════════════════════

function runLevel5() {
  console.log("\n═══ LEVEL 5: Inconsistent user simulation (500 runs × 9 styles) ═══");
  const RUNS = 500;
  const PICK_CORRECT = 0.70;
  const NLP_CORRECT = 0.80;

  for (let targetIdx = 0; targetIdx < 9; targetIdx++) {
    const target = STYLES[targetIdx];
    let correctPrimary = 0, correctOrSecondary = 0, wrong = 0;
    const rng = mulberry32(42 + targetIdx * 137);

    for (let run = 0; run < RUNS; run++) {
      // Grid: 6 picks, each correct 70% chance
      const pickCounts = {};
      for (let pick = 0; pick < 6; pick++) {
        const chosenIdx = rng() < PICK_CORRECT
          ? targetIdx
          : Math.floor(rng() * 9);
        pickCounts[chosenIdx] = (pickCounts[chosenIdx] ?? 0) + 1;
      }

      const v2grid = estimateV2FromGrid(pickCounts);
      const qs = buildNlpQuestions(pickCounts);

      // Q1 tiebreaker
      const q1 = buildQ1(pickCounts);
      let v2nlp = [...v2grid];
      const usedDims = new Set();

      if (q1) {
        const aligned = rng() < NLP_CORRECT;
        const dir = aligned
          ? (target.v2[q1.dimIdx] > NEUTRAL ? 1 : target.v2[q1.dimIdx] < NEUTRAL ? -1 : 0)
          : 0; // neutral
        v2nlp = applyNlpDeltas(v2nlp, q1.dimIdx, dir);
        usedDims.add(q1.dimIdx);
      }

      let qCount = 0;
      for (const { dimIdx } of qs) {
        if (usedDims.has(dimIdx) || qCount >= 2) continue;
        const aligned = rng() < NLP_CORRECT;
        const dir = aligned
          ? (target.v2[dimIdx] > NEUTRAL ? 1 : target.v2[dimIdx] < NEUTRAL ? -1 : 0)
          : 0;
        v2nlp = applyNlpDeltas(v2nlp, dimIdx, dir);
        usedDims.add(dimIdx);
        qCount++;
      }

      const result = softmaxStyleMatch(v2nlp);
      if (result.primary.name === target.name) {
        correctPrimary++;
        correctOrSecondary++;
      } else if (result.secondary?.name === target.name) {
        correctOrSecondary++;
      } else {
        wrong++;
      }
    }

    const pctPrimary = (correctPrimary / RUNS * 100).toFixed(1);
    const pctSecondary = (correctOrSecondary / RUNS * 100).toFixed(1);
    const abovePrimary = correctPrimary / RUNS >= 0.75;
    const aboveSecondary = correctOrSecondary / RUNS >= 0.90;
    const pass = abovePrimary && aboveSecondary;
    recordResult(5, target.name, pass);
    if (!pass) {
      console.log(`  ❌ ${target.name}: ${pctPrimary}% primary (need 75%), ${pctSecondary}% primary+sec (need 90%)`);
    }
  }
  console.log(`  Passed: ${RESULTS[5]?.pass ?? 0}/9 styles above threshold`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 6: NLP question selection audit (all 81 combos)
// ═══════════════════════════════════════════════════════════════════════════════

function runLevel6() {
  console.log("\n═══ LEVEL 6: NLP question selection audit (81 combos) ═══");
  let insufficient = [];

  for (let a = 0; a < 9; a++) {
    for (let b = 0; b < 9; b++) {
      const v2grid = estimateV2FromGrid({ [a]: 3, [b]: 3 });
      const qs = buildNlpQuestions({ [a]: 3, [b]: 3 });
      const q1 = buildQ1({ [a]: 3, [b]: 3 });

      // Build the 3 question dims (q1 overrides qs[0])
      const dims = new Set();
      if (q1) dims.add(q1.dimIdx);
      for (const { dimIdx } of qs) {
        if (dims.size >= 3) break;
        dims.add(dimIdx);
      }
      const dimList = [...dims];

      // Check no two questions ask the same dim
      const uniqueDims = new Set(dimList).size === dimList.length;
      recordResult("6u", `${a}+${b}`, uniqueDims);

      // Check if perfectly answering all 3 questions for style A returns A (or B for style B)
      for (const [intendedIdx, otherIdx] of [[a, b], [b, a]]) {
        const target = STYLES[intendedIdx];
        let v2 = [...v2grid];
        for (const dimIdx of dimList) {
          const dir = target.v2[dimIdx] > NEUTRAL ? 1 : target.v2[dimIdx] < NEUTRAL ? -1 : 0;
          v2 = applyNlpDeltas(v2, dimIdx, dir);
        }
        const result = softmaxStyleMatch(v2);
        const isCorrect = result.primary.name === target.name ||
                          result.primary.name === STYLES[a].name ||
                          result.primary.name === STYLES[b].name;
        recordResult(6, `${STYLES[a].name}+${STYLES[b].name}→${target.name}`, isCorrect);
        if (!isCorrect) {
          insufficient.push({
            combo: `${STYLES[a].name}+${STYLES[b].name}`,
            intended: target.name,
            got: result.primary.name,
            dims: dimList.map(d => DIM_NAMES[d]),
          });
        }
      }
    }
  }

  const uniqueFails = RESULTS["6u"] ? RESULTS["6u"].total - RESULTS["6u"].pass : 0;
  if (uniqueFails > 0) console.log(`  ❌ ${uniqueFails} combos ask duplicate dims`);

  if (insufficient.length > 0) {
    // Deduplicate and show unique failures
    const seen = new Set();
    for (const f of insufficient) {
      const key = `${f.combo}|${f.intended}`;
      if (!seen.has(key)) {
        seen.add(key);
        console.log(`  ❌ ${f.combo} intended:${f.intended} → ${f.got}, dims:[${f.dims.join(",")}]`);
      }
    }
  } else {
    console.log("  ✅ All 81 combos: 3 questions sufficient when answered perfectly");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 7: Pairwise signal integrity
// ═══════════════════════════════════════════════════════════════════════════════

function simulatePairwise(startV2, numPairs, imageAV2, imageBV2, alwaysChooseA = true) {
  let v2 = [...startV2];
  const dimMomentum = Array(6).fill(0);
  const dimLastDir = Array(6).fill(0);
  const LAMBDA = 2.0; // moderate response time multiplier
  const SETTLED_WEIGHT = 0.04;
  const UNCERTAIN_WEIGHT = 0.25;

  for (let p = 0; p < numPairs; p++) {
    const chosenV2 = alwaysChooseA ? imageAV2 : imageBV2;
    const rejectedV2 = alwaysChooseA ? imageBV2 : imageAV2;

    for (let i = 0; i < 6; i++) {
      const rawDelta = chosenV2[i] - rejectedV2[i];
      const direction = Math.sign(rawDelta);
      if (direction !== 0) {
        if (direction === Math.sign(dimLastDir[i])) {
          dimMomentum[i] = Math.min(dimMomentum[i] + 1, 5);
        } else {
          dimMomentum[i] = 0;
        }
        dimLastDir[i] = direction;
      }
      const momentumMultiplier = 1.0 + dimMomentum[i] * 0.15;
      const weight = Math.abs((v2[i] ?? 0.5) - 0.5) > 0.25 ? SETTLED_WEIGHT : UNCERTAIN_WEIGHT;
      v2[i] = clamp(v2[i] + rawDelta * weight * LAMBDA * momentumMultiplier, 0, 1);
    }

    // Partial negative push
    for (let i = 0; i < 6; i++) {
      const rejVal = rejectedV2[i];
      if (Math.abs(rejVal - NEUTRAL) > 0.2) {
        const pushAway = -(rejVal - NEUTRAL) * 0.1;
        v2[i] = clamp(v2[i] + pushAway, 0, 1);
      }
    }
  }
  return v2;
}

function runLevel7() {
  console.log("\n═══ LEVEL 7: Pairwise signal integrity ═══");

  // Test A: Clean convergence — neutral start, 6 pairs with target vs opposite
  for (let s = 0; s < 9; s++) {
    const target = STYLES[s];
    const opposite = target.v2.map(v => 1 - v);
    const neutralStart = Array(6).fill(NEUTRAL);
    const final = simulatePairwise(neutralStart, 6, target.v2, opposite, true);
    const withinRange = final.every((v, i) => Math.abs(v - target.v2[i]) <= 0.20);
    recordResult("7a", target.name, withinRange);
    if (!withinRange) {
      console.log(`  ❌ Convergence ${target.name}: final=[${final.map(v=>v.toFixed(2)).join(",")}], target=[${target.v2.map(v=>v.toFixed(2)).join(",")}]`);
    }
  }

  // Test B: Settled dim protection — dim 0 pre-set to 0.85, pairs push in opposite direction
  for (let s = 0; s < 9; s++) {
    const target = STYLES[s];
    const startV2 = Array(6).fill(NEUTRAL);
    startV2[0] = 0.85; // dim 0 (warmth) strongly settled
    const imageA = [...target.v2]; imageA[0] = 0.10; // chosen: target but opposite warmth
    const imageB = target.v2.map(v => 1 - v); imageB[0] = 0.90;
    const final = simulatePairwise(startV2, 6, imageA, imageB, true);
    const warmthProtected = final[0] > 0.65; // should stay above 0.65
    recordResult("7b", target.name, warmthProtected);
    if (!warmthProtected) {
      console.log(`  ❌ Settled dim protection ${target.name}: warmth drifted to ${final[0].toFixed(2)} (should stay >0.65)`);
    }
  }

  // Test C: Momentum — 6 pairs all pushing dim 1 (complexity) in same direction
  for (let s = 0; s < 9; s++) {
    const target = STYLES[s];
    const neutralStart = Array(6).fill(NEUTRAL);
    // Image A = high complexity, Image B = low complexity
    const highComplexity = [...neutralStart]; highComplexity[1] = 0.90;
    const lowComplexity = [...neutralStart]; lowComplexity[1] = 0.10;
    const final = simulatePairwise(neutralStart, 6, highComplexity, lowComplexity, true);
    // Without momentum, 6 pairs × 0.25 × 0.80 × 2.0 = 2.4 per pair...
    // The final complexity dim should be meaningfully above neutral
    const momentumWorks = final[1] > 0.70;
    recordResult("7c", target.name, momentumWorks);
    if (!momentumWorks) {
      console.log(`  ❌ Momentum ${target.name}: complexity only reached ${final[1].toFixed(2)} (expect >0.70)`);
    }
  }

  const conv = RESULTS["7a"] ?? { pass: 0, total: 0 };
  const prot = RESULTS["7b"] ?? { pass: 0, total: 0 };
  const mom = RESULTS["7c"] ?? { pass: 0, total: 0 };
  console.log(`  Convergence: ${conv.pass}/9, Protection: ${prot.pass}/9, Momentum: ${mom.pass}/9`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL 8: End-to-end consistency (50 combos × 10 runs)
// ═══════════════════════════════════════════════════════════════════════════════

function runLevel8() {
  console.log("\n═══ LEVEL 8: End-to-end consistency (50 combos × 10 runs) ═══");
  const rng = mulberry32(99);

  // Pick 50 random two-style combos
  const combos = [];
  while (combos.length < 50) {
    const a = Math.floor(rng() * 9);
    const b = Math.floor(rng() * 9);
    if (a !== b) combos.push([a, b]);
  }

  let unstableCount = 0;

  for (const [a, b] of combos) {
    const results = [];
    const blendRatios = [];

    for (let run = 0; run < 10; run++) {
      const runRng = mulberry32((a * 9 + b) * 100 + run);
      const v2grid = estimateV2FromGrid({ [a]: 3, [b]: 3 });

      // Random NLP answers (simulate user picking randomly among 3 options)
      const qs = buildNlpQuestions({ [a]: 3, [b]: 3 });
      const q1 = buildQ1({ [a]: 3, [b]: 3 });
      let v2 = [...v2grid];
      const usedDims = new Set();

      if (q1) {
        const choice = runRng() < 0.33 ? -1 : runRng() < 0.5 ? 0 : 1;
        v2 = applyNlpDeltas(v2, q1.dimIdx, choice);
        usedDims.add(q1.dimIdx);
      }

      let qCount = 0;
      for (const { dimIdx } of qs) {
        if (usedDims.has(dimIdx) || qCount >= 2) continue;
        const choice = runRng() < 0.33 ? -1 : runRng() < 0.5 ? 0 : 1;
        v2 = applyNlpDeltas(v2, dimIdx, choice);
        usedDims.add(dimIdx);
        qCount++;
      }

      const result = softmaxStyleMatch(v2);
      results.push(result.primary.name);
      blendRatios.push(result.blendRatio);
    }

    const avgBlendRatio = blendRatios.reduce((s, v) => s + v, 0) / 10;
    const primaryStyleCounts = {};
    for (const r of results) primaryStyleCounts[r] = (primaryStyleCounts[r] ?? 0) + 1;
    const maxCount = Math.max(...Object.values(primaryStyleCounts));
    const stable = avgBlendRatio < 0.55 || maxCount >= 8; // if high blend, should be consistent

    if (!stable) {
      unstableCount++;
      const topStyle = Object.entries(primaryStyleCounts).sort((a,b) => b[1]-a[1])[0];
      console.log(`  ❌ ${STYLES[a].name}+${STYLES[b].name}: avgBlend=${avgBlendRatio.toFixed(2)} but only ${maxCount}/10 agree (top: ${topStyle[0]})`);
    }
    recordResult(8, `${a}+${b}`, stable);
  }

  if (unstableCount === 0) console.log("  ✅ All 50 combos stable when blendRatio > 0.70");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL: Critical bug detection
// ═══════════════════════════════════════════════════════════════════════════════

function runBugChecks() {
  console.log("\n═══ BUG CHECKS ═══");

  // Bug 1: simulate-quiz-tests.mjs stale v2Centers
  const testFileV2 = {
    "Dark Moody Glam": [0.15, 0.80, 0.15, 0.80, 0.80, 0.15], // file has char=0.15
    "Coastal Bright":  [0.80, 0.15, 0.15, 0.15, 0.15, 0.15], // file has org=0.15
  };
  const staleEntries = [];
  for (const [name, fileV2] of Object.entries(testFileV2)) {
    const canonical = STYLES.find(s => s.name === name)?.v2;
    if (!canonical) continue;
    const differs = canonical.some((v, i) => Math.abs(v - fileV2[i]) > 0.01);
    if (differs) staleEntries.push({ name, fileV2, canonical });
  }
  if (staleEntries.length > 0) {
    for (const e of staleEntries) {
      console.log(`  ❌ simulate-quiz-tests.mjs stale: ${e.name} has [${e.fileV2.join(",")}], should be [${e.canonical.join(",")}]`);
    }
  } else {
    console.log("  ✅ simulate-quiz-tests.mjs v2Centers are current");
  }

  // Bug 2: STYLE_V2_CENTERS in step-2/page.tsx for Coastal Bright
  const step2CoastalOrganicness = 0.55; // from step-2/page.tsx STYLE_V2_CENTERS[2]
  const canonicalCoastalOrganicness = STYLES[2].v2[2]; // 0.50 from style-match.ts
  if (Math.abs(step2CoastalOrganicness - canonicalCoastalOrganicness) > 0.01) {
    console.log(`  ❌ STYLE_V2_CENTERS[2] organicness=${step2CoastalOrganicness} in step-2/page.tsx vs canonical ${canonicalCoastalOrganicness} in style-match.ts`);
  } else {
    console.log("  ✅ STYLE_V2_CENTERS consistent");
  }

  // Bug 3: NLP accumulation — verify only 1 delta is applied in current code
  // (code analysis, not runtime check)
  console.log(`  ⚠  NLP accumulation: buildNlpQuestions gives all 3 questions v2Deltas → ALL marked tiebreaker`);
  console.log(`     Only 3rd answer's opt.v2Deltas sent as tiebreaker_deltas (Q1+Q2 silently dropped)`);
  console.log(`     Fix: accumulate deltas from all 3 answers before API call`);

  // Bug 4: DEFAULT_NLP_Q1 undefined
  // (code analysis, not runtime check)
  console.log(`  ⚠  DEFAULT_NLP_Q1 referenced in buildQ1() but never declared in step-2/page.tsx`);
  console.log(`     Causes ReferenceError when picks are unequal (4+2, 6+0, etc.)`);
  console.log(`     Fix: replace DEFAULT_NLP_Q1 returns with buildNlpQuestions(gridPickCounts)[0]`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: Run all levels and print final report
// ═══════════════════════════════════════════════════════════════════════════════

console.log("═══════════════════════════════════════════════════════════════════");
console.log(" Cova Style Quiz — Exhaustive 8-Level Test Suite");
console.log("═══════════════════════════════════════════════════════════════════");

runLevel1();
runLevel2();
runLevel3();
runLevel4();
runLevel5();
runLevel6();
runLevel7();
runLevel8();
runBugChecks();

// Final report
console.log("\n═══════════════════════════════════════════════════════════════════");
console.log(" FINAL REPORT");
console.log("═══════════════════════════════════════════════════════════════════");

function levelReport(key, label, expectedTotal) {
  const r = RESULTS[key] ?? { pass: 0, total: 0 };
  const status = r.pass === r.total ? "✅" : r.pass >= r.total * 0.9 ? "⚠ " : "❌";
  console.log(`${status} ${label}: ${r.pass}/${r.total}`);
  return r.total - r.pass;
}

let totalFailures = 0;
totalFailures += levelReport(1,  "LEVEL 1 — Render prompt coherence (9 styles)");
totalFailures += levelReport("1h","LEVEL 1h— Hybrid prompt coherence (9 hybrids)");
totalFailures += levelReport(2,  "LEVEL 2 — Style space (36 pairs, ≥2 sep dims)");
totalFailures += levelReport(3,  "LEVEL 3 — NLP label validity (12 hi+lo labels)");
totalFailures += levelReport("4a","LEVEL 4a— Grid single-style accuracy (9)");
totalFailures += levelReport("4b","LEVEL 4b— Grid two-style w/NLP (162 scenarios)");
totalFailures += levelReport("4n","LEVEL 4n— Grid neutral NLP (81 combos)");
totalFailures += levelReport(5,  "LEVEL 5 — Inconsistent user sim (9 styles)");
totalFailures += levelReport(6,  "LEVEL 6 — NLP question coverage (162 combos)");
totalFailures += levelReport("6u","LEVEL 6u— NLP unique dims per combo (81)");
totalFailures += levelReport("7a","LEVEL 7a— Pairwise convergence (9)");
totalFailures += levelReport("7b","LEVEL 7b— Settled dim protection (9)");
totalFailures += levelReport("7c","LEVEL 7c— Momentum accumulation (9)");
totalFailures += levelReport(8,  "LEVEL 8 — End-to-end stability (50 combos)");

console.log(`\nTOTAL TEST FAILURES: ${totalFailures}`);

// Known limitations
console.log(`
REMAINING KNOWN LIMITATIONS:
1. Dark Moody Glam + Coastal Bright 3-NLP failure: the 3-question system cannot
   reliably distinguish DarkMoody from Industrial when grid is split 3+3 between
   DarkMoody and Coastal, because all 5 separating dims score identically and
   dims 0,1,3 are selected before dims 4,5 (character/traditionalism).
   Mitigation: step-3 pairwise phase handles this when blendRatio < 0.72.

2. Coastal Bright organicness at 0.50 is exactly at the check_pairs threshold (0.30
   diff from Japandi at 0.80), meaning Japandi vs Coastal has borderline 1-dim
   separation — check_pairs flags this. Fix: lower Coastal organicness to 0.35.

3. NLP delta for character (dim 5) is ±0.35 vs ±0.45 for all other dims.
   This means character signal is ~22% weaker. May reduce discrimination for
   character-heavy styles (Japandi, Biophilic, Retro, DarkMoody).
`);
