import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-3/page.tsx';
let src = readFileSync(path, 'utf8');

// Raise confidence threshold — 0.65 is too low, ties after NLP resolve around 0.62-0.70
const before = `      const isConfident = store.blendRatio >= 0.65 && store.competingStyles.length <= 1;`;
const after  = `      const isConfident = store.blendRatio >= 0.72 && store.competingStyles.length <= 1;`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
src = src.replace(before, after);
writeFileSync(path, src);
console.log('Done step-3');
