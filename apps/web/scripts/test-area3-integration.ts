/**
 * Test: Area 1 fingerprint flows into buildFluxPromptFromContext()
 *
 * Run: npx tsx apps/web/scripts/test-area3-integration.ts
 */

import { buildFluxPromptFromContext } from "../lib/ai/flux";
import type { RenderContext } from "../lib/types/area2";
import type { StyleFingerprint } from "../types/fingerprint";

// ── Mock fingerprint: colorTemperature=0.8 (warm), density=0.2 (minimal),
//    lightPreference=0.9 (bright daylight), all others at 0.5 (neutral)
const mockFingerprint: StyleFingerprint = {
  dimensions: {
    colorTemperature: 0.8,
    colorSaturation: 0.5,
    density: 0.2,
    formality: 0.5,
    era: 0.5,
    material: 0.5,
    texture: 0.5,
    pattern: 0.5,
    lineQuality: 0.5,
    lightPreference: 0.9,
    nature: 0.5,
    culturalInfluence: 0.5,
  },
  covariance: Array(12).fill(Array(12).fill(0)),
  confidence: 0.85,
};

// ── Full mock RenderContext with all 14 sections populated ──────────────────
const mockContext: RenderContext = {
  roomId: "test-room-123",
  userId: "test-user-456",
  assembledAt: new Date().toISOString(),

  fingerprint: mockFingerprint,

  roomContext: {
    roomShape: "rectangular",
    estimatedDimensions: "14ft × 18ft",
    ceilingHeight: "standard-8ft",
    ceilingDetail: "recessed lighting",
    naturalLightDirection: "left",
    naturalLightQuality: "soft-diffused",
    windowCount: 2,
    windowSize: "large",
    floorMaterial: "hardwood oak",
    floorColor: "warm honey",
    wallColor: "warm white",
    hasAccentWall: true,
    accentWallColor: "dusty sage",
    wallTexture: "smooth-matte",
    cameraAngle: "corner-wide",
    focalLength: "wide-angle",
    architecturalFeatures: ["crown molding", "bay window", "built-in shelving"],
    dominantColors: ["warm white", "honey", "sage"],
    colorTemperature: "warm",
    existingStyleFingerprint: "transitional",
    surfaceTextures: "smooth walls, medium-grain wood",
    userNotes: "",
    aiConfidence: 0.88,
  },

  roomConstraints: {
    wallPermanence: "own-anything-goes",
    physicalConstraints: [
      "HVAC vent on south wall",
      "load-bearing column in corner",
    ],
    bestLightTime: "afternoon",
    roomSize: "large",
    whoUsesRoom: ["couple", "family-kids"],
    primaryFunction: ["living room"],
    hasPetsOrKids: true,
    storagePriority: "high",
    offScreenPieces: "antique sideboard from grandmother",
    styleDirectionDelta: {
      coziness: 1.5,
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
    rangeMin: 5000,
    rangeMax: 12000,
    strategy: "hero-piece",
    hardCeiling: true,
    splurgeCategory: "sofa",
  },

  requestedProducts: [
    {
      id: "prod-1",
      sourceType: "url",
      originalInput: "https://example.com/sofa",
      resolvedAs: "scraped",
      fluxDescription:
        "deep blue velvet sofa, mid-century silhouette with walnut legs",
      placementIntent: "specific",
      placementHint: "against the north wall facing the fireplace",
      confirmedByUser: true,
    },
    {
      id: "prod-2",
      sourceType: "description",
      originalInput: "a jute rug",
      resolvedAs: "ai-described",
      fluxDescription:
        "8x10 natural jute area rug with subtle herringbone pattern",
      placementIntent: "ai-decides",
      confirmedByUser: true,
    },
  ],

  artBrief: {
    hasArtDirection: true,
    sourceType: "style-description",
    originalInput: "abstract landscapes",
    visualDirection: "large-scale abstract landscape in warm earth tones",
    colorPalette: ["ochre", "sienna", "cream"],
    mood: "serene",
    abstractionLevel: "semi-abstract",
    subjectMatter: "landscape",
    frameStyle: "natural-light",
    placement: "focal-wall",
    galleryWall: true,
    chosenArtImageUrl: "https://example.com/art.jpg",
    includesPersonalPhotos: false,
    hasBookCollection: true,
    hasVinylCollection: true,
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
    throwCushionDensity: 3,
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
    fandoms: ["jazz"],
    fandomTreatment: "tasteful",
    interests: ["music", "reading"],
    sentimentalObjects: [
      {
        description: "vintage leather armchair inherited from grandfather",
        placement: "reading corner by window",
      },
    ],
    moodTarget: "calm, sophisticated, and inviting",
    moodKeywords: ["serene", "warm", "curated"],
    personalityTags: ["book lover", "music enthusiast"],
  },

  tabStates: [],
  minimumThresholdMet: true,
  tabsComplete: ["budget", "products", "art", "tech", "sensory", "identity"],
};

// ── Run test ────────────────────────────────────────────────────────────────
console.log("Running buildFluxPromptFromContext integration test...\n");

const result = buildFluxPromptFromContext(mockContext);

console.log("=== Generated Prompt ===");
console.log(result);
console.log("========================\n");

// ── Assertions ──────────────────────────────────────────────────────────────
const assertions: Array<{ label: string; pass: boolean }> = [
  {
    label: 'Contains "warm amber" (high colorTemperature)',
    pass: result.toLowerCase().includes("warm amber"),
  },
  {
    label: 'Contains "bright airy" or "daylight" (high lightPreference)',
    pass:
      result.toLowerCase().includes("bright airy") ||
      result.toLowerCase().includes("daylight"),
  },
  {
    label: 'Contains "minimal" (low density)',
    pass: result.toLowerCase().includes("minimal"),
  },
  {
    label: 'Contains floor material "hardwood oak"',
    pass: result.toLowerCase().includes("hardwood oak"),
  },
  {
    label: 'Contains wall color "warm white"',
    pass: result.toLowerCase().includes("warm white"),
  },
  {
    label: "Contains at least one kept object description (sofa or fireplace)",
    pass:
      result.toLowerCase().includes("sofa") ||
      result.toLowerCase().includes("fireplace"),
  },
  {
    label: "At least 100 characters total",
    pass: result.length >= 100,
  },
  {
    label: "Contains plant species (fiddle leaf fig)",
    pass: result.toLowerCase().includes("fiddle leaf"),
  },
  {
    label: "Contains color boldness note (neutral palette)",
    pass: /neutral|muted|restrained/i.test(result),
  },
  {
    label: "Contains confidence-aware style prefix",
    pass: /style:|style leaning/i.test(result),
  }, // ─── Screen B constraints ───────────────────────────────────────────────
  {
    label: "Contains pets/kids material constraint",
    pass: /performance fabric/i.test(result),
  },
  {
    label: "Contains physical constraints (HVAC vent)",
    pass:
      result.toLowerCase().includes("hvac") ||
      result.toLowerCase().includes("fixed elements"),
  },
  {
    label: "Contains off-screen piece (antique sideboard)",
    pass:
      result.toLowerCase().includes("antique sideboard") ||
      result.toLowerCase().includes("must accommodate"),
  },
  {
    label: "Contains storage priority directive",
    pass: /prioritize storage|shelving.*storage|storage.*shelving/i.test(
      result,
    ),
  },
  {
    label: "Contains traditionality slider (>= 0.5)",
    pass: /traditional/i.test(result),
  },
  {
    label: "Contains kept object material (linen)",
    pass: result.toLowerCase().includes("linen"),
  },
  {
    label: "Contains immovable object note (fireplace)",
    pass: /position unchanged/i.test(result),
  },
  {
    label: "Contains kept object user note (family heirloom)",
    pass: result.toLowerCase().includes("family heirloom"),
  },
  {
    label: "Contains specific product with placement (sofa against north wall)",
    pass:
      result.toLowerCase().includes("north wall") ||
      result.toLowerCase().includes("facing the fireplace"),
  },
  {
    label: "Contains second confirmed product (jute rug)",
    pass: result.toLowerCase().includes("jute"),
  },
  {
    label: "Contains art visual direction",
    pass:
      result.toLowerCase().includes("abstract landscape") ||
      result.toLowerCase().includes("earth tones"),
  },
  {
    label: "Contains gallery wall note",
    pass: /gallery wall/i.test(result),
  },
  {
    label: "Contains vinyl collection note",
    pass: /vinyl/i.test(result),
  },
  {
    label: "Contains TV size and mount type",
    pass: /65.*tv|tv.*65/i.test(result) || result.includes('65"'),
  },
  {
    label: "Contains audio setup",
    pass: /soundbar/i.test(result),
  },
  {
    label: "Contains WFH workspace",
    pass: /workspace|desk.*zone|dedicated.*desk/i.test(result),
  },
  {
    label: "Contains cushion density (level 3)",
    pass: /several cushions|draped throw/i.test(result),
  },
  {
    label: "Contains rug description",
    pass:
      result.toLowerCase().includes("hand-knotted") ||
      result.toLowerCase().includes("terracotta"),
  },
  {
    label: "Contains window treatments",
    pass: /linen-curtains|linen curtains/i.test(result),
  },
  {
    label: "Contains cultural reference (Scandinavian)",
    pass: /scandinavian/i.test(result),
  },
  {
    label: "Contains fandom translation (jazz → design language)",
    pass: /vinyl shelf|rich wood|low ambient|amber tones/i.test(result),
  },
  {
    label: "Contains sentimental object",
    pass: /grandfather|armchair.*focal|focal.*armchair/i.test(result),
  },
  {
    label: "Contains mood target",
    pass: /calm.*sophisticated|sophisticated.*calm|room should feel/i.test(
      result,
    ),
  },
  {
    label: "Contains mood keywords",
    pass: /serene|curated/i.test(result),
  },
  {
    label: "Contains budget quality tier (premium, $12k)",
    pass: /premium materials|investment pieces/i.test(result),
  },
  {
    label: "Contains camera angle (corner-wide)",
    pass: /wide angle.*corner|corner.*wide/i.test(result),
  },
  {
    label: "Contains quality closer (Architectural Digest)",
    pass: /architectural digest/i.test(result),
  },
];

let allPassed = true;
for (const { label, pass } of assertions) {
  const icon = pass ? "✓" : "✗";
  console.log(`${icon} ${label}`);
  if (!pass) allPassed = false;
}

console.log(`\nPrompt length: ${result.length} chars`);
console.log(
  `\n${allPassed ? "ALL ASSERTIONS PASSED" : "SOME ASSERTIONS FAILED"}`,
);

if (!allPassed) process.exit(1);
