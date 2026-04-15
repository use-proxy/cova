import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-2/page.tsx';
let src = readFileSync(path, 'utf8');

const before = `          if (data.fingerprint) {
            store.setFingerprint(
              data.fingerprint,
              data.style_name ?? "Your Unique Style",
              data.style_tags ?? [],
            );
          }`;
const after = `          if (data.fingerprint) {
            store.setFingerprint(
              data.fingerprint,
              data.style_name ?? "Your Unique Style",
              data.style_tags ?? [],
            );
            store.setCompetingStyles(
              data.competing_styles ?? [],
              data.blend_ratio ?? 1.0,
            );
          }`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
writeFileSync(path, src.replace(before, after));
console.log('Done');
