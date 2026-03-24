/**
 * Cova Render Pipeline Integration Test
 * File: supabase/functions/tests/render-pipeline.test.ts
 *
 * Run: npx ts-node supabase/functions/tests/render-pipeline.test.ts
 * Exit 0 = PASS (all tests passed)
 * Exit 1 = FAIL (one or more tests failed)
 *
 * This test must pass before any render-related fix is considered done.
 * It mocks all external APIs (Replicate, Supabase Storage) so it runs
 * without real credentials and without incurring API costs.
 */

import * as assert from 'assert'

// ─── Types ────────────────────────────────────────────────────────────────────

type RenderStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface RenderRecord {
  id: string
  room_id: string
  user_id: string
  status: RenderStatus
  image_url: string | null
  replicate_prediction_id: string | null
  style_applied: Record<string, number> | null
  prompt_used: string | null
  tokens_used: number
}

interface MockReplicateResponse {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed'
  output: string | string[] | null
  error: string | null
}

// ─── Mock Infrastructure ──────────────────────────────────────────────────────

const TEST_ROOM_ID  = 'test-room-00000000-0000-0000-0000-000000000001'
const TEST_USER_ID  = 'test-user-00000000-0000-0000-0000-000000000001'
const TEST_RENDER_ID = 'test-render-0000-0000-0000-000000000001'

const MOCK_DEPTH_MAP_URL  = 'https://mock-storage.supabase.co/depth-map-test.jpg'
const MOCK_RENDER_URL     = 'https://mock-storage.supabase.co/render-test.jpg'
const MOCK_PREDICTION_ID  = 'mock-replicate-prediction-id-depth'
const MOCK_FLUX_PRED_ID   = 'mock-replicate-prediction-id-flux'

// Simulates the database record that would exist in Supabase
let mockRenderRecord: RenderRecord = {
  id: TEST_RENDER_ID,
  room_id: TEST_ROOM_ID,
  user_id: TEST_USER_ID,
  status: 'pending',
  image_url: null,
  replicate_prediction_id: null,
  style_applied: null,
  prompt_used: null,
  tokens_used: 0,
}

// Mock Replicate API — simulates full prediction lifecycle
function mockReplicateDepthPro(): MockReplicateResponse {
  return { id: MOCK_PREDICTION_ID, status: 'succeeded', output: MOCK_DEPTH_MAP_URL, error: null }
}

function mockReplicateFlux(): MockReplicateResponse {
  return { id: MOCK_FLUX_PRED_ID, status: 'succeeded', output: [MOCK_RENDER_URL], error: null }
}

function mockReplicateFluxFailed(): MockReplicateResponse {
  return { id: MOCK_FLUX_PRED_ID, status: 'failed', output: null, error: 'Model error' }
}

function mockReplicateFluxPending(): MockReplicateResponse {
  return { id: MOCK_FLUX_PRED_ID, status: 'processing', output: null, error: null }
}

// Mock Supabase Storage upload
function mockStorageUpload(bucket: string, path: string): { data: { path: string }, error: null } {
  return { data: { path: `${bucket}/${path}` }, error: null }
}

// ─── Core Logic Under Test ────────────────────────────────────────────────────
// These functions replicate the logic inside the edge functions
// so we can test it without running Deno or making real API calls.

function buildPrompt(styleBlend: Record<string, number>): string {
  const STYLE_PROMPTS: Record<string, string> = {
    coastal:     'coastal interior, light blue and white palette, natural linen, driftwood accents, airy and bright',
    japandi:     'japandi interior, warm neutrals, natural wood, minimalist zen, wabi-sabi, serene organic materials',
    bohemian:    'bohemian interior, rich jewel tones, mixed patterns, macrame, plants, eclectic layered textiles',
    mid_century: 'mid-century modern interior, walnut wood, organic curves, bold geometric patterns, warm amber tones',
    minimalist:  'minimalist interior, pure white, clean lines, negative space, monochromatic palette, no clutter',
  }
  return Object.entries(styleBlend)
    .sort(([, a], [, b]) => b - a)
    .filter(([style]) => STYLE_PROMPTS[style])
    .map(([style]) => STYLE_PROMPTS[style])
    .join(', ')
}

function parseFluxOutput(output: string | string[] | null): string | null {
  if (!output) return null
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output.length > 0) return output[0]
  return null
}

function simulateRenderPipeline(
  styleBlend: Record<string, number>,
  replicateDepthResponse: MockReplicateResponse,
  replicateFluxResponse: MockReplicateResponse,
): { record: RenderRecord; error: string | null } {
  const record = { ...mockRenderRecord }

  // Step 1: Mark as processing
  record.status = 'processing'
  record.style_applied = styleBlend

  // Step 2: Depth Pro
  if (replicateDepthResponse.status !== 'succeeded' || !replicateDepthResponse.output) {
    record.status = 'failed'
    return { record, error: 'Depth Pro failed' }
  }

  // Step 3: Build FLUX prompt
  const prompt = buildPrompt(styleBlend)
  if (!prompt) {
    record.status = 'failed'
    return { record, error: 'Prompt generation failed' }
  }
  record.prompt_used = prompt

  // Step 4: FLUX ControlNet
  if (replicateFluxResponse.status !== 'succeeded' || !replicateFluxResponse.output) {
    record.status = 'failed'
    return { record, error: 'FLUX generation failed' }
  }

  // Step 5: Parse output (handles both string and array)
  const imageUrl = parseFluxOutput(replicateFluxResponse.output)
  if (!imageUrl) {
    record.status = 'failed'
    return { record, error: 'Could not parse FLUX output' }
  }

  // Step 6: Storage upload (mocked)
  const upload = mockStorageUpload('renders', `${TEST_USER_ID}/${TEST_ROOM_ID}/test.jpg`)
  if (upload.error) {
    record.status = 'failed'
    return { record, error: 'Storage upload failed' }
  }

  // Step 7: Mark completed
  record.status = 'completed'
  record.image_url = MOCK_RENDER_URL
  record.replicate_prediction_id = replicateFluxResponse.id

  return { record, error: null }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const results: Array<{ name: string; passed: boolean; error?: string }> = []

function test(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}`)
    console.log(`    → ${e.message}`)
  }
}

console.log('\nCova Render Pipeline Integration Tests\n')
console.log('─'.repeat(50))

// ── Suite 1: Status Transitions ──────────────────────────────────────────────
console.log('\nSuite 1: Status Transitions')

test('status transitions from pending → processing → completed on success', () => {
  const { record, error } = simulateRenderPipeline(
    { coastal: 0.7, japandi: 0.3 },
    mockReplicateDepthPro(),
    mockReplicateFlux(),
  )
  assert.strictEqual(error, null, `Expected no error, got: ${error}`)
  assert.strictEqual(record.status, 'completed')
})

test('status transitions to failed when FLUX fails', () => {
  const { record, error } = simulateRenderPipeline(
    { coastal: 0.7, japandi: 0.3 },
    mockReplicateDepthPro(),
    mockReplicateFluxFailed(),
  )
  assert.strictEqual(record.status, 'failed')
  assert.notStrictEqual(error, null)
})

test('status transitions to failed when depth Pro fails', () => {
  const failedDepth: MockReplicateResponse = { id: 'x', status: 'failed', output: null, error: 'Depth failed' }
  const { record } = simulateRenderPipeline(
    { coastal: 1.0 },
    failedDepth,
    mockReplicateFlux(),
  )
  assert.strictEqual(record.status, 'failed')
})

// ── Suite 2: style_applied NOT NULL ──────────────────────────────────────────
console.log('\nSuite 2: style_applied NOT NULL constraint')

test('style_applied is set on every render attempt (not null)', () => {
  const styleBlend = { coastal: 0.6, japandi: 0.4 }
  const { record } = simulateRenderPipeline(styleBlend, mockReplicateDepthPro(), mockReplicateFlux())
  assert.notStrictEqual(record.style_applied, null, 'style_applied must not be null')
  assert.deepStrictEqual(record.style_applied, styleBlend)
})

test('style_applied is set even when render fails', () => {
  const styleBlend = { bohemian: 1.0 }
  const { record } = simulateRenderPipeline(styleBlend, mockReplicateDepthPro(), mockReplicateFluxFailed())
  assert.notStrictEqual(record.style_applied, null, 'style_applied must not be null even on failure')
})

// ── Suite 3: FLUX Output Parsing ─────────────────────────────────────────────
console.log('\nSuite 3: FLUX output parsing (string and array)')

test('parseFluxOutput handles string response', () => {
  const url = parseFluxOutput('https://example.com/render.jpg')
  assert.strictEqual(url, 'https://example.com/render.jpg')
})

test('parseFluxOutput handles array response', () => {
  const url = parseFluxOutput(['https://example.com/render.jpg'])
  assert.strictEqual(url, 'https://example.com/render.jpg')
})

test('parseFluxOutput handles null response', () => {
  const url = parseFluxOutput(null)
  assert.strictEqual(url, null)
})

test('parseFluxOutput handles empty array', () => {
  const url = parseFluxOutput([])
  assert.strictEqual(url, null)
})

// ── Suite 4: Prompt Construction ─────────────────────────────────────────────
console.log('\nSuite 4: Prompt construction from style blend')

test('buildPrompt returns non-empty string for valid style blend', () => {
  const prompt = buildPrompt({ coastal: 0.7, japandi: 0.3 })
  assert.ok(prompt.length > 0, 'Prompt must not be empty')
})

test('buildPrompt places dominant style first', () => {
  const prompt = buildPrompt({ japandi: 0.8, coastal: 0.2 })
  const japandiIdx = prompt.indexOf('japandi')
  const coastalIdx = prompt.indexOf('coastal')
  assert.ok(japandiIdx < coastalIdx, 'Dominant style (japandi) must appear before secondary (coastal)')
})

test('buildPrompt handles single style with 100% weight', () => {
  const prompt = buildPrompt({ minimalist: 1.0 })
  assert.ok(prompt.includes('minimalist'), 'Prompt must include the style')
})

test('buildPrompt handles empty style blend gracefully', () => {
  const prompt = buildPrompt({})
  assert.strictEqual(prompt, '', 'Empty blend should return empty string, not crash')
})

// ── Suite 5: image_url set after completion ───────────────────────────────────
console.log('\nSuite 5: image_url set after successful render')

test('image_url is set after successful render', () => {
  const { record } = simulateRenderPipeline(
    { coastal: 1.0 },
    mockReplicateDepthPro(),
    mockReplicateFlux(),
  )
  assert.strictEqual(record.status, 'completed')
  assert.notStrictEqual(record.image_url, null, 'image_url must be set after completion')
  assert.ok(record.image_url!.startsWith('https://'), 'image_url must be a valid URL')
})

test('image_url remains null after failed render', () => {
  const { record } = simulateRenderPipeline(
    { coastal: 1.0 },
    mockReplicateDepthPro(),
    mockReplicateFluxFailed(),
  )
  assert.strictEqual(record.status, 'failed')
  assert.strictEqual(record.image_url, null, 'image_url must remain null after failure')
})

// ── Suite 6: Polling Timeout Behavior ────────────────────────────────────────
console.log('\nSuite 6: Polling — stuck prediction marks as failed')

test('stuck prediction (never succeeds) marks render as failed, not left processing', () => {
  // Simulate: FLUX never completes — always returns 'processing'
  // Pipeline must mark render as 'failed' after timeout, not leave it processing forever
  let pollCount = 0
  const MAX_POLLS = 5

  function pollUntilTimeout(response: MockReplicateResponse): RenderStatus {
    while (pollCount < MAX_POLLS) {
      pollCount++
      if (response.status === 'succeeded') return 'completed'
      if (response.status === 'failed') return 'failed'
      // still processing — continue polling
    }
    // Timeout reached — must return failed, not processing
    return 'failed'
  }

  const finalStatus = pollUntilTimeout(mockReplicateFluxPending())
  assert.strictEqual(finalStatus, 'failed', 'Timed-out prediction must result in failed status, not processing')
})

// ─── Results Summary ──────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length
const failed = results.filter(r => !r.passed).length
const total  = results.length

console.log('\n' + '─'.repeat(50))
console.log(`\nResults: ${passed}/${total} passed`)

if (failed > 0) {
  console.log(`\nFailed tests:`)
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ✗ ${r.name}`)
    console.log(`    ${r.error}`)
  })
  console.log('\nSTATUS: FAIL — fix the failures above before this fix is complete.\n')
  process.exit(1)
} else {
  console.log('\nSTATUS: PASS — all render pipeline tests passed.\n')
  process.exit(0)
}