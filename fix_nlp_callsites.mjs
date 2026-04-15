import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Fix 1: useState initial value — no selections yet, no tiebreaker
src = src.replace(
  '...buildNlpQuestions({}),',
  '...buildNlpQuestions([], null),'
);

// Fix 2: call site after grid completes — pass actual selections and tiebreaker
src = src.replace(
  'const questions = buildNlpQuestions(gridPickCounts);',
  `const currentGridSelections = useFingerprintStore.getState().gridSelections;
      const currentTiebreaker = useFingerprintStore.getState().tiebreakerDeltas;
      const questions = buildNlpQuestions(currentGridSelections, currentTiebreaker);`
);

writeFileSync(path, src);
console.log('Done');
