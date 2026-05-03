import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');

// Fix 1: Add competingStyles and blendRatio to the return type of computeNewFingerprint
src = src.replace(
  'fingerprint: StyleFingerprint;\n    styleName: string;\n    styleTags: string[];\n    debug?: DebugData;\n  }',
  'fingerprint: StyleFingerprint;\n    styleName: string;\n    styleTags: string[];\n    competingStyles: string[];\n    blendRatio: number;\n    debug?: DebugData;\n  }'
);

// Fix 2: Add competingStyles declaration in the phase_c path (line ~624 area)
// Find the second let blendRatio and add competingStyles before it
src = src.replace(
  '      let blendRatio = 1.0;\n\n      if (body.phase_c_confirmation',
  '      let competingStyles: string[] = [];\n      let blendRatio = 1.0;\n\n      if (body.phase_c_confirmation'
);

// Fix 3: Remove unused buildQ2 and buildQ3 — just delete their declarations
src = src.replace(/\n\s*const buildQ2[^;]+;/g, '');
src = src.replace(/\n\s*const buildQ3[^;]+;/g, '');

writeFileSync(path, src);
console.log('Done fingerprint route');

// Fix step-2 unused buildQ2/buildQ3
const p2 = './apps/web/app/design/step-2/page.tsx';
let s2 = readFileSync(p2, 'utf8');
// Find and remove unused buildQ2 and buildQ3 function declarations
s2 = s2.replace(/\n\/\/ [^\n]*buildQ[23][^\n]*\nconst buildQ[23][^}]+}\n/g, '\n');
writeFileSync(p2, s2);
console.log('Done step-2');
