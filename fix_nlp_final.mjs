import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Read exact text of the old buildQ2 and buildQ3 to replace
const start = src.indexOf('function buildQ2(gridPickCounts');
const end = src.indexOf('\nfunction buildQ1(');
if (start === -1 || end === -1) { console.log('BOUNDS NOT FOUND', start, end); process.exit(1); }

const oldBlock = src.slice(start, end);
console.log('Replacing block starting at char', start, 'length', oldBlock.length);

const newBlock = `// Universal dim-targeted question system.
// Works for any style combination — questions adapt to whichever dims
// are most uncertain after the grid. Nothing hardcoded per style.

const DIM_QUESTIONS = [
  {
    // dim 0: warmth
    question: "What feeling do you want when you walk in?",
    hiLabel: "Warm, rich, and inviting", hiEmoji: "🌅",
    hiDeltas: [+0.35, 0, 0, 0, 0, 0],
    loLabel: "Cool, crisp, and composed", loEmoji: "🧊",
    loDeltas: [-0.35, 0, 0, 0, 0, 0],
    midLabel: "Somewhere in between", midEmoji: "⚖️",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 1: visual complexity
    question: "How much should the eye have to explore?",
    hiLabel: "A lot — richness and layers of detail", hiEmoji: "🎨",
    hiDeltas: [0, +0.35, 0, 0, 0, 0],
    loLabel: "Very little — beauty through restraint", loEmoji: "◻️",
    loDeltas: [0, -0.35, 0, 0, 0, 0],
    midLabel: "Some interest, but not overwhelming", midEmoji: "🔲",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 2: organicness
    question: "What's your relationship with natural materials?",
    hiLabel: "Essential — wood, stone, plants, living textures", hiEmoji: "🌿",
    hiDeltas: [0, 0, +0.35, 0, 0, 0],
    loLabel: "Minimal — I prefer glass, metal, precise surfaces", loEmoji: "⬜",
    loDeltas: [0, 0, -0.35, 0, 0, 0],
    midLabel: "A mix of natural and sleek", midEmoji: "🪨",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 3: density
    question: "How do you feel about objects in a space?",
    hiLabel: "Layered — rooms full of collected things and story", hiEmoji: "📚",
    hiDeltas: [0, 0, 0, +0.35, 0, 0],
    loLabel: "Sparse — every object earns its place, nothing extra", loEmoji: "✨",
    loDeltas: [0, 0, 0, -0.35, 0, 0],
    midLabel: "A few curated things, but not cluttered", midEmoji: "🏺",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 4: traditionalism
    question: "Where does your taste sit on the time spectrum?",
    hiLabel: "Heritage — antiques, patina, and timeless forms", hiEmoji: "🏛️",
    hiDeltas: [0, 0, 0, 0, +0.35, 0],
    loLabel: "Forward — contemporary and cutting-edge forms", loEmoji: "🔲",
    loDeltas: [0, 0, 0, 0, -0.35, 0],
    midLabel: "A blend of old and new", midEmoji: "⚖️",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 5: character
    question: "What kind of objects feel most at home to you?",
    hiLabel: "Handcrafted and one-of-a-kind, full of soul", hiEmoji: "🎭",
    hiDeltas: [0, 0, 0, 0, 0, +0.35],
    loLabel: "Refined, precise, and beautifully anonymous", loEmoji: "🪟",
    loDeltas: [0, 0, 0, 0, 0, -0.35],
    midLabel: "A mix — some character, some restraint", midEmoji: "🏺",
    midDeltas: [0, 0, 0, 0, 0, 0],
  },
] as const;

/** Estimate the current v2 fingerprint from grid picks alone. */
function estimateV2FromGrid(gridPickCounts: Record<number, number>): number[] {
  const NEUTRAL = 0.5;
  const entries = Object.entries(gridPickCounts).map(([idxStr, count]) => ({
    center: STYLE_V2_CENTERS[Number(idxStr)] ?? Array(6).fill(NEUTRAL) as number[],
    count,
  }));
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total === 0) return Array(6).fill(NEUTRAL) as number[];
  return Array.from({ length: 6 }, (_, i) => {
    let wSum = 0, wTotal = 0;
    for (const { center, count } of entries) {
      const dev = (center[i] ?? NEUTRAL) - NEUTRAL;
      const sig = Math.abs(dev) * (count / total);
      wSum += dev * sig;
      wTotal += sig;
    }
    return wTotal < 0.01 ? NEUTRAL : Math.max(0, Math.min(1, NEUTRAL + wSum / wTotal));
  });
}

/** Build 3 NLP questions targeting the 3 most uncertain dims after the grid.
 *  Scales automatically to any style combination — no hardcoding. */
function buildNlpQuestions(gridPickCounts: Record<number, number>): NlpQuestion[] {
  const v2 = estimateV2FromGrid(gridPickCounts);
  const ranked = Array.from({ length: 6 }, (_, i) => ({
    dimIdx: i,
    uncertainty: 1 - Math.abs((v2[i] ?? 0.5) - 0.5) * 2,
  })).sort((a, b) => b.uncertainty - a.uncertainty);

  return ranked.slice(0, 3).map(({ dimIdx }) => {
    const t = DIM_QUESTIONS[dimIdx]!;
    return {
      question: t.question,
      options: [
        { label: \`\${t.hiEmoji}  \${t.hiLabel}\`, questionId: "color" as const, choiceIndex: 0, v2Deltas: [...t.hiDeltas] },
        { label: \`\${t.midEmoji}  \${t.midLabel}\`, questionId: "color" as const, choiceIndex: 1, v2Deltas: [...t.midDeltas] },
        { label: \`\${t.loEmoji}  \${t.loLabel}\`, questionId: "color" as const, choiceIndex: 0, v2Deltas: [...t.loDeltas] },
      ],
    };
  });
}

// Shims so existing call sites still compile
function buildQ2(gridPickCounts: Record<number, number>): NlpQuestion {
  return buildNlpQuestions(gridPickCounts)[1]!;
}
function buildQ3(gridPickCounts: Record<number, number>): NlpQuestion {
  return buildNlpQuestions(gridPickCounts)[2]!;
}

`;

src = src.slice(0, start) + newBlock + src.slice(end);
writeFileSync(path, src);
console.log('Done');
