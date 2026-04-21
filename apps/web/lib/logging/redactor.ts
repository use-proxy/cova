/**
 * Phase 3 F6.5 — Outbound log redactor.
 *
 * Scans strings bound for external telemetry (Sentry, PostHog, Datadog, etc.)
 * for bare forbidden style tokens and rewrites them to neutral descriptive
 * phrases. This is Layer 5 of the research §7.4 five-layer defense — the
 * runtime sanitizer (Layer 3) already scrubs Director output at generation
 * time, but telemetry may capture intermediate state (prompt construction
 * logs, error strings, Sonnet raw responses) that bypass the generation
 * path. The redactor is idempotent: running twice yields the same result.
 *
 * Reuses the canonical replacement table from forbidden-names.ts so the
 * output vocabulary matches the runtime sanitizer.
 */

import { sanitizeForbiddenNames } from "@/lib/ai/forbidden-names";

/**
 * Redact bare forbidden style tokens from a single log string. Qualified
 * forms ("Warm Japandi", "Coastal Bright", "Retro Mid-Century") are
 * preserved.
 */
export function redactLogString(input: string | null | undefined): string {
  if (!input) return input ?? "";
  return sanitizeForbiddenNames(input);
}

/**
 * Recursively redact string values in an object/array/primitive tree.
 * Non-string leaves are returned untouched. Circular refs not supported;
 * tracked via WeakSet to avoid infinite recursion if a caller passes one.
 */
export function redactLogPayload<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (typeof value === "string") {
    return redactLogString(value) as unknown as T;
  }
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactLogPayload(v, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactLogPayload(v, seen);
  }
  return out as unknown as T;
}

/**
 * Wrap a logger's emit function (e.g., Sentry.captureMessage, posthog.capture,
 * console.error) so every argument is redacted before the underlying call.
 * Usage:
 *
 *   const safeCapture = wrapLogger(Sentry.captureMessage);
 *   safeCapture("Render failed for japandi room", { ... });
 *
 * The wrapper preserves the original function's this-binding if called as a
 * method by binding `.call(undefined, ...)`.
 */
export function wrapLogger<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args: A): R => {
    const safe = args.map((a) => redactLogPayload(a)) as A;
    return fn(...safe);
  };
}
