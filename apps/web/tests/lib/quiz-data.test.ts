import { describe, it, expect } from 'vitest'
import { computeFingerprintFromPairs } from '@/lib/ai/quiz-data'

describe('computeFingerprintFromPairs', () => {
  it('returns 6-element array', () => {
    const fp = computeFingerprintFromPairs([])
    expect(fp).toHaveLength(6)
  })

  it('returns neutral 0.5 for empty responses', () => {
    const fp = computeFingerprintFromPairs([])
    fp.forEach((d) => expect(d).toBe(0.5))
  })

  it('skips first response (warmup)', () => {
    const warmupOnly = [{ pair_id: 'lum-1', chosen: 'A' as const, super_liked: false }]
    const fp = computeFingerprintFromPairs(warmupOnly)
    fp.forEach((d) => expect(d).toBe(0.5))
  })

  it('known pair lum-1: choosing A increases luminosity (dim 0)', () => {
    const responses = [
      { pair_id: 'warmup', chosen: 'A' as const, super_liked: false },
      { pair_id: 'lum-1', chosen: 'A' as const, super_liked: false },
    ]
    const fp = computeFingerprintFromPairs(responses)
    expect(fp[0]).toBeGreaterThan(0.5) // luminosity up
  })

  it('known pair lum-2: choosing A decreases luminosity (signal=-1)', () => {
    const responses = [
      { pair_id: 'warmup', chosen: 'A' as const, super_liked: false },
      { pair_id: 'lum-2', chosen: 'A' as const, super_liked: false },
    ]
    const fp = computeFingerprintFromPairs(responses)
    expect(fp[0]).toBeLessThan(0.5) // luminosity down
  })

  it('super liked response has 3x weight', () => {
    const normal = [
      { pair_id: 'warmup', chosen: 'A' as const, super_liked: false },
      { pair_id: 'lum-1', chosen: 'A' as const, super_liked: false },
    ]
    const superLiked = [
      { pair_id: 'warmup', chosen: 'A' as const, super_liked: false },
      { pair_id: 'lum-1', chosen: 'A' as const, super_liked: true },
    ]
    const fpNormal = computeFingerprintFromPairs(normal)
    const fpSuper = computeFingerprintFromPairs(superLiked)
    // Super liked should push further from 0.5
    expect(Math.abs((fpSuper[0] ?? 0.5) - 0.5)).toBeGreaterThan(
      Math.abs((fpNormal[0] ?? 0.5) - 0.5)
    )
  })

  it('fallback round-robin for unknown pair IDs', () => {
    const responses = [
      { pair_id: 'warmup', chosen: 'A' as const, super_liked: false },
      { pair_id: 'unknown-pair-xyz', chosen: 'A' as const, super_liked: false },
    ]
    const fp = computeFingerprintFromPairs(responses)
    expect(fp).toHaveLength(6)
    // dim 0 should have moved since round-robin maps index 1 (after skip) → dim 0
    expect(fp[0]).not.toBe(0.5)
  })

  it('all values remain in [0, 1]', () => {
    const responses = Array.from({ length: 20 }, () => ({
      pair_id: 'lum-1',
      chosen: 'A' as const,
      super_liked: true,
    }))
    const fp = computeFingerprintFromPairs(responses)
    fp.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    })
  })
})
