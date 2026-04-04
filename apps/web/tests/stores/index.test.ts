import { describe, it, expect } from 'vitest'

describe('Store barrel exports', () => {
  it('exports useSessionStore', async () => {
    const { useSessionStore } = await import('@/lib/store/index')
    expect(useSessionStore).toBeDefined()
    expect(typeof useSessionStore).toBe('function')
  })

  it('exports useFingerprintStore', async () => {
    const { useFingerprintStore } = await import('@/lib/store/index')
    expect(useFingerprintStore).toBeDefined()
    expect(typeof useFingerprintStore).toBe('function')
  })

  it('exports useRoomStore', async () => {
    const { useRoomStore } = await import('@/lib/store/index')
    expect(useRoomStore).toBeDefined()
    expect(typeof useRoomStore).toBe('function')
  })

  it('all stores are importable from single path', async () => {
    const stores = await import('@/lib/store/index')
    expect(stores.useSessionStore).toBeDefined()
    expect(stores.useFingerprintStore).toBeDefined()
    expect(stores.useRoomStore).toBeDefined()
  })
})
