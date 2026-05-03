import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-3/page.tsx';
let src = readFileSync(path, 'utf8');

// Skip pairwise if step-2 was confident (blendRatio >= 0.65, only 1 competing style)
const before1 = `  const [phase, setPhase] = useState<Phase>(() => {
    const store = useFingerprintStore.getState();
    if (!store.roomType) return "room_type";
    if (store.fingerprint) return "pairs";
    return "non_visual";
  });`;
const after1 = `  const [phase, setPhase] = useState<Phase>(() => {
    const store = useFingerprintStore.getState();
    if (!store.roomType) return "room_type";
    if (store.fingerprint) {
      // Skip pairwise entirely if step-2 produced a confident single-style result
      const isConfident = store.blendRatio >= 0.65 && store.competingStyles.length <= 1;
      if (isConfident) return "compute";
      return "pairs";
    }
    return "non_visual";
  });`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Pass competing_styles to next-pair fetch
const before2 = `      const res = await fetch("/api/quiz/next-pair", {`;
const after2 = `      const competingStyles = useFingerprintStore.getState().competingStyles;
      const res = await fetch("/api/quiz/next-pair", {`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

// Add competing_styles to the next-pair request body
const before3 = `        body: JSON.stringify({
          completedPairIds:`;
const after3 = `        body: JSON.stringify({
          competing_styles: competingStyles,
          completedPairIds:`;

if (!src.includes(before3)) { console.log('BLOCK 3 NOT FOUND'); process.exit(1); }
src = src.replace(before3, after3);

writeFileSync(path, src);
console.log('Done');
