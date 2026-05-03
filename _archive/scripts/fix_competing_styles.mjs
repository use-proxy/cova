import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');
// Re-add the missing let competingStyles declaration before let blendRatio
src = src.replace(
  '  let blendRatio = 1.0;\n  if (strongV2Dims.length === 0)',
  '  let competingStyles: string[] = [];\n  let blendRatio = 1.0;\n  if (strongV2Dims.length === 0)'
);
writeFileSync(path, src);
console.log('Done');
