/**
 * In-memory rate limiter (per-user, per-endpoint).
 * Good enough for single-instance dev/preview; for multi-instance prod use Redis or Supabase.
 */

interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  render: { maxRequests: 5, windowSeconds: 3600 },
  match: { maxRequests: 30, windowSeconds: 3600 },
  'room-budget': { maxRequests: 20, windowSeconds: 3600 },
  'complete-room': { maxRequests: 20, windowSeconds: 3600 },
  detect: { maxRequests: 10, windowSeconds: 3600 },
  'parse-constraints': { maxRequests: 20, windowSeconds: 3600 },
  default: { maxRequests: 60, windowSeconds: 3600 },
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(userId: string, endpoint: string): RateLimitResult {
  const config = RATE_LIMITS[endpoint] ?? RATE_LIMITS.default
  const key = `${userId}:${endpoint}`
  const now = Date.now()
  const windowMs = config.windowSeconds * 1000

  const entry = store.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: config.maxRequests - 1, retryAfterSeconds: 0 }
  }

  if (entry.count >= config.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000)
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  entry.count++
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    retryAfterSeconds: 0,
  }
}
