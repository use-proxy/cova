import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Fix initial state — replace static NLP_Q2/NLP_Q3 with dynamic builders
// (gridPickCounts is empty at init so builders return sensible defaults)
const before1 = `    DEFAULT_NLP_Q1, NLP_Q2, NLP_Q3,`;
const after1  = `    DEFAULT_NLP_Q1, buildQ2({}), buildQ3({}),`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Fix setNlpQuestions call after grid — use dynamic builders with actual counts
const before2 = `      setNlpQuestions([q1, NLP_Q2, NLP_Q3]);`;
const after2  = `      setNlpQuestions([q1, buildQ2(gridPickCounts), buildQ3(gridPickCounts)]);`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

writeFileSync(path, src);
console.log('Done');
