import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Add the computeTiebreakerDeltas helper function right before buildQ1
const helperFn = `
function computeTiebreakerDeltas(winnerCenter, loserCenter, primaryDim) {
  const deltas = Array(6).fill(0);
  deltas[primaryDim] = winnerCenter[primaryDim] > 0.5 ? +0.35 : -0.35;
  for (let d = 0; d < 6; d++) {
    if (d === primaryDim) continue;
    const diff = winnerCenter[d] - loserCenter[d];
    if (Math.abs(diff) > 0.30) {
      deltas[d] = diff > 0 ? +0.25 : -0.25;
    }
  }
  return deltas;
}
`;

// Insert before buildQ1
src = src.replace('function buildQ1(', helperFn + 'function buildQ1(');

writeFileSync(path, src);
console.log('Helper added');
