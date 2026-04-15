import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace init state
const before1 = `    DEFAULT_NLP_Q1, buildQ2({}), buildQ3({}),`;
const after1  = `    ...buildNlpQuestions({}),`;
if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Replace setNlpQuestions — use unified builder, Q1 tiebreaker overrides first question
const before2 = `      const q1 = buildQ1(gridPickCounts);
      setNlpQuestions([q1, buildQ2(gridPickCounts), buildQ3(gridPickCounts)]);`;
const after2  = `      const questions = buildNlpQuestions(gridPickCounts);
      const q1Override = buildQ1(gridPickCounts); // personalized tiebreaker if tied
      questions[0] = q1Override; // always use tiebreaker for Q1 when available
      setNlpQuestions(questions);`;
if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

writeFileSync(path, src);
console.log('Done');
