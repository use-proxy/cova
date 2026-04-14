import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/quiz/fingerprint/route.ts';
let src = readFileSync(path, 'utf8');

// In computeNewFingerprint: capture competing styles from softmaxStyleMatch
const before1 = `  let styleName: string;
  if (strongV2Dims.length === 0) {
    styleName = "Your Unique Style";
  } else {
    const result = softmaxStyleMatch(v2Dims, "v2");
    if (result.isNeutral) {
      styleName = "Your Unique Style";
    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = \`\${primaryName} · \${secondaryName}\`;
    }
  }`;

const after1 = `  let styleName: string;
  let competingStyles: string[] = [];
  let blendRatio = 1.0;
  if (strongV2Dims.length === 0) {
    styleName = "Your Unique Style";
  } else {
    const result = softmaxStyleMatch(v2Dims, "v2");
    blendRatio = result.blendRatio;
    if (result.isNeutral) {
      styleName = "Your Unique Style";
    } else if (result.blendRatio >= 0.60 || result.secondaryStyle === null) {
      styleName = toDisplayName(result.primaryStyle.name);
      competingStyles = [result.primaryStyle.name];
    } else {
      const primaryName = toDisplayName(result.primaryStyle.name);
      const secondaryName = toDisplayName(result.secondaryStyle.name);
      styleName = \`\${primaryName} · \${secondaryName}\`;
      competingStyles = [result.primaryStyle.name, result.secondaryStyle.name];
    }
  }`;

if (!src.includes(before1)) { console.log('BLOCK 1 NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Return competing_styles + blend_ratio in the return value of computeNewFingerprint
const before2 = `  return { fingerprint, styleName, styleTags, debug: debugData };`;
const after2 = `  return { fingerprint, styleName, styleTags, competingStyles, blendRatio, debug: debugData };`;

if (!src.includes(before2)) { console.log('BLOCK 2 NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

// Destructure competingStyles + blendRatio from computeNewFingerprint call
const before3 = `        const result = await computeNewFingerprint(body, isDebug);
        fingerprint = result.fingerprint;
        styleName = result.styleName;
        styleTags = result.styleTags;`;
const after3 = `        const result = await computeNewFingerprint(body, isDebug);
        fingerprint = result.fingerprint;
        styleName = result.styleName;
        styleTags = result.styleTags;
        competingStyles = result.competingStyles ?? [];
        blendRatio = result.blendRatio ?? 1.0;`;

if (!src.includes(before3)) { console.log('BLOCK 3 NOT FOUND'); process.exit(1); }
src = src.replace(before3, after3);

// Declare competingStyles + blendRatio vars alongside styleName
const before4 = `      let fingerprint: StyleFingerprint;
      let styleName: string;
      let styleTags: string[];`;
const after4 = `      let fingerprint: StyleFingerprint;
      let styleName: string;
      let styleTags: string[];
      let competingStyles: string[] = [];
      let blendRatio = 1.0;`;

if (!src.includes(before4)) { console.log('BLOCK 4 NOT FOUND'); process.exit(1); }
src = src.replace(before4, after4);

// Add to unauthenticated return
const before5 = `        return NextResponse.json({
          fingerprint,
          style_name: styleName,
          style_tags: styleTags,
          persisted: false,`;
const after5 = `        return NextResponse.json({
          fingerprint,
          style_name: styleName,
          style_tags: styleTags,
          competing_styles: competingStyles,
          blend_ratio: blendRatio,
          persisted: false,`;

if (!src.includes(before5)) { console.log('BLOCK 5 NOT FOUND'); process.exit(1); }
src = src.replace(before5, after5);

// Add to authenticated return
const before6 = `      return NextResponse.json({
        fingerprint,
        style_name: styleName,
        style_tags: styleTags,
        ...(isDebug`;
const after6 = `      return NextResponse.json({
        fingerprint,
        style_name: styleName,
        style_tags: styleTags,
        competing_styles: competingStyles,
        blend_ratio: blendRatio,
        ...(isDebug`;

if (!src.includes(before6)) { console.log('BLOCK 6 NOT FOUND'); process.exit(1); }
src = src.replace(before6, after6);

writeFileSync(path, src);
console.log('Done');
