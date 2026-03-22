/**
 * retry-failed-cards.ts
 *
 * Retries the 22 cards that failed in the initial generate-swipe-cards.ts run.
 * Uses a 20s inter-card delay (ultra-conservative for burst=1 rate limit).
 *
 * Usage:
 *   cd scripts
 *   tsx retry-failed-cards.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env.local')

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!REPLICATE_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: REPLICATE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const STORAGE_BUCKET = 'swipe-cards'

// ---------------------------------------------------------------------------
// Failed cards from the initial run
// ---------------------------------------------------------------------------

const FAILED_CARDS: Array<{ roomType: string; style: string; cardNum: number }> = [
  { roomType: 'dining_room', style: 'coastal',     cardNum: 8  },
  { roomType: 'dining_room', style: 'coastal',     cardNum: 9  },
  { roomType: 'dining_room', style: 'coastal',     cardNum: 12 },
  { roomType: 'dining_room', style: 'coastal',     cardNum: 14 },
  { roomType: 'dining_room', style: 'coastal',     cardNum: 17 },
  { roomType: 'dining_room', style: 'japandi',     cardNum: 13 },
  { roomType: 'dining_room', style: 'bohemian',    cardNum: 3  },
  { roomType: 'dining_room', style: 'bohemian',    cardNum: 6  },
  { roomType: 'dining_room', style: 'bohemian',    cardNum: 9  },
  { roomType: 'dining_room', style: 'bohemian',    cardNum: 10 },
  { roomType: 'dining_room', style: 'bohemian',    cardNum: 16 },
  { roomType: 'dining_room', style: 'mid_century', cardNum: 3  },
  { roomType: 'dining_room', style: 'minimalist',  cardNum: 5  },
  { roomType: 'home_office', style: 'coastal',     cardNum: 11 },
  { roomType: 'home_office', style: 'coastal',     cardNum: 12 },
  { roomType: 'home_office', style: 'coastal',     cardNum: 15 },
  { roomType: 'home_office', style: 'coastal',     cardNum: 18 },
  { roomType: 'home_office', style: 'japandi',     cardNum: 1  },
  { roomType: 'home_office', style: 'japandi',     cardNum: 2  },
  { roomType: 'home_office', style: 'japandi',     cardNum: 4  },
  { roomType: 'home_office', style: 'japandi',     cardNum: 5  },
  { roomType: 'home_office', style: 'japandi',     cardNum: 6  },
]

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  db: { schema: 'public' },
})

// ---------------------------------------------------------------------------
// Replicate helpers
// ---------------------------------------------------------------------------

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string[]
  error?: string
}

async function createPrediction(prompt: string): Promise<string> {
  const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: '4:3',
        output_format: 'jpg',
        output_quality: 85,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    if (response.status === 429) {
      let retryAfter = 60
      try {
        const parsed = JSON.parse(body)
        if (typeof parsed.retry_after === 'number') retryAfter = parsed.retry_after
      } catch {}
      const headerVal = response.headers.get('retry-after')
      if (headerVal && !isNaN(Number(headerVal))) retryAfter = Number(headerVal)
      throw new RateLimitError(`Replicate rate limit (429): ${body}`, retryAfter)
    }
    throw new Error(`Replicate API error ${response.status}: ${body}`)
  }

  const prediction = (await response.json()) as ReplicatePrediction

  if (prediction.status === 'succeeded' && prediction.output?.[0]) {
    return prediction.output[0]
  }

  return pollPrediction(prediction.id)
}

async function pollPrediction(id: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(2000)
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    })
    if (!response.ok) throw new Error(`Poll error ${response.status}`)
    const prediction = (await response.json()) as ReplicatePrediction
    if (prediction.status === 'succeeded') {
      const url = prediction.output?.[0]
      if (!url) throw new Error(`Prediction ${id} succeeded but has no output`)
      return url
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction ${id} ${prediction.status}: ${prediction.error ?? ''}`)
    }
  }
  throw new Error(`Prediction ${id} timed out`)
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class RateLimitError extends Error {
  retryAfterMs: number
  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.name = 'RateLimitError'
    // Add a generous 15s buffer above the stated reset time
    this.retryAfterMs = (retryAfterSeconds + 15) * 1000
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 5000): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      const waitMs = lastError instanceof RateLimitError ? lastError.retryAfterMs : delayMs
      console.warn(`  Attempt ${attempt}/${retries} failed: ${lastError.message}`)
      if (attempt < retries) {
        console.warn(`  Waiting ${waitMs / 1000}s before retry...`)
        await sleep(waitMs)
      }
    }
  }
  throw lastError
}

function buildPrompt(style: string, roomType: string): string {
  const styleLabel = style.replace('_', '-')
  const roomLabel = roomType.replace(/_/g, ' ')
  return `${styleLabel} style ${roomLabel}, interior design, photorealistic, no people, no text, natural lighting, high quality`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const total = FAILED_CARDS.length
  let succeeded = 0
  let failed = 0

  console.log(`Retrying ${total} failed swipe cards`)
  console.log('Inter-card delay: 20s (conservative for burst=1 rate limit)')
  console.log('─'.repeat(60))

  for (let i = 0; i < FAILED_CARDS.length; i++) {
    const { roomType, style, cardNum } = FAILED_CARDS[i]
    const storagePath = `${roomType}/${style}/card-${cardNum}.jpg`
    const prompt = buildPrompt(style, roomType)

    console.log(`\n[${i + 1}/${total}] ${storagePath}`)

    try {
      const imageUrl = await withRetry(() => createPrediction(prompt))
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error(`Download failed: ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
      const publicUrl = data.publicUrl

      const { error: dbError } = await supabase.schema('public').from('swipe_cards').insert({
        room_type: roomType,
        style,
        image_url: publicUrl,
      })
      if (dbError) throw new Error(`DB insert failed: ${dbError.message}`)

      console.log(`  ✓ Done`)
      succeeded++
    } catch (err) {
      console.error(`  ✗ ERROR: ${(err as Error).message}`)
      failed++
    }

    if (i < FAILED_CARDS.length - 1) {
      await sleep(20000)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`Done. ${succeeded} succeeded, ${failed} failed out of ${total}.`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
