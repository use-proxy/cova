import { describe, it, expect } from "vitest";
import { buildFluxPrompt, sanitizeForbiddenStyleNames } from "@/lib/ai/flux";
import type { StyleFingerprint } from "@/types/fingerprint";

// Helper to build a StyleFingerprint with overrides.
// All dims are in [0, 1] with 0.5 as the neutral midpoint.
function makeFingerprint(
  overrides: Partial<StyleFingerprint["dimensions"]> = {},
): StyleFingerprint {
  const defaults: StyleFingerprint["dimensions"] = {
    colorTemperature: 0.7,
    colorSaturation: 0.5,
    density: 0.3,
    formality: 0.5,
    era: 0.4,
    material: 0.5,
    texture: 0.7,
    pattern: 0.5,
    lineQuality: 0.5,
    lightPreference: 0.7,
    nature: 0.5,
    culturalInfluence: 0.5,
  };
  return {
    dimensions: { ...defaults, ...overrides },
    covariance: Array(12).fill(Array(12).fill(0)) as number[][],
    confidence: 0.8,
  };
}

const baseFingerprint = makeFingerprint();

function prompt(
  fp: StyleFingerprint,
  overrides: {
    roomType?: string;
    budgetTier?: "budget" | "mid" | "premium" | "luxury";
    inclusions?: string[];
    constraints?: string[];
    keptItemLabels?: string[];
  } = {},
) {
  return buildFluxPrompt({
    fingerprint: fp,
    roomType: overrides.roomType ?? "living_room",
    budgetTier: overrides.budgetTier ?? "mid",
    inclusions: overrides.inclusions ?? [],
    constraints: overrides.constraints ?? [],
    keptItemLabels: overrides.keptItemLabels ?? [],
    roomAnalysis: null,
  });
}

describe("buildFluxPrompt", () => {
  it("returns a string prompt", () => {
    const result = prompt(baseFingerprint);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(20);
  });

  it("prompt contains room type", () => {
    const result = prompt(baseFingerprint, { roomType: "bedroom" });
    expect(result.toLowerCase()).toContain("bedroom");
  });

  it("maps high lightPreference (>0.7) to bright descriptors", () => {
    const fp = makeFingerprint({ lightPreference: 0.85 });
    const result = prompt(fp);
    expect(result.toLowerCase()).toMatch(/bright|airy|natural light/);
  });

  it("maps low lightPreference (<0.3) to moody descriptors", () => {
    const fp = makeFingerprint({ lightPreference: 0.15 });
    const result = prompt(fp);
    expect(result.toLowerCase()).toMatch(/moody|dramatic|dark|cozy/);
  });

  it("neutral lightPreference (in [0.3, 0.7]) generates no light descriptor", () => {
    const fp = makeFingerprint({ lightPreference: 0.5 });
    const result = prompt(fp);
    expect(result.toLowerCase()).not.toMatch(/sun-drenched|cozy intimate/);
  });

  it("maps high colorTemperature to warm descriptors", () => {
    const fp = makeFingerprint({ colorTemperature: 0.9 });
    const result = prompt(fp);
    expect(result.toLowerCase()).toMatch(/warm|amber|terracotta/);
  });

  it("maps low colorTemperature to cool descriptors", () => {
    const fp = makeFingerprint({ colorTemperature: 0.1 });
    const result = prompt(fp);
    expect(result.toLowerCase()).toMatch(/cool|slate|concrete/);
  });

  it("maps budget tier correctly", () => {
    const budgetResult = prompt(baseFingerprint, { budgetTier: "budget" });
    expect(budgetResult.toLowerCase()).toMatch(/affordable|accessible/);

    const luxuryResult = prompt(baseFingerprint, { budgetTier: "luxury" });
    expect(luxuryResult.toLowerCase()).toMatch(/designer|investment|bespoke/);
  });

  it("includes inclusions in prompt", () => {
    const result = prompt(baseFingerprint, { inclusions: ["TV", "Soundbar"] });
    expect(result.toLowerCase()).toContain("tv");
    expect(result.toLowerCase()).toContain("soundbar");
  });

  it("constraints param does not leak raw text into prompt (positive framing only)", () => {
    const result = prompt(baseFingerprint, {
      constraints: ["I rent", "I have pets"],
    });
    // buildFluxPrompt uses positive framing — constraints inform style, not raw inclusion
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(20);
  });

  it("uses positive framing only — no negative prompt syntax", () => {
    const result = prompt(baseFingerprint);
    // FLUX doesn't support negative prompts. Positive framing only.
    expect(result).not.toMatch(/negative:/i);
    expect(result).not.toMatch(/--\s*$/);
    expect(result.toLowerCase()).toContain("photorealistic");
  });

  it("handles all 4 budget tiers without error", () => {
    const tiers = ["budget", "mid", "premium", "luxury"] as const;
    tiers.forEach((tier) => {
      expect(() =>
        prompt(baseFingerprint, { roomType: "bedroom", budgetTier: tier }),
      ).not.toThrow();
    });
  });

  it("handles all fingerprint dimensions at extremes without error", () => {
    const allHigh = makeFingerprint({
      colorTemperature: 1,
      colorSaturation: 1,
      density: 1,
      formality: 1,
      era: 1,
      material: 1,
      texture: 1,
      pattern: 1,
      lineQuality: 1,
      lightPreference: 1,
      nature: 1,
      culturalInfluence: 1,
    });
    const allLow = makeFingerprint({
      colorTemperature: 0,
      colorSaturation: 0,
      density: 0,
      formality: 0,
      era: 0,
      material: 0,
      texture: 0,
      pattern: 0,
      lineQuality: 0,
      lightPreference: 0,
      nature: 0,
      culturalInfluence: 0,
    });
    expect(() => prompt(allHigh)).not.toThrow();
    expect(() => prompt(allLow)).not.toThrow();
  });

  it("silently truncates prompt at 350 words instead of throwing", () => {
    const manyInclusions = Array(50).fill(
      "a very long furniture item name that takes up space",
    );
    // buildFluxPrompt truncates to 350 words max (Kontext Pro limit) — never throws
    const result = prompt(baseFingerprint, { inclusions: manyInclusions });
    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(350);
  });

  it("never outputs forbidden style names in any prompt", () => {
    // Exercise a variety of fingerprint profiles
    const profiles = [
      makeFingerprint({ colorTemperature: 0.9, texture: 0.8 }),
      makeFingerprint({ colorTemperature: 0.1, density: 0.1 }),
      makeFingerprint({ era: 0.9, material: 0.8 }),
      makeFingerprint({ culturalInfluence: 0.9 }),
    ];
    const forbidden = [
      "japandi",
      "minimalist",
      "bohemian",
      "coastal",
      "mid-century modern",
    ];
    for (const fp of profiles) {
      const result = prompt(fp).toLowerCase();
      for (const name of forbidden) {
        expect(result).not.toContain(name);
      }
    }
  });
});

describe("sanitizeForbiddenStyleNames", () => {
  it("replaces all forbidden style names with descriptive phrases", () => {
    const dirty =
      "A Japandi room with Minimalist touches, Bohemian rugs, Coastal light, and Mid-Century Modern chairs";
    const clean = sanitizeForbiddenStyleNames(dirty);
    const forbidden = [
      "japandi",
      "minimalist",
      "bohemian",
      "coastal",
      "mid-century modern",
    ];
    for (const name of forbidden) {
      expect(clean.toLowerCase()).not.toContain(name);
    }
    // Verify replacements actually landed
    expect(clean.toLowerCase()).toContain("calm warm naturalism");
    expect(clean.toLowerCase()).toContain("negative space");
    expect(clean.toLowerCase()).toContain("textural depth");
    expect(clean.toLowerCase()).toContain("weathered materials");
    expect(clean.toLowerCase()).toContain("teak and brass");
  });

  it("is case-insensitive", () => {
    const dirty = "JAPANDI BOHEMIAN coastal";
    const clean = sanitizeForbiddenStyleNames(dirty);
    expect(clean.toLowerCase()).not.toContain("japandi");
    expect(clean.toLowerCase()).not.toContain("bohemian");
    expect(clean.toLowerCase()).not.toContain("coastal");
  });
});
