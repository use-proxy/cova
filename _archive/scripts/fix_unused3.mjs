import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');
// Find and remove the estimateV2FromGrid function
const start = src.indexOf('\nfunction estimateV2FromGrid(');
if (start === -1) {
  // Try const version
  const start2 = src.indexOf('\nconst estimateV2FromGrid');
  if (start2 === -1) { console.log('not found'); process.exit(1); }
}
// Find next function after it
const fnStart = src.indexOf('\nfunction estimateV2FromGrid(');
const nextFn = src.indexOf('\nfunction ', fnStart + 1);
src = src.slice(0, fnStart) + src.slice(nextFn);
writeFileSync(path, src);
console.log('Done');
