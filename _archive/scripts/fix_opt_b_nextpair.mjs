import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/next-pair/route.ts';
let src = readFileSync(path, 'utf8');

// Add competing_styles to request interface
const before1 = `interface NextPairRequest {
  completedPairIds?: string[];
  currentFingerprint?: Record<string, number> | StyleFingerprint | null;
  responseCount?: number;
  room_type?: string;
}`;
const after1 = `interface NextPairRequest {
  completedPairIds?: string[];
  currentFingerprint?: Record<string, number> | StyleFingerprint | null;
  responseCount?: number;
  room_type?: string;
  competing_styles?: string[]; // raw style names from softmaxStyleMatch e.g. ["biophilic_jungle", "coastal_bright"]
}`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Read competing_styles from body and use it to pick target dims
const before2 = `    const completedPairIds = body.completedPairIds ?? [];
    const currentFingerprint = body.currentFingerprint;
    const responseCount = body.responseCount ?? completedPairIds.length;`;
const after2 = `    const completedPairIds = body.completedPairIds ?? [];
    const currentFingerprint = body.currentFingerprint;
    const responseCount = body.responseCount ?? completedPairIds.length;
    const competingStyleNames = body.competing_styles ?? [];

    // If we have exactly 2 competing styles, find the V2 dims where they
    // disagree the most — those are the only dims worth asking about.
    let contestedV2Dims: number[] | null = null;
    if (competingStyleNames.length === 2) {
      const styleA = STYLES.find(s => s.name === competingStyleNames[0]);
      const styleB = STYLES.find(s => s.name === competingStyleNames[1]);
      if (styleA && styleB) {
        // Rank dims by how much the two styles disagree (absolute diff of v2Centers)
        contestedV2Dims = Array.from({ length: 6 }, (_, i) =>
          Math.abs((styleA.v2Center[i] ?? 0.5) - (styleB.v2Center[i] ?? 0.5))
        );
      }
    }`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

// In the spread phase, prefer contested dims when available
const before3 = `      if (v2Dims) {
        // Rank V2 dims by Phase A signal strength, prefer strong ones
        const ranked = Array.from({ length: V2_DIM_COUNT }, (_, i) => ({
          idx: i,
          dev: Math.abs((v2Dims[i] ?? 0.5) - 0.5),
          count: v2DimCounts[i] ?? 0,
        }))
          .filter((d) => d.count === 0) // uncovered first
          .sort((a, b) => b.dev - a.dev); // strongest signal first`;
const after3 = `      if (v2Dims) {
        // If we have contested dims, prefer those — they resolve ambiguity fastest
        const ranked = Array.from({ length: V2_DIM_COUNT }, (_, i) => ({
          idx: i,
          dev: contestedV2Dims
            ? (contestedV2Dims[i] ?? 0)                  // disagreement between competing styles
            : Math.abs((v2Dims[i] ?? 0.5) - 0.5),       // fallback: Phase A signal strength
          count: v2DimCounts[i] ?? 0,
        }))
          .filter((d) => d.count === 0) // uncovered first
          .sort((a, b) => b.dev - a.dev); // most contested / strongest signal first`;

if (!src.includes(before3)) { console.log('BLOCK 3 NOT FOUND'); process.exit(1); }
src = src.replace(before3, after3);

writeFileSync(path, src);
console.log('Done');
