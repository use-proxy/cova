import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/lib/ai/style-match.ts';
let src = readFileSync(path, 'utf8');

// Dark Moody Glam: character 0.15 → 0.80
const before1 = `    v2Center: [0.15, 0.80, 0.15, 0.80, 0.80, 0.15],`;
const after1  = `    v2Center: [0.15, 0.80, 0.15, 0.80, 0.80, 0.80],`;
if (!src.includes(before1)) { console.log('MOODY NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Coastal Bright: organicness 0.15 → 0.50
const before2 = `    v2Center: [0.80, 0.15, 0.15, 0.15, 0.15, 0.15],`;
const after2  = `    v2Center: [0.80, 0.15, 0.50, 0.15, 0.15, 0.15],`;
if (!src.includes(before2)) { console.log('COASTAL NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

writeFileSync(path, src);
console.log('Done');
