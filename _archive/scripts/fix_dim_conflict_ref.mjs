import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

if (!src.includes('DIM_CONFLICT_DESCRIPTORS')) { console.log('NOT FOUND'); process.exit(0); }
src = src.replaceAll('DIM_CONFLICT_DESCRIPTORS', 'DIM_QUESTIONS');
writeFileSync(path, src);
console.log('Done');
