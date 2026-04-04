import { describe, it, expect, vi } from 'vitest'
import { withRetry, isRetryableReplicateError } from '@/lib/retry'

describe('isRetryableReplicateError', () => {
  it('returns true for rate limit error', () => {
    expect(isRetryableReplicateError(new Error('rate limit exceeded'))).toBe(true)
  })

  it('returns true for 503 error', () => {
    expect(isRetryableReplicateError(new Error('503 service unavailable'))).toBe(true)
  })

  it('returns true for timeout error', () => {
    expect(isRetryableReplicateError(new Error('Request timeout'))).toBe(true)
  })

  it('returns false for auth error', () => {
    expect(isRetryableReplicateError(new Error('invalid API key'))).toBe(false)
  })

  it('returns false for non-Error', () => {
    expect(isRetryableReplicateError('string error')).toBe(false)
    expect(isRetryableReplicateError(null)).toBe(false)
  })
})

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxAttempts: 3 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 0 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid credentials'))
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 0 })).rejects.toThrow(
      'invalid credentials'
    )
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('exhausts all attempts and throws last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('503 service unavailable'))
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 0 })).rejects.toThrow('503')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
