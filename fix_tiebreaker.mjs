import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

const before = `            tiebreaker_deltas: opt.v2Deltas ?? store.tiebreakerDeltas ?? null,`;

const after = `            tiebreaker_deltas: opt.v2Deltas ?? useFingerprintStore.getState().tiebreakerDeltas ?? null,`;

if (!src.includes(before)) { console.log('NOT FOUND — check whitespace'); process.exit(1); }
writeFileSync(path, src.replace(before, after));
console.log('Done');
