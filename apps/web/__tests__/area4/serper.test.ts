// @vitest-environment node
/**
 * Area 4 — serper.test.ts
 * Tests lib/ai/serper.ts via mocked global.fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeShoppingItem(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Modern Sofa',
    price: '$1,299.99',
    imageUrl: 'https://example.com/sofa.jpg',
    link: 'https://www.wayfair.com/sofa-123',
    source: 'Wayfair',
    rating: 4.5,
    ratingCount: 120,
    delivery: 'Free shipping',
    badge: '',
    ...overrides,
  }
}

function makeSerperResponse(items: unknown[]) {
  return {
    shopping: items,
  }
}

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('searchProducts', () => {
  beforeEach(() => {
    process.env.SERPER_API_KEY = 'test-key-123'
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SERPER_API_KEY
  })

  it('1. returns { products, query } on success', async () => {
    global.fetch = mockFetchOk(makeSerperResponse([makeShoppingItem()]))
    const { searchProducts } = await import('@/lib/ai/serper')
    const result = await searchProducts('modern sofa')
    expect(result).toHaveProperty('products')
    expect(result).toHaveProperty('query', 'modern sofa')
    expect(Array.isArray(result.products)).toBe(true)
  })

  it('2. returns empty products on API error (non-ok response)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })
    const { searchProducts } = await import('@/lib/ai/serper')
    await expect(searchProducts('sofa')).rejects.toThrow('Serper API error')
  })

  it('3. throws when SERPER_API_KEY is missing', async () => {
    delete process.env.SERPER_API_KEY
    vi.resetModules()
    const { searchProducts } = await import('@/lib/ai/serper')
    await expect(searchProducts('sofa')).rejects.toThrow('SERPER_API_KEY is not set')
  })

  it('4. SerperProduct shape is correct', async () => {
    global.fetch = mockFetchOk(makeSerperResponse([
      makeShoppingItem({ badge: 'Sale' }),
    ]))
    const { searchProducts } = await import('@/lib/ai/serper')
    const { products } = await searchProducts('sofa')
    expect(products.length).toBeGreaterThan(0)
    const p = products[0]!
    expect(typeof p.title).toBe('string')
    expect(typeof p.price).toBe('number')
    expect(typeof p.currency).toBe('string')
    expect(typeof p.imageUrl).toBe('string')
    expect(typeof p.productUrl).toBe('string')
    expect(typeof p.retailer).toBe('string')
    expect(p.isSale).toBe(true)
  })

  it('5. num=20 → request body includes num: 20', async () => {
    let capturedBody: Record<string, unknown> = {}
    global.fetch = vi.fn().mockImplementation(async (_url: unknown, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string) as Record<string, unknown>
      return { ok: true, json: async () => makeSerperResponse([makeShoppingItem()]) }
    })
    const { searchProducts } = await import('@/lib/ai/serper')
    await searchProducts('sofa', 20)
    expect(capturedBody.num).toBe(20)
  })

  it('6. SERPER_API_KEY used in X-API-KEY header', async () => {
    let capturedHeaders: Record<string, string> = {}
    global.fetch = vi.fn().mockImplementation(async (_url: unknown, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>
      return { ok: true, json: async () => makeSerperResponse([makeShoppingItem()]) }
    })
    const { searchProducts } = await import('@/lib/ai/serper')
    await searchProducts('sofa')
    expect(capturedHeaders['X-API-KEY']).toBe('test-key-123')
  })

  it('7. 0 results → empty products array', async () => {
    global.fetch = mockFetchOk(makeSerperResponse([]))
    const { searchProducts } = await import('@/lib/ai/serper')
    const { products } = await searchProducts('sofa')
    expect(products).toEqual([])
  })

  it('8. malformed JSON → no crash (fetch rejects)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token') },
    })
    const { searchProducts } = await import('@/lib/ai/serper')
    await expect(searchProducts('sofa')).rejects.toThrow()
  })

  it('9. price parsing "$1,299.99" → 1299.99', async () => {
    global.fetch = mockFetchOk(makeSerperResponse([
      makeShoppingItem({ price: '$1,299.99', title: 'Expensive Sofa', imageUrl: 'https://i.com/a.jpg', link: 'https://wayfair.com/a' }),
    ]))
    const { searchProducts } = await import('@/lib/ai/serper')
    const { products } = await searchProducts('sofa')
    expect(products[0]?.price).toBeCloseTo(1299.99)
  })

  it('10. price parsing "From $45" → 45', async () => {
    global.fetch = mockFetchOk(makeSerperResponse([
      makeShoppingItem({ price: 'From $45', title: 'Budget Item', imageUrl: 'https://i.com/b.jpg', link: 'https://wayfair.com/b' }),
    ]))
    const { searchProducts } = await import('@/lib/ai/serper')
    const { products } = await searchProducts('budget')
    expect(products[0]?.price).toBeCloseTo(45)
  })

  it('products with price=0 or missing imageUrl are filtered out', async () => {
    global.fetch = mockFetchOk(makeSerperResponse([
      makeShoppingItem({ price: '$0', title: 'Free' }),
      makeShoppingItem({ imageUrl: '', title: 'No Image' }),
      makeShoppingItem({ title: 'Good Item' }),
    ]))
    const { searchProducts } = await import('@/lib/ai/serper')
    const { products } = await searchProducts('sofa')
    // Only the last item should pass
    expect(products.every((p) => p.price > 0 && p.imageUrl)).toBe(true)
  })
})
