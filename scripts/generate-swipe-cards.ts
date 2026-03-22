/**
 * generate-swipe-cards.ts
 *
 * Generates 400 AI room images (5 styles × 4 room types × 20 cards) using
 * the Replicate flux-schnell model, uploads them to Supabase storage, and
 * inserts records into the swipe_cards table.
 *
 * Usage:
 *   cd scripts
 *   tsx generate-swipe-cards.ts
 *
 * Required env vars (from .env.local in repo root):
 *   REPLICATE_API_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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
  console.error(
    'Missing required env vars: REPLICATE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
  )
  process.exit(1)
}

const STYLES = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'] as const
const ROOM_TYPES = ['living_room', 'bedroom', 'dining_room', 'home_office'] as const
const CARDS_PER_COMBO = 20
const STORAGE_BUCKET = 'swipe-cards'

type Style = typeof STYLES[number]
type RoomType = typeof ROOM_TYPES[number]

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
      let retryAfter = 60 // fallback
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

  // If the Prefer: wait header worked, output is already available
  if (prediction.status === 'succeeded' && prediction.output?.[0]) {
    return prediction.output[0]
  }

  // Otherwise poll until done
  return pollPrediction(prediction.id)
}

async function pollPrediction(id: string): Promise<string> {
  const maxAttempts = 60
  const intervalMs = 2000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs)

    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    })

    if (!response.ok) {
      throw new Error(`Poll error ${response.status}`)
    }

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

  throw new Error(`Prediction ${id} timed out after ${maxAttempts} attempts`)
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

async function downloadImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url}: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function uploadToSupabase(
  buffer: Buffer,
  storagePath: string
): Promise<string> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`)

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

async function insertSwipeCard(
  roomType: RoomType,
  style: Style,
  imageUrl: string
): Promise<void> {
  const { error } = await supabase.schema('public').from('swipe_cards').insert({
    room_type: roomType,
    style,
    image_url: imageUrl,
  })

  if (error) throw new Error(`DB insert failed: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(style: Style, roomType: RoomType): string {
  const styleLabel = style.replace('_', '-')
  const roomLabel = roomType.replace(/_/g, ' ')
  return `${styleLabel} style ${roomLabel}, interior design, photorealistic, no people, no text, natural lighting, high quality`
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
    this.retryAfterMs = (retryAfterSeconds + 10) * 1000
  }
}

// Simple retry wrapper — honours RateLimitError.retryAfterMs over the default delay
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delayMs = 5000
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      const waitMs =
        lastError instanceof RateLimitError ? lastError.retryAfterMs : delayMs
      console.warn(`  Attempt ${attempt}/${retries} failed: ${lastError.message}`)
      if (attempt < retries) {
        console.warn(`  Waiting ${waitMs / 1000}s before retry...`)
        await sleep(waitMs)
      }
    }
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const total = STYLES.length * ROOM_TYPES.length * CARDS_PER_COMBO
  let completed = 0
  let failed = 0

  console.log(`Starting generation of ${total} swipe card images`)
  console.log(`Styles: ${STYLES.join(', ')}`)
  console.log(`Room types: ${ROOM_TYPES.join(', ')}`)
  console.log(`Cards per combination: ${CARDS_PER_COMBO}`)
  console.log('─'.repeat(60))

  for (const roomType of ROOM_TYPES) {
    for (const style of STYLES) {
      const prompt = buildPrompt(style, roomType)
      console.log(`\n[${roomType}/${style}] Generating ${CARDS_PER_COMBO} cards...`)
      console.log(`  Prompt: "${prompt}"`)

      for (let cardNum = 1; cardNum <= CARDS_PER_COMBO; cardNum++) {
        const storagePath = `${roomType}/${style}/card-${cardNum}.jpg`

        try {
          // Generate image
          const imageUrl = await withRetry(() => createPrediction(prompt))

          // Download image buffer
          const buffer = await withRetry(() => downloadImageBuffer(imageUrl))

          // Upload to Supabase storage
          const publicUrl = await withRetry(() => uploadToSupabase(buffer, storagePath))

          // Insert DB record
          await withRetry(() => insertSwipeCard(roomType, style, publicUrl))

          completed++

          if (completed % 10 === 0) {
            console.log(
              `  Progress: ${completed}/${total} images generated (${failed} failed)`
            )
          }
        } catch (err) {
          failed++
          console.error(
            `  ERROR [${storagePath}]: ${(err as Error).message}`
          )
        }

        // 12s delay keeps requests safely under 6/min regardless of account tier
        await sleep(12000)
      }

      console.log(`  Finished [${roomType}/${style}]`)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`Done. ${completed} succeeded, ${failed} failed out of ${total} total.`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
