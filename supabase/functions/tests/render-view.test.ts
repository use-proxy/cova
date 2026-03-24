/**
 * Cova Render View Tests
 * File: supabase/functions/tests/render-view.test.ts
 *
 * Run: npx ts-node supabase/functions/tests/render-view.test.ts
 * Exit 0 = PASS | Exit 1 = FAIL
 *
 * Tests pinch zoom clamping, pan clamping, before/after slider
 * gating, regenerate compression, and HUD auto-hide timer.
 * All external APIs mocked — no credentials required.
 */

import * as assert from 'assert'

// ─── Constants (mirrored from RenderViewScreen.tsx) ───────────────────────────

const SCALE_MIN = 1.0
const SCALE_MAX = 2.5
const HUD_AUTO_HIDE_MS = 3000

// ─── Core Logic (mirrored from RenderViewScreen.tsx) ─────────────────────────

function clampScale(currentScale: number, pinchRatio: number): number {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, currentScale * pinchRatio))
}

function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } {
  const maxX = (screenWidth  * (scale - 1)) / 2
  const maxY = (screenHeight * (scale - 1)) / 2
  return {
    x: Math.max(-maxX, Math.min(maxX, tx)),
    y: Math.max(-maxY, Math.min(maxY, ty)),
  }
}

function shouldShowBeforeAfter(
  capturedImageUri: string | null,
  originalImageUrl: string | null | undefined,
): boolean {
  return capturedImageUri != null || originalImageUrl != null
}

function getBeforeImageUri(
  capturedImageUri: string | null,
  originalImageUrl: string | null | undefined,
): string {
  return capturedImageUri ?? originalImageUrl ?? ''
}

interface RegenCompressionParams {
  width: number
  quality: number
  format: string
}

function getRegenCompressionParams(): RegenCompressionParams {
  return { width: 1024, quality: 0.8, format: 'JPEG' }
}

// Simulate HUD auto-hide: returns whether HUD was hidden after timeout
function simulateHudTimer(timeoutMs: number): { hidden: boolean; timerMs: number } {
  return { hidden: timeoutMs >= HUD_AUTO_HIDE_MS, timerMs: HUD_AUTO_HIDE_MS }
}

// Simulate the idle → goBack guard
function shouldGoBack(renderStatus: string, currentRender: unknown | null): boolean {
  return renderStatus === 'idle' && currentRender === null
}

// ─── Test harness ─────────────────────────────────────────────────────────────

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

console.log('\nCova Render View Tests\n')
console.log('─'.repeat(50))

// ── Suite 1: Pinch zoom clamping ─────────────────────────────────────────────
console.log('\nSuite 1: Pinch zoom clamping (1.0x – 2.5x)')

test('scale clamps to minimum 1.0 when pinching out', () => {
  const result = clampScale(1.0, 0.5) // pinch in past minimum
  assert.strictEqual(result, SCALE_MIN, `Scale must not go below ${SCALE_MIN}`)
})

test('scale clamps to maximum 2.5 when pinching in', () => {
  const result = clampScale(2.0, 2.0) // would yield 4.0 unclamped
  assert.strictEqual(result, SCALE_MAX, `Scale must not exceed ${SCALE_MAX}`)
})

test('scale within range is not clamped', () => {
  const result = clampScale(1.5, 1.2) // 1.8
  assert.ok(result > SCALE_MIN && result < SCALE_MAX, `Scale ${result} should remain in range`)
  assert.ok(Math.abs(result - 1.8) < 0.0001)
})

test('pinch ratio of 1.0 leaves scale unchanged', () => {
  const result = clampScale(1.5, 1.0)
  assert.ok(Math.abs(result - 1.5) < 0.0001, 'Neutral pinch should not change scale')
})

test('scale minimum is 1.0 (never smaller — no white space on sides)', () => {
  assert.strictEqual(SCALE_MIN, 1.0, 'Minimum scale must be exactly 1.0x')
})

test('scale maximum is 2.5', () => {
  assert.strictEqual(SCALE_MAX, 2.5, 'Maximum scale must be exactly 2.5x')
})

// ── Suite 2: Pan clamping ────────────────────────────────────────────────────
console.log('\nSuite 2: Pan clamping (no white space)')

const SW = 390  // typical iPhone screen width
const SH = 844  // typical iPhone screen height

test('at scale 1.0 translation is clamped to zero (cannot pan)', () => {
  const clamped = clampTranslate(100, 200, 1.0, SW, SH)
  assert.strictEqual(clamped.x, 0, 'At scale 1.0 X pan must be zero')
  assert.strictEqual(clamped.y, 0, 'At scale 1.0 Y pan must be zero')
})

test('at scale 2.0 translation is bounded by (screenDim * 0.5)', () => {
  const maxExpectedX = (SW * (2.0 - 1)) / 2  // 195
  const clamped = clampTranslate(500, 0, 2.0, SW, SH)
  assert.ok(clamped.x <= maxExpectedX, `X pan ${clamped.x} must not exceed ${maxExpectedX}`)
})

test('negative pan is symmetrically clamped', () => {
  const clamped = clampTranslate(-500, 0, 2.0, SW, SH)
  const maxExpectedX = (SW * (2.0 - 1)) / 2
  assert.ok(clamped.x >= -maxExpectedX, `Negative X pan ${clamped.x} must not exceed ${-maxExpectedX}`)
})

test('pan within bounds is not altered', () => {
  const smallTx = 10
  const smallTy = 10
  const clamped = clampTranslate(smallTx, smallTy, 2.0, SW, SH)
  assert.strictEqual(clamped.x, smallTx, 'Small pan within bounds should not be clamped')
  assert.strictEqual(clamped.y, smallTy, 'Small pan within bounds should not be clamped')
})

test('at max scale 2.5 pan range is bounded correctly', () => {
  const maxExpectedX = (SW * (2.5 - 1)) / 2  // 292.5
  const clamped = clampTranslate(1000, 0, 2.5, SW, SH)
  assert.ok(clamped.x <= maxExpectedX, `X pan at max scale must not exceed ${maxExpectedX}`)
})

// ── Suite 3: Before/After slider gating ──────────────────────────────────────
console.log('\nSuite 3: Before/After slider — hidden when no original image')

test('B/A toggle hidden when both capturedImageUri and original_image_url are null', () => {
  assert.strictEqual(shouldShowBeforeAfter(null, null), false, 'Toggle must be hidden with no original')
})

test('B/A toggle shown when capturedImageUri is set', () => {
  assert.strictEqual(shouldShowBeforeAfter('/path/to/photo.jpg', null), true)
})

test('B/A toggle shown when original_image_url is set', () => {
  assert.strictEqual(shouldShowBeforeAfter(null, 'https://storage.supabase.co/original.jpg'), true)
})

test('B/A toggle shown when both are set', () => {
  assert.strictEqual(shouldShowBeforeAfter('/local.jpg', 'https://storage.supabase.co/original.jpg'), true)
})

test('before image is capturedImageUri when available', () => {
  const uri = getBeforeImageUri('/local.jpg', 'https://remote.jpg')
  assert.strictEqual(uri, '/local.jpg', 'capturedImageUri takes priority over original_image_url')
})

test('before image falls back to original_image_url when capturedImageUri null', () => {
  const uri = getBeforeImageUri(null, 'https://remote.jpg')
  assert.strictEqual(uri, 'https://remote.jpg')
})

test('before image returns empty string when both null (should never show in this state)', () => {
  const uri = getBeforeImageUri(null, null)
  assert.strictEqual(uri, '')
})

// ── Suite 4: Regenerate compression ──────────────────────────────────────────
console.log('\nSuite 4: Regenerate uses same compression as initial capture')

test('regenerate compresses to 1024px width', () => {
  assert.strictEqual(getRegenCompressionParams().width, 1024)
})

test('regenerate uses 0.8 quality', () => {
  assert.strictEqual(getRegenCompressionParams().quality, 0.8)
})

test('regenerate uses JPEG format', () => {
  assert.strictEqual(getRegenCompressionParams().format, 'JPEG')
})

// ── Suite 5: HUD auto-hide ────────────────────────────────────────────────────
console.log('\nSuite 5: HUD auto-hide timer')

test('HUD hides after 3000ms', () => {
  const { hidden, timerMs } = simulateHudTimer(3000)
  assert.strictEqual(hidden, true, 'HUD must hide at exactly 3000ms')
  assert.strictEqual(timerMs, HUD_AUTO_HIDE_MS)
})

test('HUD does not hide before 3000ms', () => {
  const { hidden } = simulateHudTimer(2999)
  assert.strictEqual(hidden, false, 'HUD must not hide before 3000ms')
})

test('HUD auto-hide timeout is exactly 3 seconds', () => {
  assert.strictEqual(HUD_AUTO_HIDE_MS, 3000)
})

// ── Suite 6: Navigation guard ─────────────────────────────────────────────────
console.log('\nSuite 6: Idle-state navigation guard')

test('navigates back when renderStatus is idle and no render loaded', () => {
  assert.strictEqual(shouldGoBack('idle', null), true)
})

test('does not navigate back when render is processing', () => {
  assert.strictEqual(shouldGoBack('processing', null), false)
})

test('does not navigate back when render is completed with a render record', () => {
  assert.strictEqual(shouldGoBack('completed', { id: 'r1', image_url: 'https://...' }), false)
})

test('does not navigate back when idle but a previous render is loaded', () => {
  assert.strictEqual(shouldGoBack('idle', { id: 'r1', image_url: 'https://...' }), false)
})

// ─── Results Summary ──────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length
const failed = results.filter(r => !r.passed).length
const total  = results.length

console.log('\n' + '─'.repeat(50))
console.log(`\nResults: ${passed}/${total} passed`)

if (failed > 0) {
  console.log('\nFailed tests:')
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ✗ ${r.name}`)
    console.log(`    ${r.error}`)
  })
  console.log('\nSTATUS: FAIL\n')
  process.exit(1)
} else {
  console.log('\nSTATUS: PASS — all render view tests passed.\n')
  process.exit(0)
}
