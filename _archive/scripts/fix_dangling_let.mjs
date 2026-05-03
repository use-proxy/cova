import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');
// Remove the orphaned "let" lines left by the regex
src = src.replace(/^  let\s*\n/gm, '');
writeFileSync(path, src);
console.log('Done');
