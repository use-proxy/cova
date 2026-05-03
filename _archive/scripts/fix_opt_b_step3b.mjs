import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-3/page.tsx';
let src = readFileSync(path, 'utf8');

// Fix 1: isConfident skip (phase init)
const before1 = `    if (store.fingerprint) return "pairs";`;
const after1 = `    if (store.fingerprint) {
      const isConfident = store.blendRatio >= 0.65 && store.competingStyles.length <= 1;
      if (isConfident) return "compute";
      return "pairs";
    }`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Fix 2: inject competing_styles into next-pair body
const before2 = `        body: JSON.stringify({
          completedPairIds,
          responseCount: completedPairIds.length,
          currentFingerprint: currentFp?.dimensions ?? null,
          ...(store.roomType ? { room_type: store.roomType } : {}),
        }),`;
const after2 = `        body: JSON.stringify({
          competing_styles: store.competingStyles ?? [],
          completedPairIds,
          responseCount: completedPairIds.length,
          currentFingerprint: currentFp?.dimensions ?? null,
          ...(store.roomType ? { room_type: store.roomType } : {}),
        }),`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

writeFileSync(path, src);
console.log('Done');
