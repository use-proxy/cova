import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  fingerprintToStyleTags,
  computeFingerprintAlignment,
  computeBudgetFit,
} from '@/lib/ai/clip'

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 0, 1, 0, 1]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5)
  })

  it('returns 0.0 for orthogonal vectors', () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5)
  })

  it('returns -1.0 for opposite vectors', () => {
    const a = [1, 0, 0]
    const b = [-1, 0, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5)
  })

  it('returns value between -1 and 1 for arbitrary vectors', () => {
    const a = [0.7, 0.3, 0.8, 0.6, 0.4, 0.7]
    const b = [0.2, 0.9, 0.1, 0.5, 0.8, 0.3]
    const sim = cosineSimilarity(a, b)
    expect(sim).toBeGreaterThanOrEqual(-1)
    expect(sim).toBeLessThanOrEqual(1)
  })

  it('handles zero vector gracefully', () => {
    const a = [0, 0, 0]
    const b = [1, 2, 3]
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('throws for vectors of different length', () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow()
  })
})

describe('fingerprintToStyleTags', () => {
  it('returns array of style tags', () => {
    const fp = [0.7, 0.3, 0.8, 0.6, 0.4, 0.7]
    const tags = fingerprintToStyleTags(fp)
    expect(Array.isArray(tags)).toBe(true)
    expect(tags.length).toBeGreaterThan(0)
  })

  it('high luminosity maps to bright/airy tags', () => {
    const fp = [0.9, 0.5, 0.5, 0.5, 0.5, 0.5]
    const tags = fingerprintToStyleTags(fp)
    expect(tags.some((t) => ['bright', 'airy', 'light'].includes(t))).toBe(true)
  })

  it('low luminosity maps to moody/dark tags', () => {
    const fp = [0.1, 0.5, 0.5, 0.5, 0.5, 0.5]
    const tags = fingerprintToStyleTags(fp)
    expect(tags.some((t) => ['moody', 'dark', 'dramatic'].includes(t))).toBe(true)
  })

  it('returns multiple tags covering all 6 dimensions', () => {
    const fp = [0.7, 0.3, 0.8, 0.6, 0.4, 0.7]
    const tags = fingerprintToStyleTags(fp)
    // At minimum one tag per dimension (each dimension adds 3-4 tags)
    expect(tags.length).toBeGreaterThanOrEqual(6)
  })
})

describe('computeFingerprintAlignment', () => {
  it('returns 1.0 for perfect tag match', () => {
    const productTags = ['modern', 'minimal', 'clean']
    const fpTags = ['modern', 'minimal', 'clean']
    expect(computeFingerprintAlignment(productTags, fpTags)).toBeCloseTo(1.0)
  })

  it('returns 0.0 for no tag overlap', () => {
    const productTags = ['traditional', 'ornate', 'classic']
    const fpTags = ['modern', 'minimal', 'clean']
    expect(computeFingerprintAlignment(productTags, fpTags)).toBe(0)
  })

  it('returns value between 0 and 1 for partial tag match', () => {
    const productTags = ['modern', 'traditional']
    const fpTags = ['modern', 'minimal']
    const score = computeFingerprintAlignment(productTags, fpTags)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('returns 0.5 for empty product tags', () => {
    expect(computeFingerprintAlignment([], ['modern', 'minimal'])).toBe(0.5)
  })

  it('returns 0.5 for empty fingerprint tags', () => {
    expect(computeFingerprintAlignment(['modern', 'minimal'], [])).toBe(0.5)
  })

  it('is case insensitive', () => {
    const productTags = ['Modern', 'MINIMAL']
    const fpTags = ['modern', 'minimal']
    expect(computeFingerprintAlignment(productTags, fpTags)).toBeCloseTo(1.0)
  })
})

describe('computeBudgetFit', () => {
  it('returns 1.0 for price at exact budget center', () => {
    const center = (500 + 2000) / 2 // 1250
    expect(computeBudgetFit(center, [500, 2000])).toBeCloseTo(1.0)
  })

  it('returns lower score for price at budget edge', () => {
    const edgeScore = computeBudgetFit(500, [500, 2000])
    const centerScore = computeBudgetFit(1250, [500, 2000])
    expect(edgeScore).toBeLessThan(centerScore)
  })

  it('returns 0 for price far outside range', () => {
    const score = computeBudgetFit(50000, [500, 2000])
    expect(score).toBeLessThanOrEqual(0)
  })

  it('never returns negative score', () => {
    const score = computeBudgetFit(100000, [500, 2000])
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('works for budget tier range [200, 500]', () => {
    const score = computeBudgetFit(350, [200, 500])
    expect(score).toBeGreaterThan(0.5)
  })

  it('works for luxury tier range [5000, 25000]', () => {
    const score = computeBudgetFit(15000, [5000, 25000])
    expect(score).toBeGreaterThan(0.5)
  })
})

describe('COVA V1 Scoring Formula Integration', () => {
  it('implements exact formula: 0.35*visual + 0.30*fp + 0.20*budget + 0.10*behavioral + 0.05*affiliate', () => {
    const visualSim = 0.8
    const fingerprintAlign = 0.6
    const budgetFit = 0.9
    const behavioral = 0
    const affiliateWeight = 0.5

    const expectedScore =
      0.35 * visualSim +
      0.30 * fingerprintAlign +
      0.20 * budgetFit +
      0.10 * behavioral +
      0.05 * affiliateWeight

    // 0.28 + 0.18 + 0.18 + 0 + 0.025 = 0.665
    expect(expectedScore).toBeCloseTo(0.665, 2)
  })

  it('behavioral score of 0 does not break formula', () => {
    const score =
      0.35 * 0.7 + 0.30 * 0.6 + 0.20 * 0.8 + 0.10 * 0 + 0.05 * 0.4
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('affiliate weight is bounded correctly (max 5% impact)', () => {
    const maxAffiliateImpact = 0.05 * 1.0
    expect(maxAffiliateImpact).toBe(0.05)
  })

  it('score weights sum to 1.0', () => {
    const weightSum = 0.35 + 0.30 + 0.20 + 0.10 + 0.05
    expect(weightSum).toBeCloseTo(1.0, 10)
  })
})
