// @vitest-environment node
/**
 * MSW Integration Tests — validates that MSW mock shapes match real Cova API contracts.
 * Also validates fixture JSON files against expected schemas.
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mswServer, withHandler } from './msw-server'
import { http, HttpResponse } from 'msw'
import { z } from 'zod'

// ── Zod schemas matching real Cova API contracts ─────────────────────────────

const FingerprintDimensionsSchema = z.object({
  colorTemperature: z.number().min(0).max(1),
  colorSaturation: z.number().min(0).max(1),
  density: z.number().min(0).max(1),
  formality: z.number().min(0).max(1),
  era: z.number().min(0).max(1),
  material: z.number().min(0).max(1),
  texture: z.number().min(0).max(1),
  pattern: z.number().min(0).max(1),
  lineQuality: z.number().min(0).max(1),
  lightPreference: z.number().min(0).max(1),
  nature: z.number().min(0).max(1),
  culturalInfluence: z.number().min(0).max(1),
})

const FingerprintResponseSchema = z.object({
  fingerprint: z.object({
    dimensions: FingerprintDimensionsSchema,
    covariance: z.array(z.array(z.number())),
    confidence: z.number().min(0).max(1),
  }),
  style_name: z.string().min(1),
  style_tags: z.array(z.string()),
})

const ChatResponseSchema = z.object({
  reply: z.string().min(10),
  completedTab: z.string().nullable(),
})

const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  retailer: z.string().min(1),
  price: z.number().positive(),
  affiliate_url: z.string().url(),
  image_url: z.string().url(),
  match_score: z.number().min(0).max(1),
  match_label: z.enum(['Perfect Match', 'Very Similar', 'Inspired By']),
  fit_label: z.string(),
  fit_reason: z.string(),
})

const MatchResponseSchema = z.object({
  products: z.array(ProductSchema).min(1),
  item_description: z.string().min(1),
  queries_used: z.array(z.string()),
})

const DetectionSchema = z.object({
  detections: z.array(z.object({
    type: z.string(),
    label: z.string(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    confidence: z.number().min(0).max(1),
    showToUser: z.boolean(),
  })),
})

const NextCardSchema = z.object({
  cards: z.array(z.object({
    id: z.string(),
    imageUrl: z.string().url(),
    alt: z.string(),
    styleName: z.string(),
    dimensionLabels: FingerprintDimensionsSchema,
  })),
})

// ── MSW server lifecycle ─────────────────────────────────────────────────────

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  mswServer.resetHandlers()
})

afterAll(() => {
  mswServer.close()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MSW default handlers — response shape validation', () => {
  test('quiz/fingerprint response matches FingerprintResponseSchema', async () => {
    const res = await fetch('http://localhost:3000/api/quiz/fingerprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase_a_selections: [], phase_b_responses: [], room_type: 'bedroom' }),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    const parsed = FingerprintResponseSchema.safeParse(data)
    expect(parsed.success).toBe(true)
  })

  test('quiz/fingerprint returns exactly 12 dimensions', async () => {
    const res = await fetch('http://localhost:3000/api/quiz/fingerprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase_a_selections: [], phase_b_responses: [], room_type: 'bedroom' }),
    })
    const data = await res.json()
    expect(Object.keys(data.fingerprint.dimensions)).toHaveLength(12)
  })

  test('quiz/next-card returns 9 cards matching NextCardSchema', async () => {
    const res = await fetch('http://localhost:3000/api/quiz/next-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round: 1, room_type: 'bedroom', shown_ids: [] }),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    const parsed = NextCardSchema.safeParse(data)
    expect(parsed.success).toBe(true)
    expect(data.cards).toHaveLength(9)
  })

  test('design-chat response matches ChatResponseSchema', async () => {
    const res = await fetch('http://localhost:3000/api/design-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'I want a warm cozy room' }),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    const parsed = ChatResponseSchema.safeParse(data)
    expect(parsed.success).toBe(true)
  })

  test('match response matches MatchResponseSchema', async () => {
    const res = await fetch('http://localhost:3000/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    const parsed = MatchResponseSchema.safeParse(data)
    expect(parsed.success).toBe(true)
  })

  test('detect response matches DetectionSchema', async () => {
    const res = await fetch('http://localhost:3000/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    const parsed = DetectionSchema.safeParse(data)
    expect(parsed.success).toBe(true)
  })

  test('detection confidence thresholds are consistent with COVA rules', async () => {
    const res = await fetch('http://localhost:3000/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    for (const det of data.detections) {
      // >= 0.85 → showToUser true, < 0.85 → showToUser false
      if (det.confidence >= 0.85) {
        expect(det.showToUser).toBe(true)
      } else {
        expect(det.showToUser).toBe(false)
      }
    }
  })
})

describe('MSW handler override — per-test behavior', () => {
  test('withHandler overrides default for single test', async () => {
    withHandler(
      http.post('*/api/design-chat', () => {
        return HttpResponse.json({
          reply: 'Custom override response for testing error handling',
          completedTab: 'budget',
        })
      })
    )

    const res = await fetch('http://localhost:3000/api/design-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    })
    const data = await res.json()
    expect(data.completedTab).toBe('budget')
  })

  test('error responses can be simulated', async () => {
    withHandler(
      http.post('*/api/render', () => {
        return HttpResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
      })
    )

    const res = await fetch('http://localhost:3000/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(429)
  })
})

describe('MSW fixture files — schema validation', () => {
  test('claude-chat-complete.json matches ChatResponseSchema', async () => {
    const fixture = await import('./ai-responses/claude-chat-complete.json')
    const parsed = ChatResponseSchema.safeParse(fixture)
    expect(parsed.success).toBe(true)
  })

  test('clip-match-living-room.json matches MatchResponseSchema', async () => {
    const fixture = await import('./ai-responses/clip-match-living-room.json')
    const parsed = MatchResponseSchema.safeParse(fixture)
    expect(parsed.success).toBe(true)
  })
})
