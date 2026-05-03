import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

// Find and remove STYLE_V2_CENTERS from its current location
const v2Block = `// V2 dim indices: 0=warmth, 1=visual_complexity, 2=organicness, 3=density, 4=traditionalism, 5=character
const STYLE_V2_CENTERS: Record<number, number[]> = {
  0: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80], // Warm Japandi / Japandi
  1: [0.15, 0.80, 0.15, 0.80, 0.80, 0.15], // Dark Moody Glam
  2: [0.80, 0.15, 0.15, 0.15, 0.15, 0.15], // Coastal Bright
  3: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15], // Industrial Loft
  4: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80], // Maximalist Eclectic
  5: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15], // Heritage Traditional
  6: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], // Pure Minimal White
  7: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80], // Biophilic Jungle
  8: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80], // Retro Mid-Century
};`;

if (!src.includes(v2Block)) { console.log('V2_CENTERS BLOCK NOT FOUND'); process.exit(1); }

// Remove from current location
src = src.replace(v2Block, '');

// Insert right before DIM_QUESTIONS (which is right before line ~84)
const insertBefore = '// Universal dim-targeted question system.';
if (!src.includes(insertBefore)) { console.log('INSERT POINT NOT FOUND'); process.exit(1); }

src = src.replace(insertBefore, v2Block + '\n\n' + insertBefore);
writeFileSync(path, src);
console.log('Done');
