/**
 * generate-stock-photos.ts
 *
 * Generates 3 stock room photos via Replicate FLUX, uploads them to
 * Supabase Storage (bucket: room-photos), and writes the public URLs
 * into apps/web/.env.local.
 *
 * Usage: npx tsx scripts/generate-stock-photos.ts
 *        (or: npx ts-node --esm scripts/generate-stock-photos.ts)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// Load env from root .env.local
const rootEnv = path.join(path.dirname(process.argv[1]!), '..', '.env.local')
config({ path: rootEnv })

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WEB_ENV_PATH = path.join(path.dirname(process.argv[1]!), '..', 'apps', 'web', '.env.local')

if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set')
if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Room definitions ─────────────────────────────────────────────────────────

const ROOMS = [
  {
    key: 'NEXT_PUBLIC_STOCK_LIVING_ROOM_URL',
    filename: 'living-room-stock.jpg',
    label: 'Living Room',
    prompt: `Photorealistic architectural interior photography, wide angle 35mm lens, \
minimalist living room, light-filled with soft natural daylight streaming \
from a large floor-to-ceiling window on the left wall casting gentle shadows, \
off-white matte walls with subtle texture, light natural oak hardwood floors \
with visible wood grain running horizontally, a simple low-profile linen sofa \
in warm greige centered against the back wall with clean straight lines, \
a small rectangular natural wood coffee table in front of the sofa, \
no wall art, no plants, no decorative objects, no throw pillows, \
no rugs, ceiling is plain white with recessed lighting unlit, \
room feels spacious and empty with lots of redesignable surface area, \
shot from the opposite corner at standing eye level, \
neutral color palette of whites creams and light wood tones throughout, \
ultra sharp focus, no motion blur, no lens distortion, \
photorealistic not CGI, natural shadows, no artificial lighting, \
architectural digest editorial quality, 4k resolution`,
  },
  {
    key: 'NEXT_PUBLIC_STOCK_BEDROOM_URL',
    filename: 'bedroom-stock.jpg',
    label: 'Bedroom',
    prompt: `Photorealistic architectural interior photography, wide angle 35mm lens, \
minimalist bedroom, soft diffused natural daylight from a window on the \
right wall, off-white smooth matte walls, light natural oak hardwood floors, \
a simple queen bed with a plain white fitted sheet and flat white duvet \
centered against the back wall with a low natural wood headboard, \
no pillows except two flat white sleeping pillows, \
two identical minimal natural wood nightstands flanking the bed, \
no lamps, no wall art, no plants, no rugs, no clutter on nightstands, \
ceiling is plain white, closet doors if visible are plain white flush panels, \
room feels open and spacious with empty walls ready to be redesigned, \
shot from the foot of the bed at standing eye level facing the headboard wall, \
neutral color palette of whites and light natural wood tones, \
ultra sharp focus, photorealistic not CGI, natural shadows only, \
no artificial lighting, architectural digest editorial quality, 4k resolution`,
  },
  {
    key: 'NEXT_PUBLIC_STOCK_HOME_OFFICE_URL',
    filename: 'home-office-stock.jpg',
    label: 'Home Office',
    prompt: `Photorealistic architectural interior photography, wide angle 35mm lens, \
minimalist home office, bright natural daylight from a window on the left wall, \
off-white smooth matte walls, light natural oak hardwood floors, \
a simple wide rectangular light oak wood desk pushed flush against the back wall \
with nothing on it, a plain white or light grey upholstered task chair \
tucked under the desk, no monitor no computer no keyboard no cables, \
no shelves, no books, no plants, no wall art, no rugs, no clutter anywhere, \
ceiling is plain white, room feels open bright and completely empty \
except for the desk and chair leaving maximum space for redesign, \
shot from the opposite wall at standing eye level facing the desk, \
neutral color palette of whites creams and light natural wood tones only, \
ultra sharp focus, photorealistic not CGI, natural window light only \
no artificial lighting, architectural digest editorial quality, 4k resolution`,
  },
]

// ── Replicate helpers ────────────────────────────────────────────────────────

async function createPrediction(prompt: string): Promise<string> {
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'black-forest-labs/flux-1.1-pro',
      input: {
        prompt,
        width: 1344,
        height: 768,
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Replicate create failed: ${res.status} ${err}`)
  }
  const data = await res.json() as { id: string; urls: { get: string } }
  return data.urls.get
}

async function pollPrediction(pollUrl: string): Promise<string> {
  while (true) {
    await sleep(3000)
    const res = await fetch(pollUrl, {
      headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Replicate poll failed: ${res.status} ${err}`)
    }
    const data = await res.json() as {
      status: string
      output?: string | string[]
      error?: string
    }
    console.log(`  status: ${data.status}`)
    if (data.status === 'succeeded') {
      const out = data.output
      const url = Array.isArray(out) ? out[0] : out
      if (!url) throw new Error('No output URL in succeeded prediction')
      return url
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Prediction ${data.status}: ${data.error ?? 'unknown error'}`)
    }
    // still processing — keep polling
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from('room-photos')
    .upload(filename, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })
  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data } = supabase.storage.from('room-photos').getPublicUrl(filename)
  return data.publicUrl
}

// ── .env.local writer ────────────────────────────────────────────────────────

function updateEnvLocal(updates: Record<string, string>): void {
  let content = fs.existsSync(WEB_ENV_PATH)
    ? fs.readFileSync(WEB_ENV_PATH, 'utf-8')
    : ''

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm')
    const line = `${key}=${value}`
    if (regex.test(content)) {
      content = content.replace(regex, line)
    } else {
      content += `\n${line}`
    }
  }

  fs.writeFileSync(WEB_ENV_PATH, content, 'utf-8')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Generating stock room photos via Replicate FLUX ===\n')

  const urlMap: Record<string, string> = {}

  for (const room of ROOMS) {
    console.log(`[${room.label}] Creating prediction...`)
    const pollUrl = await createPrediction(room.prompt)
    console.log(`[${room.label}] Polling ${pollUrl}`)

    const imageUrl = await pollPrediction(pollUrl)
    console.log(`[${room.label}] Image ready: ${imageUrl}`)

    console.log(`[${room.label}] Downloading...`)
    const buffer = await downloadImage(imageUrl)
    console.log(`[${room.label}] Downloaded ${buffer.length} bytes`)

    console.log(`[${room.label}] Uploading to Supabase Storage (room-photos/${room.filename})...`)
    const publicUrl = await uploadToSupabase(buffer, room.filename)
    console.log(`[${room.label}] Public URL: ${publicUrl}\n`)

    urlMap[room.key] = publicUrl
  }

  console.log('Writing URLs to apps/web/.env.local...')
  updateEnvLocal(urlMap)

  console.log('\n=== Done ===\n')
  for (const room of ROOMS) {
    console.log(`${room.label}:`)
    console.log(`  ${room.key}=${urlMap[room.key]}\n`)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
