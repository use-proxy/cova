// @vitest-environment node
/**
 * Area 3 — render-pipeline.test.ts
 * Tests for the render API routes:
 *   POST /api/render/from-context
 *   GET  /api/render/status
 *   POST /api/render/previews
 *   GET  /api/render/previews/status
 *   POST /api/render/tweak
 *   GET  /api/render/tweak/status
 *
 * Uses vi.doMock + vi.resetModules() in beforeEach so each test has an
 * isolated module graph. Lessons applied from phases 1 & 2:
 *  - Replicate mocked as a class
 *  - Supabase mocked via '@/lib/supabase/server' and '@/lib/supabase/admin'
 *  - vi.doMock, not vi.mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock data ───────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-123', email: 'test@example.com' }

const MOCK_RENDER_CONTEXT = {
  roomId: 'room-abc',
  userId: 'user-123',
  assembledAt: new Date().toISOString(),
  fingerprint: {
    dimensions: {
      colorTemperature: 0.7, colorSaturation: 0.5, density: 0.4,
      formality: 0.5, era: 0.5, material: 0.6, texture: 0.5,
      pattern: 0.5, lineQuality: 0.5, lightPreference: 0.6,
      nature: 0.5, culturalInfluence: 0.5,
    },
    covariance: Array(12).fill(Array(12).fill(0)),
    confidence: 0.75,
  },
  roomContext: {
    roomShape: 'rectangular',
    estimatedDimensions: '12ft x 15ft',
    ceilingHeight: 'standard-8ft',
    ceilingDetail: '',
    naturalLightDirection: 'left',
    naturalLightQuality: 'soft-diffused',
    windowCount: 1,
    windowSize: 'medium',
    floorMaterial: 'hardwood',
    floorColor: 'oak',
    wallColor: 'white',
    hasAccentWall: false,
    wallTexture: 'smooth-matte',
    cameraAngle: 'eye-level',
    focalLength: 'standard',
    architecturalFeatures: [],
    dominantColors: ['white'],
    colorTemperature: 'warm',
    existingStyleFingerprint: 'contemporary',
    surfaceTextures: 'smooth',
    userNotes: '',
    aiConfidence: 0.80,
  },
  roomConstraints: {
    wallPermanence: 'own-anything-goes',
    physicalConstraints: [],
    bestLightTime: 'morning',
    roomSize: 'medium',
    whoUsesRoom: ['couple'],
    primaryFunction: ['living room'],
    hasPetsOrKids: false,
    storagePriority: 'medium',
    offScreenPieces: '',
    styleDirectionDelta: { coziness: 0, colorBoldness: 0, traditionality: 0 },
  },
  keepMask: null,
  budget: { rangeMin: 2000, rangeMax: 8000, strategy: 'spread', hardCeiling: false, splurgeCategory: '' },
  requestedProducts: [],
  artBrief: null,
  techSpec: null,
  sensoryProfile: null,
  identityBrief: null,
  tabStates: [],
  minimumThresholdMet: true,
  tabsComplete: ['budget'],
}

// ── Helper: make Supabase mock that returns an authenticated user ──────────────

function makeAuthSupabase(user = MOCK_USER) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          original_photo_url: 'https://example.com/photo.jpg',
          render_context: MOCK_RENDER_CONTEXT,
          user_id: MOCK_USER.id,
          inpainting_mask_url: null,
          render_url: null,
          keep_mask: [],
          pipeline_cost_log: null,
        },
        error: null,
      }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    }),
  }
}

function makeUnauthSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }
}

// ── Helper: Replicate mock class ───────────────────────────────────────────────

function makeReplicateMock(predictionStatus = 'starting', output: unknown = null) {
  const createFn = vi.fn().mockResolvedValue({ id: 'pred-xyz-001', status: 'starting' })
  const getFn = vi.fn().mockResolvedValue({ id: 'pred-xyz-001', status: predictionStatus, output, error: null })
  return {
    ReplicateClass: class {
      predictions = { create: createFn, get: getFn }
    },
    createFn,
    getFn,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/render/from-context
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/render/from-context', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns prediction_id on success', async () => {
    const { ReplicateClass, createFn } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              original_photo_url: 'https://example.com/photo.jpg',
              render_context: MOCK_RENDER_CONTEXT,
              user_id: MOCK_USER.id,
              inpainting_mask_url: null,
            },
            error: null,
          }),
          update: vi.fn().mockReturnThis(),
        }),
      }),
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
    }))

    const { POST } = await import('@/app/api/render/from-context/route')
    const req = new Request('http://localhost/api/render/from-context', {
      method: 'POST',
      body: JSON.stringify({ room_id: 'room-abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('prediction_id')
    expect(typeof body.prediction_id).toBe('string')
    expect(createFn).toHaveBeenCalled()
  })

  it('returns 400 when room_id is missing', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({ from: vi.fn() }),
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
    }))

    const { POST } = await import('@/app/api/render/from-context/route')
    const req = new Request('http://localhost/api/render/from-context', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing room_id/i)
  })

  it('returns 400 when render_context is missing from room', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              original_photo_url: 'https://example.com/photo.jpg',
              render_context: null,
              user_id: MOCK_USER.id,
              inpainting_mask_url: null,
            },
            error: null,
          }),
        }),
      }),
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
    }))

    const { POST } = await import('@/app/api/render/from-context/route')
    const req = new Request('http://localhost/api/render/from-context', {
      method: 'POST',
      body: JSON.stringify({ room_id: 'room-abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/render_context missing/i)
  })

  it('returns 401 when unauthenticated', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeUnauthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({ from: vi.fn() }),
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
    }))

    const { POST } = await import('@/app/api/render/from-context/route')
    const req = new Request('http://localhost/api/render/from-context', {
      method: 'POST',
      body: JSON.stringify({ room_id: 'room-abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/render/status
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/render/status', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  function makeAdminForStatus(costLog: unknown = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            pipeline_cost_log: costLog,
            inpainting_mask_url: null,
            original_photo_url: 'https://example.com/photo.jpg',
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
      }),
    }
  }

  it('returns status:processing when prediction is in-progress', async () => {
    const { ReplicateClass } = makeReplicateMock('processing')
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue(makeAdminForStatus()),
    }))
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, runUpscale: vi.fn().mockResolvedValue('https://example.com/upscaled.png') }
    })

    const { GET } = await import('@/app/api/render/status/route')
    const req = new Request(
      'http://localhost/api/render/status?prediction_id=pred-xyz-001&room_id=room-abc',
    )
    const res = await GET(req as Parameters<typeof GET>[0])
    const body = await res.json()
    expect(body.status).toBe('processing')
  })

  it('returns status:failed when prediction failed', async () => {
    const { ReplicateClass } = makeReplicateMock('failed')
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue(makeAdminForStatus()),
    }))
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, runUpscale: vi.fn().mockResolvedValue('https://example.com/upscaled.png') }
    })

    const { GET } = await import('@/app/api/render/status/route')
    const req = new Request(
      'http://localhost/api/render/status?prediction_id=pred-xyz-001&room_id=room-abc',
    )
    const res = await GET(req as Parameters<typeof GET>[0])
    const body = await res.json()
    expect(body.status).toBe('failed')
  })

  it('returns status:complete with render_url when prediction succeeded (single-stage)', async () => {
    const renderUrl = 'https://replicate.delivery/output.png'
    const { ReplicateClass } = makeReplicateMock('succeeded', renderUrl)
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue(makeAdminForStatus()),
    }))
    const upscaleUrl = 'https://replicate.delivery/upscaled.png'
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, runUpscale: vi.fn().mockResolvedValue(upscaleUrl) }
    })
    vi.doMock('@/lib/ai/upscaler', () => ({
      upscaleRender: vi.fn().mockResolvedValue(upscaleUrl),
    }))
    vi.doMock('@/lib/ai/grounding', () => ({
      detectFurniture: vi.fn().mockResolvedValue([]),
    }))

    const { GET } = await import('@/app/api/render/status/route')
    const req = new Request(
      'http://localhost/api/render/status?prediction_id=pred-xyz-001&room_id=room-abc',
    )
    const res = await GET(req as Parameters<typeof GET>[0])
    const body = await res.json()
    expect(body.status).toBe('complete')
    expect(body).toHaveProperty('render_url')
    expect(typeof body.render_url).toBe('string')
    expect(body.render_url.startsWith('http')).toBe(true)
  })

  it('triggers upscaler on completion', async () => {
    const renderUrl = 'https://replicate.delivery/output.png'
    const { ReplicateClass } = makeReplicateMock('succeeded', renderUrl)
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue(makeAdminForStatus()),
    }))
    const upscaleMock = vi.fn().mockResolvedValue('https://example.com/upscaled.png')
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, runUpscale: upscaleMock }
    })
    vi.doMock('@/lib/ai/grounding', () => ({
      detectFurniture: vi.fn().mockResolvedValue([]),
    }))

    const { GET } = await import('@/app/api/render/status/route')
    const req = new Request(
      'http://localhost/api/render/status?prediction_id=pred-xyz-001&room_id=room-abc',
    )
    await GET(req as Parameters<typeof GET>[0])

    // runUpscale is called from lib/ai/flux — verify it was invoked
    expect(upscaleMock).toHaveBeenCalledWith(renderUrl)
  })

  it('upscaler failure is non-fatal — still returns complete with original URL', async () => {
    const renderUrl = 'https://replicate.delivery/original.png'
    const { ReplicateClass } = makeReplicateMock('succeeded', renderUrl)
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue(makeAdminForStatus()),
    }))
    // runUpscale falls back gracefully (returns original URL on error — this is the actual behaviour)
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      // Simulate: upscaler throws, but runUpscale catches and returns original
      return { ...real, runUpscale: vi.fn().mockResolvedValue(renderUrl) }
    })
    vi.doMock('@/lib/ai/grounding', () => ({
      detectFurniture: vi.fn().mockResolvedValue([]),
    }))

    const { GET } = await import('@/app/api/render/status/route')
    const req = new Request(
      'http://localhost/api/render/status?prediction_id=pred-xyz-001&room_id=room-abc',
    )
    const res = await GET(req as Parameters<typeof GET>[0])
    const body = await res.json()

    // Even when upscaler "failed" (returned original URL), status is still complete
    expect(body.status).toBe('complete')
    expect(body.render_url).toBe(renderUrl)
  })

  it('returns 400 when prediction_id is missing', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue(makeAdminForStatus()),
    }))

    const { GET } = await import('@/app/api/render/status/route')
    const req = new Request('http://localhost/api/render/status?room_id=room-abc')
    const res = await GET(req as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })

  // Note: the status route does NOT implement a quality score / retry system.
  // It does a simple URL validity check (starts with 'http'). No retry-on-score test.
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/render/previews
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/render/previews', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns { previews: [...] } with exactly 3 items on success', async () => {
    let callCount = 0
    const mockCreate = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve({ id: `pred-preview-${callCount}`, status: 'starting' })
    })
    vi.doMock('replicate', () => ({
      default: class {
        predictions = { create: mockCreate, get: vi.fn() }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { render_context: MOCK_RENDER_CONTEXT },
            error: null,
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/render/previews/route')
    const req = new Request('http://localhost/api/render/previews', {
      method: 'POST',
      body: JSON.stringify({ room_id: 'room-abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('previews')
    expect(Array.isArray(body.previews)).toBe(true)
    expect(body.previews).toHaveLength(3)
  })

  it('each preview item has prediction_id, label, and prompt_variant fields', async () => {
    let n = 0
    vi.doMock('replicate', () => ({
      default: class {
        predictions = {
          create: vi.fn().mockImplementation(() => Promise.resolve({ id: `pred-${++n}`, status: 'starting' })),
          get: vi.fn(),
        }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { render_context: MOCK_RENDER_CONTEXT },
            error: null,
          }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/render/previews/route')
    const req = new Request('http://localhost/api/render/previews', {
      method: 'POST',
      body: JSON.stringify({ room_id: 'room-abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    const previews: unknown[] = body.previews

    for (const preview of previews) {
      const p = preview as Record<string, unknown>
      expect(p).toHaveProperty('prediction_id')
      expect(p).toHaveProperty('label')
      expect(p).toHaveProperty('prompt_variant')
      expect(typeof p.prediction_id).toBe('string')
      expect(typeof p.label).toBe('string')
    }
  })

  it('returns 400 when room_id is missing', async () => {
    vi.doMock('replicate', () => ({
      default: class {
        predictions = { create: vi.fn(), get: vi.fn() }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        },
        from: vi.fn(),
      }),
    }))

    const { POST } = await import('@/app/api/render/previews/route')
    const req = new Request('http://localhost/api/render/previews', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.doMock('replicate', () => ({
      default: class {
        predictions = { create: vi.fn(), get: vi.fn() }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeUnauthSupabase()),
    }))

    const { POST } = await import('@/app/api/render/previews/route')
    const req = new Request('http://localhost/api/render/previews', {
      method: 'POST',
      body: JSON.stringify({ room_id: 'room-abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/render/previews/status
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/render/previews/status', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  // The previews/status route uses req.nextUrl.searchParams (NextRequest API).
  // We must use NextRequest (not plain Request) so nextUrl is populated.
  function makeNextReq(url: string) {
    const { NextRequest } = require('next/server') as typeof import('next/server')
    return new NextRequest(url)
  }

  it('returns { status, url } when prediction succeeded', async () => {
    const previewUrl = 'https://replicate.delivery/preview.png'
    vi.doMock('replicate', () => ({
      default: class {
        predictions = {
          create: vi.fn(),
          get: vi.fn().mockResolvedValue({
            id: 'pred-prev-001',
            status: 'succeeded',
            output: [previewUrl],
          }),
        }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))

    const { GET } = await import('@/app/api/render/previews/status/route')
    const req = makeNextReq('http://localhost/api/render/previews/status?prediction_id=pred-prev-001')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('status', 'succeeded')
    expect(body).toHaveProperty('url', previewUrl)
  })

  it('returns status when prediction is still processing', async () => {
    vi.doMock('replicate', () => ({
      default: class {
        predictions = {
          create: vi.fn(),
          get: vi.fn().mockResolvedValue({
            id: 'pred-prev-002',
            status: 'processing',
            output: null,
          }),
        }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))

    const { GET } = await import('@/app/api/render/previews/status/route')
    const req = makeNextReq('http://localhost/api/render/previews/status?prediction_id=pred-prev-002')
    const res = await GET(req)
    const body = await res.json()

    expect(body.status).toBe('processing')
    expect(body.url).toBeNull()
  })

  it('returns 400 when prediction_id is missing', async () => {
    vi.doMock('replicate', () => ({
      default: class {
        predictions = { create: vi.fn(), get: vi.fn() }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))

    const { GET } = await import('@/app/api/render/previews/status/route')
    const req = makeNextReq('http://localhost/api/render/previews/status')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/render/tweak
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/render/tweak', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns { prediction_id } on success (color tweak)', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return {
        ...real,
        submitRender: vi.fn().mockResolvedValue('pred-tweak-001'),
        submitFillRender: vi.fn().mockResolvedValue('pred-tweak-fill-001'),
      }
    })

    const { POST } = await import('@/app/api/render/tweak/route')
    const req = new Request('http://localhost/api/render/tweak', {
      method: 'POST',
      body: JSON.stringify({
        room_id: 'room-abc',
        render_url: 'https://example.com/render.png',
        tweak_type: 'color',
        instruction: 'Make the walls sage green',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('prediction_id')
    expect(typeof body.prediction_id).toBe('string')
    // createFn not called — submitRender is called from flux.ts which is mocked
    expect(body).toHaveProperty('tweak_type', 'color')
  })

  it('returns 400 when required fields are missing', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, submitRender: vi.fn() }
    })

    const { POST } = await import('@/app/api/render/tweak/route')
    // Missing instruction
    const req = new Request('http://localhost/api/render/tweak', {
      method: 'POST',
      body: JSON.stringify({
        room_id: 'room-abc',
        render_url: 'https://example.com/render.png',
        tweak_type: 'color',
        // instruction: missing
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const { ReplicateClass } = makeReplicateMock()
    vi.doMock('replicate', () => ({ default: ReplicateClass }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeUnauthSupabase()),
    }))

    const { POST } = await import('@/app/api/render/tweak/route')
    const req = new Request('http://localhost/api/render/tweak', {
      method: 'POST',
      body: JSON.stringify({
        room_id: 'room-abc',
        render_url: 'https://example.com/render.png',
        tweak_type: 'color',
        instruction: 'Make it warmer',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/render/tweak/status
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/render/tweak/status', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns status:complete with render_url on success', async () => {
    const tweakUrl = 'https://replicate.delivery/tweak.png'
    vi.doMock('replicate', () => ({
      default: class {
        predictions = {
          create: vi.fn(),
          get: vi.fn().mockResolvedValue({ id: 'pred-tweak-001', status: 'succeeded', output: tweakUrl }),
        }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }))
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, runUpscale: vi.fn().mockResolvedValue(tweakUrl) }
    })

    const { GET } = await import('@/app/api/render/tweak/status/route')
    const req = new Request(
      'http://localhost/api/render/tweak/status?prediction_id=pred-tweak-001&room_id=room-abc',
    )
    const res = await GET(req as Parameters<typeof GET>[0])
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('complete')
    expect(body).toHaveProperty('render_url')
    expect(body.render_url.startsWith('http')).toBe(true)
  })

  it('returns status:processing when prediction still running', async () => {
    vi.doMock('replicate', () => ({
      default: class {
        predictions = {
          create: vi.fn(),
          get: vi.fn().mockResolvedValue({ id: 'pred-tweak-002', status: 'processing', output: null }),
        }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({ from: vi.fn() }),
    }))
    vi.doMock('@/lib/ai/flux', async (importOriginal) => {
      const real = await importOriginal<typeof import('@/lib/ai/flux')>()
      return { ...real, runUpscale: vi.fn() }
    })

    const { GET } = await import('@/app/api/render/tweak/status/route')
    const req = new Request(
      'http://localhost/api/render/tweak/status?prediction_id=pred-tweak-002&room_id=room-abc',
    )
    const res = await GET(req as Parameters<typeof GET>[0])
    const body = await res.json()
    expect(body.status).toBe('processing')
  })

  it('returns 400 when prediction_id or room_id is missing', async () => {
    vi.doMock('replicate', () => ({
      default: class {
        predictions = { create: vi.fn(), get: vi.fn() }
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue(makeAuthSupabase()),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminSupabaseClient: vi.fn().mockReturnValue({ from: vi.fn() }),
    }))

    const { GET } = await import('@/app/api/render/tweak/status/route')
    const req = new Request('http://localhost/api/render/tweak/status?prediction_id=abc')
    const res = await GET(req as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })
})
