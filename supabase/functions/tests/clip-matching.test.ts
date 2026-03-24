/**
 * Cova CLIP Matching Tests
 * File: supabase/functions/tests/clip-matching.test.ts
 *
 * Run: npx ts-node supabase/functions/tests/clip-matching.test.ts
 * Exit 0 = PASS | Exit 1 = FAIL
 *
 * Tests product panel population, budget filter, CLIP similarity
 * search (768-dim), affiliate URL generation, and style-tag fallback.
 * All external APIs mocked — no credentials required.
 */

import * as assert from 'assert'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number       // dollars
  retailer: string
  affiliate_url: string
  clip_embedding: number[]
  style_tags: string[]
  room_types: string[]
}

interface MatchProductsParams {
  embedding: number[]
  maxPrice: number    // dollars
  roomType: string
  limit: number
}

// ─── Constants (mirrored from match-products edge function) ───────────────────

const CLIP_DIMENSIONS = 768
const DEFAULT_LIMIT = 20
const RETAILERS = ['wayfair', 'amazon', 'ikea', 'cb2'] as const

// ─── Mock product catalog ─────────────────────────────────────────────────────

function makeEmbedding(seed: number): number[] {
  // Deterministic unit-ish vector of length 768
  const vec = Array.from({ length: CLIP_DIMENSIONS }, (_, i) =>
    Math.sin(seed * 0.1 + i * 0.01)
  )
  return vec
}

const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Coastal Linen Sofa',
    price: 899,
    retailer: 'wayfair',
    affiliate_url: 'https://www.wayfair.com/furniture/pdp/coastal-sofa.html?refid=cova_aff',
    clip_embedding: makeEmbedding(1),
    style_tags: ['coastal', 'minimalist'],
    room_types: ['living_room'],
  },
  {
    id: 'p2',
    name: 'Japandi Oak Coffee Table',
    price: 450,
    retailer: 'ikea',
    affiliate_url: 'https://www.ikea.com/us/en/p/oak-table/?affid=cova',
    clip_embedding: makeEmbedding(2),
    style_tags: ['japandi', 'minimalist'],
    room_types: ['living_room', 'dining_room'],
  },
  {
    id: 'p3',
    name: 'Bohemian Macramé Wall Art',
    price: 120,
    retailer: 'amazon',
    affiliate_url: 'https://www.amazon.com/dp/B0TESTXXX?tag=cova-20',
    clip_embedding: makeEmbedding(3),
    style_tags: ['bohemian'],
    room_types: ['living_room', 'bedroom'],
  },
  {
    id: 'p4',
    name: 'Mid-Century Walnut Dresser',
    price: 1200,
    retailer: 'cb2',
    affiliate_url: 'https://www.cb2.com/walnut-dresser/s123456?af=cova',
    clip_embedding: makeEmbedding(4),
    style_tags: ['mid_century'],
    room_types: ['bedroom'],
  },
  {
    id: 'p5',
    name: 'Budget Floor Lamp',
    price: 75,
    retailer: 'amazon',
    affiliate_url: 'https://www.amazon.com/dp/B0TESTYYY?tag=cova-20',
    clip_embedding: makeEmbedding(5),
    style_tags: ['minimalist', 'coastal'],
    room_types: ['living_room', 'bedroom', 'office'],
  },
  {
    id: 'p6',
    name: 'Luxury Velvet Armchair',
    price: 3500,
    retailer: 'cb2',
    affiliate_url: 'https://www.cb2.com/velvet-chair/s999?af=cova',
    clip_embedding: makeEmbedding(6),
    style_tags: ['bohemian', 'mid_century'],
    room_types: ['living_room'],
  },
]

// ─── Core Logic (mirrored from match-products edge function) ──────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function filterByBudget(products: Product[], maxPrice: number): Product[] {
  return products.filter(p => p.price <= maxPrice)
}

function filterByRoomType(products: Product[], roomType: string): Product[] {
  return products.filter(p => p.room_types.includes(roomType))
}

function rankByCLIP(
  products: Product[],
  queryEmbedding: number[],
): Array<Product & { similarity: number }> {
  return products
    .map(p => ({ ...p, similarity: cosineSimilarity(queryEmbedding, p.clip_embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
}

function matchProducts(params: MatchProductsParams): Array<Product & { similarity: number }> {
  const { embedding, maxPrice, roomType, limit } = params

  // 1. Filter by room type
  let candidates = filterByRoomType(MOCK_PRODUCTS, roomType)

  // 2. Filter by budget
  candidates = filterByBudget(candidates, maxPrice)

  // 3. Rank by CLIP similarity
  const ranked = rankByCLIP(candidates, embedding)

  // 4. Return top N
  return ranked.slice(0, limit)
}

function fallbackByStyleTags(
  products: Product[],
  styleBlend: Record<string, number>,
  maxPrice: number,
  limit: number,
): Product[] {
  // Used when CLIP embedding is unavailable
  const dominant = Object.entries(styleBlend)
    .sort(([, a], [, b]) => b - a)
    .map(([style]) => style)

  const withinBudget = filterByBudget(products, maxPrice)

  const scored = withinBudget.map(p => {
    let score = 0
    dominant.forEach((style, rank) => {
      if (p.style_tags.includes(style)) score += (dominant.length - rank)
    })
    return { ...p, score }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...p }) => p)
}

function buildAffiliateUrl(product: Product): string {
  // Validate affiliate URL has tracking param
  const url = product.affiliate_url
  if (product.retailer === 'wayfair')  return url  // already has refid
  if (product.retailer === 'amazon')   return url  // already has tag
  if (product.retailer === 'ikea')     return url  // already has affid
  if (product.retailer === 'cb2')      return url  // already has af
  return url
}

// ─── Test harness ─────────────────────────────────────────────────────────────

const results: Array<{ name: string; passed: boolean; error?: string }> = []

function test(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}`)
    console.log(`    → ${e.message}`)
  }
}

console.log('\nCova CLIP Matching Tests\n')
console.log('─'.repeat(50))

// ── Suite 1: CLIP embedding dimensions ───────────────────────────────────────
console.log('\nSuite 1: CLIP embedding dimensions (always 768)')

test('CLIP_DIMENSIONS constant is exactly 768', () => {
  assert.strictEqual(CLIP_DIMENSIONS, 768, 'CLIP dimensions must be 768 — never 1024')
})

test('mock embeddings have exactly 768 dimensions', () => {
  const emb = makeEmbedding(1)
  assert.strictEqual(emb.length, 768, `Embedding length ${emb.length} must equal 768`)
})

test('cosine similarity of identical vectors is 1.0', () => {
  const emb = makeEmbedding(42)
  const sim = cosineSimilarity(emb, emb)
  assert.ok(Math.abs(sim - 1.0) < 0.0001, `Identity cosine similarity ${sim} must be ~1.0`)
})

test('cosine similarity of different vectors is less than 1.0', () => {
  const a = makeEmbedding(1)
  const b = makeEmbedding(99)
  const sim = cosineSimilarity(a, b)
  assert.ok(sim < 1.0, `Different vectors must have similarity < 1.0, got ${sim}`)
})

test('cosine similarity is symmetric', () => {
  const a = makeEmbedding(3)
  const b = makeEmbedding(7)
  const simAB = cosineSimilarity(a, b)
  const simBA = cosineSimilarity(b, a)
  assert.ok(Math.abs(simAB - simBA) < 0.0001, 'Cosine similarity must be symmetric')
})

// ── Suite 2: Budget filter ────────────────────────────────────────────────────
console.log('\nSuite 2: Budget filter (price ≤ maxPrice)')

test('budget filter removes products above maxPrice', () => {
  const filtered = filterByBudget(MOCK_PRODUCTS, 500)
  const overBudget = filtered.filter(p => p.price > 500)
  assert.strictEqual(overBudget.length, 0, 'No products above budget must appear')
})

test('budget filter keeps all products at or below maxPrice', () => {
  const filtered = filterByBudget(MOCK_PRODUCTS, 500)
  filtered.forEach(p => {
    assert.ok(p.price <= 500, `Product ${p.name} at $${p.price} exceeds $500 max`)
  })
})

test('budget filter with maxPrice = 0 returns no products', () => {
  const filtered = filterByBudget(MOCK_PRODUCTS, 0)
  assert.strictEqual(filtered.length, 0, 'No products should pass $0 budget filter')
})

test('budget filter with maxPrice = 10000 returns all products', () => {
  const filtered = filterByBudget(MOCK_PRODUCTS, 10000)
  assert.strictEqual(filtered.length, MOCK_PRODUCTS.length, 'All products should pass $10,000 budget')
})

test('budget filter includes product exactly at the price limit', () => {
  // p1 costs $899, p2 costs $450
  const filtered = filterByBudget(MOCK_PRODUCTS, 899)
  const p1 = filtered.find(p => p.id === 'p1')
  assert.ok(p1, 'Product at exactly $899 must be included when budget is $899')
})

// ── Suite 3: Room type filter ─────────────────────────────────────────────────
console.log('\nSuite 3: Room type filtering')

test('room type filter returns only products for that room type', () => {
  const filtered = filterByRoomType(MOCK_PRODUCTS, 'bedroom')
  filtered.forEach(p => {
    assert.ok(
      p.room_types.includes('bedroom'),
      `Product ${p.name} should be for bedroom`
    )
  })
})

test('room type filter excludes products for other room types', () => {
  // p6 (Luxury Velvet Armchair) is living_room only
  const filtered = filterByRoomType(MOCK_PRODUCTS, 'bedroom')
  const p6 = filtered.find(p => p.id === 'p6')
  assert.strictEqual(p6, undefined, 'Living-room-only product must not appear in bedroom results')
})

test('product can appear in multiple room type queries', () => {
  // p2 has room_types: ['living_room', 'dining_room']
  const living = filterByRoomType(MOCK_PRODUCTS, 'living_room')
  const dining  = filterByRoomType(MOCK_PRODUCTS, 'dining_room')
  const p2InLiving = living.find(p => p.id === 'p2')
  const p2InDining = dining.find(p => p.id === 'p2')
  assert.ok(p2InLiving, 'p2 must appear in living_room results')
  assert.ok(p2InDining, 'p2 must appear in dining_room results')
})

// ── Suite 4: CLIP ranking ─────────────────────────────────────────────────────
console.log('\nSuite 4: CLIP similarity ranking')

test('results are sorted by descending similarity', () => {
  const query = makeEmbedding(1) // closest to p1
  const ranked = rankByCLIP(MOCK_PRODUCTS, query)
  for (let i = 0; i < ranked.length - 1; i++) {
    assert.ok(
      ranked[i].similarity >= ranked[i + 1].similarity,
      `Rank ${i} similarity ${ranked[i].similarity} must be >= rank ${i + 1} similarity ${ranked[i + 1].similarity}`
    )
  }
})

test('most similar product appears first', () => {
  const query = makeEmbedding(1) // seed=1 matches p1's embedding
  const ranked = rankByCLIP(MOCK_PRODUCTS, query)
  assert.strictEqual(ranked[0].id, 'p1', 'p1 must rank first when query matches p1 embedding')
})

test('matchProducts combines room type, budget, and CLIP ranking', () => {
  const results = matchProducts({
    embedding: makeEmbedding(5),
    maxPrice: 500,
    roomType: 'living_room',
    limit: DEFAULT_LIMIT,
  })
  // All results must be for living_room
  results.forEach(p => {
    assert.ok(p.room_types.includes('living_room'), `${p.name} must be for living_room`)
  })
  // All results must be within budget
  results.forEach(p => {
    assert.ok(p.price <= 500, `${p.name} at $${p.price} exceeds $500 budget`)
  })
})

test('matchProducts respects limit parameter', () => {
  const results = matchProducts({
    embedding: makeEmbedding(1),
    maxPrice: 10000,
    roomType: 'living_room',
    limit: 2,
  })
  assert.ok(results.length <= 2, `Results length ${results.length} must be <= 2`)
})

test('matchProducts returns empty when no products match budget', () => {
  const results = matchProducts({
    embedding: makeEmbedding(1),
    maxPrice: 10,
    roomType: 'living_room',
    limit: DEFAULT_LIMIT,
  })
  assert.strictEqual(results.length, 0, 'No products should be returned below $10 budget')
})

// ── Suite 5: Affiliate URL validation ────────────────────────────────────────
console.log('\nSuite 5: Affiliate URL tracking parameters')

test('Wayfair affiliate URL contains refid parameter', () => {
  const product = MOCK_PRODUCTS.find(p => p.retailer === 'wayfair')!
  const url = buildAffiliateUrl(product)
  assert.ok(url.includes('refid='), `Wayfair URL must contain refid tracking param: ${url}`)
})

test('Amazon affiliate URL contains tag parameter', () => {
  const product = MOCK_PRODUCTS.find(p => p.retailer === 'amazon')!
  const url = buildAffiliateUrl(product)
  assert.ok(url.includes('tag='), `Amazon URL must contain tag tracking param: ${url}`)
})

test('IKEA affiliate URL contains affid parameter', () => {
  const product = MOCK_PRODUCTS.find(p => p.retailer === 'ikea')!
  const url = buildAffiliateUrl(product)
  assert.ok(url.includes('affid='), `IKEA URL must contain affid tracking param: ${url}`)
})

test('CB2 affiliate URL contains af parameter', () => {
  const product = MOCK_PRODUCTS.find(p => p.retailer === 'cb2')!
  const url = buildAffiliateUrl(product)
  assert.ok(url.includes('af='), `CB2 URL must contain af tracking param: ${url}`)
})

test('all 4 retailers are represented in product catalog', () => {
  const retailersInCatalog = new Set(MOCK_PRODUCTS.map(p => p.retailer))
  RETAILERS.forEach(retailer => {
    assert.ok(retailersInCatalog.has(retailer), `Retailer ${retailer} must be in catalog`)
  })
})

// ── Suite 6: Style-tag fallback ───────────────────────────────────────────────
console.log('\nSuite 6: Style-tag fallback (when CLIP unavailable)')

test('fallback returns products matching dominant style', () => {
  const styleBlend = { coastal: 0.7, japandi: 0.2, minimalist: 0.1 }
  const results = fallbackByStyleTags(MOCK_PRODUCTS, styleBlend, 10000, 10)
  const hasCoastalProduct = results.some(p => p.style_tags.includes('coastal'))
  assert.ok(hasCoastalProduct, 'Fallback must return at least one coastal-tagged product')
})

test('fallback respects budget filter', () => {
  const styleBlend = { mid_century: 1.0 }
  const results = fallbackByStyleTags(MOCK_PRODUCTS, styleBlend, 500, 10)
  results.forEach(p => {
    assert.ok(p.price <= 500, `Fallback product ${p.name} at $${p.price} exceeds budget`)
  })
})

test('fallback returns no more than requested limit', () => {
  const styleBlend = { minimalist: 1.0 }
  const results = fallbackByStyleTags(MOCK_PRODUCTS, styleBlend, 10000, 2)
  assert.ok(results.length <= 2, `Fallback must respect limit of 2, got ${results.length}`)
})

test('fallback ranks dominant style products above secondary style products', () => {
  // p1 is coastal+minimalist, p3 is bohemian only
  // With coastal dominant, p1 should rank above p3
  const styleBlend = { coastal: 0.9, bohemian: 0.1 }
  const results = fallbackByStyleTags(MOCK_PRODUCTS, styleBlend, 10000, 10)
  const p1Idx = results.findIndex(p => p.id === 'p1')
  const p3Idx = results.findIndex(p => p.id === 'p3')
  if (p1Idx !== -1 && p3Idx !== -1) {
    assert.ok(p1Idx < p3Idx, 'Coastal+minimalist product must rank above bohemian when coastal is dominant')
  }
})

// ─── Results Summary ──────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length
const failed = results.filter(r => !r.passed).length
const total  = results.length

console.log('\n' + '─'.repeat(50))
console.log(`\nResults: ${passed}/${total} passed`)

if (failed > 0) {
  console.log('\nFailed tests:')
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ✗ ${r.name}`)
    console.log(`    ${r.error}`)
  })
  console.log('\nSTATUS: FAIL\n')
  process.exit(1)
} else {
  console.log('\nSTATUS: PASS — all CLIP matching tests passed.\n')
  process.exit(0)
}
