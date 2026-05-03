import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');
src = src.replace(`
// Shims so existing call sites still compile
function buildQ2(gridPickCounts: Record<number, number>): NlpQuestion {
  return buildNlpQuestions(gridPickCounts)[1]!;
}
function buildQ3(gridPickCounts: Record<number, number>): NlpQuestion {
  return buildNlpQuestions(gridPickCounts)[2]!;
}
`, '\n');
writeFileSync(path, src);
console.log('Done');
