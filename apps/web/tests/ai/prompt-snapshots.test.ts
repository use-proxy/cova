// @vitest-environment node
/**
 * Snapshot regression tests for FLUX prompt builder.
 * These prevent accidental prompt regressions — any change to prompt
 * output will require explicitly updating the snapshot.
 */

import { describe, test, expect } from "vitest";
import { buildFluxPrompt, buildFluxPromptFromContext } from "@/lib/ai/flux";
import type { BuildFluxPromptParams } from "@/lib/ai/flux";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RenderContext } from "@/lib/types/area2";

function makeFP(
  dims: Partial<StyleFingerprint["dimensions"]>,
  confidence = 0.8,
): StyleFingerprint {
  return {
    dimensions: {
      colorTemperature: 0.5,
      colorSaturation: 0.5,
      density: 0.5,
      formality: 0.5,
      era: 0.5,
      material: 0.5,
      texture: 0.5,
      pattern: 0.5,
      lineQuality: 0.5,
      lightPreference: 0.5,
      nature: 0.5,
      culturalInfluence: 0.5,
      ...dims,
    },
    covariance: Array(12).fill(Array(12).fill(0)),
    confidence,
  };
}

// ── buildFluxPrompt snapshots ──────────────────────────────────────────────

describe("buildFluxPrompt — snapshot regression", () => {
  const WARM_NATURAL: BuildFluxPromptParams = {
    fingerprint: makeFP({
      colorTemperature: 0.85,
      nature: 0.88,
      texture: 0.75,
      lightPreference: 0.8,
    }),
    roomType: "living_room",
    budgetTier: "premium",
    inclusions: [],
    constraints: [],
    keptItemLabels: ["vintage oak desk"],
    roomAnalysis: null,
  };

  const COLD_LUXURY: BuildFluxPromptParams = {
    fingerprint: makeFP({
      colorTemperature: 0.15,
      formality: 0.88,
      density: 0.15,
      material: 0.2,
      texture: 0.2,
    }),
    roomType: "bedroom",
    budgetTier: "luxury",
    inclusions: ["pendant light"],
    constraints: [],
    keptItemLabels: [],
    roomAnalysis: null,
  };

  const FAMILY_BUDGET: BuildFluxPromptParams = {
    fingerprint: makeFP({ colorTemperature: 0.7, nature: 0.6, density: 0.6 }),
    roomType: "dining_room",
    budgetTier: "budget",
    inclusions: [],
    constraints: [],
    keptItemLabels: [],
    roomAnalysis: null,
  };

  test("warm natural prompt matches snapshot", () => {
    const prompt = buildFluxPrompt(WARM_NATURAL);
    expect(prompt).toMatchSnapshot();
  });

  test("cold luxury prompt matches snapshot", () => {
    const prompt = buildFluxPrompt(COLD_LUXURY);
    expect(prompt).toMatchSnapshot();
  });

  test("family budget prompt matches snapshot", () => {
    const prompt = buildFluxPrompt(FAMILY_BUDGET);
    expect(prompt).toMatchSnapshot();
  });

  test("different profiles produce meaningfully different prompts", () => {
    const warm = buildFluxPrompt(WARM_NATURAL);
    const cold = buildFluxPrompt(COLD_LUXURY);
    const family = buildFluxPrompt(FAMILY_BUDGET);

    expect(warm).not.toEqual(cold);
    expect(warm).not.toEqual(family);
    expect(cold).not.toEqual(family);

    // Warm should have warm terms, cold should have cool terms
    expect(warm.toLowerCase()).toMatch(
      /warm|amber|honey|oak|natural|biophilic/,
    );
    expect(cold.toLowerCase()).toMatch(
      /cool|slate|stone|marble|formal|minimal/,
    );
    expect(family.toLowerCase()).toMatch(/affordable|accessible|high-street/);
  });
});

// ── buildFluxPromptFromContext snapshots ─────────────────────────────────────

function makeCtx(
  overrides: { fingerprint?: StyleFingerprint; budgetMax?: number } = {},
): RenderContext {
  return {
    roomId: "snap-room",
    userId: "snap-user",
    assembledAt: "2026-04-10T00:00:00Z",
    fingerprint:
      overrides.fingerprint ?? makeFP({ colorTemperature: 0.7, nature: 0.65 }),
    roomContext: {
      roomShape: "rectangular",
      estimatedDimensions: "14x18 ft",
      ceilingHeight: "standard-8ft",
      ceilingDetail: "flat drywall",
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
      rangeMax: overrides.budgetMax ?? 8000,
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
  } as RenderContext;
}

describe("buildFluxPromptFromContext — snapshot regression", () => {
  test("context prompt matches snapshot", () => {
    const prompt = buildFluxPromptFromContext(makeCtx());
    expect(prompt).toMatchSnapshot();
  });

  test("high-budget context prompt matches snapshot", () => {
    const prompt = buildFluxPromptFromContext(
      makeCtx({
        fingerprint: makeFP({
          colorTemperature: 0.2,
          formality: 0.85,
          material: 0.15,
        }),
        budgetMax: 30000,
      }),
    );
    expect(prompt).toMatchSnapshot();
  });

  test("context prompts differ by budget tier", () => {
    const midBudget = buildFluxPromptFromContext(makeCtx({ budgetMax: 5000 }));
    const highBudget = buildFluxPromptFromContext(
      makeCtx({ budgetMax: 25000 }),
    );
    expect(midBudget).not.toEqual(highBudget);
  });
});
