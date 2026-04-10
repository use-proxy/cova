// @vitest-environment node
/**
 * Pipeline API route shape tests.
 * Verifies input validation, auth checks, and response shapes
 * for all 4 pipeline routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

function postReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase/server', () => ({
    createServerSupabaseClient: vi.fn().mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: userId ? { id: userId } : null },
          error: userId ? null : { message: 'not authenticated' },
        }),
      },
    }),
  }))
}

// ── Pipeline 1: Pre-Detection ────────────────────────────────────────────────

describe('/api/pipeline/pre-detect POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const { POST } = await import('@/app/api/pipeline/pre-detect/route')
    const req = postReq('http://localhost/api/pipeline/pre-detect', {
      room_id: 'room-1',
      photo_url: 'https://example.com/photo.jpg',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when room_id is missing', async () => {
    mockAuth('user-1')
    const { POST } = await import('@/app/api/pipeline/pre-detect/route')
    const req = postReq('http://localhost/api/pipeline/pre-detect', {
      photo_url: 'https://example.com/photo.jpg',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('room_id')
  })

  it('returns 400 when photo_url is missing', async () => {
    mockAuth('user-1')
    const { POST } = await import('@/app/api/pipeline/pre-detect/route')
    const req = postReq('http://localhost/api/pipeline/pre-detect', {
      room_id: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('photo_url')
  })

  it('returns 503 when PRE_DETECTION_WEBHOOK_URL is not configured', async () => {
    mockAuth('user-1')
    delete process.env.PRE_DETECTION_WEBHOOK_URL
    const { POST } = await import('@/app/api/pipeline/pre-detect/route')
    const req = postReq('http://localhost/api/pipeline/pre-detect', {
      room_id: 'room-1',
      photo_url: 'https://example.com/photo.jpg',
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
  })
})

// ── Pipeline 2: Redesign ─────────────────────────────────────────────────────

describe('/api/pipeline/redesign POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const { POST } = await import('@/app/api/pipeline/redesign/route')
    const req = postReq('http://localhost/api/pipeline/redesign', {
      room_id: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when room_id is missing', async () => {
    mockAuth('user-1')
    const { POST } = await import('@/app/api/pipeline/redesign/route')
    const req = postReq('http://localhost/api/pipeline/redesign', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('room_id')
  })

  it('returns 503 when REDESIGN_PIPELINE_WEBHOOK_URL is not configured', async () => {
    mockAuth('user-1')
    delete process.env.REDESIGN_PIPELINE_WEBHOOK_URL
    const { POST } = await import('@/app/api/pipeline/redesign/route')
    const req = postReq('http://localhost/api/pipeline/redesign', {
      room_id: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
  })
})

// ── Pipeline 3: Furniture Match ──────────────────────────────────────────────

describe('/api/pipeline/furniture-match POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const { POST } = await import('@/app/api/pipeline/furniture-match/route')
    const req = postReq('http://localhost/api/pipeline/furniture-match', {
      room_id: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when room_id is missing', async () => {
    mockAuth('user-1')
    const { POST } = await import('@/app/api/pipeline/furniture-match/route')
    const req = postReq('http://localhost/api/pipeline/furniture-match', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('room_id')
  })

  it('returns 503 when FURNITURE_MATCHING_WEBHOOK_URL is not configured', async () => {
    mockAuth('user-1')
    delete process.env.FURNITURE_MATCHING_WEBHOOK_URL
    const { POST } = await import('@/app/api/pipeline/furniture-match/route')
    const req = postReq('http://localhost/api/pipeline/furniture-match', {
      room_id: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
  })
})

// ── Pipeline 5: Depth Video ─────────────────────────────────────────────────

describe('/api/pipeline/depth-video POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const { POST } = await import('@/app/api/pipeline/depth-video/route')
    const req = postReq('http://localhost/api/pipeline/depth-video', {
      room_id: 'room-1',
      pano_url: 'https://example.com/pano.png',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when room_id is missing', async () => {
    mockAuth('user-1')
    const { POST } = await import('@/app/api/pipeline/depth-video/route')
    const req = postReq('http://localhost/api/pipeline/depth-video', {
      pano_url: 'https://example.com/pano.png',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('room_id')
  })

  it('returns 400 when pano_url is missing', async () => {
    mockAuth('user-1')
    const { POST } = await import('@/app/api/pipeline/depth-video/route')
    const req = postReq('http://localhost/api/pipeline/depth-video', {
      room_id: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('pano_url')
  })

  it('returns null video URL when DEPTH_VIDEO_WEBHOOK_URL is not configured', async () => {
    mockAuth('user-1')
    delete process.env.DEPTH_VIDEO_WEBHOOK_URL
    const { POST } = await import('@/app/api/pipeline/depth-video/route')
    const req = postReq('http://localhost/api/pipeline/depth-video', {
      room_id: 'room-1',
      pano_url: 'https://example.com/pano.png',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json() as { flythrough_video_url: string | null }
    expect(json.flythrough_video_url).toBeNull()
  })
})
