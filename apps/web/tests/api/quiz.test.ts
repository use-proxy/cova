import { describe, it, expect } from 'vitest'

// Test the fingerprint computation logic — extracted for unit testing
// This matches the exact implementation in /app/api/quiz/fingerprint/route.ts
function computeFingerprint(
  responses: Array<{
    pair_id: string
    chosen: string
    super_liked: boolean
  }>
): number[] {
  const dimensions = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

  responses.forEach((response, index) => {
    if (index === 0) return // Skip warmup card
    const weight = response.super_liked ? 3 : 1
    const dimIndex = index % 6
    const signal = response.chosen === 'A' ? 0.1 : -0.1
    dimensions[dimIndex] = (dimensions[dimIndex] ?? 0.5) + signal * weight
  })

  return dimensions.map((d) => Math.max(0, Math.min(1, d)))
}

describe('Quiz Fingerprint Computation', () => {
  it('returns 6-dimensional vector', () => {
    const responses = Array.from({ length: 15 }, (_, i) => ({
      pair_id: String(i),
      chosen: 'A',
      super_liked: false,
    }))
    const fp = computeFingerprint(responses)
    expect(fp).toHaveLength(6)
  })

  it('all dimensions are in [0, 1] range', () => {
    const responses = Array.from({ length: 15 }, (_, i) => ({
      pair_id: String(i),
      chosen: i % 2 === 0 ? 'A' : 'B',
      super_liked: false,
    }))
    const fp = computeFingerprint(responses)
    fp.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    })
  })

  it('skips warmup card (index 0)', () => {
    // With only warmup card, no dimensions should change
    const warmupOnly = [{ pair_id: '0', chosen: 'A', super_liked: false }]
    const fp = computeFingerprint(warmupOnly)
    // All should remain at 0.5 since index 0 is skipped
    fp.forEach((d) => expect(d).toBe(0.5))
  })

  it('super likes are weighted 3x per COVA spec', () => {
    const normalResponse = [
      { pair_id: '0', chosen: 'A', super_liked: false }, // warmup
      { pair_id: '1', chosen: 'A', super_liked: false },
    ]
    const superLikeResponse = [
      { pair_id: '0', chosen: 'A', super_liked: false }, // warmup
      { pair_id: '1', chosen: 'A', super_liked: true },
    ]
    const normalFp = computeFingerprint(normalResponse)
    const superFp = computeFingerprint(superLikeResponse)
    // Super like should move dimension more than normal
    // index 1, dimIndex = 1 % 6 = 1
    expect(Math.abs((superFp[1] ?? 0.5) - 0.5)).toBeGreaterThan(
      Math.abs((normalFp[1] ?? 0.5) - 0.5)
    )
  })

  it('handles empty responses gracefully', () => {
    const fp = computeFingerprint([])
    expect(fp).toHaveLength(6)
    fp.forEach((d) => expect(d).toBe(0.5))
  })

  it('handles full 15-card quiz without error', () => {
    const responses = Array.from({ length: 15 }, (_, i) => ({
      pair_id: String(i),
      chosen: i % 2 === 0 ? 'A' : 'B',
      super_liked: i === 5,
    }))
    expect(() => computeFingerprint(responses)).not.toThrow()
    const fp = computeFingerprint(responses)
    expect(fp).toHaveLength(6)
  })

  it('normalizes extreme values to [0, 1]', () => {
    // Many super-liked A responses would push dimension above 1 without clamping
    const responses = Array.from({ length: 20 }, (_, i) => ({
      pair_id: String(i),
      chosen: 'A',
      super_liked: true,
    }))
    const fp = computeFingerprint(responses)
    fp.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    })
  })
})
