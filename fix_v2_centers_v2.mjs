import { readFileSync, writeFileSync } from 'fs';

// Fix style-match.ts
{
  const path = './apps/web/lib/ai/style-match.ts';
  let src = readFileSync(path, 'utf8');

  // Dark Moody Glam: already fixed character=0.80
  // Also give it density=0.80 explicitly AND traditionalism stays 0.80
  // The issue is Moody+Coastal asks warmth/complexity/density
  // but traditionalism (0.80) never gets asked — add it as a second separator
  // Solution: keep current Moody fix, fix the QUESTION SELECTION instead
  // by ensuring traditionalism is picked for Q2 when Moody is a competitor

  // Coastal Bright: organicness=0.55 (already done)
  // Japandi vs Coastal: differ only on organicness (0.80 vs 0.55 = 0.25, borderline) and character (0.80 vs 0.15 = 0.65)
  // Fix: lower Coastal organicness back to 0.30 — enough to separate from Minimal (0.15 diff=0.15... no)
  // Better: raise Coastal organicness to 0.60 so Japandi(0.80) vs Coastal(0.60) = 0.20 diff (not enough)
  // Real fix: Coastal should differ from Japandi on DENSITY too
  // Japandi: density=0.15 (sparse, minimal), Coastal: density=0.15 (also sparse) — same
  // Give Coastal density=0.15 stays, but give it complexity=0.30 (slightly more visual noise than Japandi's 0.15)
  // Actually the cleanest fix: Coastal gets traditionalism=0.35 (beach houses have some casual heritage)
  // That gives Japandi vs Coastal: character(0.65) + traditionalism(0.35-0.15=0.20)... not enough
  // 
  // Cleanest: give Coastal organicness=0.50 and keep character at 0.15
  // Japandi(organicness=0.80) vs Coastal(0.50) = 0.30 diff — just over threshold
  // AND character: Japandi=0.80, Coastal=0.15 = 0.65 diff
  // That's 2 separating dims ✅

  // Re-fix Coastal: organicness=0.50 (was 0.55, close enough, let's use 0.50 for clean math)
  const before2 = `    v2Center: [0.80, 0.15, 0.55, 0.15, 0.15, 0.15],`;
  const after2  = `    v2Center: [0.80, 0.15, 0.50, 0.15, 0.15, 0.15],`;
  if (!src.includes(before2)) { console.log('COASTAL NOT FOUND in style-match'); process.exit(1); }
  src = src.replace(before2, after2);

  writeFileSync(path, src);
  console.log('Done style-match.ts');
}

// Fix step-2 STYLE_V2_CENTERS to match
{
  const path = './apps/web/app/design/step-2/page.tsx';
  let src = readFileSync(path, 'utf8');

  const before2 = `  2: [0.80, 0.15, 0.55, 0.15, 0.15, 0.15], // Coastal Bright`;
  const after2  = `  2: [0.80, 0.15, 0.50, 0.15, 0.15, 0.15], // Coastal Bright`;
  if (!src.includes(before2)) { console.log('COASTAL NOT FOUND in step-2'); process.exit(1); }
  src = src.replace(before2, after2);

  writeFileSync(path, src);
  console.log('Done step-2/page.tsx');
}
