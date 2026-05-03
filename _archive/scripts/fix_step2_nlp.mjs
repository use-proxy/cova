import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace entire buildQ1 with fully dynamic version
const before = `/** Detect if two top styles are tied and which dim they conflict on.
 *  Returns a personalized Q1 if a meaningful conflict is found,
 *  otherwise returns the default Q1. */
function buildQ1(gridPickCounts: Record<number, number>): NlpQuestion {
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length < 2) return DEFAULT_NLP_Q1;

  const top = sorted[0]!;
  const second = sorted[1]!;
  const isTied = top.count === second.count;
  if (!isTied) return DEFAULT_NLP_Q1;

  const aCenter = STYLE_V2_CENTERS[top.idx];
  const bCenter = STYLE_V2_CENTERS[second.idx];
  if (!aCenter || !bCenter) return DEFAULT_NLP_Q1;

  const NEUTRAL = 0.5;
  const CONFLICT_THRESHOLD = 0.25; // both must deviate at least this far from neutral in opposite dirs

  const warmthA = aCenter[0]! - NEUTRAL;
  const warmthB = bCenter[0]! - NEUTRAL;
  const organicA = aCenter[2]! - NEUTRAL;
  const organicB = bCenter[2]! - NEUTRAL;

  const warmthConflict =
    Math.abs(warmthA) >= CONFLICT_THRESHOLD &&
    Math.abs(warmthB) >= CONFLICT_THRESHOLD &&
    Math.sign(warmthA) !== Math.sign(warmthB);

  const organicConflict =
    Math.abs(organicA) >= CONFLICT_THRESHOLD &&
    Math.abs(organicB) >= CONFLICT_THRESHOLD &&
    Math.sign(organicA) !== Math.sign(organicB);

  // Resolve display names for both top styles by style index
  const styleNames: Record<number, string> = {
    0: "Japandi", 1: "Dark & Moody", 2: "Coastal Light", 3: "Urban Industrial",
    4: "Maximalist", 5: "Classic Traditional", 6: "Minimalist", 7: "Biophilic", 8: "Mid-Century",
  };
  const nameA = styleNames[top.idx] ?? "Style A";
  const nameB = styleNames[second.idx] ?? "Style B";

  if (warmthConflict) {
    // Determine which style is the warm one vs cool/natural one
    const warmStyle = warmthA > 0 ? nameA : nameB;
    const coolStyle = warmthA > 0 ? nameB : nameA;
    return {
      question: \`Your picks split between \${warmStyle} and \${coolStyle} — what matters most?\`,
      options: [
        {
          label: "\\u2600\\uFE0F  The bright, airy, light-filled feel",
          questionId: "color", choiceIndex: 3,
          v2Deltas: [+0.35, 0, -0.30, -0.30, 0, 0],
        },
        {
          label: "\\uD83C\\uDF3F  The natural, organic, grounded feel",
          questionId: "color", choiceIndex: 0,
          v2Deltas: [-0.35, 0, +0.30, +0.30, 0, 0],
        },
      ],
    };
  }

  if (organicConflict) {
    const organicStyle = organicA > 0 ? nameA : nameB;
    const cleanStyle = organicA > 0 ? nameB : nameA;
    return {
      question: \`Your picks split between \${organicStyle} and \${cleanStyle} — what matters most?\`,
      options: [
        {
          label: "\\uD83C\\uDF31  Plants, natural materials, living textures",
          questionId: "materials", choiceIndex: 0,
          v2Deltas: [0, 0, +0.35, +0.20, 0, +0.15],
        },
        {
          label: "\\u25FB\\uFE0F  Clean, light, open spaces",
          questionId: "materials", choiceIndex: 1,
          v2Deltas: [+0.15, 0, -0.35, -0.20, 0, -0.15],
        },
      ],
    };
  }

  // Generic tie fallback — no single dominant conflict
  return {
    question: \`Your picks split between \${nameA} and \${nameB} — what matters most?\`,
    options: [
      {
        label: "\\u2600\\uFE0F  The light and openness",
        questionId: "color", choiceIndex: 3,
        v2Deltas: [+0.25, -0.10, -0.20, -0.20, 0, 0],
      },
      {
        label: "\\uD83C\\uDF3F  The natural and organic",
        questionId: "materials", choiceIndex: 0,
        v2Deltas: [-0.15, 0, +0.30, +0.15, 0, +0.15],
      },
      {
        label: "\\uD83C\\uDFDB\\uFE0F  The atmosphere and mood",
        questionId: "materials", choiceIndex: 3,
        v2Deltas: [-0.20, +0.15, +0.10, +0.20, 0, +0.20],
      },
    ],
  };
}`;

const after = `// Per-dim conflict descriptors: [dimIndex, hiLabel, loLabel, hiEmoji, loEmoji, hiDeltas, loDeltas]
// Used to generate fully dynamic Q1 options from whichever dim conflicts most between the top 2 styles.
const DIM_CONFLICT_DESCRIPTORS: Array<{
  name: string;
  hiLabel: string;   // label when style favors HIGH end of this dim
  loLabel: string;   // label when style favors LOW end of this dim
  hiEmoji: string;
  loEmoji: string;
  hiDeltas: number[]; // v2Deltas to push toward HIGH on this dim
  loDeltas: number[]; // v2Deltas to push toward LOW on this dim
}> = [
  {
    name: "warmth",
    hiLabel: "warm, rich, inviting tones",
    loLabel: "cool, crisp, composed tones",
    hiEmoji: "🌅",
    loEmoji: "🧊",
    hiDeltas: [+0.35, 0, 0, 0, 0, 0],
    loDeltas: [-0.35, 0, 0, 0, 0, 0],
  },
  {
    name: "visual complexity",
    hiLabel: "bold, layered, visually rich spaces",
    loLabel: "clean, simple, uncluttered spaces",
    hiEmoji: "🎨",
    loEmoji: "◻️",
    hiDeltas: [0, +0.35, 0, +0.15, 0, 0],
    loDeltas: [0, -0.35, 0, -0.15, 0, 0],
  },
  {
    name: "organic feel",
    hiLabel: "natural materials, living textures, plants",
    loLabel: "sleek surfaces, glass, metal, and precision",
    hiEmoji: "🌿",
    loEmoji: "⬜",
    hiDeltas: [0, 0, +0.35, +0.15, 0, +0.15],
    loDeltas: [0, 0, -0.35, -0.15, 0, -0.15],
  },
  {
    name: "density",
    hiLabel: "richly layered rooms full of collected things",
    loLabel: "spare, minimal rooms with breathing room",
    hiEmoji: "📚",
    loEmoji: "🌬️",
    hiDeltas: [0, +0.15, 0, +0.35, 0, 0],
    loDeltas: [0, -0.15, 0, -0.35, 0, 0],
  },
  {
    name: "heritage",
    hiLabel: "timeless, traditional, heritage-rich pieces",
    loLabel: "ultra-modern, forward-looking, contemporary forms",
    hiEmoji: "🏛️",
    loEmoji: "🔲",
    hiDeltas: [0, 0, 0, 0, +0.35, 0],
    loDeltas: [0, 0, 0, 0, -0.35, 0],
  },
  {
    name: "character",
    hiLabel: "crafted, distinctive pieces with soul",
    loLabel: "sleek, generic, refined anonymity",
    hiEmoji: "✨",
    loEmoji: "🪟",
    hiDeltas: [0, 0, 0, 0, 0, +0.35],
    loDeltas: [0, 0, 0, 0, 0, -0.35],
  },
];

/** Fully dynamic Q1 builder.
 *  Finds the single V2 dim where the top-2 tied styles disagree most,
 *  then generates options and v2Deltas from that dim's descriptor.
 *  Nothing is hardcoded — works for any style combination. */
function buildQ1(gridPickCounts: Record<number, number>): NlpQuestion {
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length < 2) return DEFAULT_NLP_Q1;

  const top = sorted[0]!;
  const second = sorted[1]!;
  if (top.count !== second.count) return DEFAULT_NLP_Q1;

  const aCenter = STYLE_V2_CENTERS[top.idx];
  const bCenter = STYLE_V2_CENTERS[second.idx];
  if (!aCenter || !bCenter) return DEFAULT_NLP_Q1;

  const styleNames: Record<number, string> = {
    0: "Japandi", 1: "Dark & Moody", 2: "Coastal Light", 3: "Urban Industrial",
    4: "Maximalist", 5: "Classic Traditional", 6: "Minimalist", 7: "Biophilic", 8: "Mid-Century",
  };
  const nameA = styleNames[top.idx] ?? "Style A";
  const nameB = styleNames[second.idx] ?? "Style B";

  // Find the dim where the two styles disagree most
  const NEUTRAL = 0.5;
  const CONFLICT_THRESHOLD = 0.25;
  let bestDimIdx = -1;
  let bestConflict = 0;

  for (let i = 0; i < 6; i++) {
    const devA = (aCenter[i] ?? NEUTRAL) - NEUTRAL;
    const devB = (bCenter[i] ?? NEUTRAL) - NEUTRAL;
    const bothStrong = Math.abs(devA) >= CONFLICT_THRESHOLD && Math.abs(devB) >= CONFLICT_THRESHOLD;
    const conflict = Math.sign(devA) !== Math.sign(devB);
    if (bothStrong && conflict) {
      const magnitude = Math.abs(devA) + Math.abs(devB);
      if (magnitude > bestConflict) {
        bestConflict = magnitude;
        bestDimIdx = i;
      }
    }
  }

  if (bestDimIdx === -1) return DEFAULT_NLP_Q1;

  const desc = DIM_CONFLICT_DESCRIPTORS[bestDimIdx]!;
  const aIsHigh = (aCenter[bestDimIdx] ?? NEUTRAL) > NEUTRAL;

  // Style A is on one side, Style B on the other — label options accordingly
  const styleALabel = \`\${aIsHigh ? desc.hiEmoji : desc.loEmoji}  \${nameA}: \${aIsHigh ? desc.hiLabel : desc.loLabel}\`;
  const styleBLabel = \`\${aIsHigh ? desc.loEmoji : desc.hiEmoji}  \${nameB}: \${aIsHigh ? desc.loLabel : desc.hiLabel}\`;

  return {
    question: \`Your picks split between \${nameA} and \${nameB} — which pull matters more?\`,
    options: [
      {
        label: styleALabel,
        questionId: "color",
        choiceIndex: 0,
        v2Deltas: aIsHigh ? desc.hiDeltas : desc.loDeltas,
      },
      {
        label: styleBLabel,
        questionId: "color",
        choiceIndex: 0,
        v2Deltas: aIsHigh ? desc.loDeltas : desc.hiDeltas,
      },
    ],
  };
}`;

if (!src.includes(before)) { console.log('NLP NOT FOUND'); process.exit(1); }
src = src.replace(before, after);
writeFileSync(path, src);
console.log('Done nlp');
