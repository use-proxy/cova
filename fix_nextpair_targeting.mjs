import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/next-pair/route.ts';
let src = readFileSync(path, 'utf8');

// Fix 1: Add debug log to see what competing_styles actually arrives as
const before1 = `    const competingStyleNames = body.competing_styles ?? [];

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

const after1 = `    const competingStyleNames = body.competing_styles ?? [];
    console.log('[next-pair] competing_styles received:', competingStyleNames);
    console.log('[next-pair] all STYLES names:', STYLES.map(s => s.name));

    // If we have exactly 2 competing styles, find the V2 dims where they
    // disagree the most — those are the only dims worth asking about.
    let contestedV2Dims: number[] | null = null;
    if (competingStyleNames.length >= 1) {
      // Try exact match first, then fuzzy match via display name reverse lookup
      const DISPLAY_TO_RAW: Record<string, string> = {
        "Japandi": "Warm Japandi",
        "Dark & Moody": "Dark Moody Glam",
        "Coastal Light": "Coastal Bright",
        "Urban Industrial": "Industrial Loft",
        "Maximalist Eclectic": "Maximalist Eclectic",
        "Classic Traditional": "Heritage Traditional",
        "Minimalist": "Pure Minimal White",
        "Biophilic": "Biophilic Jungle",
        "Mid-Century Modern": "Retro Mid-Century",
      };
      const resolveStyle = (name: string) =>
        STYLES.find(s => s.name === name) ??
        STYLES.find(s => s.name === DISPLAY_TO_RAW[name]);

      const styleA = resolveStyle(competingStyleNames[0] ?? "");
      const styleB = competingStyleNames.length >= 2
        ? resolveStyle(competingStyleNames[1] ?? "")
        : null;

      console.log('[next-pair] resolved styleA:', styleA?.name, 'styleB:', styleB?.name);

      if (styleA && styleB) {
        contestedV2Dims = Array.from({ length: 6 }, (_, i) =>
          Math.abs((styleA.v2Center[i] ?? 0.5) - (styleB.v2Center[i] ?? 0.5))
        );
        console.log('[next-pair] contestedV2Dims:', contestedV2Dims);
      } else if (styleA) {
        // Single dominant style — target dims where current fp deviates from it
        contestedV2Dims = null; // let normal flow handle it
      }
    }`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Fix 2: Use contested dims for ALL pairs, not just after response >= 4
// Change the threshold from >= 4 to >= TOTAL_PAIRS (never enter adaptive phase, always use contested)
const before2 = `    if (hasFingerprint && responseCount >= 4) {`;
const after2 = `    if (hasFingerprint && responseCount >= TOTAL_PAIRS) {`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

writeFileSync(path, src);
console.log('Done next-pair');
