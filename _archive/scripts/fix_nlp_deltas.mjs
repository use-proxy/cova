import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Increase all NLP deltas from 0.35 to 0.45 for stronger signal
src = src.replaceAll('+0.35,', '+0.45,').replaceAll('-0.35,', '-0.45,');

writeFileSync(path, src);
console.log('Done');
