// @vitest-environment node
/**
 * Area 4 — scoring.test.ts
 * Pure unit tests for matchUtils.ts, budget.ts, and fit.ts.
 * No mocks needed — all pure functions.
 */

import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  computeBudgetScore,
  getMatchLabel,
  isFurnitureRetailer,
  isFurnitureProduct,
  rrfMerge,
  pickCategoryWeights,
  CATEGORY_WEIGHTS,
} from '@/lib/ai/matchUtils'
import { getItemBudgetTarget } from '@/lib/ai/budget'
import {
  extractDimensionsFromText,
  getDimensionsForCategory,
  scoreFit,
} from '@/lib/ai/fit'
import type { SerperProduct } from '@/lib/ai/serper'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<SerperProduct> = {}): SerperProduct {
  return {
    title: 'Test Chair',
    price: 299,
    currency: 'USD',
    imageUrl: 'https://example.com/img.jpg',
    productUrl: 'https://wayfair.com/chair',
    retailer: 'wayfair',
    rating: 4.5,
    ratingCount: 100,
    delivery: null,
    isSale: false,
    ...overrides,
  }
}

// ── cosineSimilarity ───────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('1. identical unit vectors → 1.0', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0)
  })

  it('2. opposite unit vectors → -1.0', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0)
  })

  it('3. orthogonal vectors → 0.0', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0)
  })

  it('4. empty vectors → 0 (no crash)', () => {
    expect(() => cosineSimilarity([], [])).not.toThrow()
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('5. mismatched lengths → 0 (no crash)', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).not.toThrow()
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })
})

// ── computeBudgetScore ─────────────────────────────────────────────────────────

describe('computeBudgetScore', () => {
  it('6. price at midpoint → ≥ 0.85', () => {
    const score = computeBudgetScore(500, [0, 1000])
    expect(score).toBeGreaterThanOrEqual(0.85)
  })

  it('7. price below min → score between 0.70 and 1.0', () => {
    const score = computeBudgetScore(50, [100, 300])
    expect(score).toBeGreaterThanOrEqual(0.70)
    expect(score).toBeLessThanOrEqual(1.0)
  })

  it('8. price above max → score approaching 0', () => {
    const score = computeBudgetScore(500, [100, 300])
    expect(score).toBeLessThan(0.5)
  })

  it('9. price 2× above max → near 0', () => {
    const score = computeBudgetScore(600, [100, 300])
    expect(score).toBeLessThan(0.1)
  })
})

// ── getMatchLabel ──────────────────────────────────────────────────────────────

describe('getMatchLabel', () => {
  it('10. score 0.90 → Perfect Match', () => {
    expect(getMatchLabel(0.90)).toBe('Perfect Match')
  })

  it('11. score 0.80 → Very Similar', () => {
    expect(getMatchLabel(0.80)).toBe('Very Similar')
  })

  it('12. score 0.70 → Inspired By', () => {
    expect(getMatchLabel(0.70)).toBe('Inspired By')
  })

  it('13a. score 0.85 → Perfect Match (boundary)', () => {
    expect(getMatchLabel(0.85)).toBe('Perfect Match')
  })

  it('13b. score 0.75 → Very Similar (boundary)', () => {
    expect(getMatchLabel(0.75)).toBe('Very Similar')
  })

  it('13c. score 0.749 → Inspired By (just below Very Similar boundary)', () => {
    expect(getMatchLabel(0.749)).toBe('Inspired By')
  })
})

// ── isFurnitureRetailer ────────────────────────────────────────────────────────

describe('isFurnitureRetailer', () => {
  it('14. wayfair.com → true', () => {
    expect(isFurnitureRetailer('wayfair.com')).toBe(true)
  })

  it('15. amazon.com → true', () => {
    expect(isFurnitureRetailer('amazon.com')).toBe(true)
  })

  it('16. staples.com → false', () => {
    expect(isFurnitureRetailer('staples.com')).toBe(false)
  })

  it('17. case insensitive — WAYFAIR → true', () => {
    expect(isFurnitureRetailer('WAYFAIR')).toBe(true)
  })

  it('17b. target → true', () => {
    expect(isFurnitureRetailer('target')).toBe(true)
  })
})

// ── isFurnitureProduct ─────────────────────────────────────────────────────────

describe('isFurnitureProduct', () => {
  it('18. price < 30 → false (price floor)', () => {
    const p = makeProduct({ price: 10, retailer: 'wayfair', productUrl: 'https://wayfair.com/item' })
    expect(isFurnitureProduct(p)).toBe(false)
  })

  it('19. price >= 30 + known retailer → true', () => {
    const p = makeProduct({ price: 30, retailer: 'wayfair', productUrl: 'https://wayfair.com/item' })
    expect(isFurnitureProduct(p)).toBe(true)
  })

  it('19b. price >= 30 + unknown retailer but furniture URL hostname → true', () => {
    const p = makeProduct({
      price: 150,
      retailer: 'SomeStore',
      productUrl: 'https://www.westelm.com/products/chair',
    })
    expect(isFurnitureProduct(p)).toBe(true)
  })

  it('19c. price >= 30 + non-furniture retailer and non-furniture URL → false', () => {
    const p = makeProduct({
      price: 50,
      retailer: 'staples',
      productUrl: 'https://www.staples.com/office-chair',
    })
    expect(isFurnitureProduct(p)).toBe(false)
  })
})

// ── rrfMerge ──────────────────────────────────────────────────────────────────

describe('rrfMerge', () => {
  it('20. product in 2 lists ranks higher than product in 1 list', () => {
    const shared = makeProduct({ productUrl: 'https://wayfair.com/both', title: 'Both Chair' })
    const onlyB = makeProduct({ productUrl: 'https://wayfair.com/only-b', title: 'Only B Chair' })
    const merged = rrfMerge([[shared], [shared, onlyB]])
    const sharedResult = merged.find((p) => p.productUrl === 'https://wayfair.com/both')
    const onlyBResult = merged.find((p) => p.productUrl === 'https://wayfair.com/only-b')
    expect(sharedResult).toBeDefined()
    expect(onlyBResult).toBeDefined()
    expect(sharedResult!.rrfScore).toBeGreaterThan(onlyBResult!.rrfScore)
  })

  it('21. item ranked #1 beats item ranked #10 when only in one list', () => {
    const top = makeProduct({ productUrl: 'https://wayfair.com/top', title: 'Top Chair' })
    const bottom = makeProduct({ productUrl: 'https://wayfair.com/bottom', title: 'Bottom Chair' })
    const list = [top, ...Array(8).fill(null).map((_, i) =>
      makeProduct({ productUrl: `https://wayfair.com/mid-${i}`, title: `Mid ${i}` })
    ), bottom]
    const merged = rrfMerge([list])
    const topResult = merged.find((p) => p.productUrl === 'https://wayfair.com/top')
    const bottomResult = merged.find((p) => p.productUrl === 'https://wayfair.com/bottom')
    expect(topResult!.rrfScore).toBeGreaterThan(bottomResult!.rrfScore)
  })
})

// ── getItemBudgetTarget ────────────────────────────────────────────────────────

describe('getItemBudgetTarget', () => {
  it('22. returns [min, max] tuple for a living room sofa', () => {
    const result = getItemBudgetTarget('sofa', 'living_room', [1000, 3000])
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result[0]).toBeLessThan(result[1])
  })

  it('23. sofa gets larger budget than decor for same total budget', () => {
    const totalRange: [number, number] = [2000, 6000]
    const sofaRange = getItemBudgetTarget('sofa', 'living_room', totalRange)
    const decorRange = getItemBudgetTarget('decor', 'living_room', totalRange)
    // Sofa allocation is 0.35, decor is 0.05 — sofa should have higher midpoint
    const sofaMid = (sofaRange[0] + sofaRange[1]) / 2
    const decorMid = (decorRange[0] + decorRange[1]) / 2
    expect(sofaMid).toBeGreaterThan(decorMid)
  })
})

// ── pickCategoryWeights ────────────────────────────────────────────────────────

describe('pickCategoryWeights', () => {
  it('18. lamp keyword → lamp weights (visual: 0.35, quality: 0.25)', () => {
    const w = pickCategoryWeights('floor lamp')
    expect(w.visual).toBe(CATEGORY_WEIGHTS.lamp!.visual)
    expect(w.quality).toBe(CATEGORY_WEIGHTS.lamp!.quality)
  })

  it('19. rug keyword → rug weights (visual: 0.55)', () => {
    const w = pickCategoryWeights('area rug')
    expect(w.visual).toBe(CATEGORY_WEIGHTS.rug!.visual)
  })

  it('fallback → default weights', () => {
    const w = pickCategoryWeights('unknown item xyz')
    expect(w).toEqual(CATEGORY_WEIGHTS.default)
  })
})

// ── extractDimensionsFromText ─────────────────────────────────────────────────

describe('extractDimensionsFromText', () => {
  it('24. "72 x 36 x 30 inches" → width 72', () => {
    const result = extractDimensionsFromText('72 x 36 x 30 inches')
    expect(result.widthInches).toBe(72)
    expect(result.source).toBe('regex')
  })

  it('24b. "W34" × D18" × H30"" format → width 34', () => {
    const result = extractDimensionsFromText('W34" × D18" × H30"')
    expect(result.widthInches).toBe(34)
  })

  it('24c. no dimension info → unknown source', () => {
    const result = extractDimensionsFromText('Beautiful modern sofa')
    expect(result.widthInches).toBeNull()
    expect(result.source).toBe('unknown')
  })
})

// ── scoreFit ───────────────────────────────────────────────────────────────────

describe('scoreFit', () => {
  it('25. sofa fits within usable space → passes: true', () => {
    const dims = { widthInches: 72, depthInches: 36, heightInches: 34, source: 'regex' as const, confidence: 'confirmed' as const }
    const result = scoreFit('sofa', dims, 120)
    expect(result.passes).toBe(true)
  })

  it('26. sofa too wide → passes: false', () => {
    // sofa maxWidthRatio = 0.85, so max = 120 * 0.85 = 102; 110 > 102
    const dims = { widthInches: 110, depthInches: 36, heightInches: 34, source: 'regex' as const, confidence: 'confirmed' as const }
    const result = scoreFit('sofa', dims, 120)
    expect(result.passes).toBe(false)
  })

  it('27. no dimension data → Dimensions Unconfirmed but still passes', () => {
    const dims = { widthInches: null, depthInches: null, heightInches: null, source: 'unknown' as const, confidence: 'unknown' as const }
    const result = scoreFit('sofa', dims, 120)
    expect(result.label).toBe('Dimensions Unconfirmed')
    expect(result.passes).toBe(true)
  })

  it('27b. wide clearance → Perfect Fit', () => {
    // clearance = (120 - 60) / 2 / 120 = 0.25 >= 0.20 → Perfect Fit
    const dims = { widthInches: 60, depthInches: 30, heightInches: 30, source: 'regex' as const, confidence: 'confirmed' as const }
    const result = scoreFit('sofa', dims, 120)
    expect(result.label).toBe('Perfect Fit')
  })
})

// ── getDimensionsForCategory ───────────────────────────────────────────────────

describe('getDimensionsForCategory', () => {
  it('sofa → returns default sofa dimensions', () => {
    const dims = getDimensionsForCategory('sofa')
    expect(dims.widthInches).toBe(84)
    expect(dims.source).toBe('default')
  })

  it('unknown category → returns null widthInches', () => {
    const dims = getDimensionsForCategory('exotic unknown furniture piece')
    expect(dims.widthInches).toBeNull()
  })
})
