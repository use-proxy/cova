import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace hardcoded NLP_Q2 and NLP_Q3 with dynamic generators
const before = `const NLP_Q2: NlpQuestion = {
  question: "How do you feel about objects in a room?",
  options: [
    { label: "\\u2728  Clear surfaces, room to breathe",           questionId: "surfaces", choiceIndex: 0 },
    { label: "\\uD83C\\uDFFA  A few curated things I love",         questionId: "surfaces", choiceIndex: 1 },
    { label: "\\uD83D\\uDCDA  Layered with things that tell a story", questionId: "surfaces", choiceIndex: 2 },
  ],
};

const NLP_Q3: NlpQuestion = {
  question: "What draws you into a space?",
  options: [
    { label: "\\uD83C\\uDF31  Plants, natural stone, raw textures",        questionId: "materials", choiceIndex: 0 },
    { label: "\\uD83C\\uDFDB\\uFE0F  Handcrafted pieces, unique finds, patina", questionId: "materials", choiceIndex: 3 },
    { label: "\\uD83C\\uDFA8  Bold color and pattern",                    questionId: "materials", choiceIndex: 2 },
    { label: "\\u25FB\\uFE0F  Clean architecture, nothing extra",         questionId: "materials", choiceIndex: 1 },
  ],
};

const DEFAULT_NLP_Q1: NlpQuestion = {`;

const after = `// Q2: always about density (surfaces/layering) — but question framing adapts to top style
// Q3: always about organicness/character (materials) — but framing adapts to top style
// Both are built dynamically after the grid so they reflect what the user actually picked.

function buildQ2(gridPickCounts: Record<number, number>): NlpQuestion {
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
        label: "✨  Clean surfaces with room to breathe",
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
}

const DEFAULT_NLP_Q1: NlpQuestion = {`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
src = src.replace(before, after);
writeFileSync(path, src);
console.log('Done Q2/Q3 generators');
