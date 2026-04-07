import { describe, it, expect } from 'vitest'
import { buildFluxPrompt } from '@/lib/ai/flux'
import type { StyleFingerprint } from '@/types/fingerprint'

// Helper to build a StyleFingerprint with overrides
function makeFingerprint(overrides: Partial<StyleFingerprint['dimensions']> = {}): StyleFingerprint {
  const defaults: StyleFingerprint['dimensions'] = {
    luminosity: 0.4, density: -0.4, temperature: 0.6, form: 0.2,
    era: -0.2, texture: 0.4, scale: 0.0, nature: 0.0, saturation: 0.0, materialOrigin: 0.0,
  }
  return {
    dimensions: { ...defaults, ...overrides },
    covariance: Array(10).fill(Array(10).fill(0)) as number[][],
    confidence: 0.8,
  }
}

const baseFingerprint = makeFingerprint()

describe('buildFluxPrompt', () => {
  it('returns a string prompt', () => {
    const result = buildFluxPrompt(baseFingerprint, 'living_room', 'mid', [])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(20)
  })

  it('prompt contains room type', () => {
    const result = buildFluxPrompt(baseFingerprint, 'bedroom', 'mid', [])
    expect(result.toLowerCase()).toContain('bedroom')
  })

  it('maps high luminosity (>0.3) to bright descriptors', () => {
    const fp = makeFingerprint({ luminosity: 0.6 })
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [])
    expect(result.toLowerCase()).toMatch(/bright|airy|natural light/)
  })

  it('maps low luminosity (<-0.3) to moody descriptors', () => {
    const fp = makeFingerprint({ luminosity: -0.6 })
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [])
    expect(result.toLowerCase()).toMatch(/moody|dramatic|dark/)
  })

  it('neutral luminosity (in [-0.3, 0.3]) generates no luminosity descriptor', () => {
    const fp = makeFingerprint({ luminosity: 0.1 })
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [])
    expect(result.toLowerCase()).not.toMatch(/bright|airy|moody|dramatic/)
  })

  it('maps high temperature to warm descriptors', () => {
    const fp = makeFingerprint({ temperature: 0.8 })
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [])
    expect(result.toLowerCase()).toMatch(/warm|amber|terracotta/)
  })

  it('maps low temperature to cool descriptors', () => {
    const fp = makeFingerprint({ temperature: -0.8 })
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [])
    expect(result.toLowerCase()).toMatch(/cool|slate|concrete/)
  })

  it('maps budget tier correctly', () => {
    const budgetResult = buildFluxPrompt(baseFingerprint, 'living_room', 'budget', [])
    expect(budgetResult.toLowerCase()).toMatch(/affordable|accessible/)

    const luxuryResult = buildFluxPrompt(baseFingerprint, 'living_room', 'luxury', [])
    expect(luxuryResult.toLowerCase()).toMatch(/designer|investment|bespoke/)
  })

  it('includes inclusions in prompt', () => {
    const result = buildFluxPrompt(baseFingerprint, 'living_room', 'mid', ['TV', 'Soundbar'])
    expect(result.toLowerCase()).toContain('tv')
    expect(result.toLowerCase()).toContain('soundbar')
  })

  it('includes negative suffix in prompt', () => {
    const result = buildFluxPrompt(baseFingerprint, 'living_room', 'mid', [])
    expect(result.toLowerCase()).toMatch(/distorted|artifact/)
  })

  it('handles all 4 budget tiers without error', () => {
    const tiers = ['budget', 'mid', 'premium', 'luxury'] as const
    tiers.forEach((tier) => {
      expect(() =>
        buildFluxPrompt(baseFingerprint, 'bedroom', tier, [])
      ).not.toThrow()
    })
  })

  it('handles all fingerprint dimensions at extremes without error', () => {
    const allHigh = makeFingerprint({
      luminosity: 1, density: 1, temperature: 1, form: 1, era: 1,
      texture: 1, scale: 1, nature: 1, saturation: 1, materialOrigin: 1,
    })
    const allLow = makeFingerprint({
      luminosity: -1, density: -1, temperature: -1, form: -1, era: -1,
      texture: -1, scale: -1, nature: -1, saturation: -1, materialOrigin: -1,
    })
    expect(() => buildFluxPrompt(allHigh, 'living_room', 'mid', [])).not.toThrow()
    expect(() => buildFluxPrompt(allLow, 'living_room', 'mid', [])).not.toThrow()
  })

  it('throws when prompt exceeds 400 words', () => {
    const manyInclusions = Array(50).fill('a very long furniture item name that takes up space')
    expect(() =>
      buildFluxPrompt(baseFingerprint, 'living_room', 'mid', manyInclusions)
    ).toThrow(/400 words/)
  })
})
