// Simulates all 9x9=81 style pair combinations through the NLP question builder
// and fingerprint math, checking that the output style makes sense.

import { readFileSync } from 'fs';

// ── Inline the core logic (no imports needed) ─────────────────────────────────

const NEUTRAL = 0.5;
const STYLES = [
  { name: "Warm Japandi",         v2Center: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80] },
  { name: "Dark Moody Glam",      v2Center: [0.15, 0.80, 0.15, 0.80, 0.80, 0.15] },
  { name: "Coastal Bright",       v2Center: [0.80, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: "Industrial Loft",      v2Center: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15] },
  { name: "Maximalist Eclectic",  v2Center: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80] },
  { name: "Heritage Traditional", v2Center: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15] },
  { name: "Pure Minimal White",   v2Center: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: "Biophilic Jungle",     v2Center: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80] },
  { name: "Retro Mid-Century",    v2Center: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80] },
];

const DIM_NAMES = ["warmth","complexity","organicness","density","traditionalism","character"];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Simulate grid phase: 3 picks each of styleA and styleB (6 total)
function simulateGrid(idxA, idxB) {
  const pickCounts = { [idxA]: 3, [idxB]: 3 };
  const v2 = Array(6).fill(NEUTRAL);
  const entries = Object.entries(pickCounts).map(([i, c]) => ({ center: STYLES[Number(i)].v2Center, count: c }));
  const total = 6;
  for (let d = 0; d < 6; d++) {
    let wSum = 0, wTotal = 0;
    for (const { center, count } of entries) {
      const dev = center[d] - NEUTRAL;
      const sig = Math.abs(dev) * (count / total);
      wSum += dev * sig;
      wTotal += sig;
    }
    v2[d] = wTotal < 0.01 ? NEUTRAL : clamp(NEUTRAL + wSum / wTotal, 0, 1);
  }
  return v2;
}

// Find the most conflicted dim between two styles
function getMostConflictedDim(idxA, idxB) {
  const THRESHOLD = 0.25;
  let bestDim = -1, bestMag = 0;
  for (let i = 0; i < 6; i++) {
    const devA = STYLES[idxA].v2Center[i] - NEUTRAL;
    const devB = STYLES[idxB].v2Center[i] - NEUTRAL;
    const bothStrong = Math.abs(devA) >= THRESHOLD && Math.abs(devB) >= THRESHOLD;
    const conflict = Math.sign(devA) !== Math.sign(devB);
    if (bothStrong && conflict) {
      const mag = Math.abs(devA) + Math.abs(devB);
      if (mag > bestMag) { bestMag = mag; bestDim = i; }
    }
  }
  return bestDim;
}

// Find most uncertain dims after grid (for Q2/Q3)
function getUncertainDims(v2, exclude = []) {
  return Array.from({ length: 6 }, (_, i) => ({
    dim: i,
    uncertainty: 1 - Math.abs((v2[i] ?? NEUTRAL) - NEUTRAL) * 2,
  }))
    .filter(x => !exclude.includes(x.dim))
    .sort((a, b) => b.uncertainty - a.uncertainty)
    .map(x => x.dim);
}

// Softmax style match
function matchStyle(v2) {
  const T = 4.5;
  const centered = v2.map(v => v - NEUTRAL);
  const sims = STYLES.map(s => {
    const sc = s.v2Center.map(v => v - NEUTRAL);
    let dot = 0, fpN = 0, sN = 0;
    for (let i = 0; i < 6; i++) {
      dot += centered[i] * sc[i];
      fpN += centered[i] ** 2;
      sN += sc[i] ** 2;
    }
    return fpN === 0 || sN === 0 ? 0 : dot / (Math.sqrt(fpN) * Math.sqrt(sN));
  });
  const exps = sims.map(s => Math.exp(s * T));
  const sum = exps.reduce((a, b) => a + b, 0);
  const weights = exps.map(e => e / sum);
  const best = weights.indexOf(Math.max(...weights));
  const sorted = weights.map((w, i) => ({ i, w })).sort((a, b) => b.w - a.w);
  return {
    primary: STYLES[sorted[0].i].name,
    secondary: STYLES[sorted[1].i].name,
    blendRatio: sorted[0].w,
  };
}

// Apply NLP answers — simulate user picking the option matching their primary style
function applyNlpAnswer(v2, dimIdx, styleIdx) {
  // User picks the option that matches their dominant style's direction
  const styleVal = STYLES[styleIdx].v2Center[dimIdx];
  const delta = styleVal > NEUTRAL ? +0.35 : -0.35;
  const newV2 = [...v2];
  newV2[dimIdx] = clamp(v2[dimIdx] + delta, 0, 1);
  return newV2;
}

// ── Run all 81 combos ─────────────────────────────────────────────────────────
let passed = 0, failed = 0, warnings = 0;
const failures = [];

for (let a = 0; a < 9; a++) {
  for (let b = 0; b < 9; b++) {
    const nameA = STYLES[a].name;
    const nameB = STYLES[b].name;
    const label = `${nameA} + ${nameB}`;

    // 1. Grid phase
    let v2 = simulateGrid(a, b);

    // 2. Q1 — most conflicted dim (tiebreaker)
    const q1Dim = getMostConflictedDim(a, b);
    const q1Question = q1Dim === -1 ? 'default' : DIM_NAMES[q1Dim];

    // Simulate user picks the answer aligned with style A
    if (q1Dim !== -1) v2 = applyNlpAnswer(v2, q1Dim, a);

    // 3. Q2, Q3 — most uncertain remaining dims
    const uncertainAfterQ1 = getUncertainDims(v2, q1Dim === -1 ? [] : [q1Dim]);
    const q2Dim = uncertainAfterQ1[0] ?? -1;
    const q3Dim = uncertainAfterQ1[1] ?? -1;

    if (q2Dim !== -1) v2 = applyNlpAnswer(v2, q2Dim, a);
    if (q3Dim !== -1) v2 = applyNlpAnswer(v2, q3Dim, a);

    // 4. Check result
    const result = matchStyle(v2);
    const expectedPrimary = nameA; // user consistently picked style A

    // Check: is the result either A or B? (both are valid)
    const isAorB = result.primary === nameA || result.primary === nameB;
    const isReasonable = isAorB || result.blendRatio < 0.45; // low confidence = genuinely mixed

    const q1Label = q1Dim === -1 ? 'no-tie' : `Q1=dim${q1Dim}(${DIM_NAMES[q1Dim]})`;
    const q2Label = q2Dim === -1 ? 'none' : `Q2=dim${q2Dim}(${DIM_NAMES[q2Dim]})`;
    const q3Label = q3Dim === -1 ? 'none' : `Q3=dim${q3Dim}(${DIM_NAMES[q3Dim]})`;

    if (!isReasonable) {
      failed++;
      failures.push({
        combo: label,
        questions: `${q1Label} ${q2Label} ${q3Label}`,
        result: result.primary,
        ratio: result.blendRatio.toFixed(2),
        v2: v2.map(v => v.toFixed(2)),
      });
    } else if (result.primary !== nameA) {
      warnings++;
      console.log(`⚠  ${label} → ${result.primary} (ratio: ${result.blendRatio.toFixed(2)}) [${q1Label}]`);
    } else {
      passed++;
    }
  }
}

console.log(`\n✅ Passed: ${passed}/81  ⚠ Warnings (wrong style but A/B): ${warnings}/81  ❌ Failed (neither A nor B): ${failed}/81`);

if (failures.length > 0) {
  console.log('\n❌ FAILURES:');
  for (const f of failures) {
    console.log(`  ${f.combo} → ${f.result} (${f.ratio}) | ${f.questions}`);
    console.log(`    v2: [${f.v2.join(', ')}]`);
  }
}
