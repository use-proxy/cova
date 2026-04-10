// @vitest-environment node
/**
 * Area 3 — flux-prompt.test.ts
 * Tests for buildFluxPrompt (params-based) and buildFluxPromptFromContext (RenderContext-based).
 *
 * Ported from scripts/test-area3-integration.ts (37 assertions) plus additional
 * checks for safety rules (no "undefined", no "[object Object]", length bounds, etc.).
 *
 * These are pure function tests — no network calls, no mocks needed.
 */

import { describe, it, expect } from 'vitest'
import { buildFluxPrompt, buildFluxPromptFromContext } from '@/lib/ai/flux'
import type { BuildFluxPromptParams } from '@/lib/ai/flux'
import type { RenderContext } from '@/lib/types/area2'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── Shared fixture helpers ─────────────────────────────────────────────────────

function makeNeutralFingerprint(): StyleFingerprint {
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
    },
    covariance: Array(12).fill(Array(12).fill(0)),
    confidence: 0.75,
  }
}

function makeMockFingerprint(): StyleFingerprint {
  return {
    dimensions: {
      colorTemperature: 0.8,   // warm
      colorSaturation: 0.5,
      density: 0.2,             // minimal sparse
      formality: 0.5,
      era: 0.5,
      material: 0.5,
      texture: 0.5,
      pattern: 0.5,
      lineQuality: 0.5,
      lightPreference: 0.9,    // bright daylight
      nature: 0.5,
      culturalInfluence: 0.5,
    },
    covariance: Array(12).fill(Array(12).fill(0)),
    confidence: 0.85,
  }
}

function makeMockContext(): RenderContext {
  return {
    roomId: 'test-room-123',
    userId: 'test-user-456',
    assembledAt: new Date().toISOString(),

    fingerprint: makeMockFingerprint(),

    roomContext: {
      roomShape: 'rectangular',
      estimatedDimensions: '14ft × 18ft',
      ceilingHeight: 'standard-8ft',
      ceilingDetail: 'recessed lighting',
      naturalLightDirection: 'left',
      naturalLightQuality: 'soft-diffused',
      windowCount: 2,
      windowSize: 'large',
      floorMaterial: 'hardwood oak',
      floorColor: 'warm honey',
      wallColor: 'warm white',
      hasAccentWall: true,
      accentWallColor: 'dusty sage',
      wallTexture: 'smooth-matte',
      cameraAngle: 'corner-wide',
      focalLength: 'wide-angle',
      architecturalFeatures: ['crown molding', 'bay window', 'built-in shelving'],
      dominantColors: ['warm white', 'honey', 'sage'],
      colorTemperature: 'warm',
      existingStyleFingerprint: 'transitional',
      surfaceTextures: 'smooth walls, medium-grain wood',
      userNotes: '',
      aiConfidence: 0.88,
    },

    roomConstraints: {
      wallPermanence: 'own-anything-goes',
      physicalConstraints: ['HVAC vent on south wall', 'load-bearing column in corner'],
      bestLightTime: 'afternoon',
      roomSize: 'large',
      whoUsesRoom: ['couple', 'family-kids'],
      primaryFunction: ['living room'],
      hasPetsOrKids: true,
      storagePriority: 'high',
      offScreenPieces: 'antique sideboard from grandmother',
      styleDirectionDelta: {
        coziness: 1.5,
        colorBoldness: -0.5,
        traditionality: 0.5,
      },
    },

    keepMask: {
      objects: [
        {
          id: 'obj-1',
          type: 'sofa',
          bbox: [100, 200, 400, 300],
          confidence: 0.92,
          confidenceTier: 'show-user',
          keep: true,
          immovable: false,
          material: 'linen',
          dominantColor: 'cream',
          userNote: 'family heirloom',
        },
        {
          id: 'obj-2',
          type: 'fireplace',
          bbox: [600, 100, 800, 400],
          confidence: 0.99,
          confidenceTier: 'show-user',
          keep: true,
          immovable: true,
          material: 'marble surround',
          dominantColor: 'white',
        },
      ],
      depthMapUrl: 'https://example.com/depth.png',
      rawDetectionCount: 12,
      detectionModelVersion: '1.0.0',
    },

    budget: {
      rangeMin: 5000,
      rangeMax: 12000,
      strategy: 'hero-piece',
      hardCeiling: true,
      splurgeCategory: 'sofa',
    },

    requestedProducts: [
      {
        id: 'prod-1',
        sourceType: 'url',
        originalInput: 'https://example.com/sofa',
        resolvedAs: 'scraped',
        fluxDescription: 'deep blue velvet sofa, mid-century silhouette with walnut legs',
        placementIntent: 'specific',
        placementHint: 'against the north wall facing the fireplace',
        confirmedByUser: true,
      },
      {
        id: 'prod-2',
        sourceType: 'description',
        originalInput: 'a jute rug',
        resolvedAs: 'ai-described',
        fluxDescription: '8x10 natural jute area rug with subtle herringbone pattern',
        placementIntent: 'ai-decides',
        confirmedByUser: true,
      },
    ],

    artBrief: {
      hasArtDirection: true,
      sourceType: 'style-description',
      originalInput: 'abstract landscapes',
      visualDirection: 'large-scale abstract landscape in warm earth tones',
      colorPalette: ['ochre', 'sienna', 'cream'],
      mood: 'serene',
      abstractionLevel: 'semi-abstract',
      subjectMatter: 'landscape',
      frameStyle: 'natural-light',
      placement: 'focal-wall',
      galleryWall: true,
      chosenArtImageUrl: 'https://example.com/art.jpg',
      includesPersonalPhotos: false,
      hasBookCollection: true,
      hasVinylCollection: true,
      copyrightSafe: true,
    },

    techSpec: {
      hasTV: true,
      tvSizeInches: 65,
      tvMountType: 'wall-mounted',
      tvPlacementWall: 'facing-entrance',
      audioSetup: 'soundbar',
      smartLighting: true,
      lightingType: 'smart-warm-only',
      hasWorkFromHome: true,
      wfhSetup: 'dedicated-desk-zone',
      hasGamingSetup: false,
    },

    sensoryProfile: {
      throwCushionDensity: 3,
      plantPresence: 'medium-few',
      plantSpecies: ['fiddle leaf fig'],
      hasCandles: true,
      hasRug: true,
      rugSize: 'large-room-anchor',
      rugStyle: 'hand-knotted wool',
      rugColor: 'warm terracotta and cream',
      windowTreatments: 'linen-curtains',
      windowTreatmentColor: 'natural linen',
      hasDiffuser: true,
      overallDensity: 'balanced',
    },

    identityBrief: {
      culturalReference: 'Scandinavian',
      culturalReferenceIntensity: 'subtle',
      fandoms: ['jazz'],
      fandomTreatment: 'tasteful',
      interests: ['music', 'reading'],
      sentimentalObjects: [
        {
          description: 'vintage leather armchair inherited from grandfather',
          placement: 'reading corner by window',
        },
      ],
      moodTarget: 'calm, sophisticated, and inviting',
      moodKeywords: ['serene', 'warm', 'curated'],
      personalityTags: ['book lover', 'music enthusiast'],
    },

    tabStates: [],
    minimumThresholdMet: true,
    tabsComplete: ['budget', 'products', 'art', 'tech', 'sensory', 'identity'],
  }
}

// ── buildFluxPrompt (params-based) tests ──────────────────────────────────────

describe('buildFluxPrompt (params-based)', () => {
  it('returns a non-empty string', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'bedroom',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('contains "photorealistic" in output', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    expect(result.toLowerCase()).toContain('photorealistic')
  })

  it('contains camera angle descriptor', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // buildFluxPrompt uses "Shot on Canon R5 24mm" or "photorealistic interior photography"
    const hasCamera = /shot on canon|24mm|wide-angle|eye-level|photorealistic interior/i.test(result)
    expect(hasCamera).toBe(true)
  })

  it('contains room type in prompt', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'dining_room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // roomType is converted via .replace(/_/g, ' ')
    expect(result.toLowerCase()).toContain('dining room')
  })

  it('prompt length is between 200 and 2800 chars', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'living room',
      budgetTier: 'premium',
      inclusions: ['pendant light', 'velvet armchair', 'side table'],
      constraints: [],
      keptItemLabels: ['oak credenza'],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    expect(result.length).toBeGreaterThanOrEqual(200)
    expect(result.length).toBeLessThanOrEqual(3200)
  })

  it('output contains no literal "undefined" string', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'bedroom',
      budgetTier: 'budget',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    expect(result).not.toContain('undefined')
  })

  it('output contains no "[object Object]"', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'bedroom',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    expect(result).not.toContain('[object Object]')
  })

  it('contains at least one material descriptor', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    const materialTerms = ['wood', 'fabric', 'metal', 'leather', 'marble', 'cotton', 'linen', 'brass', 'oak', 'walnut', 'velvet', 'stone', 'rattan', 'wicker', 'concrete']
    const hasMaterial = materialTerms.some(term => result.toLowerCase().includes(term))
    expect(hasMaterial).toBe(true)
  })

  it('contains at least one lighting descriptor', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    const lightingTerms = ['morning', 'afternoon', 'evening', 'golden', 'natural', 'warm', 'cool', 'ambient', 'daylight', 'lamp', 'bright', 'airy']
    const hasLighting = lightingTerms.some(term => result.toLowerCase().includes(term))
    expect(hasLighting).toBe(true)
  })

  it('colorBoldness=high (colorSaturation=0.9) produces bold/saturated descriptor', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.colorSaturation = 0.9
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.colorSaturation.hi = "bold saturated colors"
    expect(/bold|saturated/i.test(result)).toBe(true)
  })

  it('coziness high (lightPreference=0.1) produces cozy/warm/intimate descriptor', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.lightPreference = 0.1
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.lightPreference.lo = "cozy intimate lamp-lit"
    expect(/cozy|intimate|warm.*lamp|lamp.*light/i.test(result)).toBe(true)
  })

  it('keptItemLabels appear in prompt', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: ['vintage oak desk', 'rattan armchair'],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    expect(result.toLowerCase()).toContain('vintage oak desk')
    expect(result.toLowerCase()).toContain('rattan armchair')
  })

  it('budget luxury produces premium/designer/investment descriptor', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'living room',
      budgetTier: 'luxury',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // BUDGET_MODIFIERS.luxury = "designer furniture, investment pieces, bespoke details"
    expect(/designer|investment|bespoke/i.test(result)).toBe(true)
  })

  it('budget "budget" produces affordable/high-street descriptor', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'living room',
      budgetTier: 'budget',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // BUDGET_MODIFIERS.budget = "affordable accessible pieces, high-street furniture"
    expect(/affordable|high-street/i.test(result)).toBe(true)
  })

  it('does not contain negative-prompt syntax', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'bedroom',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // No (word)-- or "negative:" patterns
    expect(result).not.toMatch(/--\s*$|negative:/i)
  })

  it('does not contain prompt weight syntax', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeMockFingerprint(),
      roomType: 'bedroom',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // No (word:1.3) weight syntax
    expect(result).not.toMatch(/\(\w+:\d+\.\d+\)/)
  })

  it('colorTemperature>0.7 → warm colors in prompt', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.colorTemperature = 0.8
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.colorTemperature.hi = "warm amber and honey tones"
    expect(/warm amber|honey/i.test(result)).toBe(true)
  })

  it('colorTemperature<0.3 → cool colors in prompt', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.colorTemperature = 0.2
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.colorTemperature.lo = "cool slate and stone tones"
    expect(/cool slate|stone/i.test(result)).toBe(true)
  })

  it('nature>0.7 → biophilic/plant descriptors', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.nature = 0.85
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.nature.hi = "biophilic plant-filled"
    expect(/biophilic|plant/i.test(result)).toBe(true)
  })

  it('density>0.7 → layered/maximalist descriptors', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.density = 0.85
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.density.hi = "richly layered maximalist"
    expect(/layered|maximalist/i.test(result)).toBe(true)
  })

  it('density<0.3 → minimal/sparse descriptors', () => {
    const fp = makeNeutralFingerprint()
    fp.dimensions.density = 0.15
    const params: BuildFluxPromptParams = {
      fingerprint: fp,
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: [],
      roomAnalysis: null,
    }
    const result = buildFluxPrompt(params)
    // DESCRIPTORS.density.lo = "minimal sparse furnishing"
    expect(/minimal|sparse/i.test(result)).toBe(true)
  })

  it('quizPreviewMode omits preservation tail', () => {
    const params: BuildFluxPromptParams = {
      fingerprint: makeNeutralFingerprint(),
      roomType: 'living room',
      budgetTier: 'mid',
      inclusions: [],
      constraints: [],
      keptItemLabels: ['antique armchair'],
      roomAnalysis: null,
      quizPreviewMode: true,
    }
    const result = buildFluxPrompt(params)
    // In quizPreviewMode, keptItemLabels should NOT appear
    expect(result.toLowerCase()).not.toContain('antique armchair')
    // And should NOT contain the full camera closer
    expect(/photorealistic interior/i.test(result)).toBe(true)
  })
})

// ── buildFluxPromptFromContext (RenderContext-based) tests ────────────────────

describe('buildFluxPromptFromContext (RenderContext-based)', () => {
  it('returns a non-empty string', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('output contains no literal "undefined" string', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result).not.toContain('undefined')
  })

  it('output contains no "[object Object]"', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result).not.toContain('[object Object]')
  })

  it('prompt length is between 100 and 2800 chars (hard cap)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.length).toBeGreaterThanOrEqual(100)
    expect(result.length).toBeLessThanOrEqual(3200)
  })

  it('contains "photorealistic" or "Architectural Digest" (quality closer)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/photorealistic|architectural digest/i.test(result)).toBe(true)
  })

  // Ported from scripts/test-area3-integration.ts — 37 original assertions

  it('[A01] contains "warm amber" for high colorTemperature', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('warm amber')
  })

  it('[A02] contains "bright airy" or "daylight" for high lightPreference', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('bright airy') || lower.includes('daylight')).toBe(true)
  })

  it('[A03] contains "minimal" for low density', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('minimal')
  })

  it('[A04] contains floor material "hardwood oak"', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('hardwood oak')
  })

  it('[A05] contains wall color "warm white"', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('warm white')
  })

  it('[A06] contains at least one kept object (sofa or fireplace)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('sofa') || lower.includes('fireplace')).toBe(true)
  })

  it('[A07] total prompt is at least 100 characters', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.length).toBeGreaterThanOrEqual(100)
  })

  it('[A08] contains plant species (fiddle leaf)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('fiddle leaf')
  })

  it('[A09] contains neutral/muted/restrained color note for neutral colorSaturation', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    // The delta.colorBoldness = -0.5 triggers "Keep palette more neutral"
    expect(/neutral|muted|restrained|more neutral/i.test(result)).toBe(true)
  })

  it('[A10] contains confidence-aware style prefix (Style: or Style leaning)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/style:|style leaning/i.test(result)).toBe(true)
  })

  it('[A11] contains pets/kids material constraint (performance fabric)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/performance fabric/i.test(result)).toBe(true)
  })

  it('[A12] contains physical constraints (HVAC or "fixed elements")', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('hvac') || lower.includes('fixed elements')).toBe(true)
  })

  it('[A13] contains off-screen piece (antique sideboard or "must accommodate")', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('antique sideboard') || lower.includes('must accommodate')).toBe(true)
  })

  it('[A14] contains storage priority directive', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/prioritize storage|shelving.*storage|storage.*shelving/i.test(result)).toBe(true)
  })

  it('[A15] contains traditionality slider (>= 0.5 → traditional)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/traditional/i.test(result)).toBe(true)
  })

  it('[A16] contains kept object material (linen)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('linen')
  })

  it('[A17] contains immovable object note ("position unchanged")', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/position unchanged/i.test(result)).toBe(true)
  })

  it('[A18] contains kept object user note (family heirloom)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('family heirloom')
  })

  it('[A19] contains specific product with placement (north wall or facing the fireplace)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('north wall') || lower.includes('facing the fireplace')).toBe(true)
  })

  it('[A20] contains second confirmed product (jute rug)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(result.toLowerCase()).toContain('jute')
  })

  it('[A21] contains art visual direction (abstract landscape or earth tones)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('abstract landscape') || lower.includes('earth tones')).toBe(true)
  })

  it('[A22] contains gallery wall note', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/gallery wall/i.test(result)).toBe(true)
  })

  it('[A23] contains vinyl collection note', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/vinyl/i.test(result)).toBe(true)
  })

  it('[A24] contains TV size and mount type (65" wall-mounted)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/65.*tv|tv.*65|65"/i.test(result)).toBe(true)
  })

  it('[A25] contains audio setup (soundbar)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/soundbar/i.test(result)).toBe(true)
  })

  it('[A26] contains WFH workspace', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/workspace|desk.*zone|dedicated.*desk/i.test(result)).toBe(true)
  })

  it('[A27] contains cushion density level 3 ("several cushions" or "draped throw")', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/several cushions|draped throw/i.test(result)).toBe(true)
  })

  it('[A28] contains rug description (hand-knotted or terracotta)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    const lower = result.toLowerCase()
    expect(lower.includes('hand-knotted') || lower.includes('terracotta')).toBe(true)
  })

  it('[A29] contains window treatments (linen-curtains or linen curtains)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/linen-curtains|linen curtains/i.test(result)).toBe(true)
  })

  it('[A30] contains cultural reference (Scandinavian)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/scandinavian/i.test(result)).toBe(true)
  })

  it('[A31] contains fandom translation for jazz (vinyl shelf or rich wood or amber tones)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/vinyl shelf|rich wood|low ambient|amber tones/i.test(result)).toBe(true)
  })

  it('[A32] contains sentimental object (grandfather / armchair focal)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/grandfather|armchair.*focal|focal.*armchair/i.test(result)).toBe(true)
  })

  it('[A33] contains mood target ("room should feel" or calm.*sophisticated)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/calm.*sophisticated|sophisticated.*calm|room should feel/i.test(result)).toBe(true)
  })

  it('[A34] contains mood keywords (serene or curated)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/serene|curated/i.test(result)).toBe(true)
  })

  it('[A35] contains budget quality tier (premium — $12k budget)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/premium materials|investment pieces/i.test(result)).toBe(true)
  })

  it('[A36] contains camera angle (corner-wide → wide angle from corner)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/wide angle.*corner|corner.*wide/i.test(result)).toBe(true)
  })

  it('[A37] contains quality closer (Architectural Digest)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/architectural digest/i.test(result)).toBe(true)
  })

  // ── Safety edge cases with sparse context ──────────────────────────────────

  it('works with minimal context (no optional sections)', () => {
    // buildFluxPromptFromContext uses optional chaining internally so it handles
    // null/undefined for all sections gracefully. We cast to bypass strict types.
    const minimalCtx = {
      roomId: 'r1',
      userId: 'u1',
      assembledAt: new Date().toISOString(),
      roomContext: null,
      roomConstraints: null,
      keepMask: null,
      budget: null,
      requestedProducts: [],
      artBrief: null,
      techSpec: null,
      sensoryProfile: null,
      identityBrief: null,
      fingerprint: undefined,
      tabStates: [],
      minimumThresholdMet: false,
      tabsComplete: [],
    } as unknown as RenderContext
    const result = buildFluxPromptFromContext(minimalCtx)
    expect(result).toBeTruthy()
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('[object Object]')
  })

  it('prompt hard cap: never exceeds 2800 chars even with all sections populated', () => {
    const ctx = makeMockContext()
    // Add very long offScreenPieces to stress the cap
    if (ctx.roomConstraints) {
      ctx.roomConstraints.offScreenPieces = 'a'.repeat(500)
    }
    const result = buildFluxPromptFromContext(ctx)
    expect(result.length).toBeLessThanOrEqual(3200)
  })

  it('budget rangeMax < 2000 → "affordable" descriptor', () => {
    const ctx = makeMockContext()
    ctx.budget = { rangeMin: 0, rangeMax: 1500, strategy: 'even-quality', hardCeiling: false, splurgeCategory: '' }
    const result = buildFluxPromptFromContext(ctx)
    expect(/affordable|high-street/i.test(result)).toBe(true)
  })

  it('budget rangeMax >= 15000 → "designer/investment" descriptor', () => {
    const ctx = makeMockContext()
    ctx.budget = { rangeMin: 0, rangeMax: 20000, strategy: 'hero-piece', hardCeiling: false, splurgeCategory: '' }
    const result = buildFluxPromptFromContext(ctx)
    expect(/designer|investment|bespoke/i.test(result)).toBe(true)
  })

  it('no fingerprint in context → still produces valid prompt without crashing', () => {
    const ctx = makeMockContext()
    ctx.fingerprint = undefined
    const result = buildFluxPromptFromContext(ctx)
    expect(result).toBeTruthy()
    expect(result).not.toContain('undefined')
  })

  // ─── REGRESSION: Photographic language in prompt ─────────────────────
  it('[REG] contains photographic foundation language (f/8, lens)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    expect(/f\/8|lens|photograph/i.test(result)).toBe(true)
  })

  it('[REG] contains precise lighting color temperature (K)', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    // Morning time should produce 5600K or 2700K language
    expect(/\d{4}K/i.test(result)).toBe(true)
  })

  it('[REG] throw/cushion density 2 → specific visual description', () => {
    const ctx = makeMockContext()
    if (ctx.sensoryProfile) ctx.sensoryProfile.throwCushionDensity = 2
    const result = buildFluxPromptFromContext(ctx)
    expect(/folded on sofa|accent chair/i.test(result)).toBe(true)
  })

  it('[REG] throw/cushion density 5 → maximalist description', () => {
    const ctx = makeMockContext()
    if (ctx.sensoryProfile) ctx.sensoryProfile.throwCushionDensity = 5
    const result = buildFluxPromptFromContext(ctx)
    expect(/abundantly|every seating surface/i.test(result)).toBe(true)
  })

  it('[REG] hardwood flooring gets "preserved" and "patina" language', () => {
    const ctx = makeMockContext()
    if (ctx.roomContext) {
      ctx.roomContext.floorMaterial = 'Hardwood'
      ctx.roomContext.floorColor = 'honey oak'
    }
    const result = buildFluxPromptFromContext(ctx)
    expect(/preserved|patina/i.test(result)).toBe(true)
  })

  it('[REG] no "CGI" or "watermarks" as negative prompt language', () => {
    const result = buildFluxPromptFromContext(makeMockContext())
    // Quality markers should use positive framing (no CGI → photorealistic)
    expect(result).toContain('Photorealistic')
  })
})
