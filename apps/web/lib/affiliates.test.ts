/**
 * Tests for buildAffiliateUrl
 *
 * Run with: npx tsx apps/web/lib/affiliates.test.ts
 */

// Set env vars before importing
process.env.AMAZON_AFFILIATE_TAG = 'cova03-20'
process.env.ARTICLE_AFFILIATE_ID = 'art_12345'
process.env.CRATE_BARREL_AFFILIATE_ID = 'cb_key_67890'
process.env.CB2_AFFILIATE_ID = 'cb2_key_11111'
process.env.WEST_ELM_AFFILIATE_ID = 'we_22222'
process.env.POTTERY_BARN_AFFILIATE_ID = 'pb_33333'
process.env.RUGGABLE_AFFILIATE_ID = 'rug_44444'
process.env.ONE_KINGS_LANE_AFFILIATE_ID = 'okl_55555'
process.env.OVERSTOCK_AFFILIATE_ID = 'os_66666'
process.env.ETSY_AFFILIATE_ID = 'etsy_77777'

import { buildAffiliateUrl } from './affiliates'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  FAIL  ${name}: ${msg}`)
    failed++
  }
}

function expect(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`\n    Expected: ${expected}\n    Got:      ${actual}`)
  }
}

console.log('\nAffiliate URL Builder Tests\n')

// Amazon — with ASIN
test('Amazon with ASIN', () => {
  const url = buildAffiliateUrl(
    'https://www.amazon.com/dp/B0CJ3FWNW1',
    'amazon',
    'B0CJ3FWNW1'
  )
  expect(url, 'https://www.amazon.com/dp/B0CJ3FWNW1?tag=cova03-20')
})

// Amazon — extract ASIN from URL
test('Amazon extract ASIN from URL', () => {
  const url = buildAffiliateUrl(
    'https://www.amazon.com/Some-Product-Name/dp/B0CJ3FWNW1/ref=sr_1_1',
    'amazon'
  )
  expect(url, 'https://www.amazon.com/dp/B0CJ3FWNW1?tag=cova03-20')
})

// Amazon — no ASIN, append tag
test('Amazon fallback append tag', () => {
  const url = buildAffiliateUrl(
    'https://www.amazon.com/s?k=sofa',
    'amazon'
  )
  expect(url, 'https://www.amazon.com/s?k=sofa&tag=cova03-20')
})

// IKEA — no affiliate
test('IKEA returns URL as-is', () => {
  const url = buildAffiliateUrl(
    'https://www.ikea.com/us/en/p/kallax-shelf-unit-white-00275848/',
    'ikea'
  )
  expect(url, 'https://www.ikea.com/us/en/p/kallax-shelf-unit-white-00275848/')
})

// Article — AWC format
test('Article AWC format', () => {
  const url = buildAffiliateUrl(
    'https://www.article.com/product/12345/seno-sofa',
    'article'
  )
  expect(url, 'https://www.article.com/product/12345/seno-sofa?awc=art_12345')
})

// Crate & Barrel — Sovrn
test('Crate & Barrel Sovrn format', () => {
  const url = buildAffiliateUrl(
    'https://www.crateandbarrel.com/lounge-sofa/s123456',
    'crate_barrel'
  )
  const expected = `https://redirect.viglink.com?key=cb_key_67890&u=${encodeURIComponent('https://www.crateandbarrel.com/lounge-sofa/s123456')}`
  expect(url, expected)
})

// CB2 — Sovrn
test('CB2 Sovrn format', () => {
  const url = buildAffiliateUrl(
    'https://www.cb2.com/gwyneth-sofa/s123456',
    'cb2'
  )
  const expected = `https://redirect.viglink.com?key=cb2_key_11111&u=${encodeURIComponent('https://www.cb2.com/gwyneth-sofa/s123456')}`
  expect(url, expected)
})

// West Elm — ShareASale
test('West Elm ShareASale format', () => {
  const url = buildAffiliateUrl(
    'https://www.westelm.com/products/harmony-sofa-h1234/',
    'west_elm'
  )
  const expected = `https://www.shareasale.com/r.cfm?u=we_22222&urllink=${encodeURIComponent('https://www.westelm.com/products/harmony-sofa-h1234/')}`
  expect(url, expected)
})

// Pottery Barn — ShareASale
test('Pottery Barn ShareASale format', () => {
  const url = buildAffiliateUrl(
    'https://www.potterybarn.com/products/york-sofa/',
    'pottery_barn'
  )
  const expected = `https://www.shareasale.com/r.cfm?u=pb_33333&urllink=${encodeURIComponent('https://www.potterybarn.com/products/york-sofa/')}`
  expect(url, expected)
})

// Ruggable — CJ
test('Ruggable CJ format', () => {
  const url = buildAffiliateUrl(
    'https://ruggable.com/products/morris-rug',
    'ruggable'
  )
  const expected = `https://www.anrdoezrs.net/links/rug_44444/type/dlg/${encodeURIComponent('https://ruggable.com/products/morris-rug')}`
  expect(url, expected)
})

// One Kings Lane — CJ
test('One Kings Lane CJ format', () => {
  const url = buildAffiliateUrl(
    'https://www.onekingslane.com/p/4567/vintage-table',
    'one_kings_lane'
  )
  const expected = `https://www.anrdoezrs.net/links/okl_55555/type/dlg/${encodeURIComponent('https://www.onekingslane.com/p/4567/vintage-table')}`
  expect(url, expected)
})

// Overstock — CJ
test('Overstock CJ format', () => {
  const url = buildAffiliateUrl(
    'https://www.overstock.com/Home-Garden/Sofa/12345',
    'overstock'
  )
  const expected = `https://www.anrdoezrs.net/links/os_66666/type/dlg/${encodeURIComponent('https://www.overstock.com/Home-Garden/Sofa/12345')}`
  expect(url, expected)
})

// Etsy — Awin
test('Etsy Awin format', () => {
  const url = buildAffiliateUrl(
    'https://www.etsy.com/listing/1234567890/handmade-rug',
    'etsy'
  )
  const expected = `https://www.awin1.com/cread.php?awinmid=etsy_77777&p=${encodeURIComponent('https://www.etsy.com/listing/1234567890/handmade-rug')}`
  expect(url, expected)
})

// Unknown retailer — passthrough
test('Unknown retailer returns URL as-is', () => {
  const url = buildAffiliateUrl(
    'https://www.unknownstore.com/product/123',
    'unknownstore'
  )
  expect(url, 'https://www.unknownstore.com/product/123')
})

// Missing affiliate ID — passthrough
test('Missing affiliate ID returns URL as-is', () => {
  delete process.env.ARTICLE_AFFILIATE_ID
  const url = buildAffiliateUrl(
    'https://www.article.com/product/12345/seno-sofa',
    'article'
  )
  expect(url, 'https://www.article.com/product/12345/seno-sofa')
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
