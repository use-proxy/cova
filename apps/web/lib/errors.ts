/**
 * Centralized error handling — Sentry capture wrapper + typed error classes
 */

export class CovaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CovaError";
  }
}

export class RenderError extends CovaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "RENDER_FAILED", context);
    this.name = "RenderError";
  }
}

export class MatchError extends CovaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "MATCH_FAILED", context);
    this.name = "MatchError";
  }
}

export class DetectError extends CovaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "DETECT_FAILED", context);
    this.name = "DetectError";
  }
}

export class AuthError extends CovaError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTH_REQUIRED");
    this.name = "AuthError";
  }
}

export class RateLimitError extends CovaError {
  constructor(
    message: string = "Rate limit exceeded",
    retryAfterSeconds?: number,
  ) {
    super(message, "RATE_LIMITED", { retry_after: retryAfterSeconds });
    this.name = "RateLimitError";
  }
}

/**
 * Capture error to Sentry if available, always log to console in dev.
 */
export async function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));

  // Phase 3 F6.5: redact bare forbidden style names from the error message
  // and extra context before emitting to any log sink. Prevents Sonnet raw
  // output / prompt strings captured in error payloads from leaking
  // CLAUDE.md Rule 8 tokens to Sentry or console.
  const { redactLogString, redactLogPayload } = await import(
    "@/lib/logging/redactor"
  );
  const safeMessage = redactLogString(err.message);
  const safeContext = context ? redactLogPayload(context) : undefined;
  // Reconstruct a new Error so Sentry sees the redacted message. Preserve
  // original stack.
  const safeErr = new Error(safeMessage);
  safeErr.stack = err.stack;

  if (process.env.NODE_ENV !== "production") {
    console.error("[CovaError]", safeMessage, safeContext ?? "");
    return;
  }

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(safeErr, { extra: safeContext });
  } catch {
    // Sentry not configured — fail silently
    console.error("[CovaError]", safeMessage);
  }
}
