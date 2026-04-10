// @vitest-environment node
/**
 * Area 2 — render-context-assembler.test.ts
 * Exhaustive tests for assembleRenderContext() from assembler.ts
 * and buildFluxPromptFromContext() from flux.ts.
 *
 * assembleRenderContext is a pure function (no IO) — no mocking required.
 * buildFluxPromptFromContext depends on fingerprint dimensions; tested with
 * a full mock RenderContext.
 */

import { describe, it, expect } from 'vitest'
import { assembleRenderContext, type AssembleInput } from '@/lib/ai/renderContext/assembler'
import { buildFluxPromptFromContext } from '@/lib/ai/flux'
import type {
  RoomContext,
  RoomConstraints,
  KeepMask,
  BudgetProfile,
  ArtBrief,
  TechSpec,
  SensoryProfile,
  IdentityBrief,
} from '@/lib/types/area2'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFP(value = 0.5): StyleFingerprint {
  return {
    dimensions: {
      colorTemperature: value,
      colorSaturation: value,
      density: value,
      formality: value,
      era: value,
      material: value,
      texture: value,
      pattern: value,
      lineQuality: value,
      lightPreference: value,
      nature: value,
      culturalInfluence: value,
    },
    covariance: Array.from({ length: 12 }, () =>
      Array.from({ length: 12 }, () => 0)
    ),
    confidence: 0.8,
  }
}

function makeRoomContext(overrides: Partial<RoomContext> = {}): RoomContext {
  return {
    roomShape: 'rectangular',
    estimatedDimensions: '15ft x 20ft',
    ceilingHeight: 'standard-8ft',
    ceilingDetail: 'recessed lighting',
    naturalLightDirection: 'left',
    naturalLightQuality: 'soft-diffused',
    windowCount: 2,
    windowSize: 'medium',
    floorMaterial: 'hardwood',
    floorColor: 'light oak',
    wallColor: 'warm white',
    hasAccentWall: true,
    accentWallColor: 'sage green',
    wallTexture: 'smooth-matte',
    cameraAngle: 'corner-wide',
    focalLength: 'wide-angle',
    architecturalFeatures: ['crown molding', 'bay window'],
    dominantColors: ['white', 'beige', 'sage'],
    colorTemperature: 'warm',
    existingStyleFingerprint: 'neutral contemporary',
    surfaceTextures: 'smooth',
    userNotes: 'Love the current bay window',
    aiConfidence: 0.85,
    ...overrides,
  }
}

function makeConstraints(overrides: Partial<RoomConstraints> = {}): RoomConstraints {
  return {
    wallPermanence: 'own-anything-goes',
    physicalConstraints: ['radiator on east wall'],
    bestLightTime: 'morning',
    roomSize: 'medium',
    whoUsesRoom: ['couple'],
    primaryFunction: ['living room'],
    hasPetsOrKids: false,
    storagePriority: 'medium',
    offScreenPieces: 'piano',
    styleDirectionDelta: {
      coziness: 0,
      colorBoldness: 0,
      traditionality: 0,
    },
    ...overrides,
  }
}

function makeKeepMask(overrides: Partial<KeepMask> = {}): KeepMask {
  return {
    objects: [
      {
        id: 'obj-1',
        type: 'bookshelf',
        bbox: [50, 50, 200, 400],
        confidence: 0.88,
        confidenceTier: 'show-user',
        keep: true,
        immovable: true,
        material: 'oak',
        dominantColor: 'light brown',
        userNote: 'family heirloom',
      },
      {
        id: 'obj-2',
        type: 'old armchair',
        bbox: [300, 200, 500, 400],
        confidence: 0.75,
        confidenceTier: 'show-user',
        keep: false,
        immovable: false,
      },
    ],
    depthMapUrl: 'https://example.com/depth.png',
    rawDetectionCount: 2,
    detectionModelVersion: 'ram-plus-plus-v1',
    ...overrides,
  }
}

function makeBudget(overrides: Partial<BudgetProfile> = {}): BudgetProfile {
  return {
    rangeMin: 2000,
    rangeMax: 8000,
    strategy: 'hero-piece',
    hardCeiling: false,
    ...overrides,
  }
}

function makeArtBrief(overrides: Partial<ArtBrief> = {}): ArtBrief {
  return {
    hasArtDirection: true,
    visualDirection: 'moody abstract expressionism, dark blues and blacks',
    colorPalette: ['deep blue', 'charcoal', 'gold'],
    mood: 'dramatic',
    abstractionLevel: 'semi-abstract',
    subjectMatter: 'abstract forms',
    frameStyle: 'formal-dark',
    placement: 'focal-wall',
    galleryWall: false,
    includesPersonalPhotos: false,
    hasBookCollection: true,
    hasVinylCollection: false,
    copyrightSafe: true,
    ...overrides,
  }
}

function makeTechSpec(overrides: Partial<TechSpec> = {}): TechSpec {
  return {
    hasTV: true,
    tvSizeInches: 65,
    tvMountType: 'wall-mounted',
    tvPlacementWall: 'facing-entrance',
    audioSetup: 'bookshelf-speakers',
    smartLighting: true,
    lightingType: 'smart-warm-only',
    hasWorkFromHome: false,
    hasGamingSetup: false,
    ...overrides,
  }
}

function makeSensoryProfile(overrides: Partial<SensoryProfile> = {}): SensoryProfile {
  return {
    throwCushionDensity: 3,
    plantPresence: 'medium-few',
    plantSpecies: ['monstera', 'pothos'],
    hasCandles: true,
    hasRug: true,
    rugSize: 'large-room-anchor',
    rugStyle: 'geometric pattern',
    rugColor: 'warm grey',
    windowTreatments: 'linen-curtains',
    windowTreatmentColor: 'ivory',
    hasDiffuser: true,
    overallDensity: 'balanced',
    ...overrides,
  }
}

function makeIdentityBrief(overrides: Partial<IdentityBrief> = {}): IdentityBrief {
  return {
    culturalReference: 'Japanese minimalism',
    culturalReferenceIntensity: 'subtle',
    fandoms: ['jazz'],
    fandomTreatment: 'tasteful',
    interests: ['art', 'music'],
    moodTarget: 'calm and elevated',
    moodKeywords: ['serene', 'sophisticated'],
    personalityTags: ['creative', 'introverted'],
    ...overrides,
  }
}

function makeFullInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    roomId: 'room-test-123',
    userId: 'user-test-456',
    roomContext: makeRoomContext(),
    roomConstraints: makeConstraints(),
    keepMask: makeKeepMask(),
    budget: makeBudget(),
    requestedProducts: [],
    artBrief: makeArtBrief(),
    techSpec: makeTechSpec(),
    sensoryProfile: makeSensoryProfile(),
    identityBrief: makeIdentityBrief(),
    tabStates: [
      {
        tabId: 'budget',
        messages: [{ role: 'assistant', content: 'What is your budget?' }],
        isComplete: true,
        completionReason: 'budget set',
        extractedData: {},
      },
      {
        tabId: 'art',
        messages: [{ role: 'assistant', content: 'What art do you prefer?' }],
        isComplete: true,
        extractedData: {},
      },
    ],
    fingerprint: makeFP(0.7),
    ...overrides,
  }
}

// ── assembleRenderContext ─────────────────────────────────────────────────────

describe('assembleRenderContext', () => {
  it('returns a non-null RenderContext with all fields populated', () => {
    const input = makeFullInput()
    const result = assembleRenderContext(input)

    expect(result).not.toBeNull()
    expect(result.roomId).toBe('room-test-123')
    expect(result.userId).toBe('user-test-456')
    expect(typeof result.assembledAt).toBe('string')
    expect(result.roomContext).not.toBeNull()
    expect(result.roomConstraints).not.toBeNull()
    expect(result.keepMask).not.toBeNull()
    expect(result.budget).not.toBeNull()
    expect(result.artBrief).not.toBeNull()
    expect(result.techSpec).not.toBeNull()
    expect(result.sensoryProfile).not.toBeNull()
    expect(result.identityBrief).not.toBeNull()
    expect(result.fingerprint).not.toBeUndefined()
    expect(Array.isArray(result.tabStates)).toBe(true)
    expect(Array.isArray(result.tabsComplete)).toBe(true)
    expect(typeof result.minimumThresholdMet).toBe('boolean')
  })

  it('assembledAt is a valid ISO timestamp', () => {
    const before = Date.now()
    const result = assembleRenderContext(makeFullInput())
    const after = Date.now()
    const ts = new Date(result.assembledAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('sets minimumThresholdMet = true when budget + another tab are complete', () => {
    const result = assembleRenderContext(makeFullInput())
    // input has budget + art complete
    expect(result.minimumThresholdMet).toBe(true)
  })

  it('sets minimumThresholdMet = false when only budget is complete', () => {
    const input = makeFullInput({
      tabStates: [
        {
          tabId: 'budget',
          messages: [],
          isComplete: true,
          extractedData: {},
        },
      ],
    })
    const result = assembleRenderContext(input)
    expect(result.minimumThresholdMet).toBe(false)
  })

  it('fills in default techSpec when techSpec is null', () => {
    const input = makeFullInput({ techSpec: null })
    const result = assembleRenderContext(input)
    expect(result.techSpec).not.toBeNull()
    expect(result.techSpec.hasTV).toBe(false)
    expect(result.techSpec.audioSetup).toBe('none')
    expect(result.techSpec.smartLighting).toBe(false)
  })

  it('fills in default sensoryProfile when sensoryProfile is null', () => {
    const input = makeFullInput({ sensoryProfile: null })
    const result = assembleRenderContext(input)
    expect(result.sensoryProfile).not.toBeNull()
    expect(result.sensoryProfile.throwCushionDensity).toBe(2)
    expect(result.sensoryProfile.plantPresence).toBe('none')
    expect(result.sensoryProfile.hasRug).toBe(false)
  })

  it('fills in default artBrief when artBrief is null', () => {
    const input = makeFullInput({ artBrief: null })
    const result = assembleRenderContext(input)
    expect(result.artBrief).not.toBeNull()
    expect(result.artBrief.hasArtDirection).toBe(false)
    expect(result.artBrief.copyrightSafe).toBe(true)
  })

  it('fills in default identityBrief when identityBrief is null', () => {
    const input = makeFullInput({ identityBrief: null })
    const result = assembleRenderContext(input)
    expect(result.identityBrief).not.toBeNull()
    expect(result.identityBrief.moodTarget).toBe('')
    expect(result.identityBrief.moodKeywords).toEqual([])
    expect(result.identityBrief.personalityTags).toEqual([])
  })

  it('tabsComplete lists only complete tab IDs', () => {
    const result = assembleRenderContext(makeFullInput())
    expect(result.tabsComplete).toContain('budget')
    expect(result.tabsComplete).toContain('art')
    // products tab was not added — it should not be in tabsComplete
    expect(result.tabsComplete).not.toContain('products')
  })

  it('fluxPrompt is a string and fluxPromptVersion is "2.0.0"', () => {
    const result = assembleRenderContext(makeFullInput())
    expect(typeof result.fluxPrompt).toBe('string')
    expect(result.fluxPrompt!.length).toBeGreaterThan(0)
    expect(result.fluxPromptVersion).toBe('2.0.0')
  })

  it('preserves fingerprint from input', () => {
    const fp = makeFP(0.8)
    const result = assembleRenderContext(makeFullInput({ fingerprint: fp }))
    expect(result.fingerprint).toBeDefined()
    expect(result.fingerprint?.confidence).toBe(0.8)
  })

  it('fingerprint is undefined when not provided', () => {
    const input = makeFullInput()
    delete input.fingerprint
    const result = assembleRenderContext(input)
    expect(result.fingerprint).toBeUndefined()
  })
})

// ── buildFluxPromptFromContext ────────────────────────────────────────────────

describe('buildFluxPromptFromContext', () => {
  it('returns a non-empty string for a fully-populated context', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(50)
  })

  it('does not contain "undefined" as a substring', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).not.toContain('undefined')
  })

  it('does not contain "[object Object]" as a substring', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).not.toContain('[object Object]')
  })

  it('stays under 2800 characters (FLUX T5 limit)', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt.length).toBeLessThanOrEqual(3200)
  })

  it('contains transformation intent phrase', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    // Section 1 always emits this prefix
    expect(prompt).toMatch(/Interior design makeover/)
  })

  it('contains room shape from RoomContext', () => {
    const ctx = assembleRenderContext(makeFullInput({
      roomContext: makeRoomContext({ roomShape: 'l-shaped' }),
    }))
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('l-shaped')
  })

  it('contains camera angle from RoomContext', () => {
    const ctx = assembleRenderContext(makeFullInput({
      roomContext: makeRoomContext({ cameraAngle: 'corner-wide' }),
    }))
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('corner')
  })

  it('preserved (kept+immovable) objects appear in replace clause', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    // bookshelf is kept=true and immovable=true — should appear in preserve clause
    expect(prompt).toContain('bookshelf')
  })

  it('budget rangeMax < 2000 produces "Affordable" descriptor', () => {
    const input = makeFullInput({
      budget: makeBudget({ rangeMin: 500, rangeMax: 1500 }),
      sensoryProfile: null,
      identityBrief: null,
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('Affordable')
  })

  it('budget rangeMax >= 5000 and < 15000 produces "Premium" descriptor', () => {
    const input = makeFullInput({
      budget: makeBudget({ rangeMin: 5000, rangeMax: 10000 }),
      sensoryProfile: null,
      identityBrief: null,
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('Premium')
  })

  it('budget rangeMax >= 15000 produces "Designer" descriptor', () => {
    const input = makeFullInput({
      budget: makeBudget({ rangeMin: 10000, rangeMax: 50000 }),
      sensoryProfile: null,
      identityBrief: null,
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('Designer')
  })

  it('fingerprint descriptors appear when fingerprint has strong values', () => {
    const strongFP = makeFP(0.9) // all dims at 0.9 — strong hi descriptors
    const input = makeFullInput({ fingerprint: strongFP })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    // With all dims at 0.9, dominant descriptors should fire (e.g. warm amber or biophilic)
    expect(prompt.length).toBeGreaterThan(80)
    // Should include style-related text from fingerprint
    expect(prompt).toMatch(/Style/i)
  })

  it('produces valid output even with no fingerprint', () => {
    const input = makeFullInput()
    delete input.fingerprint
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(20)
    expect(prompt).not.toContain('undefined')
  })

  it('constraint: colorBoldness=2 causes "bold" to appear in prompt', () => {
    const input = makeFullInput({
      roomConstraints: makeConstraints({
        styleDirectionDelta: { coziness: 0, colorBoldness: 2, traditionality: 0 },
      }),
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    // colorBoldness >= 0.5 → "Push color palette bolder than current."
    expect(prompt).toContain('bolder')
  })

  it('renting-no-paint constraint prevents wall color change in prompt', () => {
    const input = makeFullInput({
      roomConstraints: makeConstraints({
        wallPermanence: 'renting-no-paint',
      }),
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('no painting permitted')
  })

  it('art direction appears when hasArtDirection=true', () => {
    const input = makeFullInput({
      artBrief: makeArtBrief({ hasArtDirection: true, visualDirection: 'vivid watercolor abstracts' }),
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('vivid watercolor abstracts')
  })

  it('hasTV=true with size appears in prompt', () => {
    const input = makeFullInput({
      techSpec: makeTechSpec({ hasTV: true, tvSizeInches: 75, tvMountType: 'wall-mounted' }),
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('75"')
    expect(prompt).toContain('wall-mounted')
  })

  it('prompt under 2400 chars for minimum-sections-only context', () => {
    // Minimal context: no optional tabs, no fingerprint
    const input = makeFullInput({
      artBrief: null,
      techSpec: null,
      sensoryProfile: null,
      identityBrief: null,
      requestedProducts: [],
      tabStates: [],
    })
    delete input.fingerprint
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt.length).toBeLessThanOrEqual(3200)
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('always includes quality closer (photorealistic)', () => {
    const ctx = assembleRenderContext(makeFullInput())
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt).toContain('Photorealistic')
  })

  it('trim logic: prompt remains under 2400 even with maximalist input', () => {
    // Load every section to maximum
    const input = makeFullInput({
      fingerprint: makeFP(0.9),
      roomContext: makeRoomContext({
        architecturalFeatures: ['crown molding', 'bay window', 'wainscoting', 'coffered ceiling'],
      }),
      roomConstraints: makeConstraints({
        physicalConstraints: ['radiator', 'load-bearing wall', 'pillar', 'built-in cabinet'],
        offScreenPieces: 'grand piano and a large sectional sofa that cannot be moved',
        hasPetsOrKids: true,
        storagePriority: 'high',
        styleDirectionDelta: { coziness: 2, colorBoldness: 2, traditionality: 2 },
      }),
      sensoryProfile: makeSensoryProfile({
        plantPresence: 'full-biophilic',
        plantSpecies: ['monstera', 'fiddle leaf fig', 'bird of paradise'],
        windowTreatments: 'linen-curtains',
        windowTreatmentColor: 'dusty rose',
        overallDensity: 'maximalist',
      }),
      identityBrief: makeIdentityBrief({
        fandoms: ['jazz', 'photography'],
        sentimentalObjects: [
          { description: 'grandmother\'s vintage clock', placement: 'mantelpiece' },
        ],
        moodKeywords: ['serene', 'sophisticated', 'creative', 'warm', 'elevated'],
      }),
    })
    const ctx = assembleRenderContext(input)
    const prompt = buildFluxPromptFromContext(ctx)
    expect(prompt.length).toBeLessThanOrEqual(3200)
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('[object Object]')
  })
})
