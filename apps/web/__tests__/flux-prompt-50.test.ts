/**
 * Cova 50-Profile FLUX Prompt Test Suite
 * Tests buildFluxPromptFromContext and buildFluxPrompt from lib/ai/flux.ts
 */

// We need to import from the actual codebase
import { buildFluxPrompt, buildFluxPromptFromContext } from '../lib/ai/flux'
import type { StyleFingerprint } from '../types/fingerprint'
import type { RenderContext, RoomContext, RoomConstraints, KeepMask, BudgetProfile, ArtBrief, TechSpec, SensoryProfile, IdentityBrief } from '../lib/types/area2'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFingerprint(dims: Partial<StyleFingerprint['dimensions']>, confidence = 0.75): StyleFingerprint {
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
  }
}

function makeRoomContext(overrides: Partial<RoomContext> = {}): RoomContext {
  return {
    roomShape: 'rectangular',
    estimatedDimensions: '14x18 ft',
    ceilingHeight: 'standard-8ft',
    ceilingDetail: 'flat drywall',
    naturalLightDirection: 'left',
    naturalLightQuality: 'soft-diffused',
    windowCount: 2,
    windowSize: 'medium',
    floorMaterial: 'Hardwood',
    floorColor: 'honey oak',
    wallColor: 'warm white',
    hasAccentWall: false,
    wallTexture: 'smooth-matte',
    cameraAngle: 'eye-level',
    focalLength: 'standard',
    architecturalFeatures: [],
    dominantColors: ['#F5F0E8', '#A8B5A0'],
    colorTemperature: 'warm',
    existingStyleFingerprint: '',
    surfaceTextures: '',
    userNotes: '',
    aiConfidence: 0.8,
    ...overrides,
  }
}

function makeConstraints(overrides: Partial<RoomConstraints> = {}): RoomConstraints {
  return {
    wallPermanence: 'own-anything-goes',
    physicalConstraints: [],
    bestLightTime: 'morning',
    roomSize: 'medium',
    whoUsesRoom: ['individual'],
    primaryFunction: ['living room'],
    hasPetsOrKids: false,
    storagePriority: 'medium',
    offScreenPieces: '',
    styleDirectionDelta: { coziness: 0, colorBoldness: 0, traditionality: 0 },
    ...overrides,
  }
}

function makeKeepMask(objects: Array<{type: string, keep: boolean, material?: string, dominantColor?: string, immovable?: boolean}> = []): KeepMask {
  return {
    objects: objects.map((o, i) => ({
      id: `obj-${i}`,
      type: o.type,
      bbox: [0, 0, 0.5, 0.5] as [number, number, number, number],
      confidence: 0.9,
      confidenceTier: 'show-user' as const,
      keep: o.keep,
      immovable: o.immovable ?? false,
      material: o.material,
      dominantColor: o.dominantColor,
    })),
    depthMapUrl: '',
    rawDetectionCount: objects.length,
    detectionModelVersion: 'test',
  }
}

function makeBudget(rangeMin: number, rangeMax: number, strategy: BudgetProfile['strategy'] = 'even-quality'): BudgetProfile {
  return { rangeMin, rangeMax, strategy, hardCeiling: false }
}

function makeContext(overrides: Partial<{
  fingerprint: StyleFingerprint,
  roomContext: RoomContext,
  constraints: RoomConstraints,
  keepMask: KeepMask,
  budget: BudgetProfile,
  artBrief: ArtBrief,
  techSpec: TechSpec,
  sensoryProfile: SensoryProfile,
  identityBrief: IdentityBrief,
}> = {}): RenderContext {
  return {
    roomId: 'test-room',
    userId: 'test-user',
    assembledAt: new Date().toISOString(),
    roomContext: overrides.roomContext ?? makeRoomContext(),
    roomConstraints: overrides.constraints ?? makeConstraints(),
    keepMask: overrides.keepMask ?? makeKeepMask(),
    budget: overrides.budget ?? makeBudget(3000, 8000),
    requestedProducts: [],
    artBrief: overrides.artBrief ?? { hasArtDirection: false, visualDirection: '', colorPalette: [], mood: '', abstractionLevel: 'semi-abstract', subjectMatter: '', frameStyle: 'gallery-wrap', placement: 'ai-decides', galleryWall: false, includesPersonalPhotos: false, hasBookCollection: false, hasVinylCollection: false, copyrightSafe: true },
    techSpec: overrides.techSpec ?? { hasTV: false, audioSetup: 'none', smartLighting: false, hasWorkFromHome: false, hasGamingSetup: false },
    sensoryProfile: overrides.sensoryProfile ?? { throwCushionDensity: 2, plantPresence: 'none', hasCandles: false, hasRug: false, windowTreatments: 'none', hasDiffuser: false, overallDensity: 'balanced' },
    identityBrief: overrides.identityBrief ?? { moodTarget: '', moodKeywords: [], personalityTags: [] },
    tabStates: [],
    minimumThresholdMet: true,
    tabsComplete: ['budget'],
    fingerprint: overrides.fingerprint,
  }
}

// ── Test Profiles ──────────────────────────────────────────────────────────

interface TestProfile {
  id: string
  name: string
  context: RenderContext
  // Also test buildFluxPrompt for some profiles
  buildFluxParams?: Parameters<typeof buildFluxPrompt>[0]
}

const TEST_PROFILES: TestProfile[] = [
  // 10 BUDGET RANGE TESTS
  {
    id: 'budget-01', name: 'Ultra-luxury no limit',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6, texture: 0.8, formality: 0.85, nature: 0.5, material: 0.7 }, 0.9),
      budget: makeBudget(50000, 100000, 'hero-piece'),
    }),
  },
  {
    id: 'budget-02', name: 'Mid-range redesign',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.72, nature: 0.68, material: 0.6 }),
      budget: makeBudget(3000, 8000),
    }),
  },
  {
    id: 'budget-03', name: 'Tight refresh budget',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.75, nature: 0.65 }),
      budget: makeBudget(500, 1500),
    }),
  },
  {
    id: 'budget-04', name: 'Splurge on hero piece',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.55, texture: 0.7, formality: 0.65 }),
      budget: makeBudget(2000, 6000, 'hero-piece'),
    }),
  },
  {
    id: 'budget-05', name: 'Equal distribution',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.7, nature: 0.72 }),
      budget: makeBudget(5000, 10000),
    }),
  },
  {
    id: 'budget-06', name: 'Art-forward budget',
    context: makeContext({
      fingerprint: makeFingerprint({ colorSaturation: 0.65, formality: 0.6 }),
      budget: makeBudget(4000, 12000),
      artBrief: { hasArtDirection: true, visualDirection: 'large scale abstract', frameStyle: 'gallery-wrap', galleryWall: true, colorPalette: [], mood: 'bold', abstractionLevel: 'fully-abstract', subjectMatter: 'abstract', placement: 'focal-wall', includesPersonalPhotos: false, hasBookCollection: false, hasVinylCollection: false, copyrightSafe: true },
    }),
  },
  {
    id: 'budget-07', name: 'Tech-heavy budget',
    context: makeContext({
      fingerprint: makeFingerprint({ formality: 0.6, material: 0.35 }),
      budget: makeBudget(8000, 20000),
      techSpec: { hasTV: true, tvSizeInches: 85, tvMountType: 'wall-mounted', audioSetup: 'bookshelf-speakers', smartLighting: true, lightingType: 'smart-color', hasWorkFromHome: true, wfhSetup: 'dedicated-desk-zone', hasGamingSetup: false },
    }),
  },
  {
    id: 'budget-08', name: 'Furniture-first strategy',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.65, texture: 0.7, nature: 0.6 }),
      budget: makeBudget(6000, 15000),
    }),
  },
  {
    id: 'budget-09', name: 'Accessory-focused refresh',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.7, texture: 0.55 }),
      budget: makeBudget(500, 2500),
      sensoryProfile: { throwCushionDensity: 5, plantPresence: 'full-biophilic', plantSpecies: ['monstera', 'fiddle leaf'], hasCandles: true, hasRug: true, rugStyle: 'moroccan vintage kilim', rugSize: 'large-room-anchor', windowTreatments: 'linen-curtains', windowTreatmentColor: 'natural linen', hasDiffuser: true, overallDensity: 'maximalist' },
    }),
  },
  {
    id: 'budget-10', name: 'Mixed category allocation',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6, formality: 0.65, material: 0.7 }),
      budget: makeBudget(10000, 25000, 'category-split'),
    }),
  },

  // 10 STYLE FINGERPRINT EXTREME TESTS
  {
    id: 'style-01', name: 'Maximum calm minimum everything else',
    context: makeContext({
      fingerprint: makeFingerprint({ density: 0.05, colorSaturation: 0.15, formality: 0.2, texture: 0.15, pattern: 0.1, nature: 0.3 }, 0.9),
    }),
  },
  {
    id: 'style-02', name: 'Maximum drama and luxury',
    context: makeContext({
      fingerprint: makeFingerprint({ colorSaturation: 0.90, formality: 0.85, texture: 0.85, density: 0.75, material: 0.25 }, 0.88),
    }),
  },
  {
    id: 'style-03', name: 'Maximum nature and warmth',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.95, nature: 0.98, material: 0.80, texture: 0.85, density: 0.2 }, 0.85),
    }),
  },
  {
    id: 'style-04', name: 'Maximum playfulness',
    context: makeContext({
      fingerprint: makeFingerprint({ pattern: 0.95, culturalInfluence: 0.85, colorSaturation: 0.8, era: 0.75 }, 0.8),
    }),
  },
  {
    id: 'style-05', name: 'Maximum vintage',
    context: makeContext({
      fingerprint: makeFingerprint({ era: 0.98, texture: 0.80, colorTemperature: 0.70, material: 0.60 }, 0.85),
    }),
  },
  {
    id: 'style-06', name: 'Perfectly balanced (all 0.5)',
    context: makeContext({
      fingerprint: makeFingerprint({}, 0.6),
    }),
  },
  {
    id: 'style-07', name: 'Cool minimal luxe',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.15, density: 0.12, formality: 0.88, material: 0.2, texture: 0.2 }, 0.9),
    }),
  },
  {
    id: 'style-08', name: 'Warm eclectic collector',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.85, pattern: 0.90, culturalInfluence: 0.85, texture: 0.90, era: 0.85 }, 0.8),
    }),
  },
  {
    id: 'style-09', name: 'Biophilic sanctuary',
    context: makeContext({
      fingerprint: makeFingerprint({ nature: 0.96, colorTemperature: 0.80, texture: 0.75, density: 0.08, lightPreference: 0.9 }, 0.9),
    }),
  },
  {
    id: 'style-10', name: 'Contemporary gallery',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.25, formality: 0.80, density: 0.3, nature: 0.2, lightPreference: 0.3 }, 0.85),
    }),
  },

  // 10 CONSTRAINT COMBINATION TESTS
  {
    id: 'constraint-01', name: 'Small room low ceiling',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6, nature: 0.5 }),
      roomContext: makeRoomContext({ ceilingHeight: 'low', ceilingDetail: '7.5ft ceiling', windowCount: 1, roomShape: 'rectangular', estimatedDimensions: '10x12 ft' }),
      constraints: makeConstraints({ bestLightTime: 'afternoon', primaryFunction: ['bedroom'] }),
    }),
  },
  {
    id: 'constraint-02', name: 'Large room high ceiling with fixtures',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6, formality: 0.7 }),
      roomContext: makeRoomContext({ ceilingHeight: 'vaulted', ceilingDetail: '14ft vaulted ceiling', windowCount: 6, windowSize: 'floor-to-ceiling', estimatedDimensions: '22x30 ft' }),
      constraints: makeConstraints({ physicalConstraints: ['Fireplace', 'Built-ins', 'Skylight'], primaryFunction: ['living room'] }),
    }),
  },
  {
    id: 'constraint-03', name: 'All areas protected',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.55 }),
      constraints: makeConstraints({ physicalConstraints: ['Bay Window', 'Reading Corner', 'Dining Area'], bestLightTime: 'afternoon' }),
      keepMask: makeKeepMask([
        { type: 'sofa', keep: true, material: 'fabric', dominantColor: 'grey' },
        { type: 'dining-table', keep: true, material: 'wood', dominantColor: 'oak', immovable: true },
        { type: 'bookshelf', keep: true, material: 'wood', dominantColor: 'walnut', immovable: true },
      ]),
    }),
  },
  {
    id: 'constraint-04', name: 'Evening light dramatic room',
    context: makeContext({
      fingerprint: makeFingerprint({ colorSaturation: 0.75, lightPreference: 0.2, formality: 0.7 }),
      roomContext: makeRoomContext({ ceilingHeight: 'high', ceilingDetail: '11ft ceiling', windowCount: 2, floorMaterial: 'Concrete', floorColor: 'polished grey' }),
      constraints: makeConstraints({ bestLightTime: 'evening', primaryFunction: ['living room'] }),
    }),
  },
  {
    id: 'constraint-05', name: 'Family home with kids zone',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.72, nature: 0.6 }),
      constraints: makeConstraints({ hasPetsOrKids: true, whoUsesRoom: ['family-kids'], storagePriority: 'high', primaryFunction: ['family room'] }),
    }),
  },
  {
    id: 'constraint-06', name: 'Open plan wall removal',
    context: makeContext({
      fingerprint: makeFingerprint({ density: 0.6, lightPreference: 0.75 }),
      roomContext: makeRoomContext({ roomShape: 'open-plan', windowCount: 8, estimatedDimensions: '30x40 ft', ceilingHeight: 'high', ceilingDetail: '10ft ceiling' }),
      constraints: makeConstraints({ physicalConstraints: ['Staircase'], primaryFunction: ['living room'] }),
    }),
  },
  {
    id: 'constraint-07', name: 'Historic home features',
    context: makeContext({
      fingerprint: makeFingerprint({ era: 0.8, material: 0.75, texture: 0.7 }),
      roomContext: makeRoomContext({ ceilingHeight: 'high', ceilingDetail: '12ft ceiling with crown molding', windowCount: 5, architecturalFeatures: ['Crown molding', 'Fireplace mantel', 'Exposed beams'] }),
      constraints: makeConstraints({ physicalConstraints: ['Fireplace', 'Exposed Beam'], primaryFunction: ['living room'] }),
    }),
  },
  {
    id: 'constraint-08', name: 'Modern apartment minimal',
    context: makeContext({
      fingerprint: makeFingerprint({ density: 0.2, formality: 0.4, material: 0.35 }),
      roomContext: makeRoomContext({ floorMaterial: 'Concrete', floorColor: 'light grey', windowCount: 2 }),
      constraints: makeConstraints({ wallPermanence: 'renting-no-paint', primaryFunction: ['living room'] }),
    }),
  },
  {
    id: 'constraint-09', name: 'Sunroom maximum light',
    context: makeContext({
      fingerprint: makeFingerprint({ lightPreference: 0.95, nature: 0.8 }),
      roomContext: makeRoomContext({ windowCount: 12, windowSize: 'floor-to-ceiling', naturalLightQuality: 'strong-direct' }),
      constraints: makeConstraints({ physicalConstraints: ['Skylight'], bestLightTime: 'morning', primaryFunction: ['sunroom'] }),
    }),
  },
  {
    id: 'constraint-10', name: 'Renting no paint',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6 }),
      constraints: makeConstraints({ wallPermanence: 'renting-no-paint', primaryFunction: ['living room'] }),
    }),
  },

  // 10 KEEP/REMOVE DECISION TESTS
  {
    id: 'keep-01', name: 'Keep everything',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6 }),
      keepMask: makeKeepMask([
        { type: 'sofa', keep: true, material: 'linen', dominantColor: 'oatmeal' },
        { type: 'coffee-table', keep: true, material: 'wood', dominantColor: 'walnut' },
        { type: 'rug', keep: true, material: 'jute', dominantColor: 'natural' },
        { type: 'floor-lamp', keep: true, material: 'brass', dominantColor: 'gold' },
        { type: 'curtains', keep: true, material: 'linen', dominantColor: 'cream' },
      ]),
    }),
  },
  {
    id: 'keep-02', name: 'Remove everything',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6 }),
      keepMask: makeKeepMask([
        { type: 'sofa', keep: false, material: 'fabric', dominantColor: 'grey' },
        { type: 'coffee-table', keep: false, material: 'glass', dominantColor: 'clear' },
        { type: 'rug', keep: false, material: 'synthetic', dominantColor: 'beige' },
      ]),
    }),
  },
  {
    id: 'keep-03', name: 'Keep hero pieces remove accessories',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.65, texture: 0.7 }),
      keepMask: makeKeepMask([
        { type: 'sofa', keep: true, material: 'performance fabric', dominantColor: 'stone' },
        { type: 'coffee-table', keep: true, material: 'marble', dominantColor: 'white' },
        { type: 'rug', keep: false, material: 'synthetic', dominantColor: 'grey' },
        { type: 'floor-lamp', keep: false, material: 'metal', dominantColor: 'black' },
      ]),
    }),
  },
  {
    id: 'keep-04', name: 'Keep lighting remove furniture',
    context: makeContext({
      fingerprint: makeFingerprint({ lightPreference: 0.8 }),
      keepMask: makeKeepMask([
        { type: 'sofa', keep: false },
        { type: 'chair', keep: false },
        { type: 'pendant-light', keep: true, material: 'brass', dominantColor: 'gold' },
        { type: 'floor-lamp', keep: true, material: 'brass', dominantColor: 'antique brass' },
      ]),
    }),
  },
  {
    id: 'keep-05', name: 'Keep art remove everything else',
    context: makeContext({
      fingerprint: makeFingerprint({ colorSaturation: 0.7 }),
      keepMask: makeKeepMask([
        { type: 'wall-art', keep: true, immovable: true },
        { type: 'sofa', keep: false },
        { type: 'coffee-table', keep: false },
        { type: 'rug', keep: false },
      ]),
    }),
  },
  {
    id: 'keep-06', name: 'Keep sentimental items',
    context: makeContext({
      fingerprint: makeFingerprint({ era: 0.7, colorTemperature: 0.65 }),
      keepMask: makeKeepMask([
        { type: 'armchair', keep: true, material: 'velvet', dominantColor: 'emerald', immovable: true },
        { type: 'piano', keep: true, material: 'wood', dominantColor: 'ebony', immovable: true },
        { type: 'coffee-table', keep: false },
        { type: 'rug', keep: false },
      ]),
    }),
  },
  {
    id: 'keep-07', name: 'Empty room start fresh',
    context: makeContext({
      fingerprint: makeFingerprint({ density: 0.6 }),
      keepMask: makeKeepMask([]),
    }),
  },
  {
    id: 'keep-08', name: 'Mixed decisions many items',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.6 }),
      keepMask: makeKeepMask(
        Array.from({ length: 14 }, (_, i) => ({
          type: ['sofa', 'table', 'lamp', 'decor', 'rug', 'art'][i % 6]!,
          keep: i % 3 !== 0,
          material: 'mixed',
          dominantColor: 'various',
        }))
      ),
    }),
  },
  {
    id: 'keep-09', name: 'Keep expensive remove cheap',
    context: makeContext({
      fingerprint: makeFingerprint({ formality: 0.7, material: 0.75 }),
      keepMask: makeKeepMask([
        { type: 'sofa', keep: true, material: 'performance fabric', dominantColor: 'ivory' },
        { type: 'rug', keep: true, material: 'persian wool', dominantColor: 'vintage red' },
        { type: 'shelf', keep: false, material: 'particleboard', dominantColor: 'white' },
        { type: 'curtains', keep: false, material: 'polyester', dominantColor: 'beige' },
      ]),
    }),
  },
  {
    id: 'keep-10', name: 'Keep new remove old',
    context: makeContext({
      fingerprint: makeFingerprint({ era: 0.3 }),
      keepMask: makeKeepMask([
        { type: 'sectional', keep: true, material: 'bouclé', dominantColor: 'cream' },
        { type: 'bookcase', keep: false, material: 'wood', dominantColor: 'dark oak' },
        { type: 'tv-console', keep: true, material: 'walnut', dominantColor: 'walnut' },
        { type: 'armchair', keep: false, material: 'fabric', dominantColor: 'faded green' },
      ]),
    }),
  },

  // 10 PERSONALIZATION CHAT TESTS
  {
    id: 'chat-01', name: 'All 6 tabs complete full data',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.7, nature: 0.65, texture: 0.6 }),
      budget: makeBudget(5000, 12000),
      artBrief: { hasArtDirection: true, visualDirection: 'abstract nature prints', frameStyle: 'gallery-wrap', galleryWall: false, colorPalette: ['earth tones'], mood: 'calm', abstractionLevel: 'semi-abstract', subjectMatter: 'nature', placement: 'focal-wall', includesPersonalPhotos: false, hasBookCollection: false, hasVinylCollection: false, copyrightSafe: true },
      techSpec: { hasTV: true, tvSizeInches: 65, tvMountType: 'wall-mounted', audioSetup: 'soundbar', smartLighting: true, lightingType: 'smart-warm-only', hasWorkFromHome: false, hasGamingSetup: false },
      sensoryProfile: { throwCushionDensity: 3, plantPresence: 'medium-few', plantSpecies: ['fiddle leaf fig', 'pothos'], hasCandles: false, hasRug: true, rugStyle: 'ivory shag', rugSize: 'large-room-anchor', windowTreatments: 'linen-curtains', windowTreatmentColor: 'natural', hasDiffuser: false, overallDensity: 'balanced' },
      identityBrief: { moodTarget: 'Sunday morning calm', moodKeywords: ['Sunday morning', 'coffee ritual', 'quiet luxury'], personalityTags: ['thoughtful'] },
    }),
  },
  {
    id: 'chat-02', name: 'Tech-obsessed gamer',
    context: makeContext({
      fingerprint: makeFingerprint({ formality: 0.6, material: 0.3, density: 0.3 }),
      techSpec: { hasTV: true, tvSizeInches: 85, tvMountType: 'wall-mounted', audioSetup: 'surround', smartLighting: true, lightingType: 'smart-color', hasWorkFromHome: false, hasGamingSetup: true, gamingSetup: 'full-battlestation' },
      identityBrief: { moodTarget: 'cinematic immersive', moodKeywords: ['cinematic', 'immersive', 'zero clutter'], personalityTags: ['tech'] },
    }),
  },
  {
    id: 'chat-03', name: 'Art collector identity',
    context: makeContext({
      fingerprint: makeFingerprint({ formality: 0.7, colorSaturation: 0.65 }),
      artBrief: { hasArtDirection: true, visualDirection: 'contemporary figurative', frameStyle: 'formal-dark', galleryWall: true, colorPalette: [], mood: 'intellectual', abstractionLevel: 'semi-abstract', subjectMatter: 'figurative', placement: 'distributed-gallery', includesPersonalPhotos: false, hasBookCollection: true, hasVinylCollection: true, copyrightSafe: true },
      identityBrief: { moodTarget: 'museum quality', moodKeywords: ['museum quality', 'conversation starter', 'intellectual home'], personalityTags: ['collector'] },
    }),
  },
  {
    id: 'chat-04', name: 'Plant parent biophilic',
    context: makeContext({
      fingerprint: makeFingerprint({ nature: 0.96, lightPreference: 0.85, colorTemperature: 0.75 }),
      sensoryProfile: { throwCushionDensity: 4, plantPresence: 'full-biophilic', plantSpecies: ['monstera deliciosa', 'bird of paradise', 'pothos', 'snake plant'], hasCandles: false, hasRug: true, rugStyle: 'natural jute', rugSize: 'large-room-anchor', windowTreatments: 'sheer', windowTreatmentColor: 'white', hasDiffuser: false, overallDensity: 'maximalist' },
      identityBrief: { moodTarget: 'jungle sanctuary', moodKeywords: ['greenhouse feel', 'oxygen', 'alive', 'jungle sanctuary'], personalityTags: ['plant-lover'] },
    }),
  },
  {
    id: 'chat-05', name: 'Work from home professional',
    context: makeContext({
      fingerprint: makeFingerprint({ formality: 0.65, density: 0.4 }),
      techSpec: { hasTV: false, audioSetup: 'none', smartLighting: true, lightingType: 'smart-warm-only', hasWorkFromHome: true, wfhSetup: 'dedicated-desk-zone', hasGamingSetup: false },
      identityBrief: { moodTarget: 'productive focus', moodKeywords: ['productive', 'professional video calls', 'focus zone'], personalityTags: ['professional'] },
    }),
  },
  {
    id: 'chat-06', name: 'Cultural references strong',
    context: makeContext({
      fingerprint: makeFingerprint({ culturalInfluence: 0.85, colorTemperature: 0.7 }),
      identityBrief: { culturalReference: 'Japanese', culturalReferenceIntensity: 'moderate', moodTarget: 'tranquil retreat', moodKeywords: ['Japanese ryokan tranquility', 'time slows down here'], personalityTags: ['cultured'] },
    }),
  },
  {
    id: 'chat-07', name: 'Family comfort first',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.72, density: 0.6 }),
      constraints: makeConstraints({ hasPetsOrKids: true, whoUsesRoom: ['family-kids'], storagePriority: 'high', primaryFunction: ['family room'] }),
      sensoryProfile: { throwCushionDensity: 5, plantPresence: 'small-few', hasCandles: false, hasRug: true, rugStyle: 'washable flatweave', rugSize: 'large-room-anchor', windowTreatments: 'blackout', hasDiffuser: false, overallDensity: 'maximalist' },
      identityBrief: { moodTarget: 'family togetherness', moodKeywords: ['family game night', 'movie marathons', 'easy to clean'], personalityTags: ['family'] },
    }),
  },
  {
    id: 'chat-08', name: 'Entertainer social butterfly',
    context: makeContext({
      fingerprint: makeFingerprint({ formality: 0.7, density: 0.65, colorSaturation: 0.6 }),
      identityBrief: { moodTarget: 'dinner party ready', moodKeywords: ['dinner party ready', 'cocktail hour', 'wow moment when guests arrive'], personalityTags: ['social'] },
    }),
  },
  {
    id: 'chat-09', name: 'Minimal data only budget',
    context: makeContext({
      budget: makeBudget(1000, 3000),
    }),
  },
  {
    id: 'chat-10', name: 'All preferences maxed out complex',
    context: makeContext({
      fingerprint: makeFingerprint({ colorTemperature: 0.7, colorSaturation: 0.65, formality: 0.8, texture: 0.75, material: 0.7, era: 0.6, nature: 0.55 }, 0.92),
      budget: makeBudget(20000, 50000, 'hero-piece'),
      artBrief: { hasArtDirection: true, visualDirection: 'contemporary abstract expressionist', frameStyle: 'gallery-wrap', galleryWall: true, colorPalette: ['warm earth', 'gold'], mood: 'bold', abstractionLevel: 'semi-abstract', subjectMatter: 'abstract', placement: 'focal-wall', includesPersonalPhotos: false, hasBookCollection: true, hasVinylCollection: true, copyrightSafe: true },
      techSpec: { hasTV: true, tvSizeInches: 77, tvMountType: 'wall-mounted', tvPlacementWall: 'facing-entrance', audioSetup: 'bookshelf-speakers', smartLighting: true, lightingType: 'smart-color', hasWorkFromHome: false, hasGamingSetup: false },
      sensoryProfile: { throwCushionDensity: 4, plantPresence: 'large-statement', plantSpecies: ['olive tree'], hasCandles: true, hasRug: true, rugStyle: 'vintage overdyed persian', rugSize: 'large-room-anchor', rugColor: 'muted rust', windowTreatments: 'roman-blinds', windowTreatmentColor: 'linen', hasDiffuser: true, overallDensity: 'maximalist' },
      identityBrief: { moodTarget: 'effortless luxury', moodKeywords: ['arrived', 'effortless luxury', 'AD feature ready', 'timeless not trendy'], personalityTags: ['sophisticated'] },
    }),
  },
]

// ── Test Runner ──────────────────────────────────────────────────────────────

interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

function runChecks(profile: TestProfile, prompt: string): CheckResult[] {
  const checks: CheckResult[] = []
  const lc = prompt.toLowerCase()

  // 1. Prompt builds without error — already passed if we get here
  checks.push({ name: 'Prompt builds without error', pass: true, detail: `Length: ${prompt.length} chars` })

  // 2. Minimum length
  checks.push({ name: 'Prompt is sufficiently detailed (>200 chars)', pass: prompt.length > 200, detail: `${prompt.length} chars` })

  // 3. Photorealism markers
  const photoTerms = ['photograph', 'photorealistic', 'camera', 'resolution', 'lens', 'lighting', 'staged', 'architectural digest', 'shot']
  const hasPhotoTerms = photoTerms.some(t => lc.includes(t))
  checks.push({ name: 'Contains photographic quality specs', pass: hasPhotoTerms, detail: hasPhotoTerms ? 'Found photo terms' : 'Missing photo terms' })

  // 4. No forbidden style names
  const forbidden = ['japandi', 'bohemian', 'coastal', 'mid-century modern', 'minimalist']
  const foundForbidden = forbidden.filter(f => lc.includes(f))
  checks.push({ name: 'No forbidden style names', pass: foundForbidden.length === 0, detail: foundForbidden.length > 0 ? `Found: ${foundForbidden.join(', ')}` : 'Clean' })

  // 5. Fingerprint reflected
  const fp = profile.context.fingerprint
  if (fp) {
    const d = fp.dimensions
    const highDims = Object.entries(d).filter(([_, v]) => v > 0.7).map(([k]) => k)
    const lowDims = Object.entries(d).filter(([_, v]) => v < 0.3).map(([k]) => k)
    const dimTerms: Record<string, string[]> = {
      colorTemperature: ['warm', 'amber', 'honey', 'cool', 'slate', 'stone'],
      colorSaturation: ['bold', 'saturated', 'muted', 'desaturated'],
      density: ['sparse', 'minimal', 'layered', 'maximalist', 'richly'],
      formality: ['formal', 'structured', 'casual', 'relaxed'],
      era: ['heritage', 'vintage', 'contemporary', 'cutting-edge'],
      material: ['natural', 'organic', 'manufactured', 'synthetic', 'sleek'],
      texture: ['tactile', 'textured', 'smooth', 'polished'],
      pattern: ['pattern', 'decorative', 'plain', 'solid'],
      lineQuality: ['curved', 'organic', 'geometric', 'angular', 'sharp'],
      lightPreference: ['bright', 'daylight', 'airy', 'lamp', 'intimate', 'cozy'],
      nature: ['plant', 'biophilic', 'green', 'urban'],
      culturalInfluence: ['eclectic', 'global', 'western'],
    }

    const directionalDims = [...highDims, ...lowDims]
    if (directionalDims.length > 0) {
      const anyReflected = directionalDims.some(dim => {
        const terms = dimTerms[dim] || []
        return terms.some(t => lc.includes(t))
      })
      checks.push({ name: 'Style fingerprint reflected in prompt', pass: anyReflected, detail: `Directional dims: ${directionalDims.join(', ')}` })
    }
  }

  // 6. Budget reflected
  const budget = profile.context.budget
  if (budget) {
    const budgetTerms = budget.rangeMax >= 15000
      ? ['designer', 'investment', 'bespoke', 'premium']
      : budget.rangeMax >= 5000
        ? ['premium', 'quality', 'considered', 'investment']
        : budget.rangeMax >= 2000
          ? ['quality', 'mid-range', 'well-made']
          : ['affordable', 'accessible', 'high-street']
    const hasBudgetTerms = budgetTerms.some(t => lc.includes(t))
    checks.push({ name: 'Budget level reflected in prompt', pass: hasBudgetTerms, detail: `Budget: $${budget.rangeMax}, looking for: ${budgetTerms.join('/')}` })
  }

  // 7. Keep decisions reflected
  const keptObjects = profile.context.keepMask?.objects?.filter(o => o.keep || o.immovable) ?? []
  if (keptObjects.length > 0) {
    const keepReflected = lc.includes('preserve') || lc.includes('keep') || lc.includes('unchanged')
    checks.push({ name: 'Keep decisions reflected in prompt', pass: keepReflected, detail: `${keptObjects.length} kept objects` })
  }

  const removedObjects = profile.context.keepMask?.objects?.filter(o => !o.keep && !o.immovable) ?? []
  if (removedObjects.length > 0) {
    const removeReflected = lc.includes('replace') || lc.includes('remov') || lc.includes('without')
    checks.push({ name: 'Remove decisions reflected in prompt', pass: removeReflected, detail: `${removedObjects.length} removed objects` })
  }

  // 8. Room context reflected
  const rc = profile.context.roomContext
  if (rc.ceilingHeight !== 'standard-8ft') {
    const ceilingReflected = lc.includes('ceiling') || lc.includes(rc.ceilingHeight)
    checks.push({ name: 'Ceiling height reflected', pass: ceilingReflected, detail: `Height: ${rc.ceilingHeight}` })
  }

  const cons = profile.context.roomConstraints
  if (cons.physicalConstraints.length > 0) {
    const fixturesReflected = cons.physicalConstraints.some(f => lc.includes(f.toLowerCase()))
    checks.push({ name: 'Fixtures reflected in prompt', pass: fixturesReflected, detail: `Fixtures: ${cons.physicalConstraints.join(', ')}` })
  }

  // 9. Identity keywords
  const identity = profile.context.identityBrief
  if (identity.moodKeywords.length > 0) {
    const keywordReflected = identity.moodKeywords.some(k => lc.includes(k.toLowerCase()))
    checks.push({ name: 'Identity keywords reflected', pass: keywordReflected, detail: `Keywords: ${identity.moodKeywords.slice(0, 3).join(', ')}` })
  }

  // 10. Tech preferences
  const tech = profile.context.techSpec
  if (tech.hasTV && tech.tvSizeInches) {
    const tvReflected = prompt.includes(String(tech.tvSizeInches)) || lc.includes('tv') || lc.includes('television')
    checks.push({ name: 'TV specification reflected', pass: tvReflected, detail: `TV: ${tech.tvSizeInches}"` })
  }

  // 11. Art preferences
  const art = profile.context.artBrief
  if (art.hasArtDirection) {
    const artReflected = lc.includes('art') || lc.includes('wall') || lc.includes(art.visualDirection.toLowerCase().split(' ')[0])
    checks.push({ name: 'Art preferences reflected', pass: artReflected, detail: `Art style: ${art.visualDirection}` })
  }

  // 12. Sensory preferences
  const sensory = profile.context.sensoryProfile
  if (sensory.plantPresence !== 'none') {
    const plantReflected = lc.includes('plant') || lc.includes('biophilic') || lc.includes('green')
    checks.push({ name: 'Plant preferences reflected', pass: plantReflected, detail: `Plants: ${sensory.plantPresence}` })
  }

  // 13. Constraints (pets/kids)
  if (cons.hasPetsOrKids) {
    const petsReflected = lc.includes('performance fabric') || lc.includes('family') || lc.includes('rounded') || lc.includes('durable')
    checks.push({ name: 'Pet/kid safety reflected', pass: petsReflected, detail: 'hasPetsOrKids: true' })
  }

  // 14. Wall permanence
  if (cons.wallPermanence === 'renting-no-paint') {
    const rentingReflected = lc.includes('no paint') || lc.includes('remain') || lc.includes('renting')
    checks.push({ name: 'Renting constraint reflected', pass: rentingReflected, detail: 'renting-no-paint' })
  }

  return checks
}

// @ts-expect-error standalone runner kept for manual CLI execution
async function runTests() { // eslint-disable-line
  const results: Array<{
    id: string
    name: string
    checks: CheckResult[]
    passCount: number
    failCount: number
    prompt: string
  }> = []
  let passed = 0
  let failed = 0

  for (const profile of TEST_PROFILES) {
    const checks: CheckResult[] = []

    let prompt = ''
    try {
      prompt = buildFluxPromptFromContext(profile.context)
    } catch (e) {
      checks.push({ name: 'Prompt builds without error', pass: false, detail: String(e) })
      results.push({ id: profile.id, name: profile.name, checks, passCount: 0, failCount: 1, prompt: '' })
      failed++
      continue
    }

    const profileChecks = runChecks(profile, prompt)
    checks.push(...profileChecks)

    const testPassed = checks.filter(c => c.pass).length
    const testFailed = checks.filter(c => !c.pass).length

    if (testFailed === 0) passed++
    else failed++

    results.push({
      id: profile.id,
      name: profile.name,
      checks,
      passCount: testPassed,
      failCount: testFailed,
      prompt: prompt.substring(0, 400) + (prompt.length > 400 ? '...' : ''),
    })

    const icon = testFailed === 0 ? '✅' : '❌'
    console.log(`${icon} ${profile.id}: ${profile.name} (${testPassed}/${testPassed + testFailed} checks)`)

    if (testFailed > 0) {
      checks.filter(c => !c.pass).forEach(c => {
        console.log(`   ❌ ${c.name}: ${c.detail}`)
      })
    }
  }

  console.log(`\n════ RESULTS: ${passed}/50 profiles fully passing ════`)
  const totalChecks = results.reduce((a, r) => a + r.passCount + r.failCount, 0)
  const passingChecks = results.reduce((a, r) => a + r.passCount, 0)
  const failingChecks = results.reduce((a, r) => a + r.failCount, 0)
  console.log(`Total checks run: ${totalChecks}`)
  console.log(`Checks passing: ${passingChecks}`)
  console.log(`Checks failing: ${failingChecks}`)

  // Save detailed results
  const fs = require('fs')
  fs.writeFileSync('/tmp/test_results_50.json', JSON.stringify(results, null, 2))
  fs.writeFileSync('/tmp/test_summary.md', generateMarkdownReport(results, passed, failed))

  return { passed, failed, results }
}

function generateMarkdownReport(results: any[], passed: number, _failed: number): string {
  let md = `# Cova 50-Profile Test Results\n\n`
  md += `**${passed}/50 profiles fully passing**\n\n`

  const failingProfiles = results.filter((r: any) => r.failCount > 0)
  if (failingProfiles.length > 0) {
    md += `## Failing Profiles\n\n`
    failingProfiles.forEach((r: any) => {
      md += `### ${r.id}: ${r.name}\n`
      r.checks.filter((c: any) => !c.pass).forEach((c: any) => {
        md += `- ❌ ${c.name}: ${c.detail}\n`
      })
      md += `\n**Prompt preview:**\n\`\`\`\n${r.prompt}\n\`\`\`\n\n`
    })
  }

  md += `## All Results\n\n`
  results.forEach((r: any) => {
    md += `- ${r.failCount === 0 ? '✅' : '❌'} **${r.id}**: ${r.name} (${r.passCount}/${r.passCount + r.failCount})\n`
  })

  return md
}

// ── Vitest wrapper ──────────────────────────────────────────────────────────
// The custom runTests() is a standalone runner. Wrap each profile as a Vitest
// test so `vitest run` picks them up properly.
import { describe, it, expect } from 'vitest'

describe('50-Profile FLUX Prompt Suite', () => {
  for (const profile of TEST_PROFILES) {
    it(`${profile.id}: ${profile.name}`, () => {
      const prompt = buildFluxPromptFromContext(profile.context)
      expect(prompt).toBeTruthy()
      expect(prompt).not.toContain('undefined')
      expect(prompt).not.toContain('[object Object]')

      const checks = runChecks(profile, prompt)
      const failures = checks.filter(c => !c.pass)
      if (failures.length > 0) {
        const msg = failures.map(f => `${f.name}: ${f.detail}`).join('\n')
        expect.fail(`${failures.length} check(s) failed:\n${msg}`)
      }
    })
  }
})
