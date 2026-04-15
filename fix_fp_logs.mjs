import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');

// Log 1: after tiebreaker apply
const before1 = `  if (body.tiebreaker_deltas && body.tiebreaker_deltas.length === V2_DIM_COUNT) {
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      v2Dims[i] = clamp(v2Dims[i]! + (body.tiebreaker_deltas[i] ?? 0), 0, 1);
    }
  }`;

const after1 = `  console.log('[fingerprint] tiebreaker_deltas received:', body.tiebreaker_deltas);
  if (body.tiebreaker_deltas && body.tiebreaker_deltas.length === V2_DIM_COUNT) {
    for (let i = 0; i < V2_DIM_COUNT; i++) {
      v2Dims[i] = clamp(v2Dims[i]! + (body.tiebreaker_deltas[i] ?? 0), 0, 1);
    }
    console.log('[fingerprint] v2Dims after tiebreaker:', [...v2Dims]);
  }`;

// Log 2: before style name resolution
const before2 = `  const strongV2Dims = v2Dims.filter(`;
const after2 = `  console.log('[fingerprint] v2Dims final (before style match):', [...v2Dims]);
  const strongV2Dims = v2Dims.filter(`;

if (!src.includes(before1)) { console.log('LOG1 NOT FOUND'); process.exit(1); }
if (!src.includes(before2)) { console.log('LOG2 NOT FOUND'); process.exit(1); }

src = src.replace(before1, after1);
src = src.replace(before2, after2);
writeFileSync(path, src);
console.log('Done');
