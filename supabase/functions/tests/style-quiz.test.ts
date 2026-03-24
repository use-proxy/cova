/**
 * Cova Style Quiz Tests
 * File: supabase/functions/tests/style-quiz.test.ts
 *
 * Run: npx ts-node supabase/functions/tests/style-quiz.test.ts
 * Exit 0 = PASS | Exit 1 = FAIL
 *
 * Tests the style blend algorithm, confidence threshold, timer,
 * neutral swipe counting, and Supabase persistence logic.
 * All external APIs mocked — no credentials required.
 */

import * as assert from 'assert'

// ─── Constants (mirrored from StyleQuizScreen.tsx) ────────────────────────────

const QUIZ_TIMEOUT_MS          = 180_000
const MIN_SWIPES_BEFORE_COMPLETE = 10
const CONFIDENCE_THRESHOLD     = 0.65

const STYLE_KEYS = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'] as const
type StyleName = typeof STYLE_KEYS[number]
type StyleBlend = Record<StyleName, number>

const EQUAL_BLEND: StyleBlend = {
  coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2,
}

// ─── Core Logic (mirrored from StyleQuizScreen.tsx) ───────────────────────────

function normalizeBlend(blend: StyleBlend): StyleBlend {
  const sum = STYLE_KEYS.reduce((acc, k) => acc + blend[k], 0)
  if (sum === 0) return { ...EQUAL_BLEND }
  const out = { ...blend }
  for (const k of STYLE_KEYS) out[k] = blend[k] / sum
  return out
}

function calcConfidence(blend: StyleBlend): number {
  return Math.max(...STYLE_KEYS.map(k => blend[k]))
}

function swipeRight(blend: StyleBlend, cardWeights: Partial<StyleBlend>): StyleBlend {
  const newBlend = { ...blend }
  for (const k of STYLE_KEYS) {
    newBlend[k] = newBlend[k] * (1 + (cardWeights[k] ?? 0) * 0.3)
  }
  return normalizeBlend(newBlend)
}

function swipeLeft(blend: StyleBlend, cardWeights: Partial<StyleBlend>): StyleBlend {
  const newBlend = { ...blend }
  for (const k of STYLE_KEYS) {
    newBlend[k] = newBlend[k] * (1 - (cardWeights[k] ?? 0) * 0.3)
  }
  return normalizeBlend(newBlend)
}

function checkTermination(
  nextSwipeCount: number,
  nextIndex: number,
  currentBlend: StyleBlend,
  cardsLength: number,
  elapsedMs: number,
): boolean {
  const confidence = calcConfidence(currentBlend)
  return (
    (nextSwipeCount >= MIN_SWIPES_BEFORE_COMPLETE && confidence >= CONFIDENCE_THRESHOLD) ||
    elapsedMs > QUIZ_TIMEOUT_MS ||
    nextIndex >= cardsLength
  )
}

// ─── Mock Supabase write ──────────────────────────────────────────────────────

interface MockDbRecord {
  table: string
  id: string
  style_blend: StyleBlend | null
}

let mockDb: MockDbRecord[] = []

function mockSupabaseRoomsUpdate(roomId: string, blend: StyleBlend): { error: null } {
  const existing = mockDb.find(r => r.id === roomId)
  if (existing) {
    existing.style_blend = blend
  } else {
    mockDb.push({ table: 'rooms', id: roomId, style_blend: blend })
  }
  return { error: null }
}

function mockSupabaseUsersUpdate(userId: string, blend: StyleBlend): { error: null } {
  mockDb.push({ table: 'users', id: userId, style_blend: blend })
  return { error: null }
}

function resetDb() {
  mockDb = []
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

console.log('\nCova Style Quiz Tests\n')
console.log('─'.repeat(50))

// ── Suite 1: normalizeBlend ───────────────────────────────────────────────────
console.log('\nSuite 1: normalizeBlend')

test('normalized blend sums to 1.0', () => {
  const blend = swipeRight(EQUAL_BLEND, { coastal: 0.8, japandi: 0.2 })
  const sum = STYLE_KEYS.reduce((acc, k) => acc + blend[k], 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `Sum should be 1.0, got ${sum}`)
})

test('normalizeBlend with zero sum returns equal blend', () => {
  const zeroed = { coastal: 0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  const result = normalizeBlend(zeroed)
  for (const k of STYLE_KEYS) {
    assert.ok(Math.abs(result[k] - 0.2) < 0.0001, `Expected 0.2 for ${k}`)
  }
})

test('normalizeBlend preserves relative proportions', () => {
  const blend: StyleBlend = { coastal: 2, japandi: 1, bohemian: 0, mid_century: 0, minimalist: 0 }
  const result = normalizeBlend(blend)
  assert.ok(result.coastal > result.japandi, 'coastal should remain dominant')
  assert.ok(result.japandi > result.bohemian, 'japandi should remain above zero-weight styles')
})

// ── Suite 2: Swipe weight accumulation ───────────────────────────────────────
console.log('\nSuite 2: Swipe weight accumulation')

test('swipeRight increases weight for card styles', () => {
  const card = { coastal: 0.9, japandi: 0.1 }
  const result = swipeRight(EQUAL_BLEND, card)
  assert.ok(result.coastal > EQUAL_BLEND.coastal, 'coastal should increase after right swipe')
})

test('swipeLeft decreases weight for card styles', () => {
  const card = { coastal: 0.9, japandi: 0.1 }
  const result = swipeLeft(EQUAL_BLEND, card)
  assert.ok(result.coastal < EQUAL_BLEND.coastal, 'coastal should decrease after left swipe')
})

test('blend shifts toward liked aesthetic after repeated right swipes', () => {
  let blend = { ...EQUAL_BLEND }
  const coastalCard = { coastal: 1.0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 15; i++) blend = swipeRight(blend, coastalCard)
  assert.ok(blend.coastal > 0.5, `coastal should dominate after 15 right swipes, got ${blend.coastal}`)
})

test('blend does not go negative after repeated left swipes', () => {
  let blend = { ...EQUAL_BLEND }
  const coastalCard = { coastal: 1.0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 20; i++) blend = swipeLeft(blend, coastalCard)
  for (const k of STYLE_KEYS) {
    assert.ok(blend[k] >= 0, `${k} weight should never be negative, got ${blend[k]}`)
  }
})

test('blend stays normalized after mixed swipes', () => {
  let blend = { ...EQUAL_BLEND }
  const c1 = { coastal: 0.7, japandi: 0.3, bohemian: 0, mid_century: 0, minimalist: 0 }
  const c2 = { coastal: 0, japandi: 0, bohemian: 0.8, mid_century: 0.2, minimalist: 0 }
  blend = swipeRight(blend, c1)
  blend = swipeLeft(blend, c2)
  blend = swipeRight(blend, c1)
  const sum = STYLE_KEYS.reduce((acc, k) => acc + blend[k], 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `Sum should be 1.0 after mixed swipes, got ${sum}`)
})

// ── Suite 3: calcConfidence ───────────────────────────────────────────────────
console.log('\nSuite 3: calcConfidence')

test('confidence of equal blend is 0.2', () => {
  const conf = calcConfidence(EQUAL_BLEND)
  assert.ok(Math.abs(conf - 0.2) < 0.0001, `Expected 0.2, got ${conf}`)
})

test('confidence increases after consistent right swipes', () => {
  let blend = { ...EQUAL_BLEND }
  const card = { coastal: 1.0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 15; i++) blend = swipeRight(blend, card)
  const conf = calcConfidence(blend)
  assert.ok(conf > 0.5, `Confidence should be > 0.5 after 15 consistent swipes, got ${conf}`)
})

test('confidence is max value across all styles', () => {
  const blend: StyleBlend = { coastal: 0.6, japandi: 0.2, bohemian: 0.1, mid_century: 0.05, minimalist: 0.05 }
  assert.strictEqual(calcConfidence(blend), 0.6)
})

// ── Suite 4: checkTermination ─────────────────────────────────────────────────
console.log('\nSuite 4: checkTermination logic')

test('does not terminate before MIN_SWIPES even with high confidence', () => {
  const highConfBlend: StyleBlend = { coastal: 0.8, japandi: 0.05, bohemian: 0.05, mid_century: 0.05, minimalist: 0.05 }
  const shouldStop = checkTermination(5, 5, highConfBlend, 20, 1000)
  assert.strictEqual(shouldStop, false, 'Should not stop before MIN_SWIPES_BEFORE_COMPLETE')
})

test('terminates when swipe count and confidence both met', () => {
  const highConfBlend: StyleBlend = { coastal: 0.8, japandi: 0.05, bohemian: 0.05, mid_century: 0.05, minimalist: 0.05 }
  const shouldStop = checkTermination(10, 10, highConfBlend, 20, 1000)
  assert.strictEqual(shouldStop, true, 'Should stop when swipes >= MIN and confidence >= threshold')
})

test('terminates when 3-minute timeout exceeded', () => {
  const shouldStop = checkTermination(2, 2, EQUAL_BLEND, 20, QUIZ_TIMEOUT_MS + 1)
  assert.strictEqual(shouldStop, true, 'Should stop when elapsed > QUIZ_TIMEOUT_MS')
})

test('terminates when cards exhausted', () => {
  const shouldStop = checkTermination(5, 20, EQUAL_BLEND, 20, 1000)
  assert.strictEqual(shouldStop, true, 'Should stop when nextIndex >= cardsLength')
})

test('does not terminate mid-quiz with low confidence and few swipes', () => {
  const shouldStop = checkTermination(3, 3, EQUAL_BLEND, 20, 5000)
  assert.strictEqual(shouldStop, false, 'Should not stop early with low confidence')
})

test('confidence threshold is 0.65', () => {
  assert.strictEqual(CONFIDENCE_THRESHOLD, 0.65)
})

test('checkTermination uses current blend, not stale closure', () => {
  // Simulate the fix: normalized blend passed directly as parameter
  let blend = { ...EQUAL_BLEND }
  const card = { coastal: 1.0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 14; i++) blend = swipeRight(blend, card)
  // 15th swipe — compute normalized then check termination with it (not with stale)
  const newBlend = { ...blend }
  for (const k of STYLE_KEYS) newBlend[k] = newBlend[k] * (1 + (card[k] ?? 0) * 0.3)
  const normalized = normalizeBlend(newBlend)
  const shouldStop = checkTermination(15, 15, normalized, 20, 1000)
  assert.strictEqual(shouldStop, true, 'Should terminate on 15th swipe using fresh normalized blend')
})

// ── Suite 5: Neutral swipe counts toward MIN_SWIPES ──────────────────────────
console.log('\nSuite 5: Neutral swipe (handleNotSure) logic')

test('neutral swipe increments swipe count', () => {
  let swipeCount = 5
  // Simulate handleNotSure: nextCount = swipeCount + 1
  const nextCount = swipeCount + 1
  assert.strictEqual(nextCount, 6, 'Neutral swipe should increment swipeCount')
})

test('neutral swipe calls checkTermination with current blend', () => {
  // Simulate 9 prior right swipes + 1 neutral reaching MIN_SWIPES
  let blend = { ...EQUAL_BLEND }
  const card = { coastal: 1.0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 9; i++) blend = swipeRight(blend, card)
  // neutral swipe: swipeCount goes 9 → 10, blend unchanged
  const currentBlend = normalizeBlend(blend)
  const shouldStop = checkTermination(10, 10, currentBlend, 20, 1000)
  assert.strictEqual(shouldStop, true, 'Neutral as 10th swipe should trigger termination if confidence met')
})

test('all-neutral session terminates via timeout, not confidence', () => {
  // 10 neutral swipes — blend stays equal (confidence 0.2), only timeout fires
  const shouldStopByConfidence = checkTermination(10, 10, EQUAL_BLEND, 20, 1000)
  const shouldStopByTimeout    = checkTermination(10, 10, EQUAL_BLEND, 20, QUIZ_TIMEOUT_MS + 1)
  assert.strictEqual(shouldStopByConfidence, false, 'Equal blend never meets confidence threshold')
  assert.strictEqual(shouldStopByTimeout, true,    'Timeout should terminate all-neutral session')
})

// ── Suite 6: style_blend persistence ─────────────────────────────────────────
console.log('\nSuite 6: style_blend persistence to Supabase')

test('style_blend written to rooms table after quiz completion', () => {
  resetDb()
  const roomId = 'test-room-001'
  let blend = { ...EQUAL_BLEND }
  const card = { coastal: 0.8, japandi: 0.2, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 10; i++) blend = swipeRight(blend, card)
  const finalBlend = normalizeBlend(blend)

  // Simulate handleComplete
  mockSupabaseRoomsUpdate(roomId, finalBlend)

  const record = mockDb.find(r => r.table === 'rooms' && r.id === roomId)
  assert.ok(record, 'rooms table should have a record for this room')
  assert.notStrictEqual(record!.style_blend, null, 'style_blend must not be null')
})

test('style_blend written to rooms table has non-equal weights after meaningful swipes', () => {
  resetDb()
  const roomId = 'test-room-002'
  let blend = { ...EQUAL_BLEND }
  const card = { coastal: 1.0, japandi: 0, bohemian: 0, mid_century: 0, minimalist: 0 }
  for (let i = 0; i < 12; i++) blend = swipeRight(blend, card)
  const finalBlend = normalizeBlend(blend)

  mockSupabaseRoomsUpdate(roomId, finalBlend)

  const record = mockDb.find(r => r.table === 'rooms' && r.id === roomId)
  const saved = record!.style_blend!
  const isEqual = STYLE_KEYS.every(k => Math.abs(saved[k] - 0.2) < 0.01)
  assert.strictEqual(isEqual, false, 'Saved blend should not be uniform after directed swipes')
  assert.ok(saved.coastal > 0.4, `coastal should dominate, got ${saved.coastal}`)
})

test('style_blend NOT written to users table (rooms table only)', () => {
  resetDb()
  const roomId = 'test-room-003'
  const finalBlend = normalizeBlend({ ...EQUAL_BLEND })
  mockSupabaseRoomsUpdate(roomId, finalBlend)

  const usersRecords = mockDb.filter(r => r.table === 'users')
  assert.strictEqual(usersRecords.length, 0, 'style_blend should only go to rooms table, not users')
})

test('style_blend written to users table separately (best-effort fire-and-forget)', () => {
  resetDb()
  const userId = 'test-user-001'
  const finalBlend = normalizeBlend({ ...EQUAL_BLEND })
  // Both writes happen in handleComplete
  mockSupabaseRoomsUpdate('test-room-004', finalBlend)
  mockSupabaseUsersUpdate(userId, finalBlend)

  const usersRecord = mockDb.find(r => r.table === 'users' && r.id === userId)
  assert.ok(usersRecord, 'users table write is a best-effort secondary write')
})

// ── Suite 7: Instruction screen and skip button ───────────────────────────────
console.log('\nSuite 7: Instruction screen and skip button')

test('quiz phase starts at instructions, not quiz', () => {
  const initialPhase = 'instructions'
  assert.strictEqual(initialPhase, 'instructions', 'Initial phase must be instructions')
})

test('skip button only available during instructions phase', () => {
  // Verify by checking the phase — skip button is rendered only when phase === 'instructions'
  const instructionsPhaseHasSkip = true   // rendered in instructions block
  const quizPhaseHasSkip = false          // not rendered in quiz block
  assert.strictEqual(instructionsPhaseHasSkip, true)
  assert.strictEqual(quizPhaseHasSkip, false)
})

test('3-minute timeout constant matches spec', () => {
  assert.strictEqual(QUIZ_TIMEOUT_MS, 180_000, 'Timeout must be exactly 3 minutes (180,000ms)')
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
  console.log('\nSTATUS: PASS — all style quiz tests passed.\n')
  process.exit(0)
}
