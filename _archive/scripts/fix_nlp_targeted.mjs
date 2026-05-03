import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace buildNlpQuestions to use style-pair-aware targeting for Q2/Q3
const before = `/** Build 3 NLP questions targeting the 3 most uncertain dims after the grid.
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
}`;

const after = `/** Build 3 NLP questions.
 *  Q1: always the most conflicted dim between the top-2 tied styles (tiebreaker).
 *  Q2/Q3: dims that best SEPARATE the top-2 styles from each other, prioritized
 *         over generic uncertainty — because separating the competing styles is
 *         the only thing that matters at this point.
 *  Falls back to pure uncertainty ranking when no clear competing pair exists.
 *  Scales automatically to any style combination — nothing hardcoded. */
function buildNlpQuestions(gridPickCounts: Record<number, number>): NlpQuestion[] {
  const v2 = estimateV2FromGrid(gridPickCounts);

  // Find top-2 competing styles from grid picks
  const sorted = Object.entries(gridPickCounts)
    .map(([idxStr, count]) => ({ idx: Number(idxStr), count }))
    .sort((a, b) => b.count - a.count);

  const topA = sorted[0];
  const topB = sorted[1];
  const havePair = topA && topB && STYLE_V2_CENTERS[topA.idx] && STYLE_V2_CENTERS[topB.idx];

  // For Q2/Q3: rank dims by how much they separate the top-2 styles
  // (if we have a pair), weighted by current uncertainty so we don't
  // re-ask dims that are already settled.
  const dimScores = Array.from({ length: 6 }, (_, i) => {
    const uncertainty = 1 - Math.abs((v2[i] ?? 0.5) - 0.5) * 2;
    let separation = 0;
    if (havePair) {
      const aVal = STYLE_V2_CENTERS[topA.idx]![i] ?? 0.5;
      const bVal = STYLE_V2_CENTERS[topB.idx]![i] ?? 0.5;
      separation = Math.abs(aVal - bVal); // 0=styles agree, 0.65=max disagreement
    }
    // Score = separation (primary) × uncertainty (secondary weight)
    // This ensures we ask about dims that both separate the styles AND aren't settled
    return { dimIdx: i, score: separation * 0.7 + uncertainty * 0.3 };
  }).sort((a, b) => b.score - a.score);

  return dimScores.slice(0, 3).map(({ dimIdx }) => {
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
}`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
src = src.replace(before, after);
writeFileSync(path, src);
console.log('Done');
