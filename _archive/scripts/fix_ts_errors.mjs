import { readFileSync, writeFileSync } from 'fs';

// Fix 1: Add types to computeTiebreakerDeltas in step-2/page.tsx
const p1 = './apps/web/app/design/step-2/page.tsx';
let s1 = readFileSync(p1, 'utf8');
s1 = s1.replace(
  'function computeTiebreakerDeltas(winnerCenter, loserCenter, primaryDim) {',
  'function computeTiebreakerDeltas(winnerCenter: number[], loserCenter: number[], primaryDim: number): number[] {'
);
writeFileSync(p1, s1);
console.log('Fix 1 done: computeTiebreakerDeltas types');

// Fix 2: fingerprint/route.ts — remove competingStyles and blendRatio from return
const p2 = './apps/web/app/api/quiz/fingerprint/route.ts';
let s2 = readFileSync(p2, 'utf8');
s2 = s2.replace(/,?\s*competingStyles:[^,\n}]+/g, '');
s2 = s2.replace(/,?\s*blendRatio:[^,\n}]+/g, '');
writeFileSync(p2, s2);
console.log('Fix 2 done: removed competingStyles/blendRatio from route return');
