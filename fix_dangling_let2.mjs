import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');
src = src.replace(/^\s*let\s*\n/gm, '');
writeFileSync(path, src);
console.log('Done');
