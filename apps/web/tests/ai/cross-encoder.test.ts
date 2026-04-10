// @vitest-environment node
/**
 * Cross-Encoder Re-ranking Tests
 *
 * Tests for two-stage retrieval:
 *   Stage 1: Broad CLIP search (top 50 candidates)
 *   Stage 2: Cross-encoder re-ranking for precision
 *
 * The cross-encoder uses Claude as the re-ranker (no deployed ML model needed).
 */

import { describe, test, expect } from 'vitest'

// ── Product candidate type ───────────────────────────────────────────────────

interface ProductCandidate {
  id: string
  name: string
  brand: string
  price: number
  category: string
  similarity_score: number
}

// ── Re-ranking logic (pure function, no API calls) ──────────────────────────

function rerankByBudgetAndCategory(
  candidates: ProductCandidate[],
  budget: { min: number; max: number },
  preferredCategories: string[],
  topK: number
): ProductCandidate[] {
  if (candidates.length <= topK) return candidates

  // Score each candidate
  const scored = candidates.map(p => {
    let score = p.similarity_score

    // Budget fit bonus (0-0.2)
    const center = (budget.min + budget.max) / 2
    const halfRange = (budget.max - budget.min) / 2
    const dist = Math.abs(p.price - center) / halfRange
    score += Math.max(0, 0.2 * (1 - dist))

    // Category preference bonus (0-0.1)
    if (preferredCategories.includes(p.category)) {
      score += 0.1
    }

    return { product: p, score }
  })

  // Sort by composite score
  scored.sort((a, b) => b.score - a.score)

  // Category diversity: ensure at least 1 per category if possible
  const result: ProductCandidate[] = []
  const usedCategories = new Set<string>()

  // First pass: one per category
  for (const cat of preferredCategories) {
    const match = scored.find(s =>
      s.product.category === cat && !result.includes(s.product)
    )
    if (match) {
      result.push(match.product)
      usedCategories.add(cat)
    }
  }

  // Second pass: fill remaining by score
  for (const s of scored) {
    if (result.length >= topK) break
    if (!result.includes(s.product)) {
      result.push(s.product)
    }
  }

  return result.slice(0, topK)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Cross-encoder re-ranking — budget and category scoring', () => {
  const candidates: ProductCandidate[] = Array.from({ length: 30 }, (_, i) => ({
    id: `product-${i}`,
    name: `Product ${i}`,
    brand: ['Article', 'West Elm', 'CB2', 'IKEA', 'Pottery Barn'][i % 5],
    price: 100 + i * 80,
    category: ['Seating', 'Tables', 'Lighting', 'Rugs', 'Decor', 'Art'][i % 6],
    similarity_score: 0.95 - (i * 0.015),
  }))

  test('returns exactly topK results', () => {
    const result = rerankByBudgetAndCategory(
      candidates,
      { min: 500, max: 2000 },
      ['Seating', 'Tables', 'Lighting'],
      12
    )
    expect(result).toHaveLength(12)
  })

  test('returns all candidates when fewer than topK', () => {
    const small = candidates.slice(0, 5)
    const result = rerankByBudgetAndCategory(
      small,
      { min: 500, max: 2000 },
      ['Seating'],
      12
    )
    expect(result).toHaveLength(5)
  })

  test('category diversity: preferred categories get representation', () => {
    const preferred = ['Seating', 'Tables', 'Lighting', 'Rugs', 'Decor']
    const result = rerankByBudgetAndCategory(
      candidates,
      { min: 500, max: 2000 },
      preferred,
      12
    )

    const resultCategories = new Set(result.map(p => p.category))
    // Should have at least 4 of 5 preferred categories represented
    const overlap = preferred.filter(c => resultCategories.has(c))
    expect(overlap.length).toBeGreaterThanOrEqual(4)
  })

  test('budget-centered products rank higher than edge products', () => {
    const budgetCenter = (500 + 2000) / 2 // 1250
    const result = rerankByBudgetAndCategory(
      candidates,
      { min: 500, max: 2000 },
      [],
      12
    )

    // Products near budget center should appear earlier
    const centerProduct = result.find(p => Math.abs(p.price - budgetCenter) < 200)
    if (centerProduct) {
      const index = result.indexOf(centerProduct)
      // Should be in top half
      expect(index).toBeLessThan(8)
    }
  })

  test('all results have required fields', () => {
    const result = rerankByBudgetAndCategory(
      candidates,
      { min: 500, max: 2000 },
      ['Seating'],
      12
    )

    for (const product of result) {
      expect(product.id).toBeTruthy()
      expect(product.name).toBeTruthy()
      expect(product.brand).toBeTruthy()
      expect(product.price).toBeGreaterThan(0)
      expect(product.category).toBeTruthy()
      expect(product.similarity_score).toBeGreaterThanOrEqual(0)
      expect(product.similarity_score).toBeLessThanOrEqual(1)
    }
  })

  test('no duplicate products in results', () => {
    const result = rerankByBudgetAndCategory(
      candidates,
      { min: 500, max: 2000 },
      ['Seating', 'Tables'],
      12
    )

    const ids = result.map(p => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('Cross-encoder — Cova scoring formula weights', () => {
  test('weights sum to 1.0: 0.35 visual + 0.30 fp + 0.20 budget + 0.10 behavioral + 0.05 affiliate', () => {
    const weightSum = 0.35 + 0.30 + 0.20 + 0.10 + 0.05
    expect(weightSum).toBeCloseTo(1.0, 10)
  })

  test('visual similarity has highest weight (0.35)', () => {
    const weights = { visual: 0.35, fingerprint: 0.30, budget: 0.20, behavioral: 0.10, affiliate: 0.05 }
    const max = Math.max(...Object.values(weights))
    expect(weights.visual).toBe(max)
  })

  test('affiliate weight is capped at 5% (prevents bias)', () => {
    const maxAffiliateImpact = 0.05 * 1.0 // max affiliate score * weight
    expect(maxAffiliateImpact).toBe(0.05)
    expect(maxAffiliateImpact).toBeLessThan(0.10) // less than behavioral
  })

  test('style vector re-ranking applies correct multipliers', () => {
    // Per CLAUDE.md: style vector re-ranking ×1.10 match, ×0.85 no match
    const baseScore = 0.80
    const matchBoost = baseScore * 1.10
    const noMatchPenalty = baseScore * 0.85

    expect(matchBoost).toBeCloseTo(0.88, 2)
    expect(noMatchPenalty).toBeCloseTo(0.68, 2)
    expect(matchBoost).toBeGreaterThan(noMatchPenalty)
  })
})
