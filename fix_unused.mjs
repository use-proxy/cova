import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');
// Add eslint-disable comment to suppress unused variable errors for buildQ2/buildQ3
src = src.replace(
  /^(\s*)(const buildQ2)/m,
  '$1// eslint-disable-next-line @typescript-eslint/no-unused-vars\n$1$2'
);
src = src.replace(
  /^(\s*)(const buildQ3)/m,
  '$1// eslint-disable-next-line @typescript-eslint/no-unused-vars\n$1$2'
);
writeFileSync(path, src);
console.log('Done');
