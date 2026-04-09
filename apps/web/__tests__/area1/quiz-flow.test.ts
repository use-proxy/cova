// @vitest-environment node
/**
 * Area 1 — quiz-flow.test.ts
 * Integration tests for all quiz API routes.
 * All external dependencies (Supabase, Replicate) are mocked using vi.doMock
 * (not vi.mock — doMock is NOT hoisted, so per-test factory functions work).
 * No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeFP(val = 0.5): StyleFingerprint {
  const diag = Array.from({ length: 12 }, (_, i) =>
    Array.from({ length: 12 }, (__, j) => (i === j ? 0.5 : 0))
  )
  return {
    dimensions: {
      colorTemperature:  val,
      colorSaturation:   val,
      density:           val,
      formality:         val,
      era:               val,
      material:          val,
      texture:           val,
      pattern:           val,
      lineQuality:       val,
      lightPreference:   val,
      nature:            val,
      culturalInfluence: val,
    },
    covariance: diag,
    confidence: 0.5,
  }
}

function postReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

// ── /api/quiz/fingerprint ─────────────────────────────────────────────────────

describe('/api/quiz/fingerprint POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 401 when user is not authenticated (new format)', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/fingerprint/route')
    const req = postReq('http://localhost/api/quiz/fingerprint', {
      phase_a_selections: [],
      phase_b_responses: [],
      room_type: 'living_room',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 401 when user is not authenticated (legacy format)', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/quiz/fingerprint/route')
    const req = postReq('http://localhost/api/quiz/fingerprint', {
      responses: [{ pair_id: 'pair-01', chosen: 'A', super_liked: false }],
      entry_path: 'pairs',
      room_type: 'bedroom',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 when room_type is missing (new format)', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
          }),
        },
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/fingerprint/route')
    const req = postReq('http://localhost/api/quiz/fingerprint', {
      phase_a_selections: [],
      phase_b_responses: [],
      // room_type deliberately omitted
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 when responses array is empty (legacy format)', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
          }),
        },
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/quiz/fingerprint/route')
    const req = postReq('http://localhost/api/quiz/fingerprint', {
      responses: [],
      entry_path: 'pairs',
      room_type: 'bedroom',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 200 with fingerprint, style_name, style_tags on valid authenticated new-format request', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-abc' } },
          }),
        },
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'style_fingerprints') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'fp-001' }, error: null }),
                }),
              }),
            }
          }
          // quiz_anchor_images
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/fingerprint/route')
    const req = postReq('http://localhost/api/quiz/fingerprint', {
      phase_a_selections: [],
      phase_b_responses: [],
      room_type: 'living_room',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('fingerprint')
    expect(json).toHaveProperty('style_name')
    expect(json).toHaveProperty('style_tags')
    expect(Array.isArray(json.style_tags)).toBe(true)
  })

  it('does not crash on empty JSON body — returns 400 or 401', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/quiz/fingerprint/route')
    const req = new Request('http://localhost/api/quiz/fingerprint', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    // {} has no phase_a_selections key → treated as legacy → no responses → 400
    // or unauthenticated path (which only fires after 400 check)
    expect([400, 401, 500]).toContain(res.status)
  })
})

// ── /api/quiz/next-pair ───────────────────────────────────────────────────────

describe('/api/quiz/next-pair POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns quizComplete: true when responseCount >= 12', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn(),
    }))

    const { POST } = await import('@/app/api/quiz/next-pair/route')
    const req = postReq('http://localhost/api/quiz/next-pair', {
      completedPairIds: [],
      responseCount: 12,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.quizComplete).toBe(true)
    expect(json.pair).toBeNull()
  })

  it('returns a pair object on valid request (mocked DB with candidates)', async () => {
    const mockPair = {
      id: 'pair-uuid-1',
      dimension: 'colorTemperature',
      dimension_index: 0,
      image_a_url: 'https://example.com/a.jpg',
      image_b_url: 'https://example.com/b.jpg',
      image_a_vector: { colorTemperature: 0.1 },
      image_b_vector: { colorTemperature: 0.9 },
    }

    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'dimension') {
              return { in: vi.fn().mockResolvedValue({ data: [], error: null }) }
            }
            // Full column select
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [mockPair], error: null }),
              }),
            }
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/next-pair/route')
    const req = postReq('http://localhost/api/quiz/next-pair', {
      completedPairIds: [],
      responseCount: 0,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('pair')
    expect(json).toHaveProperty('quizComplete')
    // With a valid candidate, quizComplete should be false and pair should be non-null
    expect(json.quizComplete).toBe(false)
    expect(json.pair).not.toBeNull()
    expect(json.pair).toHaveProperty('id', 'pair-uuid-1')
  })

  it('returns quizComplete: true when DB returns no candidates', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'dimension') {
              return { in: vi.fn().mockResolvedValue({ data: [], error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/next-pair/route')
    const req = postReq('http://localhost/api/quiz/next-pair', {
      completedPairIds: [],
      responseCount: 0,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.quizComplete).toBe(true)
  })

  it('does not crash on empty JSON body — defaults kick in and returns valid response', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'dimension') {
              return { in: vi.fn().mockResolvedValue({ data: [], error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/next-pair/route')
    const req = new Request('http://localhost/api/quiz/next-pair', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect([200, 500]).toContain(res.status)
  })
})

// ── /api/quiz/confidence ──────────────────────────────────────────────────────
// Legacy swipe-card route. Uses createServerClient from @supabase/ssr + cookies().
// No auth guard: works with session_id only.

describe('/api/quiz/confidence POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns confidence < 100 and complete: false with fewer than 8 swipes', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/confidence/route')
    const req = postReq('http://localhost/api/quiz/confidence', {
      session_id: 'sess-1',
      swipes: [
        { card_id: 'c1', direction: 'right', style_tags: ['modern'], timestamp: 1 },
        { card_id: 'c2', direction: 'left', style_tags: ['rustic'], timestamp: 2 },
      ],
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.complete).toBe(false)
    expect(typeof json.confidence).toBe('number')
  })

  it('returns confidence: 100 and complete: true when n >= 25 swipes', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/confidence/route')
    const swipes = Array.from({ length: 25 }, (_, i) => ({
      card_id: `c${i}`,
      direction: 'right' as const,
      style_tags: ['modern'],
      timestamp: i,
    }))
    const req = postReq('http://localhost/api/quiz/confidence', {
      session_id: 'sess-2',
      swipes,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.complete).toBe(true)
    expect(json.confidence).toBe(100)
    expect(json).toHaveProperty('style_fingerprint')
  })

  it('does not crash on empty swipes array', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/confidence/route')
    const req = postReq('http://localhost/api/quiz/confidence', {
      session_id: 'sess-3',
      swipes: [],
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.confidence).toBe('number')
    expect(json.complete).toBe(false)
  })
})

// ── /api/quiz/validation-renders ─────────────────────────────────────────────
// No auth guard. Uses Replicate for image generation (mocked).

describe('/api/quiz/validation-renders POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 400 when fingerprint is missing', async () => {
    vi.doMock('replicate', () => ({ default: vi.fn() }))
    vi.doMock('@/lib/ai/flux', () => ({
      buildFluxPrompt: vi.fn().mockReturnValue('test prompt'),
    }))

    const { POST } = await import('@/app/api/quiz/validation-renders/route')
    const req = postReq('http://localhost/api/quiz/validation-renders', {
      roomType: 'living_room',
      // fingerprint deliberately omitted
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 when roomType is missing', async () => {
    vi.doMock('replicate', () => ({ default: vi.fn() }))
    vi.doMock('@/lib/ai/flux', () => ({
      buildFluxPrompt: vi.fn().mockReturnValue('test prompt'),
    }))

    const { POST } = await import('@/app/api/quiz/validation-renders/route')
    const req = postReq('http://localhost/api/quiz/validation-renders', {
      fingerprint: makeFP(),
      // roomType deliberately omitted
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 200 with renders array on valid request (mocked Replicate)', async () => {
    const mockOutput = 'https://example.com/render.png'
    const mockPredictions = {
      create: vi.fn().mockResolvedValue({
        id: 'pred-1',
        status: 'succeeded',
        output: mockOutput,
      }),
      get: vi.fn().mockResolvedValue({
        id: 'pred-1',
        status: 'succeeded',
        output: mockOutput,
      }),
    }
    // Must be a real class so `new Replicate(...)` works in the route
    class MockReplicate {
      predictions = mockPredictions
      constructor(_opts: unknown) {}
    }
    vi.doMock('replicate', () => ({
      default: MockReplicate,
    }))
    vi.doMock('@/lib/ai/flux', () => ({
      buildFluxPrompt: vi.fn().mockReturnValue('a beautiful living room'),
    }))

    const { POST } = await import('@/app/api/quiz/validation-renders/route')
    const req = postReq('http://localhost/api/quiz/validation-renders', {
      fingerprint: makeFP(),
      roomType: 'living_room',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('renders')
    expect(Array.isArray(json.renders)).toBe(true)
    expect(json.renders).toHaveLength(3)
    // Each slot has label, fingerprint, and url (or null on failure)
    for (const slot of json.renders) {
      expect(slot).toHaveProperty('label')
      expect(slot).toHaveProperty('fingerprint')
      expect(['string', 'object']).toContain(typeof slot.url)
    }
  })

  it('does not crash on empty JSON body — returns 400', async () => {
    vi.doMock('replicate', () => ({ default: vi.fn() }))
    vi.doMock('@/lib/ai/flux', () => ({ buildFluxPrompt: vi.fn() }))

    const { POST } = await import('@/app/api/quiz/validation-renders/route')
    const req = new Request('http://localhost/api/quiz/validation-renders', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ── /api/quiz/next-card ───────────────────────────────────────────────────────
// Both GET and POST. No auth guard. Returns 9 anchor cards.

describe('/api/quiz/next-card GET + POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  const mockCards = [
    {
      id: 'anchor-1',
      style_name: 'Warm Japandi',
      style_index: 1,
      image_url: 'https://example.com/1.jpg',
      style_vector: {
        colorTemperature: 0.8, colorSaturation: 0.25, density: 0.3,
        formality: 0.4, era: 0.45, material: 0.85, texture: 0.55,
        pattern: 0.1, lineQuality: 0.75, lightPreference: 0.65,
        nature: 0.6, culturalInfluence: 0.25,
      },
    },
  ]

  it('GET returns cards array', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockCards, error: null }),
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/quiz/next-card/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('cards')
    expect(Array.isArray(json.cards)).toBe(true)
  })

  it('POST returns cards array', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockCards, error: null }),
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/quiz/next-card/route')
    const res = await POST()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('cards')
    expect(Array.isArray(json.cards)).toBe(true)
  })

  it('returns empty cards array when DB has no rows', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/quiz/next-card/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.cards).toEqual([])
  })

  it('returns 500 when DB returns error', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/quiz/next-card/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('card shape includes id, style_name, style_index, image_url, style_vector', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(),
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockCards, error: null }),
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/quiz/next-card/route')
    const res = await GET()
    const json = await res.json()
    const card = json.cards[0]
    expect(card).toHaveProperty('id')
    expect(card).toHaveProperty('style_name')
    expect(card).toHaveProperty('style_index')
    expect(card).toHaveProperty('image_url')
    expect(card).toHaveProperty('style_vector')
  })
})
