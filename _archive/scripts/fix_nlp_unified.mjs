import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace buildQ2, buildQ3, DEFAULT_NLP_Q1, and buildQ1 entirely
// with a single unified builder that targets the 3 most uncertain dims

const before = `function buildQ2(gridPickCounts: Record<number, number>): NlpQuestion {
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);
  const topIdx = sorted[0]?.idx ?? -1;

  // Density: does the leading style prefer sparse or layered?
  const topCenter = STYLE_V2_CENTERS[topIdx];
  const prefersLayered = topCenter && topCenter[3]! > 0.5;

  return {
    question: "When you walk into a room, what feels right?",
    options: [
      {
        label: "✨  Clear surfaces with room to breathe",
        questionId: "surfaces", choiceIndex: 0,
      },
      {
        label: "🏺  A few carefully chosen objects",
        questionId: "surfaces", choiceIndex: 1,
      },
      {
        label: prefersLayered
          ? "📚  Layered with collected pieces and story"
          : "🪴  Curated elements that each have purpose",
        questionId: "surfaces", choiceIndex: 2,
      },
    ],
  };
}

function buildQ3(gridPickCounts: Record<number, number>): NlpQuestion {
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);
  const topIdx = sorted[0]?.idx ?? -1;
  const topCenter = STYLE_V2_CENTERS[topIdx];

  // Character + organicness: what material world does this style live in?
  const prefersOrganic = topCenter && topCenter[2]! > 0.5;
  const prefersCharacter = topCenter && topCenter[5]! > 0.5;

  return {
    question: "What pulls you deeper into a space?",
    options: [
      {
        label: prefersOrganic
          ? "🌿  Plants, natural stone, raw wood"
          : "🌿  Natural materials and organic forms",
        questionId: "materials", choiceIndex: 0,
      },
      {
        label: prefersCharacter
          ? "🏛️  Handcrafted pieces with age and patina"
          : "🏛️  Objects with history and craftsmanship",
        questionId: "materials", choiceIndex: 3,
      },
      {
        label: "🎨  Bold color and expressive pattern",
        questionId: "materials", choiceIndex: 2,
      },
      {
        label: "⬜  Clean architecture and nothing extra",
        questionId: "materials", choiceIndex: 1,
      },
    ],
  };
}`;

const after = `// One universal question template per V2 dim.
// Each question resolves uncertainty on that specific dim via v2Deltas.
// Works for any style combination — no hardcoding.
const DIM_QUESTIONS: Array<{
  question: string;
  hiLabel: string; hiEmoji: string; hiDeltas: number[];
  loLabel: string; loEmoji: string; loDeltas: number[];
  midLabel: string; midEmoji: string; midDeltas: number[];
}> = [
  {
    // dim 0: warmth
    question: "What's the feeling you want when you walk in?",
    hiLabel:  "Warm, rich, and inviting — like a fire is on",
    hiEmoji:  "🌅", hiDeltas:  [+0.35, 0, 0, 0, 0, 0],
    loLabel:  "Cool, crisp, and composed — clear-headed calm",
    loEmoji:  "🧊", loDeltas:  [-0.35, 0, 0, 0, 0, 0],
    midLabel: "Somewhere between — not too warm, not too cold",
    midEmoji: "⚖️", midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 1: visual complexity
    question: "How much should the eye have to explore?",
    hiLabel:  "A lot — I love visual richness and layers of detail",
    hiEmoji:  "🎨", hiDeltas:  [0, +0.35, 0, 0, 0, 0],
    loLabel:  "Very little — beauty is in restraint and simplicity",
    loEmoji:  "◻️", loDeltas:  [0, -0.35, 0, 0, 0, 0],
    midLabel: "A balance — some interest, but not overwhelming",
    midEmoji: "🔲", midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 2: organicness
    question: "What's your relationship with natural materials?",
    hiLabel:  "Essential — I want wood, stone, plants, living textures",
    hiEmoji:  "🌿", hiDeltas:  [0, 0, +0.35, 0, 0, 0],
    loLabel:  "Minimal — I prefer glass, metal, and precise surfaces",
    loEmoji:  "⬜", loDeltas:  [0, 0, -0.35, 0, 0, 0],
    midLabel: "A mix — some natural, some sleek",
    midEmoji: "🪨", midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 3: density
    question: "How do you feel about objects in a space?",
    hiLabel:  "Layered — I love rooms full of collected things and story",
    hiEmoji:  "📚", hiDeltas:  [0, 0, 0, +0.35, 0, 0],
    loLabel:  "Sparse — every object earns its place, nothing extra",
    loEmoji:  "✨", loDeltas:  [0, 0, 0, -0.35, 0, 0],
    midLabel: "A few curated things, but not cluttered",
    midEmoji: "🏺", midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 4: traditionalism
    question: "Where does your taste sit on the time spectrum?",
    hiLabel:  "Heritage — I love antiques, patina, and timeless forms",
    hiEmoji:  "🏛️", hiDeltas:  [0, 0, 0, 0, +0.35, 0],
    loLabel:  "Forward — I prefer contemporary and cutting-edge forms",
    loEmoji:  "🔲", loDeltas:  [0, 0, 0, 0, -0.35, 0],
    midLabel: "A blend of old and new",
    midEmoji: "⚖️", midDeltas: [0, 0, 0, 0, 0, 0],
  },
  {
    // dim 5: character
    question: "What kind of objects feel most at home to you?",
    hiLabel:  "Handcrafted, one-of-a-kind, full of soul and history",
    hiEmoji:  "🎭", hiDeltas:  [0, 0, 0, 0, 0, +0.35],
    loLabel:  "Refined, precise, and beautifully anonymous",
    loEmoji:  "🪟", loDeltas:  [0, 0, 0, 0, 0, -0.35],
    midLabel: "A mix of both — some character, some restraint",
    midEmoji: "🏺", midDeltas: [0, 0, 0, 0, 0, 0],
  },
];

/** Compute the current v2 fingerprint estimate from grid picks alone.
 *  Used to identify which dims are still uncertain after the grid. */
function estimateV2FromGrid(gridPickCounts: Record<number, number>): number[] {
  const NEUTRAL = 0.5;
  const entries = Object.entries(gridPickCounts).map(([idxStr, count]) => ({
    center: STYLE_V2_CENTERS[Number(idxStr)] ?? Array(6).fill(NEUTRAL) as number[],
    count,
  }));
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total === 0) return Array(6).fill(NEUTRAL) as number[];

  return Array.from({ length: 6 }, (_, i) => {
    let weightedSum = 0, totalWeight = 0;
    for (const { center, count } of entries) {
      const val = center[i] ?? NEUTRAL;
      const dev = val - NEUTRAL;
      const signal = Math.abs(dev) * (count / total);
      weightedSum += dev * signal;
      totalWeight += signal;
    }
    return totalWeight < 0.01
      ? NEUTRAL
      : Math.max(0, Math.min(1, NEUTRAL + weightedSum / totalWeight));
  });
}

/** Build all 3 NLP questions dynamically.
 *  Targets the 3 dims with the most uncertainty (closest to 0.5) after the grid.
 *  Q1 is always the most uncertain dim — if two top styles tie on it, it becomes
 *  a personalized tiebreaker. Q2 and Q3 target the next most uncertain dims.
 *  Nothing is hardcoded — works for any style combination. */
function buildNlpQuestions(gridPickCounts: Record<number, number>): NlpQuestion[] {
  const v2 = estimateV2FromGrid(gridPickCounts);

  // Rank dims by uncertainty (distance from 0.5, ascending = most uncertain first)
  const ranked = Array.from({ length: 6 }, (_, i) => ({
    dimIdx: i,
    uncertainty: 1 - Math.abs((v2[i] ?? 0.5) - 0.5) * 2, // 1=fully uncertain, 0=fully settled
  })).sort((a, b) => b.uncertainty - a.uncertainty);

  // Build a question for each of the top 3 uncertain dims
  return ranked.slice(0, 3).map(({ dimIdx }) => {
    const tmpl = DIM_QUESTIONS[dimIdx]!;
    return {
      question: tmpl.question,
      options: [
        { label: \`\${tmpl.hiEmoji}  \${tmpl.hiLabel}\`, questionId: "color" as const, choiceIndex: 0, v2Deltas: tmpl.hiDeltas },
        { label: \`\${tmpl.midEmoji}  \${tmpl.midLabel}\`, questionId: "color" as const, choiceIndex: 1, v2Deltas: tmpl.midDeltas },
        { label: \`\${tmpl.loEmoji}  \${tmpl.loLabel}\`, questionId: "color" as const, choiceIndex: 0, v2Deltas: tmpl.loDeltas },
      ],
    };
  });
}

function buildQ2(gridPickCounts: Record<number, number>): NlpQuestion {
  return buildNlpQuestions(gridPickCounts)[1] ?? DIM_QUESTIONS[3]!  as unknown as NlpQuestion;
}
function buildQ3(gridPickCounts: Record<number, number>): NlpQuestion {
  return buildNlpQuestions(gridPickCounts)[2] ?? DIM_QUESTIONS[2]! as unknown as NlpQuestion;
}`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
src = src.replace(before, after);
writeFileSync(path, src);
console.log('Done');
