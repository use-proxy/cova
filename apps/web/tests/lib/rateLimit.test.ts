import { describe, it, expect, beforeEach } from 'vitest'

// Use a fresh module per test by resetting via cache manipulation
let checkRateLimit: (userId: string, endpoint: string) => { allowed: boolean; remaining: number; retryAfterSeconds: number }

beforeEach(async () => {
  // Clear module cache to reset the in-memory store
  vi.resetModules()
  const mod = await import('@/lib/rateLimit')
  checkRateLimit = mod.checkRateLimit
})

describe('checkRateLimit', () => {
  it('allows first request', async () => {
    const result = checkRateLimit('user-1', 'render')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBeGreaterThanOrEqual(0)
  })

  it('allows requests under limit', async () => {
    for (let i = 0; i < 4; i++) {
      const result = checkRateLimit('user-2', 'render')
      expect(result.allowed).toBe(true)
    }
  })

  it('blocks after limit is reached for render (5/hr)', async () => {
    const userId = 'user-render-limit'
    for (let i = 0; i < 5; i++) {
      checkRateLimit(userId, 'render')
    }
    const blocked = checkRateLimit(userId, 'render')
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('different users have independent limits', async () => {
    // Exhaust user-A
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-A', 'render')
    }
    const blockedA = checkRateLimit('user-A', 'render')
    expect(blockedA.allowed).toBe(false)

    // user-B should still be allowed
    const allowedB = checkRateLimit('user-B', 'render')
    expect(allowedB.allowed).toBe(true)
  })

  it('different endpoints have independent limits', async () => {
    const userId = 'user-multi'
    // Exhaust render (limit=5)
    for (let i = 0; i < 5; i++) checkRateLimit(userId, 'render')
    const renderBlocked = checkRateLimit(userId, 'render')
    expect(renderBlocked.allowed).toBe(false)

    // match endpoint (limit=30) still allows
    const matchAllowed = checkRateLimit(userId, 'match')
    expect(matchAllowed.allowed).toBe(true)
  })
})
