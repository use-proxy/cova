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

function simulateGrid(a, b) {
  const v2 = Array(6).fill(NEUTRAL);
  const entries = [{ center: STYLES[a].v2Center, count: 3 }, { center: STYLES[b].v2Center, count: 3 }];
  for (let d = 0; d < 6; d++) {
    let wSum = 0, wTotal = 0;
    for (const { center, count } of entries) {
      const dev = center[d] - NEUTRAL;
      const sig = Math.abs(dev) * (count / 6);
      wSum += dev * sig; wTotal += sig;
    }
    v2[d] = wTotal < 0.01 ? NEUTRAL : clamp(NEUTRAL + wSum / wTotal, 0, 1);
  }
  return v2;
}

function getMostConflictedDim(a, b) {
  let bestDim = -1, bestMag = 0;
  for (let i = 0; i < 6; i++) {
    const devA = STYLES[a].v2Center[i] - NEUTRAL;
    const devB = STYLES[b].v2Center[i] - NEUTRAL;
    if (Math.abs(devA) >= 0.25 && Math.abs(devB) >= 0.25 && Math.sign(devA) !== Math.sign(devB)) {
      const mag = Math.abs(devA) + Math.abs(devB);
      if (mag > bestMag) { bestMag = mag; bestDim = i; }
    }
  }
  return bestDim;
}

function getUncertainDims(v2, exclude = []) {
  return Array.from({ length: 6 }, (_, i) => ({
    dim: i, uncertainty: 1 - Math.abs((v2[i] ?? NEUTRAL) - NEUTRAL) * 2,
  })).filter(x => !exclude.includes(x.dim)).sort((a, b) => b.uncertainty - a.uncertainty).map(x => x.dim);
}

function matchStyle(v2) {
  const T = 4.5;
  const centered = v2.map(v => v - NEUTRAL);
  const sims = STYLES.map(s => {
    const sc = s.v2Center.map(v => v - NEUTRAL);
    let dot = 0, fpN = 0, sN = 0;
    for (let i = 0; i < 6; i++) { dot += centered[i]*sc[i]; fpN += centered[i]**2; sN += sc[i]**2; }
    return fpN === 0 || sN === 0 ? 0 : dot / (Math.sqrt(fpN) * Math.sqrt(sN));
  });
  const exps = sims.map(s => Math.exp(s * T));
  const sum = exps.reduce((a, b) => a + b, 0);
  const sorted = exps.map((e, i) => ({ i, w: e/sum })).sort((a, b) => b.w - a.w);
  return { primary: STYLES[sorted[0].i].name, secondary: STYLES[sorted[1].i].name, ratio: sorted[0].w };
}

// Simulate a user who intends style X answering each dim question
// Returns final v2 after all 3 NLP answers
function simulateNlp(v2Start, a, b, intendedStyleIdx) {
  let v2 = [...v2Start];
  const q1Dim = getMostConflictedDim(a, b);
  const dimsUsed = [];

  // Q1: pick the option matching intended style's direction on the conflicted dim
  if (q1Dim !== -1) {
    const intendedVal = STYLES[intendedStyleIdx].v2Center[q1Dim];
    const delta = intendedVal > NEUTRAL ? +0.35 : intendedVal < NEUTRAL ? -0.35 : 0;
    v2[q1Dim] = clamp(v2[q1Dim] + delta, 0, 1);
    dimsUsed.push(q1Dim);
  }

  // Q2, Q3: pick options matching intended style on uncertain dims
  const uncertain = getUncertainDims(v2, dimsUsed);
  for (let q = 0; q < 2; q++) {
    const dim = uncertain[q];
    if (dim === undefined) break;
    const intendedVal = STYLES[intendedStyleIdx].v2Center[dim];
    const delta = intendedVal > NEUTRAL ? +0.35 : intendedVal < NEUTRAL ? -0.35 : 0;
    v2[dim] = clamp(v2[dim] + delta, 0, 1);
    dimsUsed.push(dim);
  }
  return { v2, dimsUsed };
}

// ── Test matrix: for each combo, test user intending A, intending B, intending neither (mid) ──
let totalTests = 0, passed = 0, failed = 0;
const failures = [];

for (let a = 0; a < 9; a++) {
  for (let b = 0; b < 9; b++) {
    const v2Grid = simulateGrid(a, b);

    // Test 1: user intends style A
    {
      const { v2, dimsUsed } = simulateNlp(v2Grid, a, b, a);
      const result = matchStyle(v2);
      totalTests++;
      const ok = result.primary === STYLES[a].name || result.primary === STYLES[b].name;
      if (!ok) { failed++; failures.push({ combo: `${STYLES[a].name} + ${STYLES[b].name}`, intended: STYLES[a].name, got: result.primary, ratio: result.ratio.toFixed(2), v2: v2.map(v=>v.toFixed(2)), dims: dimsUsed }); }
      else if (result.primary !== STYLES[a].name) { console.log(`⚠  [A intends A] ${STYLES[a].name}+${STYLES[b].name} → ${result.primary} (${result.ratio.toFixed(2)})`); passed++; }
      else passed++;
    }

    // Test 2: user intends style B
    {
      const { v2, dimsUsed } = simulateNlp(v2Grid, a, b, b);
      const result = matchStyle(v2);
      totalTests++;
      const ok = result.primary === STYLES[a].name || result.primary === STYLES[b].name;
      if (!ok) { failed++; failures.push({ combo: `${STYLES[a].name} + ${STYLES[b].name}`, intended: STYLES[b].name, got: result.primary, ratio: result.ratio.toFixed(2), v2: v2.map(v=>v.toFixed(2)), dims: dimsUsed }); }
      else if (result.primary !== STYLES[b].name) { console.log(`⚠  [B intends B] ${STYLES[a].name}+${STYLES[b].name} → ${result.primary} (${result.ratio.toFixed(2)})`); passed++; }
      else passed++;
    }
  }
}

console.log(`\n✅ ${passed}/${totalTests} passed  ❌ ${failed}/${totalTests} failed`);
if (failures.length > 0) {
  console.log('\n❌ FAILURES (result was neither A nor B):');
  for (const f of failures) {
    console.log(`  ${f.combo} | intended: ${f.intended} → got: ${f.got} (${f.ratio})`);
    console.log(`    dims asked: [${f.dims.map(d=>DIM_NAMES[d]).join(', ')}]`);
    console.log(`    v2: [${f.v2.join(', ')}]`);
  }
}
