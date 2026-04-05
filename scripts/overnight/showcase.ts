import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: 'apps/web/.env.local' })

import { createClient } from '@supabase/supabase-js'
import Replicate from 'replicate'
import pLimit from 'p-limit'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { RunState } from './types'
import { log, incrementStat } from './logger'
import { saveState } from './state'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// ─── 12 Named Styles (from apps/web/app/api/quiz/fingerprint/route.ts) ────────
interface StyleDef {
  name: string
  slug: string
  center: number[] // 10-dim fingerprint vector
}

const STYLES: StyleDef[] = [
  { name: 'Warm Japandi',        slug: 'warm-japandi',        center: [0.75, 0.2, 0.8, 0.75, 0.45, 0.7, 0.35, 0.7, 0.35, 0.65] },
  { name: 'Organic Modern',      slug: 'organic-modern',      center: [0.7, 0.45, 0.75, 0.8, 0.25, 0.7, 0.5, 0.75, 0.5, 0.7] },
  { name: 'Scandi Hygge',        slug: 'scandi-hygge',        center: [0.6, 0.5, 0.3, 0.5, 0.25, 0.65, 0.35, 0.5, 0.35, 0.55] },
  { name: 'Coastal Light',       slug: 'coastal-light',       center: [0.85, 0.3, 0.5, 0.65, 0.2, 0.45, 0.5, 0.6, 0.3, 0.45] },
  { name: 'Bohemian Layered',    slug: 'bohemian-layered',    center: [0.5, 0.8, 0.7, 0.7, 0.5, 0.8, 0.45, 0.85, 0.65, 0.8] },
  { name: 'Dark Luxe',           slug: 'dark-luxe',           center: [0.2, 0.5, 0.65, 0.45, 0.65, 0.75, 0.25, 0.35, 0.45, 0.55] },
  { name: 'Heritage Maximalist', slug: 'heritage-maximalist', center: [0.45, 0.85, 0.65, 0.4, 0.85, 0.75, 0.55, 0.5, 0.55, 0.7] },
  { name: 'Zen Sanctuary',       slug: 'zen-sanctuary',       center: [0.8, 0.1, 0.5, 0.65, 0.2, 0.2, 0.3, 0.5, 0.15, 0.35] },
  { name: 'Industrial Edge',     slug: 'industrial-edge',     center: [0.3, 0.45, 0.2, 0.15, 0.2, 0.3, 0.5, 0.1, 0.3, 0.2] },
  { name: 'Moody Eclectic',      slug: 'moody-eclectic',      center: [0.15, 0.8, 0.6, 0.5, 0.7, 0.75, 0.4, 0.55, 0.7, 0.65] },
  { name: 'Parisian Chic',       slug: 'parisian-chic',       center: [0.55, 0.5, 0.5, 0.45, 0.65, 0.5, 0.5, 0.4, 0.3, 0.5] },
  { name: 'Desert Modern',       slug: 'desert-modern',       center: [0.75, 0.25, 0.8, 0.2, 0.2, 0.7, 0.45, 0.45, 0.55, 0.6] },
]

const ROOM_TYPES = ['living_room', 'bedroom', 'home_office', 'studio'] as const
type ShowcaseRoomType = typeof ROOM_TYPES[number]

// Stock photo URLs per room type (reliable Unsplash sources)
const STOCK_PHOTOS: Record<ShowcaseRoomType, string[]> = {
  living_room: [
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1024',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1024',
  ],
  bedroom: [
    'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1024',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1024',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1024',
  ],
  home_office: [
    'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=1024',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1024',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1024',
  ],
  studio: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1024',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1024',
    'https://images.unsplash.com/photo-1537726235470-8504e3beef77?w=1024',
  ],
}

// Inline the buildFluxPrompt logic (avoids cross-project import)
function dimDesc(value: number, high: string, mid: string, low: string): string {
  if (value >= 0.7) return high
  if (value <= 0.3) return low
  return mid
}

function buildFluxPrompt(fingerprint: number[], roomType: string): { positive: string; negative: string } {
  const [luminosity, density, temperature, form, era, texture, scale, nature, saturation, materialOrigin] = fingerprint

  const styleDescriptors = [
    dimDesc(luminosity ?? 0.5, 'bright airy flooded with natural light', 'comfortable balanced lighting', 'moody dramatic intimate lighting'),
    dimDesc(density ?? 0.5, 'richly layered maximalist curated objects', 'well-furnished comfortable', 'minimal breathing space intentional emptiness'),
    dimDesc(temperature ?? 0.5, 'warm amber tones honey wood terracotta', 'neutral balanced temperature', 'cool slate concrete steel cool whites'),
    dimDesc(form ?? 0.5, 'organic curves natural materials rattan linen', 'balanced forms', 'geometric precision clean lines structured'),
    dimDesc(era ?? 0.5, 'classic heritage antique traditional craft', 'transitional timeless', 'contemporary cutting edge ultra-modern'),
    dimDesc(texture ?? 0.5, 'tactile richness chunky knits rough linen stone', 'balanced texture', 'smooth surfaces polished lacquered sleek'),
    dimDesc(scale ?? 0.5, 'grand expansive high ceilings statement pieces', 'comfortable proportions', 'intimate cozy human scale nook-like'),
    dimDesc(nature ?? 0.5, 'abundant plants biophilic natural wood stone', 'few natural elements', 'urban manufactured no plants industrial'),
    dimDesc(saturation ?? 0.5, 'bold rich color jewel tones confident palette', 'moderate color presence', 'monochromatic muted tonal restrained'),
    dimDesc(materialOrigin ?? 0.5, 'artisan handmade pottery woven craft visible', 'mix of handmade and manufactured', 'precision manufactured factory perfect'),
  ].join(', ')

  const positive = [
    `Photorealistic interior design render of a ${roomType.replace('_', ' ')}.`,
    styleDescriptors,
    'quality mid-range furniture, good materials and solid construction',
    'Professional interior photography, perfect lighting, high resolution, magazine quality.',
  ].join(' ')

  const negative = 'distorted walls, wrong perspective, AI artifacts, blurry, low quality, watermark, text overlay, cartoon, illustration, fisheye lens, extreme distortion, multiple rooms, people, faces, animals'

  return { positive, negative }
}

async function generateRender(
  photoUrl: string,
  prompt: string,
  _negativePrompt: string
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: 'black-forest-labs/flux-kontext-pro',
    input: {
      prompt,
      input_image: photoUrl,
      guidance: 7.5,
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })

  // Poll until complete (max 120s)
  const deadline = Date.now() + 120_000
  let finalPrediction = prediction

  while (Date.now() < deadline) {
    if (finalPrediction.status === 'succeeded' || finalPrediction.status === 'failed' || finalPrediction.status === 'canceled') {
      break
    }
    await new Promise((r) => setTimeout(r, 5000))
    finalPrediction = await replicate.predictions.get(prediction.id)
  }

  if (finalPrediction.status !== 'succeeded' || !finalPrediction.output) {
    throw new Error(`FLUX render failed/timed out: ${finalPrediction.status}`)
  }

  const output = finalPrediction.output
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output.length > 0) return String(output[0])

  throw new Error('Unexpected FLUX output format')
}

const SHOWCASE_URLS_FILE = path.join(process.cwd(), 'docs', 'sessions', 'showcase-urls.md')

function appendShowcaseUrl(styleName: string, roomType: string, index: number, url: string): void {
  const line = `- **${styleName}** × ${roomType} [${index + 1}]: ${url}\n`
  try {
    fs.appendFileSync(SHOWCASE_URLS_FILE, line)
  } catch {
    // ignore
  }
}

export async function runShowcase(state: RunState): Promise<void> {
  log('SHOWCASE', 'INFO', 'Showcase generation starting — 12 styles × 4 rooms × 3 renders = 144 total')

  // Ensure showcase bucket exists
  try {
    await supabase.storage.createBucket('showcase', { public: true })
    log('SHOWCASE', 'INFO', 'Created showcase storage bucket')
  } catch {
    // Bucket already exists — safe to ignore
  }

  // Verify bucket is accessible
  try {
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = buckets?.some((b) => b.name === 'showcase')
    log('SHOWCASE', exists ? 'SUCCESS' : 'ERROR', exists ? 'Showcase bucket confirmed' : 'Showcase bucket creation failed — uploads may fail')
  } catch {
    log('SHOWCASE', 'WARN', 'Could not verify showcase bucket — proceeding anyway')
  }

  // Init showcase URLs file
  if (!fs.existsSync(SHOWCASE_URLS_FILE)) {
    fs.writeFileSync(SHOWCASE_URLS_FILE, '# Showcase Render URLs\n\n')
  }

  const limit = pLimit(4) // 4 simultaneous FLUX renders

  const tasks: Array<{ style: StyleDef; roomType: ShowcaseRoomType; index: number }> = []

  for (const style of STYLES) {
    for (const roomType of ROOM_TYPES) {
      for (let i = 0; i < 3; i++) {
        tasks.push({ style, roomType, index: i })
      }
    }
  }

  let completed = 0

  await Promise.allSettled(
    tasks.map(({ style, roomType, index }) =>
      limit(async () => {
        const showcaseKey = `${style.slug}:${roomType}:${index}`

        if (state.showcase_completed.includes(showcaseKey)) {
          log('SHOWCASE', 'INFO', `Skipping already completed: ${showcaseKey}`)
          completed++
          return
        }

        try {
          const photoUrl = STOCK_PHOTOS[roomType][index] ?? STOCK_PHOTOS[roomType][0]!
          const { positive, negative } = buildFluxPrompt(style.center, roomType)

          const renderUrl = await generateRender(photoUrl, positive, negative)

          // Download render
          let imageData: Buffer
          try {
            const response = await axios.get<Buffer>(renderUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
            })
            imageData = Buffer.from(response.data)
          } catch {
            // If we can't download, save URL directly
            appendShowcaseUrl(style.name, roomType, index, renderUrl)
            state.showcase_completed.push(showcaseKey)
            saveState(state)
            incrementStat('showcaseGenerated')
            log('SHOWCASE', 'SUCCESS', `Generated (no download): ${style.name} × ${roomType} [${index + 1}]`)
            completed++
            return
          }

          // Upload to Supabase Storage
          const storagePath = `showcase/${style.slug}/${roomType}/${index}.jpg`
          const { error: uploadError } = await supabase.storage
            .from('showcase')
            .upload(storagePath, imageData, {
              contentType: 'image/jpeg',
              upsert: true,
            })

          let publicUrl: string
          if (uploadError) {
            // Bucket might not exist — record the Replicate URL instead
            log('SHOWCASE', 'WARN', `Showcase storage upload failed: ${uploadError.message} — recording Replicate URL`)
            publicUrl = renderUrl
          } else {
            const { data: urlData } = supabase.storage.from('showcase').getPublicUrl(storagePath)
            publicUrl = urlData.publicUrl
          }

          appendShowcaseUrl(style.name, roomType, index, publicUrl)
          state.showcase_completed.push(showcaseKey)
          saveState(state)
          incrementStat('showcaseGenerated')

          log('SHOWCASE', 'SUCCESS', `Generated: ${style.name} × ${roomType} [${index + 1}/3] (${completed + 1}/${tasks.length})`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log('SHOWCASE', 'ERROR', `Failed: ${style.name} × ${roomType} [${index + 1}]: ${msg}`)
        }

        completed++
      })
    )
  )

  log('SHOWCASE', 'SUCCESS', `Showcase complete: ${state.showcase_completed.length}/144 renders generated`)
}
