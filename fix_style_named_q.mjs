import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

const before = `  // Helper: build style-named 2-option question from a DIM_QUESTIONS entry
  function styleNamedQuestion(dimIdx: number, dqIdx: number): NlpQuestion {
    const desc = DIM_QUESTIONS[dqIdx]!;
    const aIsHigh = (aCenter![dimIdx] ?? NEUTRAL) > NEUTRAL;
    return {
      question: \`Your picks split between \${nameA} and \${nameB} — which pull matters more?\`,
      options: [
        {
          label: \`\${aIsHigh ? desc.hiEmoji : desc.loEmoji}  \${nameA}: \${aIsHigh ? desc.hiLabel : desc.loLabel}\`,
          questionId: "color",
          choiceIndex: 0,
          v2Deltas: [...(aIsHigh ? desc.hiDeltas : desc.loDeltas)] as number[],
        },
        {
          label: \`\${aIsHigh ? desc.loEmoji : desc.hiEmoji}  \${nameB}: \${aIsHigh ? desc.loLabel : desc.hiLabel}\`,
          questionId: "color",
          choiceIndex: 0,
          v2Deltas: [...(aIsHigh ? desc.loDeltas : desc.hiDeltas)] as number[],
        },
      ],
    };
  }`;

const after = `  // Helper: build style-named 2-option question using dynamic multi-dim deltas
  function styleNamedQuestion(dimIdx: number, dqIdx: number): NlpQuestion {
    const desc = DIM_QUESTIONS[dqIdx]!;
    const aIsHigh = (aCenter![dimIdx] ?? NEUTRAL) > NEUTRAL;
    // Use computeTiebreakerDeltas to include ALL dims where styles differ > 0.30
    // This prevents Industrial from stealing DarkMoody wins on secondary dims
    const aDeltasMulti = computeTiebreakerDeltas(aCenter!, bCenter!, dimIdx);
    const bDeltasMulti = computeTiebreakerDeltas(bCenter!, aCenter!, dimIdx);
    return {
      question: \`Your picks split between \${nameA} and \${nameB} — which pull matters more?\`,
      options: [
        {
          label: \`\${aIsHigh ? desc.hiEmoji : desc.loEmoji}  \${nameA}: \${aIsHigh ? desc.hiLabel : desc.loLabel}\`,
          questionId: "color",
          choiceIndex: 0,
          v2Deltas: aDeltasMulti,
        },
        {
          label: \`\${aIsHigh ? desc.loEmoji : desc.hiEmoji}  \${nameB}: \${aIsHigh ? desc.loLabel : desc.hiLabel}\`,
          questionId: "color",
          choiceIndex: 0,
          v2Deltas: bDeltasMulti,
        },
      ],
    };
  }`;

if (!src.includes(before)) {
  console.log('NOT FOUND — checking for partial match');
  const partial = 'function styleNamedQuestion(dimIdx: number, dqIdx: number)';
  console.log('Partial found:', src.includes(partial));
  process.exit(1);
}

writeFileSync(path, src.replace(before, after));
console.log('Done');
