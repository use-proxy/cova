// @vitest-environment node
/**
 * Area 2 — room-analysis.test.ts
 * Tests for the area2 Zustand store, system prompts, and API routes.
 * Uses vi.doMock (NOT vi.mock) with vi.resetModules() in beforeEach
 * so each test gets a fresh module graph with its own mock configuration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RoomContext, RoomConstraints, KeepMask } from '@/lib/types/area2'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoomContext(): RoomContext {
  return {
    roomShape: 'rectangular',
    estimatedDimensions: '15ft x 20ft',
    ceilingHeight: 'standard-8ft',
    ceilingDetail: '',
    naturalLightDirection: 'left',
    naturalLightQuality: 'soft-diffused',
    windowCount: 2,
    windowSize: 'medium',
    floorMaterial: 'hardwood',
    floorColor: 'light oak',
    wallColor: 'warm white',
    hasAccentWall: false,
    wallTexture: 'smooth-matte',
    cameraAngle: 'eye-level',
    focalLength: 'standard',
    architecturalFeatures: [],
    dominantColors: ['white', 'beige'],
    colorTemperature: 'warm',
    existingStyleFingerprint: 'neutral contemporary',
    surfaceTextures: 'smooth',
    userNotes: '',
    aiConfidence: 0.85,
  }
}

function makeRoomConstraints(): RoomConstraints {
  return {
    wallPermanence: 'own-anything-goes',
    physicalConstraints: [],
    bestLightTime: 'morning',
    roomSize: 'medium',
    whoUsesRoom: ['couple'],
    primaryFunction: ['living room'],
    hasPetsOrKids: false,
    storagePriority: 'medium',
    offScreenPieces: '',
    styleDirectionDelta: {
      coziness: 0,
      colorBoldness: 0,
      traditionality: 0,
    },
  }
}

function makeKeepMask(): KeepMask {
  return {
    objects: [
      {
        id: 'obj-1',
        type: 'sofa',
        bbox: [100, 100, 400, 300],
        confidence: 0.9,
        confidenceTier: 'show-user',
        keep: true,
        immovable: false,
      },
    ],
    depthMapUrl: 'https://example.com/depth.png',
    rawDetectionCount: 1,
    detectionModelVersion: 'ram-plus-plus-v1',
  }
}

function postReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

// ── Area2Store defaults ───────────────────────────────────────────────────────

describe('area2Store — initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    // Stub sessionStorage (zustand persist middleware needs it)
    vi.doMock('@/lib/ai/flux', () => ({
      buildFluxPromptFromContext: vi.fn().mockReturnValue('mock flux prompt'),
    }))
    vi.doMock('@/lib/store/fingerprint', () => ({
      useFingerprintStore: { getState: vi.fn().mockReturnValue({ fingerprint: null }) },
    }))
  })

  it('initializes with correct defaults', async () => {
    const { useArea2Store } = await import('@/lib/stores/area2Store')
    const state = useArea2Store.getState()
    expect(state.roomId).toBeNull()
    expect(state.imageUrl).toBeNull()
    expect(state.currentStep).toBe(0)
    expect(state.styleVariantChosen).toBeNull()
    expect(state.roomContext).toBeNull()
    expect(state.roomContextLoading).toBe(false)
    expect(state.roomConstraints).toBeNull()
    expect(state.keepMask).toBeNull()
    expect(state.detectionStatus).toBe('pending')
    expect(state.selectedObjectId).toBeNull()
    expect(state.activeTab).toBe('all')
    expect(state.tabStates).toEqual([])
    expect(state.budget).toBeNull()
    expect(state.requestedProducts).toEqual([])
    expect(state.artBrief).toBeNull()
    expect(state.techSpec).toBeNull()
    expect(state.sensoryProfile).toBeNull()
    expect(state.identityBrief).toBeNull()
    expect(state.renderContext).toBeNull()
    expect(state.minimumThresholdMet).toBe(false)
  })

  it('setRoom stores roomId and imageUrl', async () => {
    const { useArea2Store } = await import('@/lib/stores/area2Store')
    useArea2Store.getState().reset()
    useArea2Store.getState().setRoom('room-abc', 'https://example.com/img.jpg')
    const state = useArea2Store.getState()
    expect(state.roomId).toBe('room-abc')
    expect(state.imageUrl).toBe('https://example.com/img.jpg')
  })

  it('setRoomContext stores RoomContext correctly', async () => {
    const { useArea2Store } = await import('@/lib/stores/area2Store')
    useArea2Store.getState().reset()
    const ctx = makeRoomContext()
    useArea2Store.getState().setRoomContext(ctx)
    const stored = useArea2Store.getState().roomContext
    expect(stored).not.toBeNull()
    expect(stored?.roomShape).toBe('rectangular')
    expect(stored?.ceilingHeight).toBe('standard-8ft')
    expect(stored?.naturalLightQuality).toBe('soft-diffused')
    expect(stored?.aiConfidence).toBe(0.85)
  })

  it('setRoomConstraints stores RoomConstraints correctly', async () => {
    const { useArea2Store } = await import('@/lib/stores/area2Store')
    useArea2Store.getState().reset()
    const constraints = makeRoomConstraints()
    useArea2Store.getState().setRoomConstraints(constraints)
    const stored = useArea2Store.getState().roomConstraints
    expect(stored).not.toBeNull()
    expect(stored?.wallPermanence).toBe('own-anything-goes')
    expect(stored?.hasPetsOrKids).toBe(false)
    expect(stored?.storagePriority).toBe('medium')
  })

  it('setKeepMask stores KeepMask correctly', async () => {
    const { useArea2Store } = await import('@/lib/stores/area2Store')
    useArea2Store.getState().reset()
    const mask = makeKeepMask()
    useArea2Store.getState().setKeepMask(mask)
    const stored = useArea2Store.getState().keepMask
    expect(stored).not.toBeNull()
    expect(stored?.objects).toHaveLength(1)
    expect(stored?.objects[0]?.type).toBe('sofa')
    expect(stored?.objects[0]?.keep).toBe(true)
    expect(stored?.rawDetectionCount).toBe(1)
  })
})

// ── /api/rooms/create ─────────────────────────────────────────────────────────

describe('/api/rooms/create POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns { id, room_id } on valid auth', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn().mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-123' } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'room-new-1' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      }),
    }))

    const { POST } = await import('@/app/api/rooms/create/route')
    const req = postReq('http://localhost/api/rooms/create', { room_type: 'living_room' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json() as { id: string; room_id: string }
    expect(json.id).toBe('room-new-1')
    expect(json.room_id).toBe('room-new-1')
  })

  it('returns 401 when auth returns null user', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn().mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      }),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      }),
    }))

    const { POST } = await import('@/app/api/rooms/create/route')
    const req = postReq('http://localhost/api/rooms/create', {})
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json() as { error: string }
    expect(json.error).toBe('Unauthorized')
  })
})

// ── /api/rooms/status ─────────────────────────────────────────────────────────

describe('/api/rooms/status GET', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns status response shape with expected keys', async () => {
    const mockRoom = {
      id: 'room-1',
      status: 'complete',
      redesign_status: 'complete',
      marble_spz_url: 'https://example.com/room.spz',
      marble_spz_url_500k: null,
      marble_spz_url_100k: null,
      marble_mini_spz_url: null,
      marble_plus_thumbnail_url: null,
      furniture_matches_count: 3,
      redesign_pano_url: null,
      flythrough_ready: false,
      flythrough_video_url: null,
      flythrough_duration_seconds: null,
      plus_upgrade_ready: false,
      plus_started_at: null,
      plus_completed_at: null,
      hotspot_timing: null,
      pipeline_mode: 'full',
      pipeline_cost_log: null,
      pre_detection_result: null,
      fixed_furniture: null,
      capture_mode: 'upload',
    }

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn().mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rooms') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: mockRoom, error: null }),
                  }),
                }),
              }),
            }
          }
          // room_products table
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }),
      }),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      }),
    }))

    const { GET } = await import('@/app/api/rooms/status/route')
    const req = new Request('http://localhost/api/rooms/status?roomId=room-1') as Parameters<typeof GET>[0]
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.roomId).toBe('room-1')
    expect(json.redesign_status).toBe('complete')
    expect(json.isComplete).toBe(true)
    expect(typeof json.progress_percent).toBe('number')
    expect(typeof json.progress_message).toBe('string')
    expect(Array.isArray(json.room_products)).toBe(true)
  })
})

// ── /api/detect ───────────────────────────────────────────────────────────────

describe('/api/detect POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns detections on successful pipeline run', async () => {
    const mockRoomContext = makeRoomContext()
    const mockKeepMask = makeKeepMask()
    const mockObjects = mockKeepMask.objects

    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        },
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }),
    }))
    vi.doMock('@/lib/ai/detection', () => ({
      runDetectionPipeline: vi.fn().mockResolvedValue({
        objects: mockObjects,
        keepMask: mockKeepMask,
        roomContext: mockRoomContext,
        errors: [],
        confidenceDistribution: [0.9],
      }),
    }))

    const { POST } = await import('@/app/api/detect/route')
    const req = postReq('http://localhost/api/detect', {
      imageUrl: 'https://example.com/room.jpg',
      roomId: 'room-1',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.success).toBe(true)
    expect(json.objectCount).toBe(1)
    expect(json.roomContext).not.toBeNull()
    expect(json.keepMask).not.toBeNull()
    expect(Array.isArray((json.errors as unknown[]))).toBe(true)
  })
})

// ── /api/parse-constraints ────────────────────────────────────────────────────

describe('/api/parse-constraints POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns structured constraints and inclusions for valid input', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
          }),
        },
      }),
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
    }))
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            constraints: ['no dark colors'],
            inclusions: ['add plants'],
          }),
        },
      ],
    })
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: mockCreate }
      },
    }))

    const { POST } = await import('@/app/api/parse-constraints/route')
    const req = postReq('http://localhost/api/parse-constraints', {
      text: 'no dark colors, add plants',
      room_type: 'living_room',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json() as { constraints: string[]; inclusions: string[] }
    expect(Array.isArray(json.constraints)).toBe(true)
    expect(Array.isArray(json.inclusions)).toBe(true)
    expect(json.constraints).toContain('no dark colors')
    expect(json.inclusions).toContain('add plants')
  })
})

// ── /api/design-chat ──────────────────────────────────────────────────────────

describe('/api/design-chat POST', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  const VALID_TABS = ['budget', 'products', 'art', 'tech', 'sensory', 'identity'] as const

  for (const tab of VALID_TABS) {
    it(`returns structured reply for tab "${tab}"`, async () => {
      vi.doMock('@/lib/supabase/server', () => ({
        createServerSupabaseClient: vi.fn().mockResolvedValue({
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: { user: { id: 'user-1' } },
            }),
          },
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
          }),
        }),
      }))
      const mockCreate2 = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tell me your budget range.' }],
      })
      vi.doMock('@anthropic-ai/sdk', () => ({
        default: class {
          messages = { create: mockCreate2 }
        },
      }))
      vi.doMock('@/lib/ai/chat/extractStructuredData', () => ({
        extractStructuredData: vi.fn().mockResolvedValue({
          extractedData: {},
          tabComplete: false,
          shouldGenerateArt: false,
          artPrompt: null,
        }),
      }))
      vi.doMock('@/lib/ai/scraping/productScraper', () => ({
        scrapeProductUrl: vi.fn().mockResolvedValue(null),
      }))

      const { POST } = await import('@/app/api/design-chat/route')
      const req = postReq('http://localhost/api/design-chat', {
        message: 'hello',
        activeTab: tab,
        roomId: 'room-1',
        tabHistory: [],
        currentExtracted: {},
      })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const json = await res.json() as Record<string, unknown>
      expect(typeof json.reply).toBe('string')
      expect(typeof json.tabComplete).toBe('boolean')
    })
  }

  it('returns 400 when activeTab and roomId are missing', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1' } },
          }),
        },
      }),
    }))
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: vi.fn() }
      },
    }))
    vi.doMock('@/lib/ai/chat/extractStructuredData', () => ({
      extractStructuredData: vi.fn(),
    }))
    vi.doMock('@/lib/ai/scraping/productScraper', () => ({
      scrapeProductUrl: vi.fn(),
    }))

    const { POST } = await import('@/app/api/design-chat/route')
    const req = postReq('http://localhost/api/design-chat', {
      message: 'hello',
      // activeTab and roomId intentionally omitted
      tabHistory: [],
      currentExtracted: {},
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('activeTab')
  })
})

// ── systemPrompts ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('returns non-empty strings for all 6 tab IDs', async () => {
    const { buildSystemPrompt } = await import('@/lib/ai/chat/systemPrompts')
    const tabIds = ['budget', 'products', 'art', 'tech', 'sensory', 'identity'] as const
    for (const tab of tabIds) {
      const prompt = buildSystemPrompt(tab, null, null)
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    }
  })

  it('each tab prompt contains tab-specific opening message content', async () => {
    const { buildSystemPrompt } = await import('@/lib/ai/chat/systemPrompts')
    // Verify each tab has at least some unique content
    const budgetPrompt = buildSystemPrompt('budget', null, null)
    const productsPrompt = buildSystemPrompt('products', null, null)
    // They should differ from each other
    expect(budgetPrompt).not.toBe(productsPrompt)
    // Budget prompt should reference budget-related content
    expect(budgetPrompt.toLowerCase()).toContain('budget')
    // Products prompt should reference products content
    expect(productsPrompt.toLowerCase()).toContain('product')
  })

  it('summarizeFingerprint returns non-empty for valid fingerprint', async () => {
    const { buildSystemPrompt } = await import('@/lib/ai/chat/systemPrompts')
    const fingerprint = {
      dimensions: {
        colorTemperature: 0.9,
        colorSaturation: 0.9,
        density: 0.9,
        formality: 0.1,
        era: 0.1,
        material: 0.1,
        texture: 0.5,
        pattern: 0.5,
        lineQuality: 0.5,
        lightPreference: 0.9,
        nature: 0.9,
        culturalInfluence: 0.1,
      },
      covariance: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0)),
      confidence: 0.85,
    }
    // buildSystemPrompt with a strong fingerprint should include fingerprint section
    const prompt = buildSystemPrompt('budget', null, null, fingerprint)
    expect(prompt).toContain('STYLE FINGERPRINT')
  })

  it('summarizeFingerprint returns empty string for null fingerprint', async () => {
    const { buildSystemPrompt } = await import('@/lib/ai/chat/systemPrompts')
    // With null fingerprint the section should be omitted — prompt still has the base
    const withNull = buildSystemPrompt('budget', null, null, null)
    expect(withNull).not.toContain('STYLE FINGERPRINT')
    expect(withNull.length).toBeGreaterThan(0)
  })

  it('prompt does not contain forbidden style names', async () => {
    const { buildSystemPrompt } = await import('@/lib/ai/chat/systemPrompts')
    const tabIds = ['budget', 'products', 'art', 'tech', 'sensory', 'identity'] as const
    const forbiddenNames = ['Japandi', 'Bohemian', 'Coastal', 'Mid-Century Modern', 'Minimalist']
    for (const tab of tabIds) {
      const prompt = buildSystemPrompt(tab, null, null)
      // The system prompt itself is internal (designer-facing), but it must not
      // contain the style names in a way that would leak to the user. The prompt
      // instructs the AI to never say these names — check it contains that instruction.
      expect(prompt).toContain('NEVER mention specific interior-design style names')
      // Verify the names don't appear outside the instruction context
      const instructionLineIdx = prompt.indexOf('NEVER mention specific interior-design style names')
      const beforeInstruction = prompt.substring(0, instructionLineIdx)
      for (const name of forbiddenNames) {
        expect(beforeInstruction).not.toContain(name)
      }
    }
  })
})
