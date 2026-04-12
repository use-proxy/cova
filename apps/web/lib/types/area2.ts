/**
 * Area 2 — canonical types for the detection pipeline and design context.
 * Every other Area 2 file imports from here. Do NOT redefine these inline.
 */

// ─── Screen A ───────────────────────────────────────────────────────────────

export interface RoomContext {
  // Spatial — ranked #1 for FLUX realism
  roomShape: "rectangular" | "l-shaped" | "open-plan" | "irregular";
  estimatedDimensions: string;
  ceilingHeight: "low" | "standard-8ft" | "high" | "vaulted" | "coffered";
  ceilingDetail: string;

  // Lighting — ranked #2
  naturalLightDirection:
    | "left"
    | "right"
    | "front"
    | "back"
    | "overhead"
    | "multiple"
    | "minimal";
  naturalLightQuality: "strong-direct" | "soft-diffused" | "minimal" | "none";
  windowCount: number;
  windowSize:
    | "small-single"
    | "medium"
    | "large"
    | "floor-to-ceiling"
    | "multiple-mixed";

  // Materials — ranked #3
  floorMaterial: string;
  floorColor: string;
  wallColor: string;
  hasAccentWall: boolean;
  accentWallColor?: string;
  wallTexture:
    | "smooth-matte"
    | "smooth-glossy"
    | "textured"
    | "wallpapered"
    | "exposed-brick"
    | "paneled";

  // Camera — ranked #4
  cameraAngle:
    | "eye-level"
    | "slightly-elevated"
    | "corner-wide"
    | "straight-on";
  focalLength: "wide-angle" | "standard" | "slight-telephoto";

  // Architecture
  architecturalFeatures: string[];

  // Color palette
  dominantColors: string[];
  colorTemperature: "warm" | "cool" | "neutral";

  // Style read
  existingStyleFingerprint: string;
  surfaceTextures: string;

  // User corrections
  userNotes: string;
  aiConfidence: number;
}

// ─── Screen B ───────────────────────────────────────────────────────────────

export interface RoomConstraints {
  wallPermanence: "own-anything-goes" | "renting-no-paint" | "some-walls-only";
  physicalConstraints: string[];
  bestLightTime: "morning" | "afternoon" | "evening" | "always-dim";
  roomSize: "small" | "medium" | "large" | "unknown";
  whoUsesRoom: string[];
  primaryFunction: string[];
  hasPetsOrKids: boolean;
  storagePriority: "low" | "medium" | "high";
  offScreenPieces: string;
  styleDirectionDelta: {
    coziness: number;
    colorBoldness: number;
    traditionality: number;
  };
}

// ─── Screen C ───────────────────────────────────────────────────────────────

export interface DetectedObject {
  id: string;
  type: string;
  bbox: [number, number, number, number];
  confidence: number;
  confidenceTier: "show-user" | "use-internally" | "low-use-internally";
  keep: boolean;
  immovable: boolean;
  segmentationMask?: string;
  material?: string;
  dominantColor?: string;
  dominantColorHex?: string;
  sizeInRoom?: "large" | "medium" | "small";
  styleDescriptors?: string[];
  estimatedWidthInches?: number;
  estimatedHeightInches?: number;
  userNote?: string;
  depthMeters?: number;
}

export interface KeepMask {
  objects: DetectedObject[];
  zoneOfInterest?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  depthMapUrl: string;
  rawDetectionCount: number;
  detectionModelVersion: string;
}

// ─── Screen D ───────────────────────────────────────────────────────────────

export interface BudgetProfile {
  rangeMin: number;
  rangeMax: number;
  strategy: "hero-piece" | "even-quality" | "category-split";
  categoryAllocations?: {
    sofa?: [number, number];
    lighting?: [number, number];
    rug?: [number, number];
    tables?: [number, number];
    decor?: [number, number];
    art?: [number, number];
    tech?: [number, number];
  };
  hardCeiling: boolean;
  splurgeCategory?: string;
  tier?: "essential" | "elevated" | "refined" | "prestige" | "signature";
}

export interface RequestedProduct {
  id: string;
  sourceType: "url" | "description" | "image-upload";
  originalInput: string;
  scrapedData?: {
    name: string;
    brand?: string;
    price?: number;
    dimensions?: string;
    color?: string;
    imageUrl?: string;
    retailerUrl: string;
  };
  resolvedAs: "scraped" | "ai-described" | "render-approximation";
  fluxDescription: string;
  placementIntent: "ai-decides" | "specific";
  placementHint?: string;
  confirmedByUser: boolean;
}

export interface ArtBrief {
  hasArtDirection: boolean;
  sourceType?:
    | "uploaded-image"
    | "artist-description"
    | "style-description"
    | "abstract-mood";
  originalInput?: string;
  visualDirection: string;
  colorPalette: string[];
  mood: string;
  abstractionLevel:
    | "photographic"
    | "illustrative"
    | "semi-abstract"
    | "fully-abstract";
  subjectMatter: string;
  frameStyle:
    | "formal-dark"
    | "natural-light"
    | "frameless"
    | "gallery-wrap"
    | "mixed";
  placement: "focal-wall" | "distributed-gallery" | "above-sofa" | "ai-decides";
  galleryWall: boolean;
  chosenArtImageUrl?: string;
  generatedOptions?: string[];
  includesPersonalPhotos: boolean;
  hasBookCollection: boolean;
  hasVinylCollection: boolean;
  copyrightSafe: boolean;
  artUrl?: string;
}

export interface TechSpec {
  hasTV: boolean;
  tvSizeInches?: number;
  tvMountType?: "wall-mounted" | "console" | "frame-tv";
  tvPlacementWall?:
    | "ai-decides"
    | "left"
    | "right"
    | "facing-entrance"
    | "other";
  audioSetup?:
    | "none"
    | "soundbar"
    | "bookshelf-speakers"
    | "floor-standing"
    | "surround"
    | "earbuds-only";
  audioProducts?: RequestedProduct[];
  smartLighting: boolean;
  lightingType?:
    | "standard"
    | "smart-color"
    | "smart-warm-only"
    | "statement-fixture";
  hasWorkFromHome: boolean;
  wfhSetup?: "dedicated-desk-zone" | "shared-surface" | "minimal";
  hasGamingSetup: boolean;
  gamingSetup?: "full-battlestation" | "console-only" | "casual";
  otherTech?: string;
  suggestedProducts?: RequestedProduct[];
}

export interface SensoryProfile {
  throwCushionDensity: 1 | 2 | 3 | 4 | 5;
  throwStyle?: string;
  plantPresence:
    | "none"
    | "small-few"
    | "medium-few"
    | "large-statement"
    | "full-biophilic";
  plantSpecies?: string[];
  hasCandles: boolean;
  candleStyle?: string;
  hasRug: boolean;
  rugSize?: "small-accent" | "medium" | "large-room-anchor";
  rugStyle?: string;
  rugColor?: string;
  windowTreatments:
    | "none"
    | "sheer"
    | "linen-curtains"
    | "blackout"
    | "roman-blinds"
    | "shutters";
  windowTreatmentColor?: string;
  hasDiffuser: boolean;
  overallDensity: "minimal" | "balanced" | "maximalist";
}

export interface IdentityBrief {
  culturalReference?: string;
  culturalReferenceIntensity?: "subtle" | "moderate" | "prominent";
  fandoms?: string[];
  fandomTreatment?: "very-subtle" | "tasteful" | "featured";
  interests?: string[];
  sentimentalObjects?: {
    description: string;
    imageUrl?: string;
    placement: string;
  }[];
  moodTarget: string;
  moodKeywords: string[];
  personalityTags: string[];
}

// ─── Tab conversation state ──────────────────────────────────────────────────

export type TabId =
  | "all"
  | "budget"
  | "products"
  | "art"
  | "tech"
  | "sensory"
  | "identity";

export type TabExtractedData =
  | Partial<BudgetProfile>
  | Partial<RequestedProduct>[]
  | Partial<ArtBrief>
  | Partial<TechSpec>
  | Partial<SensoryProfile>
  | Partial<IdentityBrief>;

export interface TabConversationState {
  tabId: TabId;
  messages: { role: "assistant" | "user"; content: string }[];
  isComplete: boolean;
  completionReason?: string;
  extractedData: TabExtractedData;
}

// ─── Master render context ───────────────────────────────────────────────────

export interface RenderContext {
  schemaVersion?: string;
  roomId: string;
  userId: string;
  assembledAt: string;

  // From screens A, B, C
  roomContext: RoomContext;
  roomConstraints: RoomConstraints;
  keepMask: KeepMask;

  // From Screen D tabs
  budget: BudgetProfile;
  requestedProducts: RequestedProduct[];
  artBrief: ArtBrief;
  techSpec: TechSpec;
  sensoryProfile: SensoryProfile;
  identityBrief: IdentityBrief;

  // Tab conversation history (for resuming sessions)
  tabStates: TabConversationState[];

  // From Area 1 style quiz
  fingerprint?: import("@/types/fingerprint").StyleFingerprint;

  // Optional style blend metadata written by the quiz pipeline
  styleBlend?: Record<string, number>;
  style_blend?: Record<string, number>;

  // Assembled FLUX prompt (built from all above)
  fluxPrompt?: string;
  fluxPromptVersion?: string;

  // Completion tracking
  minimumThresholdMet: boolean;
  tabsComplete: string[];
}
