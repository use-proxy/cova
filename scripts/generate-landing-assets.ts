/**
 * generate-landing-assets.ts
 *
 * Generates all landing page images via Replicate FLUX 1.1 Pro,
 * uploads to Supabase Storage bucket "landing-assets" (public),
 * and writes all URLs to scripts/landing-urls.json
 *
 * Usage: npx tsx scripts/generate-landing-assets.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

const webEnv = path.join(path.dirname(process.argv[1]!), '..', 'apps', 'web', '.env.local')
config({ path: webEnv })

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set')
if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const IMAGES: { key: string; storagePath: string; prompt: string }[] = [
  // ── ROOM CARDS ──────────────────────────────────────────────────────────────
  {
    key: 'room-cards/living-room',
    storagePath: 'room-cards/living-room.jpg',
    prompt: `Photorealistic interior photography, inviting living room, comfortable linen sofa against off-white wall, light oak hardwood floors, natural daylight streaming from left window, one coffee table, one floor lamp, soft shadows, wide angle 35mm lens, warm neutral palette, lived-in but tidy, 4k, architectural digest quality, photorealistic not CGI`,
  },
  {
    key: 'room-cards/bedroom',
    storagePath: 'room-cards/bedroom.jpg',
    prompt: `Photorealistic interior photography, serene bedroom, queen bed with white linen bedding centered against off-white wall, light oak headboard, natural daylight from right window, two oak nightstands, soft morning light, peaceful atmosphere, wide angle 35mm lens, neutral warm palette, 4k, architectural digest quality, photorealistic not CGI`,
  },
  {
    key: 'room-cards/studio',
    storagePath: 'room-cards/studio.jpg',
    prompt: `Photorealistic interior photography, compact studio apartment, open plan layout visible, small sofa and sleeping area in same frame, kitchen counter glimpsed in background, off-white walls, light floors, natural daylight, functional and cozy, wide angle 35mm lens, neutral palette, 4k, photorealistic not CGI`,
  },
  {
    key: 'room-cards/home-office',
    storagePath: 'room-cards/home-office.jpg',
    prompt: `Photorealistic interior photography, productive home office, wide oak desk against off-white wall, comfortable task chair, natural daylight from large window left side, organized minimal desktop, one bookshelf visible, warm neutral palette, wide angle 35mm lens, 4k, architectural digest quality, photorealistic not CGI`,
  },
  {
    key: 'room-cards/dining-room',
    storagePath: 'room-cards/dining-room.jpg',
    prompt: `Photorealistic interior photography, elegant dining room, rectangular oak dining table with six simple chairs, off-white walls, light oak floors, natural daylight, pendant light above table, nothing on walls yet, wide angle 35mm lens, neutral warm palette, 4k, architectural digest quality, photorealistic not CGI`,
  },
  {
    key: 'room-cards/bathroom',
    storagePath: 'room-cards/bathroom.jpg',
    prompt: `Photorealistic interior photography, clean bathroom, freestanding white oval bathtub, off-white subway tiles, natural stone floor, frosted window with natural light, simple chrome fixtures, one plant on windowsill, wide angle 35mm lens, 4k, photorealistic not CGI, architectural digest quality`,
  },
  {
    key: 'room-cards/outdoor',
    storagePath: 'room-cards/outdoor.jpg',
    prompt: `Photorealistic exterior photography, pleasant outdoor terrace or patio, simple wooden decking, white rendered garden wall, one simple outdoor sofa with cushions, string lights overhead unlit, plants in pots, afternoon light, wide angle 35mm lens, 4k, photorealistic not CGI, lifestyle photography quality`,
  },
  {
    key: 'room-cards/dorm-room',
    storagePath: 'room-cards/dorm-room.jpg',
    prompt: `Photorealistic interior photography, compact college dorm room, single bed against white wall with simple bedding, small desk beside it with lamp, neutral walls, natural daylight from window, tidy and functional, one shelf above desk, wide angle 35mm lens, 4k, photorealistic not CGI`,
  },
  {
    key: 'room-cards/first-apartment',
    storagePath: 'room-cards/first-apartment.jpg',
    prompt: `Photorealistic interior photography, charming first apartment living space, small comfortable sofa, open kitchen visible in background, off-white walls, light floors, natural daylight, compact but well-laid-out, one rug on floor, wide angle 35mm lens, warm neutral palette, 4k, photorealistic not CGI, lifestyle photography quality`,
  },

  // ── HERO BEFORE/AFTER ────────────────────────────────────────────────────────
  {
    key: 'hero/before-neutral',
    storagePath: 'hero/before-neutral.jpg',
    prompt: `Photorealistic interior photography, neutral empty living room, basic beige fabric sofa against plain white wall, generic laminate flooring, harsh overhead fluorescent light, no art no plants no personality, flat and uninspiring, feels like a rental with default furniture, wide angle 35mm, slightly desaturated cold tones, 4k, photorealistic`,
  },
  {
    key: 'hero/after-nordic-minimal',
    storagePath: 'hero/after-nordic-minimal.jpg',
    prompt: `Photorealistic architectural interior photography, Nordic minimal living room, low-profile pale oak sofa with clean straight lines and linen upholstery in off-white, pale blonde oak hardwood floors with visible grain, pure white walls with perfect plaster texture, single large abstract artwork in muted grey and cream, one concrete pendant light centered overhead casting soft diffused light, thin wool rug in light grey, two minimal side tables in pale birch, zero clutter, floor-to-ceiling white curtains diffusing natural light, crisp cool daylight, calm and considered, Kinfolk magazine aesthetic, wide angle 35mm lens, 4k, photorealistic not CGI, architectural digest`,
  },
  {
    key: 'hero/after-warm-japandi',
    storagePath: 'hero/after-warm-japandi.jpg',
    prompt: `Photorealistic architectural interior photography, warm japandi living room, low-profile sofa in warm greige linen with natural wood legs, light honey oak hardwood floors, off-white walls with subtle warm undertone, one large ceramic vase with dried pampas grass floor piece, woven rattan pendant light overhead with warm amber glow, tatami-inspired wool rug in natural undyed fiber, bonsai tree on low side table, shoji-inspired curtains in raw linen filtering warm afternoon light, handthrown ceramic objects on coffee table, deeply peaceful and considered, warm and grounding, wide angle 35mm lens, 4k, photorealistic not CGI, architectural digest, kinfolk aesthetic`,
  },
  {
    key: 'hero/after-organic-modern',
    storagePath: 'hero/after-organic-modern.jpg',
    prompt: `Photorealistic architectural interior photography, organic modern living room, large curved bouclé sofa in warm cream with soft rounded arms, terracotta and warm white walls, wide plank light oak floors, sculptural organic coffee table in travertine stone, arched doorway visible in background, oversized fiddle leaf fig tree in terracotta pot, warm linen curtains floor to ceiling, curved arc floor lamp in brass with cream shade casting warm glow, abstract earthy artwork above sofa in terracotta and sage tones, handmade ceramic objects on coffee table, biophilic and warm, sophisticated yet relaxed, wide angle 35mm lens, 4k, photorealistic not CGI, architectural digest quality`,
  },

  // ── PERSON TAKING PHOTO ──────────────────────────────────────────────────────
  {
    key: 'person-taking-photo',
    storagePath: 'person-taking-photo.jpg',
    prompt: `Lifestyle photography, person seen from behind in foreground holding up a modern smartphone with both hands, photographing their living room, the living room is fully visible in front of them and takes up 70% of the frame, room is a pleasant neutral living room with sofa and natural light, person is casually dressed in neutral tones, their head and shoulders visible in bottom-center of frame, phone screen gently glowing, warm natural daylight, shallow depth of field with room in focus, candid and natural feel, not staged, editorial photography, 35mm lens, 4k, photorealistic, lifestyle magazine quality`,
  },

  // ── SHOPPABLE RENDER ─────────────────────────────────────────────────────────
  {
    key: 'shoppable-render',
    storagePath: 'shoppable-render.jpg',
    prompt: `Photorealistic architectural interior photography, warm japandi styled living room, designed for product photography clarity, low-profile greige linen sofa positioned center-left against warm white wall, round travertine coffee table directly in front of sofa in center foreground fully visible from above angle, tall brass arc floor lamp on far right side of frame with cream shade, full lamp height visible from base to shade, light oak hardwood floors, warm afternoon light from left window, minimal clutter, everything clearly visible and distinguishable, wide angle 35mm, product photography lighting quality, 4k, photorealistic not CGI, clean editorial`,
  },

  // ── SMART ROOM ───────────────────────────────────────────────────────────────
  {
    key: 'smart-room',
    storagePath: 'smart-room.jpg',
    prompt: `Photorealistic interior photography, modern living room with integrated smart home technology, large 65-inch flat screen TV mounted prominently on center back wall displaying a dark ambient screensaver, sleek black soundbar centered directly beneath TV on floating media console, three warm amber pendant smart lights hanging from ceiling clearly illuminated casting warm pools of light, gaming desk setup in right foreground with ultrawide curved monitor showing subtle RGB purple glow at edges and mechanical keyboard with soft RGB lighting, dark navy and warm wood interior, sophisticated and cohesive, all four tech items clearly visible and spatially separated, wide angle 35mm lens, 4k, photorealistic not CGI, interior design photography`,
  },
]

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateImage(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Create prediction
      const createRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'black-forest-labs/flux-1.1-pro',
          input: {
            prompt,
            width: 1344,
            height: 768,
            num_inference_steps: 28,
          },
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`Create prediction failed: ${err}`)
      }

      const prediction = await createRes.json() as { id: string; status: string; output?: string | string[]; error?: string }

      // Poll until done
      let pollCount = 0
      while (true) {
        await sleep(3000)
        pollCount++

        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
        })

        if (!pollRes.ok) throw new Error(`Poll failed: ${await pollRes.text()}`)

        const status = await pollRes.json() as { status: string; output?: string | string[]; error?: string }

        if (status.status === 'succeeded') {
          const output = status.output
          if (Array.isArray(output)) return output[0]!
          if (typeof output === 'string') return output
          throw new Error('Unexpected output format')
        }

        if (status.status === 'failed') {
          throw new Error(`Prediction failed: ${status.error}`)
        }

        if (pollCount > 60) throw new Error('Prediction timed out after 3 minutes')
      }
    } catch (err) {
      if (attempt === retries) throw err
      console.log(`  Retry ${attempt}/${retries} after error: ${err}`)
      await sleep(2000)
    }
  }
  throw new Error('Should not reach here')
}

async function uploadToSupabase(imageUrl: string, storagePath: string): Promise<string> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const uint8 = new Uint8Array(buffer)

  const { error } = await supabase.storage
    .from('landing-assets')
    .upload(storagePath, uint8, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage.from('landing-assets').getPublicUrl(storagePath)
  return data.publicUrl
}

async function ensureBucketPublic() {
  // Check if bucket exists
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === 'landing-assets')

  if (!exists) {
    const { error } = await supabase.storage.createBucket('landing-assets', {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
    })
    if (error) throw new Error(`Create bucket failed: ${error.message}`)
    console.log('Created landing-assets bucket (public)')
  } else {
    console.log('landing-assets bucket already exists')
  }
}

async function processBatch(batch: typeof IMAGES, results: Record<string, string>, remaining: { count: number }) {
  await Promise.all(
    batch.map(async (img) => {
      console.log(`Generating ${img.key}... ${remaining.count} remaining`)
      try {
        const imageUrl = await generateImage(img.prompt)
        const publicUrl = await uploadToSupabase(imageUrl, img.storagePath)
        results[img.key] = publicUrl
        remaining.count--
        console.log(`✓ ${img.key} → ${publicUrl}`)
      } catch (err) {
        console.error(`✗ ${img.key} failed: ${err}`)
        // Use fallback from generated-urls.json
        const fallbackMap: Record<string, string> = {
          'hero/before-neutral': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/living-room-stock-1.jpg',
          'hero/after-nordic-minimal': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-01-a.jpg',
          'hero/after-warm-japandi': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-01-b.jpg',
          'hero/after-organic-modern': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-02-a.jpg',
          'person-taking-photo': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/living-room-stock-2.jpg',
          'shoppable-render': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-03-a.jpg',
          'smart-room': 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-04-a.jpg',
        }
        if (fallbackMap[img.key]) {
          results[img.key] = fallbackMap[img.key]!
          console.log(`  Used fallback for ${img.key}`)
        }
        remaining.count--
      }
    })
  )
}

async function main() {
  console.log('=== Cova Landing Asset Generator ===')
  console.log(`Generating ${IMAGES.length} images...`)
  console.log('')

  await ensureBucketPublic()

  const results: Record<string, string> = {}
  const remaining = { count: IMAGES.length }

  // Process in parallel batches of 5
  const BATCH_SIZE = 5
  for (let i = 0; i < IMAGES.length; i += BATCH_SIZE) {
    const batch = IMAGES.slice(i, i + BATCH_SIZE)
    await processBatch(batch, results, remaining)
  }

  // Save to landing-urls.json
  const outputPath = path.join(path.dirname(process.argv[1]!), 'landing-urls.json')
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log('')
  console.log(`✓ Saved ${Object.keys(results).length} URLs to scripts/landing-urls.json`)

  // Summary
  console.log('')
  console.log('=== Generation Summary ===')
  console.log(`Total images: ${IMAGES.length}`)
  console.log(`Succeeded: ${Object.keys(results).length}`)
  console.log(`Estimated cost: ~$${(IMAGES.length * 0.04).toFixed(2)}`)
  console.log('')
  console.log('URLs:')
  for (const [key, url] of Object.entries(results)) {
    console.log(`  ${key}: ${url}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
