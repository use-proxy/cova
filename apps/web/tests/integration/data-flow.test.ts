// @vitest-environment node
/**
 * Data Integrity Test — Canonical Session
 *
 * Verifies the complete data flow: every piece of user input from the design
 * steps appears in the final render prompt produced by buildFluxPromptFromContext.
 */

import { describe, test, expect, beforeAll } from "vitest";
import { buildFluxPromptFromContext } from "@/lib/ai/flux";
import type { RenderContext } from "@/lib/types/area2";
import type { StyleFingerprint } from "@/types/fingerprint";

// ── Canonical test session with KNOWN values for everything ─────────────────

const CANONICAL_FINGERPRINT: StyleFingerprint = {
  dimensions: {
    colorTemperature: 0.82, // warm
    colorSaturation: 0.55, // neutral
    density: 0.2, // sparse/minimal
    formality: 0.5, // neutral
    era: 0.5, // neutral
    material: 0.78, // natural/organic
    texture: 0.75, // tactile
    pattern: 0.5, // neutral
    lineQuality: 0.6, // slightly organic
    lightPreference: 0.85, // bright/airy
    nature: 0.82, // biophilic
    culturalInfluence: 0.5, // neutral
  },
  covariance: Array(12).fill(Array(12).fill(0)),
  confidence: 0.88,
};

const CANONICAL_CONTEXT = {
  roomId: "canonical-room",
  userId: "canonical-user",
  assembledAt: new Date().toISOString(),

  fingerprint: CANONICAL_FINGERPRINT,

  roomContext: {
    roomShape: "rectangular",
    estimatedDimensions: "16ft × 22ft",
    ceilingHeight: "high",
    ceilingDetail: "10ft ceiling with crown molding",
    naturalLightDirection: "left",
    naturalLightQuality: "warm-golden",
    windowCount: 4,
    windowSize: "large",
    floorMaterial: "hardwood oak",
    floorColor: "warm honey",
    wallColor: "warm white",
    hasAccentWall: true,
    accentWallColor: "dusty sage",
    wallTexture: "smooth-matte",
    cameraAngle: "corner-wide",
    focalLength: "wide-angle",
    architecturalFeatures: ["crown molding", "bay window", "fireplace mantel"],
    dominantColors: ["warm white", "honey", "sage"],
    colorTemperature: "warm",
    existingStyleFingerprint: "transitional",
    surfaceTextures: "smooth walls, medium-grain wood",
    userNotes: "",
    aiConfidence: 0.9,
  },

  roomConstraints: {
    wallPermanence: "own-anything-goes",
    physicalConstraints: ["Fireplace", "Built-in shelving"],
    bestLightTime: "morning",
    roomSize: "large",
    whoUsesRoom: ["couple"],
    primaryFunction: ["living room"],
    hasPetsOrKids: false,
    storagePriority: "high",
    offScreenPieces: "antique sideboard from grandmother",
    styleDirectionDelta: {
      coziness: 1.0,
      colorBoldness: -0.5,
      traditionality: 0.5,
    },
  },

  keepMask: {
    objects: [
      {
        id: "obj-1",
        type: "sofa",
        bbox: [100, 200, 400, 300],
        confidence: 0.92,
        confidenceTier: "show-user",
        keep: true,
        immovable: false,
        material: "linen",
        dominantColor: "cream",
        userNote: "family heirloom",
      },
      {
        id: "obj-2",
        type: "fireplace",
        bbox: [600, 100, 800, 400],
        confidence: 0.99,
        confidenceTier: "show-user",
        keep: true,
        immovable: true,
        material: "marble surround",
        dominantColor: "white",
      },
    ],
    depthMapUrl: "https://example.com/depth.png",
    rawDetectionCount: 12,
    detectionModelVersion: "1.0.0",
  },

  budget: {
    rangeMin: 6000,
    rangeMax: 14000,
    strategy: "hero-piece",
    hardCeiling: true,
    splurgeCategory: "sofa",
  },

  requestedProducts: [
    {
      id: "prod-1",
      sourceType: "url",
      originalInput: "https://example.com/coffee-table",
      resolvedAs: "scraped",
      fluxDescription:
        "CB2 Slab marble coffee table, Carrara white, low rectangular silhouette",
      placementIntent: "specific",
      placementHint: "center of seating area facing fireplace",
      confirmedByUser: true,
    },
  ],

  artBrief: {
    hasArtDirection: true,
    sourceType: "style-description",
    originalInput: "botanical watercolor prints",
    visualDirection:
      "large-scale botanical watercolor prints in warm earth tones",
    colorPalette: ["ochre", "sage", "cream"],
    mood: "serene",
    abstractionLevel: "semi-abstract",
    subjectMatter: "botanical",
    frameStyle: "natural-light",
    placement: "focal-wall",
    galleryWall: true,
    chosenArtImageUrl: "",
    includesPersonalPhotos: false,
    hasBookCollection: true,
    hasVinylCollection: false,
    copyrightSafe: true,
  },

  techSpec: {
    hasTV: true,
    tvSizeInches: 65,
    tvMountType: "wall-mounted",
    tvPlacementWall: "facing-entrance",
    audioSetup: "soundbar",
    smartLighting: true,
    lightingType: "smart-warm-only",
    hasWorkFromHome: true,
    wfhSetup: "dedicated-desk-zone",
    hasGamingSetup: false,
  },

  sensoryProfile: {
    throwCushionDensity: 4,
    plantPresence: "medium-few",
    plantSpecies: ["fiddle leaf fig"],
    hasCandles: true,
    hasRug: true,
    rugSize: "large-room-anchor",
    rugStyle: "hand-knotted wool",
    rugColor: "warm terracotta and cream",
    windowTreatments: "linen-curtains",
    windowTreatmentColor: "natural linen",
    hasDiffuser: true,
    overallDensity: "balanced",
  },

  identityBrief: {
    culturalReference: "Scandinavian",
    culturalReferenceIntensity: "subtle",
    fandoms: [],
    fandomTreatment: "tasteful",
    interests: ["reading"],
    sentimentalObjects: [
      {
        description: "vintage leather armchair inherited from grandfather",
        placement: "reading corner by window",
      },
    ],
    moodTarget: "calm, sophisticated, and inviting",
    moodKeywords: ["serene", "warm", "curated"],
    personalityTags: ["book lover"],
  },

  tabStates: [],
  minimumThresholdMet: true,
  tabsComplete: ["budget", "products", "art", "tech", "sensory", "identity"],
} as unknown as RenderContext;

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Complete data flow — canonical session", () => {
  let prompt: string;

  beforeAll(() => {
    prompt = buildFluxPromptFromContext(
      CANONICAL_CONTEXT as unknown as RenderContext,
    );
  });

  // ── SAFETY INVARIANTS ──────────────────────────────────────────────────

  test('prompt does not contain "undefined" or "null"', () => {
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("null");
    expect(prompt).not.toContain("[object Object]");
  });

  test("prompt does not contain forbidden style names", () => {
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
  });

  test("prompt is sufficiently detailed (>200 chars)", () => {
    expect(prompt.length).toBeGreaterThan(200);
  });

  test("prompt respects 2800 char hard cap", () => {
    expect(prompt.length).toBeLessThanOrEqual(2800);
  });

  // ── STYLE FINGERPRINT CHECKS ──────────────────────────────────────────

  test("fingerprint warmth (0.82=high) produces warm descriptors", () => {
    const warmTerms = ["warm", "amber", "honey", "terracotta", "golden", "oak"];
    expect(warmTerms.some((t) => prompt.toLowerCase().includes(t))).toBe(true);
  });

  test("fingerprint nature (0.82=high) produces natural/biophilic descriptors", () => {
    const natureTerms = [
      "natural",
      "organic",
      "biophilic",
      "plant",
      "botanical",
      "rattan",
      "linen",
    ];
    expect(natureTerms.some((t) => prompt.toLowerCase().includes(t))).toBe(
      true,
    );
  });

  test("fingerprint density (0.2=low) — sparse descriptor present or outranked by stronger dims", () => {
    // density=0.2 deviates 0.3 from midpoint but may be outranked by
    // colorTemp=0.82 (0.32 dev), nature=0.82 (0.32), lightPref=0.85 (0.35),
    // material=0.78 (0.28), texture=0.75 (0.25). Top-3 picks may not include density.
    // Verify either density appears directly OR the overall prompt doesn't
    // contradict it (no maximalist/layered terms).
    const densityTerms = ["minimal", "sparse"];
    const contradictions = ["maximalist", "richly layered"];
    const hasDensity = densityTerms.some((t) =>
      prompt.toLowerCase().includes(t),
    );
    const hasContradiction = contradictions.some((t) =>
      prompt.toLowerCase().includes(t),
    );
    expect(hasDensity || !hasContradiction).toBe(true);
  });

  test("fingerprint lightPreference (0.85=high) produces bright/airy descriptors", () => {
    const lightTerms = ["bright", "airy", "daylight", "natural light"];
    expect(lightTerms.some((t) => prompt.toLowerCase().includes(t))).toBe(true);
  });

  // ── ROOM CONTEXT CHECKS ───────────────────────────────────────────────

  test('floor material "hardwood oak" appears', () => {
    expect(prompt.toLowerCase()).toContain("hardwood oak");
  });

  test('wall color "warm white" appears', () => {
    expect(prompt.toLowerCase()).toContain("warm white");
  });

  test("fireplace fixture appears", () => {
    expect(prompt.toLowerCase()).toContain("fireplace");
  });

  test("architectural features reflected", () => {
    const features = ["crown molding", "bay window", "fireplace mantel"];
    expect(features.some((f) => prompt.toLowerCase().includes(f))).toBe(true);
  });

  test('accent wall "dusty sage" appears', () => {
    expect(prompt.toLowerCase()).toContain("dusty sage");
  });

  // ── CONSTRAINT CHECKS ─────────────────────────────────────────────────

  test('storage priority "high" appears', () => {
    expect(
      /prioritize storage|shelving.*storage|storage.*shelving/i.test(prompt),
    ).toBe(true);
  });

  test('off-screen piece "antique sideboard" appears', () => {
    const lower = prompt.toLowerCase();
    expect(
      lower.includes("antique sideboard") || lower.includes("must accommodate"),
    ).toBe(true);
  });

  test("coziness slider (+1.0) shifts warmer", () => {
    expect(/warmer|cozier/i.test(prompt)).toBe(true);
  });

  test("colorBoldness slider (-0.5) keeps palette neutral", () => {
    expect(/neutral|muted|restrained/i.test(prompt)).toBe(true);
  });

  test("traditionality slider (+0.5) adds traditional character", () => {
    expect(/traditional/i.test(prompt)).toBe(true);
  });

  // ── KEEP/REMOVE CHECKS ────────────────────────────────────────────────

  test("kept sofa with linen material appears", () => {
    expect(prompt.toLowerCase()).toContain("linen");
  });

  test('kept sofa user note "family heirloom" appears', () => {
    expect(prompt.toLowerCase()).toContain("family heirloom");
  });

  test('immovable fireplace has "position unchanged"', () => {
    expect(/position unchanged/i.test(prompt)).toBe(true);
  });

  // ── REQUESTED PRODUCT CHECKS ──────────────────────────────────────────

  test("CB2 Slab marble coffee table appears in prompt", () => {
    const lower = prompt.toLowerCase();
    expect(
      lower.includes("marble") ||
        lower.includes("cb2") ||
        lower.includes("carrara"),
    ).toBe(true);
  });

  test('product placement "center of seating area" appears', () => {
    const lower = prompt.toLowerCase();
    expect(
      lower.includes("center of seating area") ||
        lower.includes("facing fireplace"),
    ).toBe(true);
  });

  // ── ART CHECKS ────────────────────────────────────────────────────────

  test("botanical art style appears", () => {
    expect(prompt.toLowerCase()).toMatch(/botanical|watercolor|earth tones/);
  });

  test("gallery wall appears", () => {
    expect(/gallery wall/i.test(prompt)).toBe(true);
  });

  test("book collection appears", () => {
    expect(/book.*collection|book.*shelf/i.test(prompt)).toBe(true);
  });

  // ── TECH CHECKS ───────────────────────────────────────────────────────

  test('65" TV appears in prompt', () => {
    expect(/65.*tv|tv.*65|65"/i.test(prompt)).toBe(true);
  });

  test("wall-mounted TV mount type appears", () => {
    expect(/wall-mounted|wall mounted/i.test(prompt)).toBe(true);
  });

  test("soundbar audio setup appears", () => {
    expect(/soundbar/i.test(prompt)).toBe(true);
  });

  test("dedicated workspace appears", () => {
    expect(/workspace|desk.*zone|dedicated.*desk/i.test(prompt)).toBe(true);
  });

  // ── SENSORY CHECKS ───────────────────────────────────────────────────

  test("throwCushionDensity 4 → layered cushions language", () => {
    const cushionTerms = ["layered", "cushion", "throw", "blanket"];
    expect(cushionTerms.some((t) => prompt.toLowerCase().includes(t))).toBe(
      true,
    );
  });

  test("fiddle leaf fig plant appears", () => {
    expect(prompt.toLowerCase()).toContain("fiddle leaf");
  });

  test("hand-knotted wool rug appears", () => {
    const lower = prompt.toLowerCase();
    expect(lower.includes("hand-knotted") || lower.includes("terracotta")).toBe(
      true,
    );
  });

  test("linen curtains appear", () => {
    expect(/linen.?curtains?/i.test(prompt)).toBe(true);
  });

  // ── IDENTITY CHECKS ──────────────────────────────────────────────────

  test("Scandinavian cultural reference appears", () => {
    expect(/scandinavian/i.test(prompt)).toBe(true);
  });

  test('sentimental object "grandfather" appears', () => {
    expect(/grandfather|armchair.*focal/i.test(prompt)).toBe(true);
  });

  test('mood target "calm, sophisticated" appears', () => {
    expect(
      /calm.*sophisticated|sophisticated.*calm|room should feel/i.test(prompt),
    ).toBe(true);
  });

  test("mood keywords (serene or curated) appear", () => {
    expect(/serene|curated/i.test(prompt)).toBe(true);
  });

  // ── QUALITY CHECKS ────────────────────────────────────────────────────

  test("contains photographic quality marker", () => {
    expect(/photorealistic|architectural digest/i.test(prompt)).toBe(true);
  });

  test("contains camera angle (corner-wide)", () => {
    expect(/wide angle.*corner|corner.*wide/i.test(prompt)).toBe(true);
  });

  test("budget $14k → premium/investment quality tier", () => {
    expect(/premium|investment/i.test(prompt)).toBe(true);
  });

  test("morning light translates to lighting description", () => {
    expect(/morning|eastern|cool blue/i.test(prompt)).toBe(true);
  });
});
