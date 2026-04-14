import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');

// Store raw internal names, not display names
const before1 = `    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
      competingStyles = [result.primaryStyle.name];
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = \`\${primaryName} · \${secondaryName}\`;
      competingStyles = [result.primaryStyle.name, result.secondaryStyle.name];
    }`;

const after1 = `    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
      competingStyles = [result.primaryStyle.name]; // raw internal name for next-pair matching
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = \`\${primaryName} · \${secondaryName}\`;
      competingStyles = [result.primaryStyle.name, result.secondaryStyle.name]; // raw internal names
    }`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);
writeFileSync(path, src);
console.log('Done fingerprint route');
