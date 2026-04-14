import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/lib/store/fingerprint.ts';
let src = readFileSync(path, 'utf8');

// Add to interface
const before1 = `  /** Direct V2 6-dim adjustments from tie-breaker Q1. Null if no tie was detected. */
  tiebreakerDeltas: number[] | null;`;
const after1 = `  /** Direct V2 6-dim adjustments from tie-breaker Q1. Null if no tie was detected. */
  tiebreakerDeltas: number[] | null;
  /** Top-2 style names competing after step-2, used to target pairwise in step-3. */
  competingStyles: string[];
  /** Primary style blend ratio from step-2 softmax. <0.65 = ambiguous, run pairwise. */
  blendRatio: number;`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Add setter to interface
const before2 = `  setTiebreakerDeltas: (deltas: number[] | null) => void;`;
const after2 = `  setTiebreakerDeltas: (deltas: number[] | null) => void;
  setCompetingStyles: (styles: string[], blendRatio: number) => void;`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

// Add to INITIAL_STATE
const before3 = `  tiebreakerDeltas: null as number[] | null,`;
const after3 = `  tiebreakerDeltas: null as number[] | null,
  competingStyles: [] as string[],
  blendRatio: 1.0,`;

if (!src.includes(before3)) { console.log('BLOCK 3 NOT FOUND'); process.exit(1); }
src = src.replace(before3, after3);

// Add setter implementation
const before4 = `      setTiebreakerDeltas: (tiebreakerDeltas) => set({ tiebreakerDeltas }),`;
const after4 = `      setTiebreakerDeltas: (tiebreakerDeltas) => set({ tiebreakerDeltas }),
      setCompetingStyles: (competingStyles, blendRatio) => set({ competingStyles, blendRatio }),`;

if (!src.includes(before4)) { console.log('BLOCK 4 NOT FOUND'); process.exit(1); }
src = src.replace(before4, after4);

// Add to partialize (persist competingStyles + blendRatio — needed across step-2→step-3 navigation)
const before5 = `        // tiebreakerDeltas: omitted — in-session only, step-2 is single page load`;
const after5 = `        // tiebreakerDeltas: omitted — in-session only, step-2 is single page load
        competingStyles: state.competingStyles,
        blendRatio: state.blendRatio,`;

if (!src.includes(before5)) { console.log('BLOCK 5 NOT FOUND'); process.exit(1); }
src = src.replace(before5, after5);

writeFileSync(path, src);
console.log('Done');
