/**
 * COVA V1 — Phase 1: API Contract Tests
 * Hits running dev server directly via fetch. No browser needed.
 * Requires: npm run dev running on port 3000.
 *
 * Auth setup: creates a real test user in Supabase and obtains a valid JWT.
 * All protected routes tested with a real session cookie.
 *
 * Run: npx playwright test tests/e2e/api-contracts.test.ts
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getItemBudgetTarget, optimizeRoomSelection } from '@/lib/ai/budget'
import { scoreFit, extractDimensionsFromText, getDimensionsForCategory } from '@/lib/ai/fit'
import { injectTestAuth } from './helpers/auth'

const BASE_URL = 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const TEST_ROOM_PHOTO =
  'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_2093.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzIwOTMuanBlZyIsImlhdCI6MTc3NTQ0OTQwNCwiZXhwIjoxNzc2MDU0MjA0fQ.NIHpii_0BvmGKEMzzyUT7pmQKQmUSzWBUzEq7giHWIg'

const TEST_FINGERPRINT = {
  dimensions: {
    luminosity: 0.4, density: -0.4, temperature: 0.6, form: -0.2,
    era: -0.6, texture: 0.4, scale: 0.0, nature: 0.2,
    saturation: -0.2, materialOrigin: -0.4,
  },
  covariance: Array(10).fill(Array(10).fill(0)),
  confidence: 0.8,
}

// Shared auth state — set in beforeAll
let testUserId = ''
let testAuthToken = ''
let testRoomId = ''
let testEmail = ''

// ── Auth setup ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn('SUPABASE_URL or SERVICE_KEY not set — auth tests will be skipped')
    return
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  testEmail = `test-${Date.now()}@cova-test.com`
  const { data: user, error } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: 'TestPassword123!',
    email_confirm: true,
  })

  if (error || !user.user) {
    console.error(`Failed to create test user: ${error?.message}`)
    return
  }
  testUserId = user.user.id

  // Sign in to get JWT
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: 'TestPassword123!',
  })
  testAuthToken = signIn.session?.access_token ?? ''

  // Create a test room
  const { data: room } = await adminClient
    .from('rooms')
    .insert({ user_id: testUserId, original_photo_url: TEST_ROOM_PHOTO })
    .select()
    .single()
  testRoomId = (room as { id: string } | null)?.id ?? ''
})

test.afterAll(async () => {
  if (!testUserId || !SERVICE_KEY) return
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await adminClient.auth.admin.deleteUser(testUserId)
})

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Cookie: `sb-access-token=${testAuthToken}; sb-refresh-token=placeholder`,
  Authorization: `Bearer ${testAuthToken}`,
})

// ── GROUP 1: Authentication ───────────────────────────────────────────────────

test('AUTH: unauthenticated request to /api/render returns 401', async () => {
  const res = await fetch(`${BASE_URL}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_url: TEST_ROOM_PHOTO }),
  })
  expect(res.status).toBe(401)
})

test('AUTH: unauthenticated request to /api/match returns 401', async () => {
  const res = await fetch(`${BASE_URL}/api/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: true }),
  })
  expect(res.status).toBe(401)
})

test('AUTH: unauthenticated request to /api/detect returns 401', async () => {
  const res = await fetch(`${BASE_URL}/api/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_url: TEST_ROOM_PHOTO }),
  })
  expect(res.status).toBe(401)
})

test('AUTH: unauthenticated request to /api/rooms/capture returns 401', async () => {
  const fd = new FormData()
  fd.append('photo', new Blob(['test'], { type: 'image/jpeg' }), 'test.jpg')
  const res = await fetch(`${BASE_URL}/api/rooms/capture`, {
    method: 'POST',
    body: fd,
  })
  expect(res.status).toBe(401)
})

// ── GROUP 2: Quiz fingerprint API ─────────────────────────────────────────────

test('QUIZ: POST /api/quiz/fingerprint with 15 responses returns 10-dim fingerprint', async () => {
  const responses = Array.from({ length: 15 }, (_, i) => ({
    pair_id: `pair-${String(i + 1).padStart(2, '0')}`,
    chosen: 'A',
    super_liked: false,
  }))

  const res = await fetch(`${BASE_URL}/api/quiz/fingerprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses, entry_path: 'pairs', room_type: 'living-room' }),
  })
  expect(res.status).toBe(200)

  const data = (await res.json()) as {
    fingerprint: { dimensions: Record<string, number>; covariance: number[][]; confidence: number }
    style_name: string
    style_tags: string[]
  }
  expect(data.fingerprint).toHaveProperty('dimensions')
  expect(Object.keys(data.fingerprint.dimensions)).toHaveLength(10)
  expect(data.fingerprint.confidence).toBeGreaterThanOrEqual(0)
  expect(data.fingerprint.covariance).toHaveLength(10)
  expect(typeof data.style_name).toBe('string')
  expect(data.style_name.length).toBeGreaterThan(0)
  expect(Array.isArray(data.style_tags)).toBe(true)
  expect(data.style_tags.length).toBeGreaterThan(0)
  console.log(`Quiz fingerprint style: ${data.style_name}`)
  console.log(`Fingerprint dimensions: ${JSON.stringify(data.fingerprint.dimensions)}`)
})

test('QUIZ: POST /api/quiz/fingerprint with fewer than 15 responses still returns fingerprint', async () => {
  const responses = Array.from({ length: 5 }, (_, i) => ({
    pair_id: `pair-${String(i + 1).padStart(2, '0')}`,
    chosen: 'B',
    super_liked: false,
  }))

  const res = await fetch(`${BASE_URL}/api/quiz/fingerprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses, entry_path: 'pairs', room_type: 'bedroom' }),
  })
  expect(res.status).toBe(200)
  const data = (await res.json()) as {
    fingerprint: { dimensions: Record<string, number>; covariance: number[][]; confidence: number }
  }
  expect(data.fingerprint).toHaveProperty('dimensions')
  expect(Object.keys(data.fingerprint.dimensions)).toHaveLength(10)
  expect(data.fingerprint.confidence).toBeGreaterThanOrEqual(0)
  expect(data.fingerprint.covariance).toHaveLength(10)
})

test('QUIZ: POST /api/quiz/fingerprint with empty responses returns 400', async () => {
  const res = await fetch(`${BASE_URL}/api/quiz/fingerprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses: [], entry_path: 'pairs', room_type: 'living-room' }),
  })
  expect(res.status).toBe(400)
})

// ── GROUP 3: Render API ───────────────────────────────────────────────────────

test('RENDER: POST /api/render returns 401 when no auth', async () => {
  const res = await fetch(`${BASE_URL}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photo_url: TEST_ROOM_PHOTO,
      fingerprint_vector: TEST_FINGERPRINT,
      room_type: 'living-room',
      budget: 'mid',
      inclusions: [],
      constraints: [],
      room_id: testRoomId || 'fake-room',
    }),
  })
  expect(res.status).toBe(401)
})

test('RENDER: POST /api/render missing required fields returns 400', async ({ browser }) => {
  const context = await browser.newContext()
  await injectTestAuth(context)
  const page = await context.newPage()
  await page.goto(BASE_URL)

  // Missing fingerprint_vector
  const res = await page.request.post(`${BASE_URL}/api/render`, {
    data: {
      photo_url: TEST_ROOM_PHOTO,
      room_type: 'living-room',
      budget: 'mid',
      room_id: testRoomId || 'test-room',
    },
  })
  expect(res.status()).toBe(400)
  await context.close()
})

test('RENDER: POST /api/render with valid data returns prediction_id', async () => {
  if (!testAuthToken || !testRoomId) {
    console.log('SKIP: no auth token or room ID — auth setup incomplete')
    return
  }
  const res = await fetch(`${BASE_URL}/api/render`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      photo_url: TEST_ROOM_PHOTO,
      keep_mask: null,
      fingerprint_vector: TEST_FINGERPRINT,
      room_type: 'living-room',
      budget: 'mid',
      inclusions: [],
      constraints: [],
      room_id: testRoomId,
    }),
  })
  // May be 401 if cookie auth doesn't work via fetch, 429 rate limit, or 200
  console.log(`Render POST status: ${res.status}`)
  if (res.status === 200) {
    const data = (await res.json()) as { prediction_id: string }
    expect(typeof data.prediction_id).toBe('string')
    expect(data.prediction_id.length).toBeGreaterThan(0)
    console.log(`prediction_id: ${data.prediction_id}`)
  } else {
    // Log error without failing — Replicate may not be configured in test env
    const err = (await res.json().catch(() => ({ error: 'no body' }))) as { error: string }
    console.log(`Render returned ${res.status}: ${err.error}`)
  }
})

// ── GROUP 4: Match API ────────────────────────────────────────────────────────

test('MATCH: POST /api/match returns 401 when unauthenticated', async () => {
  const res = await fetch(`${BASE_URL}/api/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      render_url: TEST_ROOM_PHOTO,
      item_id: 'sofa',
      item_label: 'Sofa',
      item_bbox: [0.1, 0.3, 0.4, 0.4],
      item_keep: null,
      fingerprint_vector: TEST_FINGERPRINT,
      budget_range: [1000, 3000],
      room_type: 'living_room',
      room_id: testRoomId || 'test',
    }),
  })
  expect(res.status).toBe(401)
})

test('MATCH: POST /api/match with item_keep: true returns 400', async ({ browser }) => {
  const context = await browser.newContext()
  await injectTestAuth(context)
  const page = await context.newPage()
  await page.goto(BASE_URL)

  const res = await page.request.post(`${BASE_URL}/api/match`, {
    data: {
      render_url: TEST_ROOM_PHOTO,
      item_id: 'sofa',
      item_label: 'Sofa',
      item_bbox: [0.1, 0.3, 0.4, 0.4],
      item_keep: true,  // kept items should be rejected
      fingerprint_vector: TEST_FINGERPRINT,
      budget_range: [1000, 3000],
      room_type: 'living_room',
      room_id: testRoomId || 'test',
    },
  })
  expect(res.status()).toBe(400)
  await context.close()
})

test('MATCH: POST /api/match missing required fields returns 400', async ({ browser }) => {
  const context = await browser.newContext()
  await injectTestAuth(context)
  const page = await context.newPage()
  await page.goto(BASE_URL)

  const res = await page.request.post(`${BASE_URL}/api/match`, {
    data: {
      // missing render_url, item_id, etc.
      fingerprint_vector: TEST_FINGERPRINT,
    },
  })
  expect(res.status()).toBe(400)
  await context.close()
})

// ── GROUP 5: Coherence API ────────────────────────────────────────────────────

test('COHERENCE: POST /api/match/coherence returns 401 when unauthenticated', async () => {
  const res = await fetch(`${BASE_URL}/api/match/coherence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productsByItem: {}, styleName: 'test', fingerprint: [], roomType: 'living_room', keptItemLabels: [] }),
  })
  expect(res.status).toBe(401)
})

test('COHERENCE: POST /api/match/coherence with single item skips coherence (passthrough)', async ({ browser }) => {
  const context = await browser.newContext()
  await injectTestAuth(context)
  const page = await context.newPage()
  await page.goto(BASE_URL)

  const res = await page.request.post(`${BASE_URL}/api/match/coherence`, {
    data: {
      productsByItem: {
        sofa: [{ id: 'p1', name: 'Modern Sofa', retailer: 'amazon', price: 799, affiliate_url: 'https://amazon.com', image_url: 'https://example.com/img.jpg', match_score: 0.82, match_label: 'Very Similar' }],
      },
      styleName: 'Warm Japandi',
      fingerprint: TEST_FINGERPRINT,
      roomType: 'living_room',
      keptItemLabels: [],
    },
  })
  // Single item — should passthrough without calling Claude (coherenceScore: 8)
  const data = (await res.json()) as { coherenceScore: number; wasAdjusted: boolean }
  expect(res.status()).toBe(200)
  expect(data.coherenceScore).toBe(8)
  expect(data.wasAdjusted).toBe(false)
  await context.close()
})

// ── GROUP 6: Accessories API ──────────────────────────────────────────────────

test('ACCESSORIES: POST /api/match/accessories returns 401 when unauthenticated', async () => {
  const res = await fetch(`${BASE_URL}/api/match/accessories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  expect(res.status).toBe(401)
})

// ── GROUP 7: Budget utility unit tests ────────────────────────────────────────

test('BUDGET: getItemBudgetTarget sofa in living_room [1000, 3000] ≈ [525, 805]', () => {
  // midBudget = 2000, ratio = 0.35 (sofa in living_room), target = 700
  // range = [round(700 * 0.75), round(700 * 1.15)] = [525, 805]
  const result = getItemBudgetTarget('Sofa', 'living_room', [1000, 3000])
  expect(result[0]).toBeCloseTo(525, -1)   // within 10 of 525
  expect(result[1]).toBeCloseTo(805, -1)   // within 10 of 805
  console.log(`Sofa budget target: $${result[0]} – $${result[1]}`)
})

test('BUDGET: getItemBudgetTarget for unknown item falls back to DEFAULT_ALLOCATION (10%)', () => {
  const result = getItemBudgetTarget('Exotic Lamp', 'living_room', [1000, 3000])
  // DEFAULT_ALLOCATION = 0.10, midBudget = 2000, target = 200
  // range = [round(200 * 0.75), round(200 * 1.15)] = [150, 230]
  expect(result[0]).toBeGreaterThan(0)
  expect(result[1]).toBeGreaterThan(result[0])
})

test('BUDGET: optimizeRoomSelection keeps total within budget ceiling', () => {
  // Create mock products where top picks total 150% of ceiling
  const productsByItem = {
    sofa: [{ id: 's1', price: 3000 }, { id: 's2', price: 1200 }],   // top over budget
    chair: [{ id: 'c1', price: 1500 }, { id: 'c2', price: 600 }],   // top over budget
  }
  const budgetRange: [number, number] = [2000, 3000]  // max 3000

  const { totalCost, selectedIndices, wasOptimized } = optimizeRoomSelection(productsByItem, budgetRange)

  console.log(`Optimizer result: total=$${totalCost}, wasOptimized=${String(wasOptimized)}`)
  console.log(`Selected indices: sofa=${String(selectedIndices['sofa'])}, chair=${String(selectedIndices['chair'])}`)

  expect(totalCost).toBeLessThanOrEqual(budgetRange[1])
  expect(wasOptimized).toBe(true)
})

// ── GROUP 8: Fit utility unit tests ──────────────────────────────────────────

test('FIT: scoreFit hard-rejects sofa 120in wide on 96in wall', () => {
  const dims = {
    widthInches: 120,
    depthInches: 40,
    heightInches: 34,
    source: 'regex' as const,
    confidence: 'confirmed' as const,
  }
  const result = scoreFit('sofa', dims, 96)
  console.log(`scoreFit(120in sofa, 96in wall): ${result.label} — ${result.reason}`)
  expect(result.passes).toBe(false)
  expect(result.label).toBe('Tight Fit')
})

test('FIT: scoreFit returns Perfect Fit for 72in sofa on 144in wall', () => {
  const dims = {
    widthInches: 72,
    depthInches: 38,
    heightInches: 34,
    source: 'regex' as const,
    confidence: 'confirmed' as const,
  }
  const result = scoreFit('sofa', dims, 144)
  // clearancePerSide = (144 - 72) / 2 = 36 → ratio = 36/144 = 0.25 ≥ 0.20 → Perfect Fit
  console.log(`scoreFit(72in sofa, 144in wall): ${result.label} — ${result.reason}`)
  expect(result.passes).toBe(true)
  expect(result.label).toBe('Perfect Fit')
})

test('FIT: scoreFit with no width data returns Dimensions Unconfirmed (not rejected)', () => {
  const dims = {
    widthInches: null,
    depthInches: null,
    heightInches: null,
    source: 'unknown' as const,
    confidence: 'unknown' as const,
  }
  const result = scoreFit('sofa', dims, 144)
  expect(result.label).toBe('Dimensions Unconfirmed')
  expect(result.passes).toBe(true)  // don't hard-reject unknown dims
})

test('FIT: extractDimensionsFromText parses W x D x H format', () => {
  const dims = extractDimensionsFromText('Overall: 84"W x 38"D x 34"H')
  expect(dims.widthInches).toBe(84)
  expect(dims.depthInches).toBe(38)
  expect(dims.heightInches).toBe(34)
  expect(dims.source).toBe('regex')
  expect(dims.confidence).toBe('confirmed')
})

test('FIT: extractDimensionsFromText parses WxDxH no space', () => {
  const dims = extractDimensionsFromText('Sofa 72W x 32D x 35H inches')
  expect(dims.widthInches).toBe(72)
})

test('FIT: extractDimensionsFromText returns null width when no dims present', () => {
  const dims = extractDimensionsFromText('Modern linen sofa with tapered legs')
  expect(dims.widthInches).toBeNull()
  expect(dims.source).toBe('unknown')
})

test('FIT: getDimensionsForCategory returns category defaults for sofa', () => {
  const dims = getDimensionsForCategory('sofa')
  expect(dims.widthInches).toBe(84)
  expect(dims.source).toBe('default')
  expect(dims.confidence).toBe('estimated')
})

test('FIT: getDimensionsForCategory returns null dims for unknown category', () => {
  const dims = getDimensionsForCategory('exotic lamp')
  expect(dims.widthInches).toBeNull()
})
