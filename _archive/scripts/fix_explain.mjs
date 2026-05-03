import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/api/fingerprint/explain/route.ts';
let src = readFileSync(path, 'utf8');

const before = `  // Build a readable summary of the dimensions
  const summary = Object.entries(dimensions)
    .map(([key, value]) => \`\${key}: \${value.toFixed(2)}\`)
    .join(", ");`;

const after = `  // Build a human-readable V2 summary instead of raw key names
  // V2 slot order in dimensions object: colorTemperature=warmth, colorSaturation=complexity,
  // formality=organicness, density=density, era=traditionalism, material=character
  const v2Labels: Array<[string, string, string]> = [
    ["colorTemperature", "cool tones",        "warm tones"],
    ["colorSaturation",  "visually simple",   "bold and complex"],
    ["formality",        "manufactured feel", "natural and organic"],
    ["density",          "clean and sparse",  "richly layered"],
    ["era",              "ultra-modern",      "heritage and traditional"],
    ["material",         "sleek and generic", "crafted and distinctive"],
  ];
  const summary = v2Labels
    .map(([key, lo, hi]) => {
      const val = dimensions[key] ?? 0.5;
      if (val < 0.35) return lo;
      if (val > 0.65) return hi;
      return null;
    })
    .filter(Boolean)
    .join(", ") || "balanced across all dimensions";`;

if (!src.includes(before)) { console.log('NOT FOUND'); process.exit(1); }
writeFileSync(path, src.replace(before, after));

// Also fix the prompt to use the plain-English summary correctly
const before2 = `content: \`Given this interior design style fingerprint with scores 0-1: \${summary}

Write exactly 2-3 sentences explaining in plain English what this means for how the person's room will look. Focus on materials, colors, and mood. No jargon. Do not use any specific style names like Japandi, Bohemian, Coastal, Mid-Century Modern, or Minimalist — describe the feel and materials instead. Do not start with any header, title, or preamble. Start directly with the description sentence.\``;

const after2 = `content: \`This person's interior design style is: \${summary}.

Write exactly 2-3 sentences describing how their room will look and feel. Be specific about materials, colors, and atmosphere. Do not name any design styles. Do not start with a header or preamble — begin directly with the description.\``;

if (!src.includes(before2)) { 
  // Try the replaced version
  const src2 = readFileSync(path, 'utf8');
  if (!src2.includes(before2)) { console.log('PROMPT NOT FOUND'); process.exit(1); }
}
writeFileSync(path, src.replace(before2, after2));
console.log('Done');
