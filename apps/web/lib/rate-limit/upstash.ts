// P01b — Upstash Redis-backed rate limiting + per-email cooldowns + silent
// signin lockout. Halts at boot if either Upstash env var is missing.
//
// Key namespacing: all keys prefixed with `cova:p01b:` to avoid collisions
// with future phases or other Cova surfaces.

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "[lib/rate-limit/upstash] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set",
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return Reflect.get(getRedis(), prop);
  },
});

const KEY_PREFIX = "cova:p01b";

export type RouteKey =
  | "signup"
  | "signin"
  | "forgot-password"
  | "reset-password"
  | "resend-verification"
  | "delete-account"
  | "users-export";

interface RouteLimit {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
}

export const RATE_LIMITS: Record<RouteKey, RouteLimit> = {
  signup: { limit: 3, window: "1 h" },
  signin: { limit: 20, window: "1 h" },
  "forgot-password": { limit: 5, window: "1 h" },
  "reset-password": { limit: 10, window: "1 h" },
  "resend-verification": { limit: 5, window: "1 h" },
  "delete-account": { limit: 1, window: "1 h" },
  "users-export": { limit: 1, window: "24 h" },
};

const limiterCache = new Map<RouteKey, Ratelimit>();

function getLimiter(route: RouteKey): Ratelimit {
  const cached = limiterCache.get(route);
  if (cached) return cached;
  const cfg = RATE_LIMITS[route];
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(cfg.limit, cfg.window),
    prefix: `${KEY_PREFIX}:rl:${route}`,
    analytics: false,
  });
  limiterCache.set(route, limiter);
  return limiter;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

export async function checkPerIp(route: RouteKey, ip: string): Promise<RateLimitResult> {
  const result = await getLimiter(route).limit(ip);
  if (result.success) return { ok: true };
  const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfterSec };
}

export async function checkPerEmailCooldown(
  route: RouteKey,
  email: string,
  cooldownSec: number,
): Promise<RateLimitResult> {
  const key = `${KEY_PREFIX}:cooldown:${route}:${email.toLowerCase()}`;
  const set = await redis.set(key, "1", { nx: true, ex: cooldownSec });
  if (set === "OK") return { ok: true };
  const ttl = await redis.ttl(key);
  return { ok: false, retryAfterSec: ttl > 0 ? ttl : cooldownSec };
}

const SIGNIN_LOCKOUT_THRESHOLD = 5;
const SIGNIN_LOCKOUT_TTL_SEC = 900; // 15 min

export interface SigninLockoutResult {
  count: number;
  lockedUntilTs?: number;
}

export async function incrSigninLockout(email: string): Promise<SigninLockoutResult> {
  const key = `${KEY_PREFIX}:lockout:signin:${email.toLowerCase()}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, SIGNIN_LOCKOUT_TTL_SEC);
  }
  if (count >= SIGNIN_LOCKOUT_THRESHOLD) {
    const ttl = await redis.ttl(key);
    const lockedUntilTs = Date.now() + Math.max(0, ttl) * 1000;
    return { count, lockedUntilTs };
  }
  return { count };
}

export async function clearSigninLockout(email: string): Promise<void> {
  const key = `${KEY_PREFIX}:lockout:signin:${email.toLowerCase()}`;
  await redis.del(key);
}

export async function isSigninLockedOut(email: string): Promise<boolean> {
  const key = `${KEY_PREFIX}:lockout:signin:${email.toLowerCase()}`;
  const raw = await redis.get<number | string | null>(key);
  if (raw == null) return false;
  const count = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return count >= SIGNIN_LOCKOUT_THRESHOLD;
}

export async function checkPerUserLockout(
  scope: string,
  userId: string,
  ttlSec: number,
): Promise<RateLimitResult> {
  const key = `${KEY_PREFIX}:userlock:${scope}:${userId}`;
  const exists = await redis.get(key);
  if (exists != null) {
    const ttl = await redis.ttl(key);
    return { ok: false, retryAfterSec: ttl > 0 ? ttl : ttlSec };
  }
  return { ok: true };
}

export async function setPerUserLockout(
  scope: string,
  userId: string,
  ttlSec: number,
): Promise<void> {
  const key = `${KEY_PREFIX}:userlock:${scope}:${userId}`;
  await redis.set(key, "1", { ex: ttlSec });
}
