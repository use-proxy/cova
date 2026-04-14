import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Dark Moody Glam: character 0.15 → 0.80
const before1 = `  1: [0.15, 0.80, 0.15, 0.80, 0.80, 0.15], // Dark Moody Glam`;
const after1  = `  1: [0.15, 0.80, 0.15, 0.80, 0.80, 0.80], // Dark Moody Glam`;
if (!src.includes(before1)) { console.log('MOODY NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Coastal Bright: organicness 0.15 → 0.55
const before2 = `  2: [0.80, 0.15, 0.15, 0.15, 0.15, 0.15], // Coastal Bright`;
const after2  = `  2: [0.80, 0.15, 0.55, 0.15, 0.15, 0.15], // Coastal Bright`;
if (!src.includes(before2)) { console.log('COASTAL NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

writeFileSync(path, src);
console.log('Done');
