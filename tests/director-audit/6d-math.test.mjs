// 6D Fingerprint Math Validation — Phase 0 Director Audit
//
// Reimplements softmaxStyleMatch (apps/web/lib/ai/style-match.ts) in plain JS
// using the exact V2 anchors + weights + temperature from the source.
//
// Produces numeric output for Deliverable 3 of docs/audit/director.md.

// ── Anchors (copied verbatim from style-match.ts STYLES[].v2Center) ──
const V2_ANCHORS = [
  { name: "Warm Japandi",         center: [0.75, 0.20, 0.80, 0.25, 0.30, 0.70] },
  { name: "Dark Moody Glam",      center: [0.25, 0.75, 0.30, 0.70, 0.65, 0.80] },
  { name: "Coastal Bright",       center: [0.65, 0.20, 0.55, 0.25, 0.25, 0.25] },
  { name: "Industrial Loft",      center: [0.20, 0.65, 0.15, 0.55, 0.35, 0.40] },
  { name: "Maximalist Eclectic",  center: [0.65, 0.90, 0.65, 0.85, 0.30, 0.85] },
  { name: "Heritage Traditional", center: [0.70, 0.70, 0.65, 0.75, 0.90, 0.35] },
  { name: "Pure Minimal White",   center: [0.30, 0.10, 0.25, 0.10, 0.40, 0.15] },
  { name: "Biophilic Jungle",     center: [0.60, 0.40, 0.90, 0.65, 0.20, 0.70] },
  { name: "Retro Mid-Century",    center: [0.70, 0.55, 0.40, 0.50, 0.55, 0.75] },
  { name: "Nordic Scandi",        center: [0.55, 0.15, 0.45, 0.20, 0.25, 0.45] },
];

// V2_DIMENSION_MATCH_WEIGHTS from style-match.ts
const WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9];
const NEUTRAL = 0.5;
const T = 4.5; // temperature from source

const DIM_NAMES = ["warmth", "visual_complexity", "organicness", "density", "traditionalism", "character"];

// ── Ported softmax match (produces weight per anchor) ──
function softmaxMatch(fp) {
  const fpC = fp.map((v) => v - NEUTRAL);
  const rawSims = V2_ANCHORS.map(({ name, center }) => {
    const sC = center.map((v) => v - NEUTRAL);
    let dot = 0, fpN = 0, sN = 0;
    for (let i = 0; i < 6; i++) {
      const w = WEIGHTS[i];
      dot += fpC[i] * sC[i] * w;
      fpN += fpC[i] ** 2 * w;
      sN += sC[i] ** 2 * w;
    }
    const sim = fpN === 0 || sN === 0 ? 0 : dot / (Math.sqrt(fpN) * Math.sqrt(sN));
    return { name, center, sim };
  });
  const expDenSum = rawSims.reduce((acc, s) => acc + Math.exp(Math.max(0, s.sim) * T), 0);
  return rawSims.map((s) => ({
    name: s.name,
    center: s.center,
    similarity: s.sim,
    weight: Math.exp(s.sim * T) / expDenSum,
  }));
}

// Return weight vector (array aligned to V2_ANCHORS order)
function weightVector(fp) {
  return softmaxMatch(fp).map((m) => m.weight);
}

function l2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// ── Seeded PRNG for reproducibility ──
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ──────────────────────────────────────────────────────────────
// Check 3.1 — Continuity
// For each axis i: hold others at 0.5, sweep 0.00..1.00 step 0.01.
// Max delta between adjacent weight vectors should be < threshold.
// ──────────────────────────────────────────────────────────────
function check_continuity() {
  const thresholdOriginal = 0.02;
  const report = { axisResults: [], pass: true, threshold: thresholdOriginal };
  for (let axis = 0; axis < 6; axis++) {
    const deltas = [];
    const samples = [];
    for (let t = 0; t <= 100; t++) {
      const v = t / 100;
      const fp = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      fp[axis] = v;
      samples.push(weightVector(fp));
    }
    for (let k = 1; k < samples.length; k++) {
      deltas.push(l2(samples[k], samples[k - 1]));
    }
    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)];
    const max = deltas[deltas.length - 1];
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const std = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length);
    const outlier3sigma = max > median + 3 * std;
    const axisPass = max < thresholdOriginal;
    report.axisResults.push({
      axis: DIM_NAMES[axis],
      max: Number(max.toFixed(5)),
      median: Number(median.toFixed(5)),
      mean: Number(mean.toFixed(5)),
      std: Number(std.toFixed(5)),
      outlier3sigma,
      pass: axisPass,
    });
    if (!axisPass) report.pass = false;
  }
  return report;
}

// ──────────────────────────────────────────────────────────────
// Check 3.2 — Monotonicity
// For each anchor: identify which side of 0.5 it sits on for each axis,
// sweep axis from opposite extreme toward anchor, holding other axes at 0.5.
// Anchor's weight should change monotonically (increase as we approach it).
// ──────────────────────────────────────────────────────────────
function check_monotonicity() {
  const report = { anchorResults: [], pass: true };
  for (let a = 0; a < V2_ANCHORS.length; a++) {
    const anchor = V2_ANCHORS[a];
    const perAxis = [];
    let anchorPass = true;
    for (let axis = 0; axis < 6; axis++) {
      const side = anchor.center[axis] > 0.5 ? "high" : "low";
      const start = side === "high" ? 0.0 : 1.0;
      const end = side === "high" ? 1.0 : 0.0;
      const steps = 21;
      const weights = [];
      for (let i = 0; i < steps; i++) {
        const v = start + ((end - start) * i) / (steps - 1);
        const fp = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
        fp[axis] = v;
        weights.push(weightVector(fp)[a]);
      }
      // Check monotonic non-decrease (allow epsilon for noise)
      let violations = 0;
      for (let k = 1; k < weights.length; k++) {
        if (weights[k] < weights[k - 1] - 1e-6) violations++;
      }
      // Near-midline anchors (|0.5 - center| < 0.05) are uninformative for this axis
      const near = Math.abs(anchor.center[axis] - 0.5) < 0.05;
      const axisPass = near || violations === 0;
      perAxis.push({
        axis: DIM_NAMES[axis],
        anchorValue: anchor.center[axis],
        side,
        violations,
        near,
        pass: axisPass,
        weightsStartEnd: [Number(weights[0].toFixed(4)), Number(weights[weights.length - 1].toFixed(4))],
      });
      if (!axisPass) anchorPass = false;
    }
    report.anchorResults.push({ anchor: anchor.name, pass: anchorPass, perAxis });
    if (!anchorPass) report.pass = false;
  }
  return report;
}

// ──────────────────────────────────────────────────────────────
// Check 3.3 — Reconstruction (information preservation)
// For N random 6D points: compute weights → reconstruct centroid as
// sum(weight * anchor.center). Measure L2 distance input vs reconstructed.
// ──────────────────────────────────────────────────────────────
function check_reconstruction(n = 1000, seed = 0x12345) {
  const rng = mulberry32(seed);
  const errors = [];
  for (let i = 0; i < n; i++) {
    const fp = [0, 1, 2, 3, 4, 5].map(() => rng());
    const weights = weightVector(fp);
    const recon = [0, 0, 0, 0, 0, 0];
    for (let a = 0; a < V2_ANCHORS.length; a++) {
      for (let d = 0; d < 6; d++) recon[d] += weights[a] * V2_ANCHORS[a].center[d];
    }
    errors.push(l2(fp, recon));
  }
  errors.sort((a, b) => a - b);
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  const p50 = errors[Math.floor(n * 0.5)];
  const p95 = errors[Math.floor(n * 0.95)];
  const max = errors[n - 1];
  const meanThreshold = 0.10;
  const p95Threshold = 0.15;
  const pass = mean < meanThreshold && p95 < p95Threshold;
  return { n, seed, mean: Number(mean.toFixed(4)), p50: Number(p50.toFixed(4)), p95: Number(p95.toFixed(4)), max: Number(max.toFixed(4)), meanThreshold, p95Threshold, pass };
}

// ──────────────────────────────────────────────────────────────
// Check 3.4 — Anchor coverage
// For 1000 random points: count top-3 appearances per anchor.
// Floor: each anchor appears in ≥30 (3%) of top-3 lists.
// ──────────────────────────────────────────────────────────────
function check_coverage(n = 1000, seed = 0x12345, topN = 3) {
  const rng = mulberry32(seed);
  const counts = V2_ANCHORS.map(() => 0);
  for (let i = 0; i < n; i++) {
    const fp = [0, 1, 2, 3, 4, 5].map(() => rng());
    const w = weightVector(fp);
    const idx = w.map((v, j) => ({ v, j })).sort((a, b) => b.v - a.v).slice(0, topN);
    for (const { j } of idx) counts[j]++;
  }
  const floor = Math.floor(n * 0.03);
  const perAnchor = counts.map((c, i) => ({
    anchor: V2_ANCHORS[i].name,
    topNCount: c,
    fraction: c / n,
    pass: c >= floor,
  }));
  const pass = perAnchor.every((p) => p.pass);
  return { n, seed, topN, floor, perAnchor, pass };
}

// ── Run all checks ──
const out = {
  timestamp: new Date().toISOString(),
  source_function: "softmaxStyleMatch in apps/web/lib/ai/style-match.ts",
  anchor_source: "STYLES[].v2Center (10 anchors, 6 dimensions)",
  parameters: { temperature_T: T, weights: WEIGHTS, neutral_midpoint: NEUTRAL },
  check_3_1_continuity: check_continuity(),
  check_3_2_monotonicity: check_monotonicity(),
  check_3_3_reconstruction: check_reconstruction(1000, 0x12345),
  check_3_4_coverage: check_coverage(1000, 0x12345, 3),
};

console.log(JSON.stringify(out, null, 2));
