import { describe, it, expect, beforeAll } from 'vitest'

// Set env vars before importing to simulate production environment
beforeAll(() => {
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
})

describe('Affiliate URL Builder', () => {
  const COVA_TAG = 'cova03-20'

  it('injects Amazon affiliate tag', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://www.amazon.com/dp/B08N5WRWNW'
    const result = buildAffiliateUrl(url, 'amazon')
    expect(result).toContain(COVA_TAG)
  })

  it('handles Article affiliate links', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://www.article.com/products/sofa'
    const result = buildAffiliateUrl(url, 'article')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles West Elm affiliate links', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://www.westelm.com/products/sofa'
    const result = buildAffiliateUrl(url, 'west_elm')
    expect(typeof result).toBe('string')
  })

  it('handles Pottery Barn affiliate links', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://www.potterybarn.com/products/sofa'
    const result = buildAffiliateUrl(url, 'pottery_barn')
    expect(typeof result).toBe('string')
  })

  it('handles Crate and Barrel affiliate links', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://www.crateandbarrel.com/sofa/1'
    const result = buildAffiliateUrl(url, 'crate_barrel')
    expect(typeof result).toBe('string')
  })

  it('returns valid URL for all supported retailers', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const retailers = [
      'amazon',
      'article',
      'west_elm',
      'pottery_barn',
      'crate_barrel',
      'cb2',
      'ruggable',
      'one_kings_lane',
      'overstock',
      'etsy',
      'ikea',
    ]
    retailers.forEach((retailer) => {
      const result = buildAffiliateUrl('https://example.com/product', retailer)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  it('IKEA returns URL unchanged (no affiliate program)', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://www.ikea.com/us/en/p/sofa'
    const result = buildAffiliateUrl(url, 'ikea')
    expect(result).toBe(url)
  })

  it('unknown retailer returns original URL', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const url = 'https://example.com/product'
    const result = buildAffiliateUrl(url, 'unknown_retailer')
    expect(result).toBe(url)
  })

  it('never returns undefined or null', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    const result = buildAffiliateUrl('https://example.com', 'unknown_retailer')
    expect(result).not.toBeUndefined()
    expect(result).not.toBeNull()
  })

  it('Amazon ASIN extraction works from standard URL', async () => {
    const { buildAffiliateUrl } = await import('@/lib/affiliates')
    // Valid Amazon ASIN is exactly 10 alphanumeric uppercase chars
    const url = 'https://www.amazon.com/Some-Product-Name/dp/B08N5WRWNW/ref=sr_1_1'
    const result = buildAffiliateUrl(url, 'amazon')
    expect(result).toContain('B08N5WRWNW')
    expect(result).toContain(COVA_TAG)
  })
})
