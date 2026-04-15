import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-4/page.tsx';
let src = readFileSync(path, 'utf8');

// Fix displayDescription — remove all V1 stub dim references
const before1 = `  const displayDescription = useMemo(() => {
    if (!fingerprint)
      return "You gravitate toward spaces that breathe. Clean lines, natural materials, and deliberate calm define your aesthetic. Every object earns its place — nothing is accidental, everything is intentional.";
    const d = fingerprint.dimensions;
    const parts: string[] = [];
    if (d.colorTemperature > 0.6) parts.push("warm, inviting tones");
    else if (d.colorTemperature < 0.4) parts.push("cool, composed tones");
    if (d.nature > 0.65) parts.push("natural materials and organic forms");
    if (d.texture > 0.65) parts.push("rich tactile surfaces");
    if (d.density < 0.35) parts.push("deliberate calm and breathing room");
    if (d.formality > 0.65) parts.push("structured elegance");
    if (d.era > 0.65) parts.push("heritage character and timeless pieces");
    if (d.pattern > 0.65) parts.push("expressive pattern and detail");
    if (parts.length === 0)
      parts.push("balanced design with personal character");
    return \`Your design DNA draws you toward \${parts.join(", ")}. Every space you create reflects this unique sensibility.\`;
  }, [fingerprint]);`;

const after1 = `  const displayDescription = useMemo(() => {
    if (!fingerprint)
      return "You gravitate toward spaces that breathe. Clean lines, natural materials, and deliberate calm define your aesthetic. Every object earns its place — nothing is accidental, everything is intentional.";
    // V2 dims: colorTemperature=warmth, colorSaturation=complexity,
    // formality=organicness, density=density, era=traditionalism, material=character
    const d = fingerprint.dimensions;
    const parts: string[] = [];
    if (d.colorTemperature > 0.6) parts.push("warm, inviting tones");
    else if (d.colorTemperature < 0.4) parts.push("cool, composed tones");
    if (d.formality > 0.65) parts.push("natural materials and organic forms");
    if (d.material > 0.65) parts.push("crafted pieces with distinctive character");
    if (d.density < 0.35) parts.push("deliberate calm and breathing room");
    else if (d.density > 0.65) parts.push("richly layered spaces full of story");
    if (d.era > 0.65) parts.push("heritage character and timeless pieces");
    if (d.colorSaturation > 0.65) parts.push("bold visual complexity and drama");
    if (parts.length === 0) parts.push("balanced design with personal character");
    return \`Your design DNA draws you toward \${parts.join(", ")}. Every space you create reflects this unique sensibility.\`;
  }, [fingerprint]);`;

if (!src.includes(before1)) { console.log('DESC NOT FOUND'); process.exit(1); }
src = src.replace(before1, after1);

// Fix displayTraits — remove V1 stub dim references
const before2 = `  const displayTraits = useMemo(() => {
    if (storedStyleTags.length > 0) return storedStyleTags;
    if (!fingerprint)
      return ["Calm · Intentional", "Natural Materials", "Negative Space"];
    const d = fingerprint.dimensions;
    const traits: string[] = [];
    if (d.colorTemperature > 0.65) traits.push("Warm Tones");
    if (d.colorTemperature < 0.35) traits.push("Cool Palette");
    if (d.nature > 0.65) traits.push("Natural Materials");
    if (d.texture > 0.65) traits.push("Rich Textures");
    if (d.density < 0.35) traits.push("Negative Space");
    if (d.formality > 0.65) traits.push("Refined Structure");
    if (d.era > 0.65) traits.push("Vintage Character");
    if (d.pattern > 0.65) traits.push("Bold Patterns");
    if (d.lightPreference > 0.65) traits.push("Natural Light");
    if (d.culturalInfluence > 0.65) traits.push("Global Influence");
    return traits.slice(0, 3).length > 0
      ? traits.slice(0, 3)
      : ["Evolved Taste", "Personal Touch", "Refined Balance"];
  }, [fingerprint, storedStyleTags]);`;

const after2 = `  const displayTraits = useMemo(() => {
    if (storedStyleTags.length > 0) return storedStyleTags;
    if (!fingerprint)
      return ["Calm · Intentional", "Natural Materials", "Negative Space"];
    // Pure V2 dims only
    const d = fingerprint.dimensions;
    const traits: string[] = [];
    if (d.colorTemperature > 0.65) traits.push("Warm Tones");
    if (d.colorTemperature < 0.35) traits.push("Cool Palette");
    if (d.colorSaturation > 0.65) traits.push("Bold & Complex");
    if (d.colorSaturation < 0.35) traits.push("Visual Simplicity");
    if (d.formality > 0.65) traits.push("Natural & Organic");
    if (d.formality < 0.35) traits.push("Clean & Structured");
    if (d.density > 0.65) traits.push("Richly Layered");
    if (d.density < 0.35) traits.push("Negative Space");
    if (d.era > 0.65) traits.push("Heritage Character");
    if (d.era < 0.35) traits.push("Ultra-Modern");
    if (d.material > 0.65) traits.push("Crafted & Distinctive");
    return traits.slice(0, 4).length > 0
      ? traits.slice(0, 4)
      : ["Balanced Style", "Personal Touch", "Refined Taste"];
  }, [fingerprint, storedStyleTags]);`;

if (!src.includes(before2)) { console.log('TRAITS NOT FOUND'); process.exit(1); }
src = src.replace(before2, after2);

// Fix displayStyleName — remove V1 stub dim references
const before3 = `    const d = fingerprint.dimensions;
    // Map to descriptive names based on dominant dimensions
    const calm = (1 - d.density) * 0.5 + (1 - d.colorSaturation) * 0.5;
    if (d.colorTemperature > 0.7 && d.nature > 0.7) return "Organic Warmth";
    if (d.formality > 0.7 && d.colorSaturation > 0.7) return "Luxe Drama";
    if (calm > 0.75 && d.texture < 0.4) return "Pure Quiet";
    if (d.pattern > 0.7 || d.culturalInfluence > 0.7) return "Eclectic Spirit";
    if (d.nature > 0.75 && d.colorTemperature > 0.6) return "Warm Naturalist";
    if (d.era > 0.7) return "Heritage Soul";
    if (d.material > 0.7 && d.texture > 0.6) return "Tactile Artisan";
    if (d.lightPreference > 0.7 && calm > 0.6) return "Sunlit Purist";
    if (d.formality > 0.6 && d.material < 0.4) return "Modern Edge";
    if (d.colorTemperature < 0.35) return "Cool Curator";
    return "Evolved Naturalist";`;

const after3 = `    // Pure V2 dims only
    const d = fingerprint.dimensions;
    const calm = (1 - d.density) * 0.5 + (1 - d.colorSaturation) * 0.5;
    if (d.colorTemperature > 0.7 && d.formality > 0.7) return "Organic Warmth";
    if (d.colorSaturation > 0.7 && d.density > 0.7) return "Luxe Drama";
    if (calm > 0.75 && d.material < 0.4) return "Pure Quiet";
    if (d.colorSaturation > 0.7 && d.material > 0.7) return "Eclectic Spirit";
    if (d.formality > 0.75 && d.colorTemperature > 0.6) return "Warm Naturalist";
    if (d.era > 0.7) return "Heritage Soul";
    if (d.material > 0.7 && d.density > 0.6) return "Tactile Artisan";
    if (d.colorTemperature > 0.7 && calm > 0.6) return "Sunlit Purist";
    if (d.era < 0.35 && d.material < 0.4) return "Modern Edge";
    if (d.colorTemperature < 0.35) return "Cool Curator";
    return "Evolved Naturalist";`;

if (!src.includes(before3)) { console.log('STYLENAME NOT FOUND'); process.exit(1); }
src = src.replace(before3, after3);

writeFileSync(path, src);
console.log('Done desc+traits+stylename');
