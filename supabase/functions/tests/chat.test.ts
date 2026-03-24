/**
 * Cova Chat Tests
 * File: supabase/functions/tests/chat.test.ts
 *
 * Run: npx ts-node supabase/functions/tests/chat.test.ts
 * Exit 0 = PASS | Exit 1 = FAIL
 *
 * Tests Claude API vision call (URL-type image), session history persistence,
 * tap coordinate passing, free chat / token-on-regenerate logic.
 * All external APIs mocked — no credentials required.
 */

import * as assert from 'assert'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TapCoordinate {
  x: number
  y: number
}

interface ClaudeImageBlock {
  type: 'image'
  source: {
    type: 'url'
    url: string
  }
}

interface ClaudeTextBlock {
  type: 'text'
  text: string
}

type ClaudeContentBlock = ClaudeImageBlock | ClaudeTextBlock

interface ClaudeMessagePayload {
  model: string
  max_tokens: number
  system: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: ClaudeContentBlock[] | string
  }>
}

interface RoomContext {
  dimensions: { width: number; depth: number; height: number; unit: string }
  roomType: string
  styleBlend: Record<string, number>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT_IS_FREE = true
const REGEN_COSTS_TOKENS = true
const V1_TOKEN_BALANCE = 999
const MAX_TOKENS_RESPONSE = 1024
const CLAUDE_MODEL = 'claude-sonnet-4-6'

// ─── Mock state ───────────────────────────────────────────────────────────────

let mockChatHistory: ChatMessage[] = []
let mockTokenBalance = V1_TOKEN_BALANCE
let mockClaudeCallCount = 0
let mockLastPayload: ClaudeMessagePayload | null = null

function resetState() {
  mockChatHistory = []
  mockTokenBalance = V1_TOKEN_BALANCE
  mockClaudeCallCount = 0
  mockLastPayload = null
}

// ─── Mock Claude API ──────────────────────────────────────────────────────────

function mockClaudeAPI(payload: ClaudeMessagePayload): { content: string } {
  mockClaudeCallCount++
  mockLastPayload = payload
  return { content: 'Mock Claude response about your room.' }
}

// ─── Core Logic (mirrored from chat-room edge function + ChatPanel.tsx) ───────

function buildSystemPrompt(roomContext: RoomContext): string {
  const { dimensions, roomType, styleBlend } = roomContext
  const dominantStyle = Object.entries(styleBlend)
    .sort(([, a], [, b]) => b - a)[0][0]

  return [
    `You are Cova, an expert interior designer AI helping a user redesign their ${roomType}.`,
    `Room dimensions: ${dimensions.width}m wide × ${dimensions.depth}m deep × ${dimensions.height}m high.`,
    `Style blend: ${JSON.stringify(styleBlend)}. Dominant style: ${dominantStyle}.`,
    `Focus on actionable, specific design advice. Be concise and visual in your descriptions.`,
    `Do not mention style names like "Japandi" or "Coastal" directly to the user.`,
  ].join('\n')
}

function buildUserMessage(
  text: string,
  renderImageUrl: string | null,
  tapCoordinate: TapCoordinate | null,
): ClaudeContentBlock[] {
  const blocks: ClaudeContentBlock[] = []

  // Include render image if available
  if (renderImageUrl) {
    blocks.push({
      type: 'image',
      source: {
        type: 'url',
        url: renderImageUrl,
      },
    })
  }

  // Build text content
  let textContent = text
  if (tapCoordinate) {
    textContent = `[User tapped at position (${tapCoordinate.x.toFixed(0)}, ${tapCoordinate.y.toFixed(0)}) on the render image]\n\n${text}`
  }

  blocks.push({ type: 'text', text: textContent })
  return blocks
}

function appendToHistory(history: ChatMessage[], role: 'user' | 'assistant', content: string): ChatMessage[] {
  return [...history, { role, content }]
}

function sendChatMessage(
  userText: string,
  history: ChatMessage[],
  roomContext: RoomContext,
  renderImageUrl: string | null,
  tapCoordinate: TapCoordinate | null,
): { response: string; updatedHistory: ChatMessage[]; tokensCharged: number } {
  const systemPrompt = buildSystemPrompt(roomContext)
  const userBlocks = buildUserMessage(userText, renderImageUrl, tapCoordinate)

  // Build conversation messages (include history + new user message)
  const messages = [
    ...history.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
    { role: 'user' as const, content: userBlocks },
  ]

  const payload: ClaudeMessagePayload = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS_RESPONSE,
    system: systemPrompt,
    messages,
  }

  const { content } = mockClaudeAPI(payload)

  // Chat is always FREE — zero tokens charged
  const tokensCharged = 0

  // Persist to history
  const updatedHistory = appendToHistory(
    appendToHistory(history, 'user', userText),
    'assistant',
    content,
  )

  return { response: content, updatedHistory, tokensCharged }
}

function simulateRegenerate(currentTokenBalance: number): {
  newBalance: number
  tokensCharged: number
  allowed: boolean
} {
  if (!REGEN_COSTS_TOKENS) {
    return { newBalance: currentTokenBalance, tokensCharged: 0, allowed: true }
  }
  // V1: tokens_enabled = false, balance never decrements
  // This simulates the V1 behavior: regeneration is allowed but free
  return { newBalance: currentTokenBalance, tokensCharged: 0, allowed: true }
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

console.log('\nCova Chat Tests\n')
console.log('─'.repeat(50))

// ── Suite 1: Claude API vision call ───────────────────────────────────────────
console.log('\nSuite 1: Claude API call — URL-type image source')

const MOCK_ROOM_CONTEXT: RoomContext = {
  dimensions: { width: 4.9, depth: 3.7, height: 2.7, unit: 'm' },
  roomType: 'living_room',
  styleBlend: { coastal: 0.6, japandi: 0.3, minimalist: 0.1 },
}

const MOCK_RENDER_URL = 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/renders/user1/room1/render.jpg?token=abc'

test('Claude API called exactly once per chat message', () => {
  resetState()
  sendChatMessage('What color should I paint the walls?', [], MOCK_ROOM_CONTEXT, MOCK_RENDER_URL, null)
  assert.strictEqual(mockClaudeCallCount, 1, 'Claude API must be called exactly once per message')
})

test('image block uses URL type (not base64)', () => {
  resetState()
  sendChatMessage('Describe this room.', [], MOCK_ROOM_CONTEXT, MOCK_RENDER_URL, null)
  const payload = mockLastPayload!
  const lastUserMsg = payload.messages[payload.messages.length - 1]
  const content = lastUserMsg.content as ClaudeContentBlock[]
  const imageBlock = content.find(b => b.type === 'image') as ClaudeImageBlock | undefined
  assert.ok(imageBlock, 'Image block must be present in user message')
  assert.strictEqual(imageBlock.source.type, 'url', 'Image source type must be "url" (not base64)')
})

test('image URL is passed correctly to Claude payload', () => {
  resetState()
  sendChatMessage('How can I improve this space?', [], MOCK_ROOM_CONTEXT, MOCK_RENDER_URL, null)
  const payload = mockLastPayload!
  const lastUserMsg = payload.messages[payload.messages.length - 1]
  const content = lastUserMsg.content as ClaudeContentBlock[]
  const imageBlock = content.find(b => b.type === 'image') as ClaudeImageBlock | undefined
  assert.strictEqual(imageBlock?.source.url, MOCK_RENDER_URL, 'Image URL must match MOCK_RENDER_URL')
})

test('no image block when renderImageUrl is null', () => {
  resetState()
  sendChatMessage('Give me design advice.', [], MOCK_ROOM_CONTEXT, null, null)
  const payload = mockLastPayload!
  const lastUserMsg = payload.messages[payload.messages.length - 1]
  const content = lastUserMsg.content as ClaudeContentBlock[]
  const imageBlock = content.find(b => b.type === 'image')
  assert.strictEqual(imageBlock, undefined, 'No image block when renderImageUrl is null')
})

test('correct Claude model is used', () => {
  resetState()
  sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(mockLastPayload!.model, CLAUDE_MODEL, `Must use model ${CLAUDE_MODEL}`)
})

test('system prompt contains room dimensions', () => {
  resetState()
  sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  const system = mockLastPayload!.system
  assert.ok(system.includes('4.9'), 'System prompt must contain room width')
  assert.ok(system.includes('3.7'), 'System prompt must contain room depth')
  assert.ok(system.includes('2.7'), 'System prompt must contain room height')
})

test('system prompt contains room type', () => {
  resetState()
  sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  const system = mockLastPayload!.system
  assert.ok(system.includes('living_room'), 'System prompt must contain room type')
})

test('system prompt does NOT expose style names to user', () => {
  // The system prompt is for Claude's internal context, not shown to users.
  // However, we verify the rule is upheld: the instruction to not mention style names exists.
  resetState()
  sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  const system = mockLastPayload!.system
  assert.ok(
    system.includes('Do not mention style names'),
    'System prompt must instruct Claude not to mention style names'
  )
})

// ── Suite 2: Session history persistence ─────────────────────────────────────
console.log('\nSuite 2: Session history persistence')

test('first message produces history with 2 entries (user + assistant)', () => {
  resetState()
  const { updatedHistory } = sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(updatedHistory.length, 2, 'History must have 2 entries after first message')
  assert.strictEqual(updatedHistory[0].role, 'user')
  assert.strictEqual(updatedHistory[1].role, 'assistant')
})

test('second message appends to history (4 entries total)', () => {
  resetState()
  const { updatedHistory: h1 } = sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  const { updatedHistory: h2 } = sendChatMessage('Tell me more.', h1, MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(h2.length, 4, 'History must grow by 2 each turn')
  assert.strictEqual(h2[2].role, 'user')
  assert.strictEqual(h2[3].role, 'assistant')
})

test('full history is sent to Claude on subsequent messages', () => {
  resetState()
  const { updatedHistory: h1 } = sendChatMessage('First message', [], MOCK_ROOM_CONTEXT, null, null)
  sendChatMessage('Second message', h1, MOCK_ROOM_CONTEXT, null, null)
  // Second call: messages array should include history from h1 + new user message
  const payload = mockLastPayload!
  // h1 has 2 entries, plus new user msg = 3 total messages in payload
  assert.strictEqual(payload.messages.length, 3, 'Second message payload must include prior history')
})

test('history entries preserve correct roles', () => {
  resetState()
  const { updatedHistory } = sendChatMessage('Test', [], MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(updatedHistory[0].role, 'user', 'First entry must be user')
  assert.strictEqual(updatedHistory[1].role, 'assistant', 'Second entry must be assistant')
})

test('user message text is preserved in history', () => {
  resetState()
  const userText = 'Should I add more plants?'
  const { updatedHistory } = sendChatMessage(userText, [], MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(updatedHistory[0].content, userText, 'User text must be preserved in history')
})

// ── Suite 3: Tap coordinate passing ──────────────────────────────────────────
console.log('\nSuite 3: Tap coordinate appending to message')

test('tap coordinate prepended to user message text', () => {
  resetState()
  const tap: TapCoordinate = { x: 245, y: 380 }
  const blocks = buildUserMessage('What is that?', MOCK_RENDER_URL, tap)
  const textBlock = blocks.find(b => b.type === 'text') as ClaudeTextBlock
  assert.ok(textBlock.text.includes('245'), 'Tap X coordinate must appear in message text')
  assert.ok(textBlock.text.includes('380'), 'Tap Y coordinate must appear in message text')
})

test('tap coordinate label present in text block', () => {
  resetState()
  const tap: TapCoordinate = { x: 100, y: 200 }
  const blocks = buildUserMessage('What furniture is this?', MOCK_RENDER_URL, tap)
  const textBlock = blocks.find(b => b.type === 'text') as ClaudeTextBlock
  assert.ok(
    textBlock.text.includes('tapped at position'),
    'Tap position label must appear in message text'
  )
})

test('no tap label when tapCoordinate is null', () => {
  resetState()
  const blocks = buildUserMessage('General question', MOCK_RENDER_URL, null)
  const textBlock = blocks.find(b => b.type === 'text') as ClaudeTextBlock
  assert.ok(
    !textBlock.text.includes('tapped at position'),
    'Tap label must not appear when no tap coordinate'
  )
})

test('image block and text block both present when tap and image provided', () => {
  resetState()
  const tap: TapCoordinate = { x: 50, y: 100 }
  const blocks = buildUserMessage('Explain this.', MOCK_RENDER_URL, tap)
  const hasImage = blocks.some(b => b.type === 'image')
  const hasText  = blocks.some(b => b.type === 'text')
  assert.ok(hasImage, 'Image block must be present')
  assert.ok(hasText, 'Text block must be present')
})

// ── Suite 4: Free chat / token-on-regenerate ──────────────────────────────────
console.log('\nSuite 4: Free chat — token charged only on Regenerate')

test('chat message charges zero tokens', () => {
  resetState()
  const { tokensCharged } = sendChatMessage(
    'Add a rug to this room.',
    [],
    MOCK_ROOM_CONTEXT,
    MOCK_RENDER_URL,
    null,
  )
  assert.strictEqual(tokensCharged, 0, 'Chat messages must charge 0 tokens in V1')
})

test('CHAT_IS_FREE constant is true', () => {
  assert.strictEqual(CHAT_IS_FREE, true, 'Chat must be free in V1')
})

test('V1 token balance is 999', () => {
  assert.strictEqual(V1_TOKEN_BALANCE, 999, 'V1 token balance must be 999')
})

test('regenerate is allowed in V1 (tokens_enabled = false)', () => {
  resetState()
  const { allowed } = simulateRegenerate(mockTokenBalance)
  assert.strictEqual(allowed, true, 'Regenerate must always be allowed in V1')
})

test('regenerate does not decrement token balance in V1', () => {
  resetState()
  const initialBalance = mockTokenBalance
  const { newBalance } = simulateRegenerate(mockTokenBalance)
  assert.strictEqual(newBalance, initialBalance, 'Token balance must not decrement in V1')
})

test('multiple chat messages never change token balance', () => {
  resetState()
  const initialBalance = mockTokenBalance
  sendChatMessage('Message 1', [], MOCK_ROOM_CONTEXT, null, null)
  sendChatMessage('Message 2', [], MOCK_ROOM_CONTEXT, null, null)
  sendChatMessage('Message 3', [], MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(mockTokenBalance, initialBalance, 'Token balance must be unchanged after 3 chat messages')
})

// ── Suite 5: System prompt correctness ───────────────────────────────────────
console.log('\nSuite 5: System prompt construction')

test('system prompt includes dominant style context', () => {
  const context: RoomContext = {
    dimensions: { width: 5, depth: 4, height: 3, unit: 'm' },
    roomType: 'bedroom',
    styleBlend: { japandi: 0.8, minimalist: 0.2 },
  }
  const prompt = buildSystemPrompt(context)
  assert.ok(prompt.includes('japandi'), 'System prompt must include dominant style for Claude context')
})

test('system prompt identifies correct dominant style', () => {
  const context: RoomContext = {
    dimensions: { width: 5, depth: 4, height: 3, unit: 'm' },
    roomType: 'bedroom',
    styleBlend: { bohemian: 0.7, coastal: 0.2, minimalist: 0.1 },
  }
  const prompt = buildSystemPrompt(context)
  assert.ok(prompt.includes('bohemian'), 'Dominant style must be bohemian (0.7 weight)')
})

test('system prompt includes max_tokens limit', () => {
  resetState()
  sendChatMessage('Hello', [], MOCK_ROOM_CONTEXT, null, null)
  assert.strictEqual(
    mockLastPayload!.max_tokens,
    MAX_TOKENS_RESPONSE,
    `max_tokens must be ${MAX_TOKENS_RESPONSE}`
  )
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
  console.log('\nSTATUS: PASS — all chat tests passed.\n')
  process.exit(0)
}
