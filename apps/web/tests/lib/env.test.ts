import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('validateEnvironment', () => {
  const originalEnv = { ...process.env }
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn

  beforeEach(() => {
    // Silence console output during these tests
    console.error = vi.fn()
    console.warn = vi.fn()
    // Set required vars
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    ;(process.env as Record<string, string>).NODE_ENV = 'development'
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    vi.resetModules()
  })

  it('returns valid=true when all required vars are set', async () => {
    const { validateEnvironment } = await import('@/lib/env')
    const result = validateEnvironment()
    expect(result.valid).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('returns valid=false when required client var missing', async () => {
    // In jsdom, window is defined so serverOnly vars are skipped.
    // Test with a non-serverOnly required var instead.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const { validateEnvironment } = await import('@/lib/env')
    const result = validateEnvironment()
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('includes optional vars in warnings not missing', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    const { validateEnvironment } = await import('@/lib/env')
    const result = validateEnvironment()
    expect(result.missing).not.toContain('NEXT_PUBLIC_POSTHOG_KEY')
    expect(result.warnings).toContain('NEXT_PUBLIC_POSTHOG_KEY')
  })

  it('does not throw in development mode even with missing required vars', async () => {
    delete process.env.REPLICATE_API_TOKEN
    ;(process.env as Record<string, string>).NODE_ENV = 'development'
    const { validateEnvironment } = await import('@/lib/env')
    expect(() => validateEnvironment()).not.toThrow()
  })
})
