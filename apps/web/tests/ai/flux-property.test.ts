// @vitest-environment node
/**
 * Property-based tests for FLUX prompt builder using fast-check.
 * Verifies invariants that must hold for ALL possible input combinations.
 */

import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { buildFluxPrompt, buildFluxPromptFromContext } from "@/lib/ai/flux";
import type { BuildFluxPromptParams } from "@/lib/ai/flux";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";

// ── Arbitraries ─────────────────────────────────────────────────────────────

const dimensionsArb = fc.record({
  colorTemperature: fc.double({ min: 0, max: 1, noNaN: true }),
  colorSaturation: fc.double({ min: 0, max: 1, noNaN: true }),
  density: fc.double({ min: 0, max: 1, noNaN: true }),
  formality: fc.double({ min: 0, max: 1, noNaN: true }),
  era: fc.double({ min: 0, max: 1, noNaN: true }),
  material: fc.double({ min: 0, max: 1, noNaN: true }),
  texture: fc.double({ min: 0, max: 1, noNaN: true }),
  pattern: fc.double({ min: 0, max: 1, noNaN: true }),
  lineQuality: fc.double({ min: 0, max: 1, noNaN: true }),
  lightPreference: fc.double({ min: 0, max: 1, noNaN: true }),
  nature: fc.double({ min: 0, max: 1, noNaN: true }),
  culturalInfluence: fc.double({ min: 0, max: 1, noNaN: true }),
});

const fingerprintArb: fc.Arbitrary<StyleFingerprint> = fc.record({
  dimensions: dimensionsArb,
  covariance: fc.constant(Array(12).fill(Array(12).fill(0))),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
});

const budgetTierArb = fc.constantFrom(
  "budget" as const,
  "mid" as const,
  "premium" as const,
  "luxury" as const,
);

const roomTypeArb = fc.constantFrom(
  "living_room",
  "bedroom",
  "dining_room",
  "home_office",
  "kitchen",
  "bathroom",
  "nursery",
  "sunroom",
);

const inclusionArb = fc
  .string({ minLength: 3, maxLength: 30 })
  .map((s) => s.replace(/[^a-zA-Z ]/g, "x").trim() || "item");

const paramsArb: fc.Arbitrary<BuildFluxPromptParams> = fc.record({
  fingerprint: fingerprintArb,
  roomType: roomTypeArb,
  budgetTier: budgetTierArb,
  inclusions: fc.array(inclusionArb, { maxLength: 5 }),
  constraints: fc.array(inclusionArb, { maxLength: 3 }),
  keptItemLabels: fc.array(inclusionArb, { maxLength: 5 }),
  roomAnalysis: fc.constant(null),
  quizPreviewMode: fc.boolean(),
});

// ── buildFluxPrompt property tests ──────────────────────────────────────────

describe("buildFluxPrompt — property-based invariants", () => {
  test('prompt never contains "undefined" or "null" for any input', () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        expect(prompt).not.toContain("undefined");
        expect(prompt).not.toContain("null");
        expect(prompt).not.toContain("[object Object]");
      }),
      { numRuns: 200 },
    );
  });

  test("prompt is always a non-empty string", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(20);
      }),
      { numRuns: 200 },
    );
  });

  test("prompt never exceeds 350 words (Kontext Pro limit)", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        const wordCount = prompt.split(/\s+/).filter(Boolean).length;
        expect(wordCount).toBeLessThanOrEqual(350);
      }),
      { numRuns: 200 },
    );
  });

  test("prompt always contains photorealistic quality marker", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        const hasPhotoTerms = [
          "photorealistic",
          "photograph",
          "canon",
          "camera",
          "architectural digest",
        ].some((t) => prompt.toLowerCase().includes(t));
        expect(hasPhotoTerms).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test("prompt never contains forbidden style names", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        const forbidden = [
          "japandi",
          "bohemian",
          "coastal",
          "mid-century modern",
          "minimalist",
        ];
        forbidden.forEach((f) => {
          expect(prompt.toLowerCase()).not.toContain(f);
        });
      }),
      { numRuns: 100 },
    );
  });

  test("prompt never contains negative prompt syntax", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        expect(prompt).not.toMatch(/negative:/i);
        // No SD-style weight syntax like (word:1.3)
        expect(prompt).not.toMatch(/\(\w+:\d+\.\d+\)/);
      }),
      { numRuns: 200 },
    );
  });

  test("room type always appears in prompt (normalized)", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const prompt = buildFluxPrompt(params);
        const normalizedType = params.roomType.replace(/_/g, " ");
        expect(prompt.toLowerCase()).toContain(normalizedType);
      }),
      { numRuns: 100 },
    );
  });

  test("high colorTemperature (>0.7) always produces warm descriptors", () => {
    const warmParams = fc.record({
      fingerprint: fc.record({
        dimensions: dimensionsArb.map((d) => ({
          ...d,
          colorTemperature: 0.85,
        })),
        covariance: fc.constant(Array(12).fill(Array(12).fill(0))),
        confidence: fc.constant(0.8),
      }),
      roomType: fc.constant("living_room"),
      budgetTier: budgetTierArb,
      inclusions: fc.constant([]),
      constraints: fc.constant([]),
      keptItemLabels: fc.constant([]),
      roomAnalysis: fc.constant(null),
    }) as fc.Arbitrary<BuildFluxPromptParams>;

    fc.assert(
      fc.property(warmParams, (params) => {
        const prompt = buildFluxPrompt(params);
        const warmTerms = [
          "warm",
          "amber",
          "honey",
          "terracotta",
          "oak",
          "brass",
        ];
        const hasWarm = warmTerms.some((t) => prompt.toLowerCase().includes(t));
        expect(hasWarm).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  test("low colorTemperature (<0.3) always produces cool descriptors", () => {
    const coolParams = fc.record({
      fingerprint: fc.record({
        dimensions: dimensionsArb.map((d) => ({
          ...d,
          colorTemperature: 0.15,
        })),
        covariance: fc.constant(Array(12).fill(Array(12).fill(0))),
        confidence: fc.constant(0.8),
      }),
      roomType: fc.constant("living_room"),
      budgetTier: budgetTierArb,
      inclusions: fc.constant([]),
      constraints: fc.constant([]),
      keptItemLabels: fc.constant([]),
      roomAnalysis: fc.constant(null),
    }) as fc.Arbitrary<BuildFluxPromptParams>;

    fc.assert(
      fc.property(coolParams, (params) => {
        const prompt = buildFluxPrompt(params);
        const coolTerms = [
          "cool",
          "slate",
          "stone",
          "concrete",
          "glass",
          "steel",
          "marble",
          "nickel",
        ];
        const hasCool = coolTerms.some((t) => prompt.toLowerCase().includes(t));
        expect(hasCool).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  test("budget luxury always produces premium language", () => {
    const luxParams = fc.record({
      fingerprint: fingerprintArb,
      roomType: roomTypeArb,
      budgetTier: fc.constant("luxury" as const),
      inclusions: fc.constant([]),
      constraints: fc.constant([]),
      keptItemLabels: fc.constant([]),
      roomAnalysis: fc.constant(null),
    }) as fc.Arbitrary<BuildFluxPromptParams>;

    fc.assert(
      fc.property(luxParams, (params) => {
        const prompt = buildFluxPrompt(params);
        const luxTerms = ["designer", "investment", "bespoke"];
        const hasLux = luxTerms.some((t) => prompt.toLowerCase().includes(t));
        expect(hasLux).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  test('budget "budget" always produces affordable language', () => {
    const budgetParams = fc.record({
      fingerprint: fingerprintArb,
      roomType: roomTypeArb,
      budgetTier: fc.constant("budget" as const),
      inclusions: fc.constant([]),
      constraints: fc.constant([]),
      keptItemLabels: fc.constant([]),
      roomAnalysis: fc.constant(null),
    }) as fc.Arbitrary<BuildFluxPromptParams>;

    fc.assert(
      fc.property(budgetParams, (params) => {
        const prompt = buildFluxPrompt(params);
        const budgetTerms = ["affordable", "accessible", "high-street"];
        const hasBudget = budgetTerms.some((t) =>
          prompt.toLowerCase().includes(t),
        );
        expect(hasBudget).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  test("quizPreviewMode omits preservation tail and kept items", () => {
    const previewParams = fc.record({
      fingerprint: fingerprintArb,
      roomType: roomTypeArb,
      budgetTier: budgetTierArb,
      inclusions: fc.constant([]),
      constraints: fc.constant([]),
      keptItemLabels: fc.array(fc.constant("antique table"), {
        minLength: 1,
        maxLength: 3,
      }),
      roomAnalysis: fc.constant(null),
      quizPreviewMode: fc.constant(true),
    }) as fc.Arbitrary<BuildFluxPromptParams>;

    fc.assert(
      fc.property(previewParams, (params) => {
        const prompt = buildFluxPrompt(params);
        expect(prompt.toLowerCase()).not.toContain("antique table");
        expect(prompt.toLowerCase()).not.toContain("preserve exactly");
      }),
      { numRuns: 50 },
    );
  });

  test("keptItemLabels appear in non-preview prompt", () => {
    const keepParams = fc.record({
      fingerprint: fingerprintArb,
      roomType: roomTypeArb,
      budgetTier: budgetTierArb,
      inclusions: fc.constant([]),
      constraints: fc.constant([]),
      keptItemLabels: fc.constant(["vintage oak desk"]),
      roomAnalysis: fc.constant(null),
      quizPreviewMode: fc.constant(false),
    }) as fc.Arbitrary<BuildFluxPromptParams>;

    fc.assert(
      fc.property(keepParams, (params) => {
        const prompt = buildFluxPrompt(params);
        expect(prompt.toLowerCase()).toContain("vintage oak desk");
      }),
      { numRuns: 50 },
    );
  });
});

// ── buildFluxPromptFromContext property tests ────────────────────────────────

function makeMinimalContext(
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return {
    roomId: "test-room",
    userId: "test-user",
    assembledAt: new Date().toISOString(),
    roomContext: {
      roomShape: "rectangular",
      estimatedDimensions: "14x18 ft",
      ceilingHeight: "standard-8ft",
      ceilingDetail: "",
      naturalLightDirection: "left",
      naturalLightQuality: "soft-diffused",
      windowCount: 2,
      windowSize: "medium",
      floorMaterial: "Hardwood",
      floorColor: "honey oak",
      wallColor: "warm white",
      hasAccentWall: false,
      wallTexture: "smooth-matte",
      cameraAngle: "eye-level",
      focalLength: "standard",
      architecturalFeatures: [],
      dominantColors: [],
      colorTemperature: "warm",
      existingStyleFingerprint: "",
      surfaceTextures: "",
      userNotes: "",
      aiConfidence: 0.8,
    },
    roomConstraints: {
      wallPermanence: "own-anything-goes",
      physicalConstraints: [],
      bestLightTime: "morning",
      roomSize: "medium",
      whoUsesRoom: ["individual"],
      primaryFunction: ["living room"],
      hasPetsOrKids: false,
      storagePriority: "medium",
      offScreenPieces: "",
      styleDirectionDelta: { coziness: 0, colorBoldness: 0, traditionality: 0 },
    },
    keepMask: {
      objects: [],
      depthMapUrl: "",
      rawDetectionCount: 0,
      detectionModelVersion: "test",
    },
    budget: {
      rangeMin: 3000,
      rangeMax: 8000,
      strategy: "even-quality",
      hardCeiling: false,
    },
    requestedProducts: [],
    artBrief: {
      hasArtDirection: false,
      visualDirection: "",
      colorPalette: [],
      mood: "",
      abstractionLevel: "semi-abstract",
      subjectMatter: "",
      frameStyle: "gallery-wrap",
      placement: "ai-decides",
      galleryWall: false,
      includesPersonalPhotos: false,
      hasBookCollection: false,
      hasVinylCollection: false,
      copyrightSafe: true,
    },
    techSpec: {
      hasTV: false,
      audioSetup: "none",
      smartLighting: false,
      hasWorkFromHome: false,
      hasGamingSetup: false,
    },
    sensoryProfile: {
      throwCushionDensity: 2,
      plantPresence: "none",
      hasCandles: false,
      hasRug: false,
      windowTreatments: "none",
      hasDiffuser: false,
      overallDensity: "balanced",
    },
    identityBrief: { moodTarget: "", moodKeywords: [], personalityTags: [] },
    tabStates: [],
    minimumThresholdMet: true,
    tabsComplete: ["budget"],
    ...overrides,
  } as RenderContext;
}

describe("buildFluxPromptFromContext — property-based invariants", () => {
  test('prompt never contains "undefined" for random fingerprints', () => {
    fc.assert(
      fc.property(fingerprintArb, (fp) => {
        const ctx = makeMinimalContext({ fingerprint: fp });
        const prompt = buildFluxPromptFromContext(ctx);
        expect(prompt).not.toContain("undefined");
        expect(prompt).not.toContain("[object Object]");
      }),
      { numRuns: 200 },
    );
  });

  test("prompt never exceeds 2800 char hard cap", () => {
    fc.assert(
      fc.property(fingerprintArb, (fp) => {
        const ctx = makeMinimalContext({ fingerprint: fp });
        const prompt = buildFluxPromptFromContext(ctx);
        expect(prompt.length).toBeLessThanOrEqual(2800);
      }),
      { numRuns: 200 },
    );
  });

  test("prompt always contains quality closer", () => {
    fc.assert(
      fc.property(fingerprintArb, (fp) => {
        const ctx = makeMinimalContext({ fingerprint: fp });
        const prompt = buildFluxPromptFromContext(ctx);
        expect(/photorealistic|architectural digest/i.test(prompt)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test("budget rangeMax >= 15000 always produces premium language", () => {
    fc.assert(
      fc.property(fingerprintArb, (fp) => {
        const ctx = makeMinimalContext({
          fingerprint: fp,
          budget: {
            rangeMin: 0,
            rangeMax: 20000,
            strategy: "hero-piece",
            hardCeiling: false,
          },
        });
        const prompt = buildFluxPromptFromContext(ctx);
        expect(/designer|investment|bespoke|premium/i.test(prompt)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  test("hasPetsOrKids always mentions performance fabric", () => {
    fc.assert(
      fc.property(fingerprintArb, (fp) => {
        const ctx = makeMinimalContext({
          fingerprint: fp,
          roomConstraints: {
            wallPermanence: "own-anything-goes",
            physicalConstraints: [],
            bestLightTime: "morning",
            roomSize: "medium",
            whoUsesRoom: ["family-kids"],
            primaryFunction: ["living room"],
            hasPetsOrKids: true,
            storagePriority: "medium",
            offScreenPieces: "",
            styleDirectionDelta: {
              coziness: 0,
              colorBoldness: 0,
              traditionality: 0,
            },
          },
        });
        const prompt = buildFluxPromptFromContext(ctx);
        expect(/performance fabric/i.test(prompt)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});
