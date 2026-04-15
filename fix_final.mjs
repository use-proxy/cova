import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');

// Fix return type of computeNewFingerprint
src = src.replace(
`): Promise<{
  fingerprint: StyleFingerprint;
  styleName: string;
  styleTags: string[];
  debug?: DebugData;
}> {`,
`): Promise<{
  fingerprint: StyleFingerprint;
  styleName: string;
  styleTags: string[];
  competingStyles: string[];
  blendRatio: number;
  debug?: DebugData;
}> {`
);

writeFileSync(path, src);
console.log('Return type fixed');
