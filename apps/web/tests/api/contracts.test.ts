import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase before importing routes
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'test-user-id',
              email: 'test@example.com',
            },
          },
          error: null,
        }),
      },
    })
  ),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-session-id' },
            error: null,
          }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          contains: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          })),
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
          })),
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/ai/flux', () => ({
  buildFluxPrompt: vi.fn().mockReturnValue({
    positive: 'test positive prompt',
    negative: 'test negative prompt',
  }),
  runFluxRender: vi.fn().mockResolvedValue('https://example.com/render.jpg'),
}))

vi.mock('@/lib/ai/clip', () => ({
  embedImage: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn().mockReturnValue(0.75),
  fingerprintToStyleTags: vi.fn().mockReturnValue(['modern', 'minimal']),
  computeFingerprintAlignment: vi.fn().mockReturnValue(0.6),
  computeBudgetFit: vi.fn().mockReturnValue(0.8),
}))

vi.mock('@/lib/ai/grounding', () => ({
  detectFurniture: vi.fn().mockResolvedValue([
    {
      type: 'furniture',
      label: 'sofa',
      bbox: [100, 200, 300, 400],
      confidence: 0.92,
      showToUser: true,
    },
  ]),
  detectArchitecture: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/ai/depth', () => ({
  estimateDepth: vi.fn().mockResolvedValue({
    depth_map_url: 'https://example.com/depth.jpg',
    quality_score: 0.85,
  }),
}))

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          description: 'A modern sofa',
          style_tags: ['modern', 'minimal'],
          material: 'fabric',
          color: 'grey',
          dimensions_estimate: '80x30 inches',
        }),
      },
    ],
  })
  // Use a regular function (not arrow) so it can be used as a constructor with `new`
  function AnthropicMock() {
    return { messages: { create: mockCreate } }
  }
  return { default: AnthropicMock }
})

describe('API Route Contract Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/quiz/fingerprint', () => {
    it('returns fingerprint array and style name', async () => {
      const { POST } = await import('@/app/api/quiz/fingerprint/route')

      const request = new Request('http://localhost/api/quiz/fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: Array.from({ length: 15 }, (_, i) => ({
            pair_id: String(i),
            chosen: 'A',
            super_liked: false,
          })),
          entry_path: 'pairs',
          room_type: 'living_room',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('fingerprint')
      expect(data).toHaveProperty('style_name')
      expect(Array.isArray(data.fingerprint)).toBe(true)
      expect(data.fingerprint).toHaveLength(6)
      data.fingerprint.forEach((d: number) => {
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(1)
      })
    })

    it('returns 400 for empty responses', async () => {
      const { POST } = await import('@/app/api/quiz/fingerprint/route')

      const request = new Request('http://localhost/api/quiz/fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: [],
          entry_path: 'pairs',
          room_type: 'living_room',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/render', () => {
    it('returns render_url and render_session_id', async () => {
      const { POST } = await import('@/app/api/render/route')

      const request = new Request('http://localhost/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: 'https://example.com/photo.jpg',
          depth_map_url: 'https://example.com/depth.jpg',
          keep_mask: null,
          fingerprint_vector: [0.7, 0.3, 0.8, 0.6, 0.4, 0.7],
          room_type: 'living_room',
          budget: 'mid',
          inclusions: [],
          constraints: [],
          room_id: 'test-room-id',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('render_url')
      expect(data).toHaveProperty('render_session_id')
      expect(typeof data.render_url).toBe('string')
    })

    it('returns 400 for missing required fields', async () => {
      const { POST } = await import('@/app/api/render/route')

      const request = new Request('http://localhost/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: 'https://example.com/photo.jpg',
          // missing fingerprint_vector, room_type, budget, room_id
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/match', () => {
    it('returns products array', async () => {
      const { POST } = await import('@/app/api/match/route')

      const request = new Request('http://localhost/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          render_crop_url: 'https://example.com/crop.jpg',
          fingerprint_vector: [0.7, 0.3, 0.8, 0.6, 0.4, 0.7],
          budget_range: [500, 2000],
          room_type: 'living_room',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('products')
      expect(Array.isArray(data.products)).toBe(true)
    })

    it('returns 400 for missing required fields', async () => {
      const { POST } = await import('@/app/api/match/route')

      const request = new Request('http://localhost/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/detect', () => {
    it('returns detections, depth_map_url, depth_quality', async () => {
      const { POST } = await import('@/app/api/detect/route')

      const request = new Request('http://localhost/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: 'https://example.com/photo.jpg',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('detections')
      expect(data).toHaveProperty('depth_map_url')
      expect(data).toHaveProperty('depth_quality')
      expect(Array.isArray(data.detections)).toBe(true)
    })

    it('returns 400 for missing photo_url', async () => {
      const { POST } = await import('@/app/api/detect/route')

      const request = new Request('http://localhost/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })
})
