import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');
const before = `v2Dims[i]! + rawDelta * 0.25 * lambda * momentumMultiplier,`;
const after = `v2Dims[i]! + rawDelta * (Math.abs((v2Dims[i] ?? 0.5) - 0.5) > 0.25 ? 0.04 : 0.25) * lambda * momentumMultiplier,`;
if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
writeFileSync(path, src.replace(before, after));
console.log('Done');
