// @vitest-environment node

/**
 * Tests for lib/rateLimit.ts
 *
 * The module uses a module-level Map as its store. We isolate each test by
 * using vi.resetModules() + dynamic re-import so that every test starts with
 * a fresh, empty Map rather than state that leaked from a previous test.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

// Real config values read from the source — do not change these without
// also updating the source file.
const REAL_LIMITS = {
  render:             { maxRequests: 5,  windowSeconds: 3600 },
  match:              { maxRequests: 30, windowSeconds: 3600 },
  'room-budget':      { maxRequests: 20, windowSeconds: 3600 },
  'complete-room':    { maxRequests: 20, windowSeconds: 3600 },
  detect:             { maxRequests: 10, windowSeconds: 3600 },
  'parse-constraints':{ maxRequests: 20, windowSeconds: 3600 },
  default:            { maxRequests: 60, windowSeconds: 3600 },
} as const

type CheckRateLimit = (userId: string, endpoint: string) => {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

let checkRateLimit: CheckRateLimit

// Re-import a fresh module before every test so the in-memory store is empty.
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  const mod = await import('@/lib/rateLimit')
  checkRateLimit = mod.checkRateLimit
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Result shape ────────────────────────────────────────────────────────────

describe('result shape', () => {
  it('returns allowed:true, remaining:number, retryAfterSeconds:0 on first call', () => {
    const result = checkRateLimit('u1', 'render')
    expect(typeof result.allowed).toBe('boolean')
    expect(typeof result.remaining).toBe('number')
    expect(typeof result.retryAfterSeconds).toBe('number')
    expect(result.allowed).toBe(true)
    expect(result.retryAfterSeconds).toBe(0)
  })

  it('returns retryAfterSeconds > 0 when denied', () => {
    // exhaust the render limit (maxRequests = 5)
    for (let i = 0; i < 5; i++) checkRateLimit('u-shape', 'render')
    const denied = checkRateLimit('u-shape', 'render')
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSeconds).toBeGreaterThan(0)
  })
})

// ─── First request ───────────────────────────────────────────────────────────

describe('first request', () => {
  it('is always allowed', () => {
    expect(checkRateLimit('user-first', 'render').allowed).toBe(true)
  })
})

// ─── Below limit ─────────────────────────────────────────────────────────────

describe('requests below max within window', () => {
  it('all succeed for render (max=5)', () => {
    for (let i = 0; i < 4; i++) {
      expect(checkRateLimit('u-below', 'render').allowed).toBe(true)
    }
  })
})

// ─── Boundary: exactly at maxRequests ────────────────────────────────────────

describe('boundary — exactly maxRequests calls', () => {
  it('the Nth call (N = maxRequests) is still allowed', () => {
    // render has maxRequests = 5; calls 1-4 succeed, call 5 should too
    for (let i = 0; i < 4; i++) checkRateLimit('u-boundary', 'render')
    const fifth = checkRateLimit('u-boundary', 'render')
    expect(fifth.allowed).toBe(true)
  })
})

// ─── Exceeding limit ─────────────────────────────────────────────────────────

describe('exceeding limit', () => {
  it('the (maxRequests+1)th call is denied for render', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('u-exceed', 'render')
    const sixth = checkRateLimit('u-exceed', 'render')
    expect(sixth.allowed).toBe(false)
    expect(sixth.remaining).toBe(0)
  })
})

// ─── Window expiry ───────────────────────────────────────────────────────────

describe('window expiry', () => {
  it('resets counter after windowSeconds elapses', () => {
    // exhaust render limit
    for (let i = 0; i < 5; i++) checkRateLimit('u-window', 'render')
    expect(checkRateLimit('u-window', 'render').allowed).toBe(false)

    // advance past the 1-hour window
    vi.advanceTimersByTime(REAL_LIMITS.render.windowSeconds * 1000 + 1)

    // next call should be allowed again
    expect(checkRateLimit('u-window', 'render').allowed).toBe(true)
  })
})

// ─── Independent user IDs ────────────────────────────────────────────────────

describe('user isolation', () => {
  it('different user IDs have independent counters', () => {
    // exhaust limit for user A
    for (let i = 0; i < 5; i++) checkRateLimit('user-A', 'render')
    expect(checkRateLimit('user-A', 'render').allowed).toBe(false)

    // user B should still be allowed
    expect(checkRateLimit('user-B', 'render').allowed).toBe(true)
  })
})

// ─── Independent action types ────────────────────────────────────────────────

describe('action isolation', () => {
  it('different endpoints have independent counters', () => {
    // exhaust render limit (max=5)
    for (let i = 0; i < 5; i++) checkRateLimit('u-actions', 'render')
    expect(checkRateLimit('u-actions', 'render').allowed).toBe(false)

    // 'detect' limit (max=10) should still be fresh
    expect(checkRateLimit('u-actions', 'detect').allowed).toBe(true)
  })
})

// ─── Real config values ──────────────────────────────────────────────────────

describe('real config: match action', () => {
  it('has maxRequests = 30 per hour', () => {
    // Make exactly 30 calls — all should be allowed
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('u-match', 'match').allowed).toBe(true)
    }
    // 31st is denied
    expect(checkRateLimit('u-match', 'match').allowed).toBe(false)
  })
})

describe('real config: room-budget action', () => {
  it('has maxRequests = 20 per hour', () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit('u-rb', 'room-budget').allowed).toBe(true)
    }
    expect(checkRateLimit('u-rb', 'room-budget').allowed).toBe(false)
  })
})

describe('real config: complete-room action', () => {
  it('has maxRequests = 20 per hour', () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit('u-cr', 'complete-room').allowed).toBe(true)
    }
    expect(checkRateLimit('u-cr', 'complete-room').allowed).toBe(false)
  })
})

// ─── retryAfterSeconds when allowed ─────────────────────────────────────────

describe('retryAfterSeconds when allowed', () => {
  it('is 0 when request is allowed', () => {
    expect(checkRateLimit('u-retry', 'render').retryAfterSeconds).toBe(0)
  })
})

// ─── Concurrent / synchronous loop ───────────────────────────────────────────

describe('synchronous loop race-free counting', () => {
  it('counts correctly when 5 requests are made synchronously in a loop', () => {
    const results = Array.from({ length: 5 }, () =>
      checkRateLimit('u-sync', 'render')
    )
    // All 5 should succeed (render max = 5)
    expect(results.every((r) => r.allowed)).toBe(true)
    // 6th should fail
    expect(checkRateLimit('u-sync', 'render').allowed).toBe(false)
  })
})

// ─── remaining decrements correctly ─────────────────────────────────────────

describe('remaining field', () => {
  it('decrements from (maxRequests-1) down to 0', () => {
    const max = REAL_LIMITS.detect.maxRequests // 10

    const first = checkRateLimit('u-rem', 'detect')
    expect(first.remaining).toBe(max - 1) // 9

    for (let i = 0; i < max - 2; i++) checkRateLimit('u-rem', 'detect')

    const last = checkRateLimit('u-rem', 'detect')
    expect(last.remaining).toBe(0)
  })
})
