/**
 * Generate 5 harmonious hex color swatches from style fingerprint dimensions.
 * Uses temperature, saturation, and luminosity dimensions to build a palette.
 */
export function generateSwatchesFromFingerprint(
  dimensions: Record<string, number>,
): string[] {
  // Extract relevant dimensions (0–1 scale)
  const temp = clamp(dimensions.colorTemperature ?? 0.5, 0, 1);
  const sat = clamp(dimensions.colorSaturation ?? 0.5, 0, 1);
  const lum = clamp(dimensions.lightPreference ?? 0.5, 0, 1);

  // Map temperature to hue: warm (0) = amber ~35°, cool (1) = blue ~210°
  const baseHue = lerp(35, 210, temp);
  // Map saturation to HSL saturation: 20%–70%
  const baseSat = lerp(20, 70, sat);
  // Map luminosity to HSL lightness: 25%–65%
  const baseLit = lerp(25, 65, lum);

  // Generate 5 harmonious swatches with hue offsets
  const offsets = [0, 30, -30, 60, -60];
  return offsets.map((offset) => {
    const h = (((baseHue + offset) % 360) + 360) % 360;
    const s = clamp(baseSat + (Math.abs(offset) / 60) * 5, 10, 80);
    const l = clamp(baseLit + (offset > 0 ? 5 : -5), 15, 75);
    return hslToHex(h, s, l);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);

  function f(n: number): string {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  }

  return `#${f(0)}${f(8)}${f(4)}`;
}
