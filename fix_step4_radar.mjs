import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-4/page.tsx';
let src = readFileSync(path, 'utf8');

// Replace the broken V1-dim radar computation with pure V2
const before = `  // Map 12-dim fingerprint to 8 display dimensions
  const computedDimensions = useMemo(() => {
    if (!fingerprint) return DIMENSIONS; // fallback to defaults
    const d = fingerprint.dimensions;
    return [
      {
        name: "Calm",
        score: Math.round(
          (1 - d.density) * 50 +
            (1 - d.colorSaturation) * 25 +
            d.lineQuality * 25,
        ),
      },
      { name: "Warmth", score: Math.round(d.colorTemperature * 100) },
      { name: "Texture", score: Math.round(d.texture * 100) },
      {
        name: "Drama",
        score: Math.round(
          d.colorSaturation * 50 +
            d.formality * 25 +
            (1 - d.lightPreference) * 25,
        ),
      },
      { name: "Nature", score: Math.round(d.nature * 100) },
      {
        name: "Luxury",
        score: Math.round(
          d.formality * 40 + d.material * 30 + (1 - d.density) * 30,
        ),
      },
      {
        name: "Playfulness",
        score: Math.round(
          d.pattern * 40 + d.culturalInfluence * 30 + d.colorSaturation * 30,
        ),
      },
      { name: "Vintage", score: Math.round(d.era * 100) },
    ];
  }, [fingerprint]);`;

const after = `  // Map V2 6-dim fingerprint to 6 radar axes (pure V2 — no stub dims)
  // V2 slot mapping: colorTemperature=warmth, colorSaturation=complexity,
  // formality=organicness, density=density, era=traditionalism, material=character
  const computedDimensions = useMemo(() => {
    if (!fingerprint) return DIMENSIONS; // fallback to defaults
    const d = fingerprint.dimensions;
    return [
      { name: "Warmth",       score: Math.round(d.colorTemperature * 100) },
      { name: "Complexity",   score: Math.round(d.colorSaturation * 100) },
      { name: "Organic",      score: Math.round(d.formality * 100) },
      { name: "Layered",      score: Math.round(d.density * 100) },
      { name: "Heritage",     score: Math.round(d.era * 100) },
      { name: "Character",    score: Math.round(d.material * 100) },
    ];
  }, [fingerprint]);`;

if (!src.includes(before)) { console.log('RADAR NOT FOUND'); process.exit(1); }
src = src.replace(before, after);
writeFileSync(path, src);
console.log('Done radar');
