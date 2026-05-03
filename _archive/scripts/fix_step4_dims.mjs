import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-4/page.tsx';
let src = readFileSync(path, 'utf8');

const before = `const DIMENSIONS = [
  { name: "Calm", score: 87 },
  { name: "Warmth", score: 72 },
  { name: "Texture", score: 65 },
  { name: "Drama", score: 28 },
  { name: "Nature", score: 81 },
  { name: "Luxury", score: 55 },
  { name: "Playfulness", score: 22 },
  { name: "Vintage", score: 40 },
];`;

const after = `const DIMENSIONS = [
  { name: "Warmth",     score: 50 },
  { name: "Complexity", score: 50 },
  { name: "Organic",    score: 50 },
  { name: "Layered",    score: 50 },
  { name: "Heritage",   score: 50 },
  { name: "Character",  score: 50 },
];`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
writeFileSync(path, src.replace(before, after));
console.log('Done');
