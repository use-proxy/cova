import { describe, it, expect } from 'vitest'
import { buildFluxPrompt } from '@/lib/ai/flux'

describe('buildFluxPrompt', () => {
  const baseFingerprint = [0.7, 0.3, 0.8, 0.6, 0.4, 0.7]

  it('returns positive and negative prompts', () => {
    const result = buildFluxPrompt(baseFingerprint, 'living_room', 'mid', [], [])
    expect(result).toHaveProperty('positive')
    expect(result).toHaveProperty('negative')
    expect(typeof result.positive).toBe('string')
    expect(typeof result.negative).toBe('string')
  })

  it('positive prompt contains room type', () => {
    const result = buildFluxPrompt(baseFingerprint, 'bedroom', 'mid', [], [])
    expect(result.positive.toLowerCase()).toContain('bedroom')
  })

  it('maps high luminosity (>=0.5) to bright descriptors', () => {
    const fp = [0.8, 0.5, 0.5, 0.5, 0.5, 0.5]
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [], [])
    expect(result.positive.toLowerCase()).toMatch(/bright|airy|natural light/)
  })

  it('maps low luminosity (<0.5) to moody descriptors', () => {
    const fp = [0.2, 0.5, 0.5, 0.5, 0.5, 0.5]
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [], [])
    expect(result.positive.toLowerCase()).toMatch(/moody|dramatic|intimate/)
  })

  it('maps high temperature to warm descriptors', () => {
    const fp = [0.5, 0.5, 0.9, 0.5, 0.5, 0.5]
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [], [])
    expect(result.positive.toLowerCase()).toMatch(/warm|amber|terracotta/)
  })

  it('maps low temperature to cool descriptors', () => {
    const fp = [0.5, 0.5, 0.1, 0.5, 0.5, 0.5]
    const result = buildFluxPrompt(fp, 'living_room', 'mid', [], [])
    expect(result.positive.toLowerCase()).toMatch(/cool|slate|concrete/)
  })

  it('maps budget tier correctly', () => {
    const budgetResult = buildFluxPrompt(baseFingerprint, 'living_room', 'budget', [], [])
    expect(budgetResult.positive.toLowerCase()).toMatch(/affordable|accessible/)

    const luxuryResult = buildFluxPrompt(baseFingerprint, 'living_room', 'luxury', [], [])
    expect(luxuryResult.positive.toLowerCase()).toMatch(/designer|investment|bespoke/)
  })

  it('includes inclusions in positive prompt', () => {
    const result = buildFluxPrompt(baseFingerprint, 'living_room', 'mid', ['TV', 'Soundbar'], [])
    expect(result.positive.toLowerCase()).toContain('tv')
    expect(result.positive.toLowerCase()).toContain('soundbar')
  })

  it('includes constraints in positive prompt', () => {
    const result = buildFluxPrompt(
      baseFingerprint,
      'living_room',
      'mid',
      [],
      ["Can't drill into walls", 'I rent']
    )
    // The constraint text is included literally in the prompt
    expect(result.positive.toLowerCase()).toMatch(/constraint|rent|drill/i)
  })

  it('negative prompt contains artifact prevention terms', () => {
    const result = buildFluxPrompt(baseFingerprint, 'living_room', 'mid', [], [])
    expect(result.negative.toLowerCase()).toMatch(/distorted|artifact|blurry/)
  })

  it('handles all 4 budget tiers without error', () => {
    const tiers = ['budget', 'mid', 'premium', 'luxury'] as const
    tiers.forEach((tier) => {
      expect(() =>
        buildFluxPrompt(baseFingerprint, 'bedroom', tier, [], [])
      ).not.toThrow()
    })
  })

  it('handles all fingerprint dimensions at extremes', () => {
    const allHigh = [1, 1, 1, 1, 1, 1]
    const allLow = [0, 0, 0, 0, 0, 0]
    expect(() => buildFluxPrompt(allHigh, 'living_room', 'mid', [], [])).not.toThrow()
    expect(() => buildFluxPrompt(allLow, 'living_room', 'mid', [], [])).not.toThrow()
  })
})
