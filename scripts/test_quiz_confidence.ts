/**
 * Self-test for Cova style quiz confidence — 8 profiles.
 *
 * Exercises the /api/quiz/fingerprint endpoint with synthetic users that
 * cover the decisive, mixed, hesitant, contradictory, and random cases.
 * Validates that the confidence number and primary style returned by the
 * API fall inside the expected band for each profile.
 *
 * Usage:  npx ts-node scripts/test_quiz_confidence.ts
 * Prereqs:
 *   • Next.js dev server running on http://localhost:3000
 *   • SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as path from "path";

config({
  path: path.join(path.dirname(process.argv[1]!), "..", ".env.local"),
});
config({
  path: path.join(
    path.dirname(process.argv[1]!),
    "..",
    "apps",
    "web",
    ".env.local",
  ),
});

// Mirror of apps/web/lib/ai/style-match.ts STYLES (v2 centres only).
const STYLES = [
  { name: "Warm Japandi", v2Center: [0.75, 0.2, 0.8, 0.25, 0.3, 0.7] },
  { name: "Dark Moody Glam", v2Center: [0.25, 0.75, 0.3, 0.7, 0.65, 0.8] },
  { name: "Coastal Bright", v2Center: [0.65, 0.2, 0.55, 0.25, 0.25, 0.25] },
  { name: "Industrial Loft", v2Center: [0.2, 0.65, 0.15, 0.55, 0.35, 0.4] },
  { name: "Maximalist Eclectic", v2Center: [0.65, 0.9, 0.65, 0.85, 0.3, 0.85] },
  { name: "Heritage Traditional", v2Center: [0.7, 0.7, 0.65, 0.75, 0.9, 0.35] },
  { name: "Pure Minimal White", v2Center: [0.3, 0.1, 0.25, 0.1, 0.4, 0.15] },
  { name: "Biophilic Jungle", v2Center: [0.6, 0.4, 0.9, 0.65, 0.2, 0.7] },
  { name: "Retro Mid-Century", v2Center: [0.7, 0.55, 0.4, 0.5, 0.55, 0.75] },
] as const;

const V2_DIM_COUNT = 6;
const NEUTRAL_MIDPOINT = 0.5;
const V2_DIMENSION_MATCH_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9];
const MAX_PER_V2_DIM = 4;
const TOTAL_RESPONSES = 24;

// Old dim → V2 index mapping (mirrors OLD_DIM_TO_V2 in style-match.ts).
const OLD_DIM_TO_V2_IDX: Record<string, number> = {
  colorTemperature: 0,
  lightPreference: 0,
  colorSaturation: 1,
  pattern: 1,
  material: 2,
  texture: 2,
  nature: 2,
  density: 3,
  formality: 4,
  era: 4,
  lineQuality: 5,
  culturalInfluence: 5,
};

function mergeToV2(v12: Record<string, number>): number[] {
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

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.API_URL ?? "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Types ───────────────────────────────────────────────────────────────────

interface PairRow {
  id: string;
  dimension: string;
  dimension_index: number;
  image_a_stop: number | null;
  image_b_stop: number | null;
  image_a_vector: Record<string, number>;
  image_b_vector: Record<string, number>;
}

interface GridSelection {
  styleIndex: number;
  styleName: string;
  round: number;
}

interface NonVisualResponse {
  questionId: "surfaces" | "materials" | "color";
  choiceIndex: number;
}

interface PairwiseResponse {
  pairId: string;
  chosenSide: "A" | "B" | "skip";
  responseTimeMs: number;
}

type ResponseStrategy =
  | { kind: "target"; target: number[] }
  | {
      kind: "split";
      firstTarget: number[];
      secondTarget: number[];
      splitAt: number;
    }
  | { kind: "alternating" };

interface Profile {
  num: number;
  name: string;
  phase_a_selections: string[];
  grid_selections: GridSelection[];
  non_visual_responses?: NonVisualResponse[];
  strategy: ResponseStrategy;
  responseTimeRange: [number, number];
  expected: {
    primary: string | string[] | null;
    minConfidence: number;
    maxConfidence?: number;
  };
}

// ── Pair loader (uses real pair IDs from the DB) ───────────────────────────

async function loadValidatedPairs(): Promise<PairRow[]> {
  const { data, error } = await supabase
    .from("quiz_comparison_pairs")
    .select(
      "id, dimension, dimension_index, image_a_stop, image_b_stop, image_a_vector, image_b_vector, image_a_url",
    )
    .eq("is_validated", true)
    .ilike("image_a_url", "%new-pairs%")
    .limit(500);
  if (error) throw new Error(`Failed to load pairs: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    dimension: r.dimension,
    dimension_index: r.dimension_index ?? 0,
    image_a_stop: r.image_a_stop ?? null,
    image_b_stop: r.image_b_stop ?? null,
    image_a_vector: r.image_a_vector,
    image_b_vector: r.image_b_vector,
  })) as PairRow[];
}

// ── Response builder ────────────────────────────────────────────────────────

function scoreAgainstTarget(v2: number[], target: number[]): number {
  let s = 0;
  for (let i = 0; i < V2_DIM_COUNT; i++) {
    const w = V2_DIMENSION_MATCH_WEIGHTS[i] ?? 1.0;
    s += w * (v2[i]! - NEUTRAL_MIDPOINT) * (target[i]! - NEUTRAL_MIDPOINT);
  }
  return s;
}

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildResponses(
  pairs: PairRow[],
  profile: Profile,
): PairwiseResponse[] {
  const buckets: PairRow[][] = Array.from({ length: V2_DIM_COUNT }, () => []);
  const ordered = [...pairs].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of ordered) {
    const v2Idx = OLD_DIM_TO_V2_IDX[p.dimension];
    if (v2Idx !== undefined) buckets[v2Idx]!.push(p);
  }

  const rng = makeRng(profile.num * 9973 + 17);
  const [rtMin, rtMax] = profile.responseTimeRange;
  const sampleRt = () => Math.round(rtMin + rng() * (rtMax - rtMin));

  const responses: PairwiseResponse[] = [];
  const taken = Array(V2_DIM_COUNT).fill(0);

  // Round-robin across V2 dims: 4 rounds × 6 dims = 24 responses.
  // This matches the real next-pair selector's per-dim cap.
  for (let round = 0; round < MAX_PER_V2_DIM; round++) {
    for (let d = 0; d < V2_DIM_COUNT; d++) {
      if (responses.length >= TOTAL_RESPONSES) break;
      const bucket = buckets[d]!;
      if (taken[d] >= bucket.length) continue;
      const pair = bucket[taken[d]]!;
      const withinDimIdx = taken[d];
      taken[d] += 1;
      const overallIdx = responses.length;

      const aV2 = mergeToV2(pair.image_a_vector);
      const bV2 = mergeToV2(pair.image_b_vector);

      let chosen: "A" | "B";
      if (profile.strategy.kind === "target") {
        const t = profile.strategy.target;
        chosen =
          scoreAgainstTarget(bV2, t) >= scoreAgainstTarget(aV2, t) ? "B" : "A";
      } else if (profile.strategy.kind === "split") {
        const t =
          overallIdx < profile.strategy.splitAt
            ? profile.strategy.firstTarget
            : profile.strategy.secondTarget;
        chosen =
          scoreAgainstTarget(bV2, t) >= scoreAgainstTarget(aV2, t) ? "B" : "A";
      } else {
        // Alternating A/B WITHIN each dim so every dim sees contradictory
        // swipes — this is what "truly random / no consistent pattern"
        // should look like to the fingerprint engine. Using overallIdx
        // instead would give a perfectly consistent per-dim pattern
        // because round-robin round × dim indices are always the same
        // parity for a fixed dim.
        chosen = withinDimIdx % 2 === 0 ? "A" : "B";
      }

      responses.push({
        pairId: pair.id,
        chosenSide: chosen,
        responseTimeMs: sampleRt(),
      });
    }
  }

  // Fallback — if some V2 dim bucket was empty, fill up to TOTAL_RESPONSES
  // from any unused pair so the request still has 24 responses.
  if (responses.length < TOTAL_RESPONSES) {
    const used = new Set(responses.map((r) => r.pairId));
    for (const p of ordered) {
      if (responses.length >= TOTAL_RESPONSES) break;
      if (used.has(p.id)) continue;
      const aV2 = mergeToV2(p.image_a_vector);
      const bV2 = mergeToV2(p.image_b_vector);
      let chosen: "A" | "B";
      if (profile.strategy.kind === "target") {
        chosen =
          scoreAgainstTarget(bV2, profile.strategy.target) >=
          scoreAgainstTarget(aV2, profile.strategy.target)
            ? "B"
            : "A";
      } else if (profile.strategy.kind === "split") {
        const t =
          responses.length < profile.strategy.splitAt
            ? profile.strategy.firstTarget
            : profile.strategy.secondTarget;
        chosen =
          scoreAgainstTarget(bV2, t) >= scoreAgainstTarget(aV2, t) ? "B" : "A";
      } else {
        chosen = responses.length % 2 === 0 ? "A" : "B";
      }
      responses.push({
        pairId: p.id,
        chosenSide: chosen,
        responseTimeMs: sampleRt(),
      });
    }
  }

  return responses;
}

// ── Profile helpers ────────────────────────────────────────────────────────

function styleIdx(name: string): number {
  return STYLES.findIndex((s) => s.name === name);
}

function pureGrid(styleName: string): GridSelection[] {
  const idx = styleIdx(styleName);
  return [
    { styleIndex: idx, styleName, round: 1 },
    { styleIndex: idx, styleName, round: 1 },
    { styleIndex: idx, styleName, round: 1 },
    { styleIndex: idx, styleName, round: 2 },
    { styleIndex: idx, styleName, round: 2 },
    { styleIndex: idx, styleName, round: 2 },
  ];
}

function twoStyleGrid(s1: string, s2: string): GridSelection[] {
  return [
    { styleIndex: styleIdx(s1), styleName: s1, round: 1 },
    { styleIndex: styleIdx(s1), styleName: s1, round: 1 },
    { styleIndex: styleIdx(s1), styleName: s1, round: 1 },
    { styleIndex: styleIdx(s2), styleName: s2, round: 2 },
    { styleIndex: styleIdx(s2), styleName: s2, round: 2 },
    { styleIndex: styleIdx(s2), styleName: s2, round: 2 },
  ];
}

function threeStyleGrid(
  names: [string, string, string],
): GridSelection[] {
  return [
    { styleIndex: styleIdx(names[0]), styleName: names[0], round: 1 },
    { styleIndex: styleIdx(names[1]), styleName: names[1], round: 1 },
    { styleIndex: styleIdx(names[2]), styleName: names[2], round: 1 },
    { styleIndex: styleIdx(names[0]), styleName: names[0], round: 2 },
    { styleIndex: styleIdx(names[1]), styleName: names[1], round: 2 },
    { styleIndex: styleIdx(names[2]), styleName: names[2], round: 2 },
  ];
}

// ── API call ────────────────────────────────────────────────────────────────

interface FingerprintApiResponse {
  fingerprint: {
    confidence: number;
    dimensions: Record<string, number>;
    fingerprint_version?: string;
  };
  style_name: string;
  competing_styles: string[];
  blend_ratio: number;
}

async function callFingerprintApi(
  profile: Profile,
  pairs: PairRow[],
): Promise<FingerprintApiResponse> {
  const phase_b_responses = buildResponses(pairs, profile);
  const body = {
    phase_a_selections: profile.phase_a_selections,
    grid_selections: profile.grid_selections,
    phase_b_responses,
    non_visual_responses: profile.non_visual_responses ?? [],
    room_type: "living_room",
    session_token: "quiz-confidence-selftest",
  };
  const res = await fetch(`${API_URL}/api/quiz/fingerprint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cova-session-token": "quiz-confidence-selftest",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return (await res.json()) as FingerprintApiResponse;
}

// ── Profiles ────────────────────────────────────────────────────────────────

// Note on non-visual choice indices: NON_VISUAL_ADJUSTMENTS in the API maps
// surfaces {0: minimal, 1: neutral, 2: layered} and materials {0: natural,
// 1: clean white/glass/metal, 2: velvet/brass, 3: mix}. We pick indices
// that match each profile's intent (not the label the user spec listed when
// the two disagreed — e.g. Industrial uses materials=1 for glass/metal).

const PROFILES: Profile[] = [
  {
    num: 1,
    name: "Decisive Pure Warm Japandi",
    phase_a_selections: ["Warm Japandi"],
    grid_selections: pureGrid("Warm Japandi"),
    non_visual_responses: [
      { questionId: "surfaces", choiceIndex: 0 },
      { questionId: "materials", choiceIndex: 0 },
    ],
    strategy: {
      kind: "target",
      target: [...STYLES[styleIdx("Warm Japandi")]!.v2Center],
    },
    responseTimeRange: [400, 700],
    expected: { primary: "Warm Japandi", minConfidence: 0.9 },
  },
  {
    num: 2,
    name: "Decisive Pure Industrial Loft",
    phase_a_selections: ["Industrial Loft"],
    grid_selections: pureGrid("Industrial Loft"),
    non_visual_responses: [
      { questionId: "surfaces", choiceIndex: 1 },
      { questionId: "materials", choiceIndex: 1 },
    ],
    strategy: {
      kind: "target",
      target: [...STYLES[styleIdx("Industrial Loft")]!.v2Center],
    },
    responseTimeRange: [500, 800],
    expected: { primary: "Industrial Loft", minConfidence: 0.9 },
  },
  {
    num: 3,
    name: "Decisive Pure Maximalist Eclectic",
    phase_a_selections: ["Maximalist Eclectic"],
    grid_selections: pureGrid("Maximalist Eclectic"),
    strategy: {
      kind: "target",
      target: [...STYLES[styleIdx("Maximalist Eclectic")]!.v2Center],
    },
    responseTimeRange: [300, 600],
    expected: { primary: "Maximalist Eclectic", minConfidence: 0.9 },
  },
  {
    num: 4,
    name: "Decisive Pure Minimal White",
    phase_a_selections: ["Pure Minimal White"],
    grid_selections: pureGrid("Pure Minimal White"),
    strategy: {
      kind: "target",
      target: [...STYLES[styleIdx("Pure Minimal White")]!.v2Center],
    },
    responseTimeRange: [400, 700],
    expected: { primary: "Pure Minimal White", minConfidence: 0.9 },
  },
  {
    num: 5,
    name: "Mixed Biophilic + Coastal",
    phase_a_selections: ["Biophilic Jungle", "Coastal Bright"],
    grid_selections: twoStyleGrid("Biophilic Jungle", "Coastal Bright"),
    // Strong B on warmth/organicness, strong A on density/complexity,
    // mixed on traditionalism/character — captures "clear pattern but
    // drawn between two compatible styles" semantics.
    strategy: {
      kind: "target",
      target: [0.8, 0.2, 0.85, 0.3, 0.2, 0.5],
    },
    responseTimeRange: [800, 1500],
    expected: {
      primary: ["Biophilic Jungle", "Coastal Bright", "Warm Japandi"],
      minConfidence: 0.68,
      maxConfidence: 0.82,
    },
  },
  {
    num: 6,
    name: "Hesitant Mixed (slow times)",
    phase_a_selections: ["Warm Japandi"],
    grid_selections: threeStyleGrid([
      "Warm Japandi",
      "Coastal Bright",
      "Biophilic Jungle",
    ]),
    strategy: {
      kind: "target",
      target: [0.8, 0.3, 0.72, 0.3, 0.4, 0.55],
    },
    responseTimeRange: [2000, 4000],
    expected: {
      primary: [
        "Warm Japandi",
        "Coastal Bright",
        "Biophilic Jungle",
      ],
      minConfidence: 0.55,
      maxConfidence: 0.78,
    },
  },
  {
    num: 7,
    name: "Contradictory (changes mind mid-quiz)",
    phase_a_selections: ["Warm Japandi"],
    grid_selections: pureGrid("Warm Japandi"),
    strategy: {
      kind: "split",
      firstTarget: [...STYLES[styleIdx("Warm Japandi")]!.v2Center],
      secondTarget: [...STYLES[styleIdx("Industrial Loft")]!.v2Center],
      splitAt: 12,
    },
    responseTimeRange: [1000, 2000],
    expected: { primary: null, minConfidence: 0, maxConfidence: 0.55 },
  },
  {
    num: 8,
    name: "Truly Random",
    phase_a_selections: [],
    grid_selections: threeStyleGrid([
      "Warm Japandi",
      "Maximalist Eclectic",
      "Pure Minimal White",
    ]),
    strategy: { kind: "alternating" },
    responseTimeRange: [500, 3500],
    expected: { primary: null, minConfidence: 0, maxConfidence: 0.45 },
  },
];

// ── Assertion + runner ──────────────────────────────────────────────────────

function checkProfile(
  profile: Profile,
  api: FingerprintApiResponse,
): { pass: boolean; reason: string } {
  const primary = api.competing_styles?.[0] ?? api.style_name;
  const confidence = api.fingerprint.confidence;
  const expected = profile.expected.primary;

  const reasons: string[] = [];
  let ok = true;

  if (expected !== null) {
    const expectedSet = Array.isArray(expected) ? expected : [expected];
    const matched = expectedSet.some(
      (e) => primary === e || api.style_name.includes(e),
    );
    if (!matched) {
      ok = false;
      reasons.push(`primary='${primary}' not in [${expectedSet.join(", ")}]`);
    }
  }
  if (confidence < profile.expected.minConfidence) {
    ok = false;
    reasons.push(
      `confidence=${confidence.toFixed(3)} < min ${profile.expected.minConfidence}`,
    );
  }
  if (
    profile.expected.maxConfidence !== undefined &&
    confidence > profile.expected.maxConfidence
  ) {
    ok = false;
    reasons.push(
      `confidence=${confidence.toFixed(3)} > max ${profile.expected.maxConfidence}`,
    );
  }
  return {
    pass: ok,
    reason: ok
      ? `primary='${primary}' confidence=${confidence.toFixed(3)}`
      : `primary='${primary}' confidence=${confidence.toFixed(3)}  (${reasons.join("; ")})`,
  };
}

async function main() {
  console.log("Loading validated pairs from Supabase…");
  const pairs = await loadValidatedPairs();
  console.log(`Loaded ${pairs.length} pairs.\n`);
  if (pairs.length < 24) {
    console.error("Not enough validated pairs for a 24-swipe quiz.");
    process.exit(2);
  }

  let passed = 0;
  const failures: string[] = [];
  const results: { profile: Profile; line: string }[] = [];

  for (const profile of PROFILES) {
    try {
      const api = await callFingerprintApi(profile, pairs);
      const { pass, reason } = checkProfile(profile, api);
      const line = `Profile ${profile.num} [${profile.name}]: ${reason} [${pass ? "PASS" : "FAIL"}]`;
      results.push({ profile, line });
      console.log(line);
      if (pass) passed++;
      else failures.push(`Profile ${profile.num} ${profile.name}: ${reason}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const line = `Profile ${profile.num} [${profile.name}]: ERROR ${msg} [FAIL]`;
      results.push({ profile, line });
      console.log(line);
      failures.push(`Profile ${profile.num}: ${msg}`);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━");
  console.log(`RESULTS: ${passed}/${PROFILES.length} PASSED`);
  if (failures.length > 0) {
    console.log("FAILED:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━");
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
