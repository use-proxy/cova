/**
 * Exponential backoff retry utility for Replicate API calls.
 */

interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
}

export function isRetryableReplicateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  // Retry on rate limits, timeouts, and transient 5xx
  return (
    msg.includes('rate limit') ||
    msg.includes('timeout') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('service unavailable') ||
    msg.includes('too many requests')
  )
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffFactor = 2,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      const isLast = attempt === maxAttempts
      const isRetryable = isRetryableReplicateError(error)

      if (isLast || !isRetryable) {
        throw error
      }

      const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1), maxDelayMs)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
