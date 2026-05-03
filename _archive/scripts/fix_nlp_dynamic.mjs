import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace the entire buildNlpQuestions function with a dynamic version
// that inspects the actual fingerprint state and only asks about uncertain dims

const OLD_MARKER = 'function buildNlpQuestions(';
const insertPoint = src.indexOf(OLD_MARKER);
if (insertPoint === -1) { console.log('buildNlpQuestions not found'); process.exit(1); }

// Find end of the function (next function declaration or export default)
const afterFn = src.indexOf('\nfunction ', insertPoint + 1);
const exportDefault = src.indexOf('\nexport default', insertPoint);
const endPoint = Math.min(
  afterFn > 0 ? afterFn : Infinity,
  exportDefault > 0 ? exportDefault : Infinity
);

if (endPoint === Infinity) { console.log('Could not find end of buildNlpQuestions'); process.exit(1); }

const oldFn = src.slice(insertPoint, endPoint);
console.log('Found buildNlpQuestions, length:', oldFn.length);

const newFn = `function buildNlpQuestions(
  gridSelections: Array<{ styleIndex: number; round: number; styleName: string }>,
  tiebreakerDeltasApplied: number[] | null,
): NlpQuestion[] {
  // Step 1: compute blended fingerprint from grid selections
  const NEUTRAL = 0.5;
  const STYLE_V2: number[][] = [
    [0.80, 0.15, 0.80, 0.15, 0.15, 0.80], // Japandi
    [0.15, 0.80, 0.15, 0.80, 0.80, 0.15], // DarkMoody
    [0.80, 0.15, 0.15, 0.15, 0.15, 0.15], // Coastal
    [0.15, 0.80, 0.15, 0.80, 0.15, 0.15], // Industrial
    [0.80, 0.80, 0.80, 0.80, 0.15, 0.80], // Maximalist
    [0.80, 0.80, 0.80, 0.80, 0.80, 0.15], // Traditional
    [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], // Minimalist
    [0.15, 0.15, 0.80, 0.80, 0.15, 0.80], // Biophilic
    [0.80, 0.80, 0.15, 0.15, 0.15, 0.80], // MidCentury
  ];

  const pickCounts: Record<number, number> = {};
  for (const s of gridSelections) {
    pickCounts[s.styleIndex] = (pickCounts[s.styleIndex] ?? 0) + 1;
  }
  const totalPicks = gridSelections.length || 6;

  const fp = Array(6).fill(0) as number[];
  const tw = Array(6).fill(0) as number[];
  for (const [idxStr, count] of Object.entries(pickCounts)) {
    const sv = STYLE_V2[Number(idxStr)];
    if (!sv) continue;
    const w = count / totalPicks;
    for (let d = 0; d < 6; d++) {
      const dev = (sv[d] ?? NEUTRAL) - NEUTRAL;
      const sig = Math.abs(dev) * w;
      fp[d] += dev * sig;
      tw[d] += sig;
    }
  }
  for (let d = 0; d < 6; d++) {
    fp[d] = tw[d] < 0.01 ? NEUTRAL : Math.max(0, Math.min(1, NEUTRAL + fp[d] / tw[d]));
  }

  // Step 2: apply tiebreaker deltas if Q1 fired
  if (tiebreakerDeltasApplied) {
    for (let d = 0; d < 6; d++) {
      fp[d] = Math.max(0, Math.min(1, fp[d] + (tiebreakerDeltasApplied[d] ?? 0)));
    }
  }

  // Step 3: find uncertain dims (|v - 0.5| < 0.25, sorted most uncertain first)
  const uncertain = fp
    .map((v, i) => ({ i, v, u: 1 - Math.abs(v - NEUTRAL) * 2 }))
    .filter(d => d.u > 0.5)
    .sort((a, b) => b.u - a.u);

  // If no uncertain dims, no questions needed
  if (uncertain.length === 0) return [];

  // Step 4: dim → question definitions (each dim maps to a clear 2-option question)
  // NV mapping: {qId, c} = questionId and choiceIndex for NON_VISUAL_ADJUSTMENTS
  const DIM_TO_Q: Record<number, {
    question: string;
    hiLabel: string; hiEmoji: string; hiNV: { qId: "surfaces"|"materials"|"color"; c: number };
    loLabel: string; loEmoji: string; loNV: { qId: "surfaces"|"materials"|"color"; c: number };
    hiDeltas: number[]; loDeltas: number[];
  }> = {
    0: { // warmth
      question: "What feeling do you want when you walk in?",
      hiLabel: "Warm, amber, golden — cozy and inviting",
      hiEmoji: "🌅", hiNV: { qId: "color", c: 1 },
      hiDeltas: [+0.35, 0, 0, 0, 0, 0],
      loLabel: "Cool, grey, crisp — calm and composed",
      loEmoji: "🪨", loNV: { qId: "color", c: 0 },
      loDeltas: [-0.35, 0, 0, 0, 0, 0],
    },
    1: { // complexity
      question: "How visually rich do you want the space?",
      hiLabel: "Bold — pattern, color, lots to look at",
      hiEmoji: "🎨", hiNV: { qId: "color", c: 2 },
      hiDeltas: [0, +0.35, 0, 0, 0, 0],
      loLabel: "Calm — clean, simple, quiet",
      loEmoji: "⬜", loNV: { qId: "color", c: 0 },
      loDeltas: [0, -0.35, 0, 0, 0, 0],
    },
    2: { // organicness
      question: "What materials draw you in?",
      hiLabel: "Natural — wood, stone, plants, linen",
      hiEmoji: "🪵", hiNV: { qId: "materials", c: 0 },
      hiDeltas: [0, 0, +0.35, 0, 0, 0],
      loLabel: "Sleek — metal, glass, concrete, lacquer",
      loEmoji: "⚙️", loNV: { qId: "materials", c: 1 },
      loDeltas: [0, 0, -0.35, 0, 0, 0],
    },
    3: { // density
      question: "How do you feel about objects in a space?",
      hiLabel: "Layered — rooms full of collected things",
      hiEmoji: "📚", hiNV: { qId: "surfaces", c: 2 },
      hiDeltas: [0, 0, 0, +0.35, 0, 0],
      loLabel: "Spare — only what earns its place",
      loEmoji: "✨", loNV: { qId: "surfaces", c: 0 },
      loDeltas: [0, 0, 0, -0.35, 0, 0],
    },
    4: { // traditionalism
      question: "What era draws you in?",
      hiLabel: "Heritage — timeless, old-world craftsmanship",
      hiEmoji: "🏛️", hiNV: { qId: "materials", c: 2 },
      hiDeltas: [0, 0, 0, 0, +0.35, 0],
      loLabel: "Contemporary — raw, stripped-back, modern",
      loEmoji: "🔩", loNV: { qId: "materials", c: 1 },
      loDeltas: [0, 0, 0, 0, -0.35, 0],
    },
    5: { // character
      question: "What kind of objects speak to you?",
      hiLabel: "Handcrafted — artisan, unique, with soul",
      hiEmoji: "🏺", hiNV: { qId: "materials", c: 3 },
      hiDeltas: [0, 0, 0, 0, 0, +0.35],
      loLabel: "Precise — clean lines, no ornamentation",
      loEmoji: "📐", loNV: { qId: "materials", c: 1 },
      loDeltas: [0, 0, 0, 0, 0, -0.35],
    },
  };

  // Step 5: build up to 2 questions for the most uncertain dims
  // (3 if all dims are very uncertain — e.g. 3-way style split)
  const maxQuestions = uncertain.length >= 4 ? 3 : Math.min(uncertain.length, 2);
  const questions: NlpQuestion[] = [];

  for (let qi = 0; qi < maxQuestions; qi++) {
    const dimInfo = uncertain[qi];
    if (!dimInfo) break;
    const def = DIM_TO_Q[dimInfo.i];
    if (!def) continue;

    questions.push({
      question: def.question,
      options: [
        {
          label: \`\${def.hiEmoji}  \${def.hiLabel}\`,
          questionId: def.hiNV.qId,
          choiceIndex: def.hiNV.c,
          v2Deltas: def.hiDeltas,
        },
        {
          label: \`\${def.loEmoji}  \${def.loLabel}\`,
          questionId: def.loNV.qId,
          choiceIndex: def.loNV.c,
          v2Deltas: def.loDeltas,
        },
      ],
    });
  }

  return questions;
}

`;

src = src.slice(0, insertPoint) + newFn + src.slice(endPoint);
writeFileSync(path, src);
console.log('Done — buildNlpQuestions replaced with dynamic version');
