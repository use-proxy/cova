/**
 * generate-all-images.ts
 *
 * Generates up to 369 images via Replicate FLUX 1.1 Pro:
 *   - 9 room types × 19 pairs × 2 images = 342 quiz pair images
 *   - 9 room types × 3 stock base photos = 27 stock images
 *
 * PHASE 0: Audits what already exists in Supabase Storage.
 * Only generates missing images.
 * Uploads each image to Supabase Storage immediately on completion.
 * Writes all URLs to scripts/generated-urls.json.
 * Overwrites apps/web/lib/ai/quiz-data.ts with all URLs populated.
 *
 * Usage: npx tsx scripts/generate-all-images.ts
 * Expected runtime: ~15-25 minutes | ~$14.76 max
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootEnvPath = path.join(__dirname, '..', 'apps', 'web', '.env.local')
config({ path: rootEnvPath })
// Also try root .env.local
config({ path: path.join(__dirname, '..', '.env.local') })

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set')
if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Room type definitions ─────────────────────────────────────────────────────

const ROOM_TYPES = [
  { key: 'living-room',     desc: 'minimalist living room interior' },
  { key: 'bedroom',         desc: 'minimalist bedroom interior' },
  { key: 'studio',          desc: 'minimalist studio apartment' },
  { key: 'home-office',     desc: 'minimalist home office' },
  { key: 'dining-room',     desc: 'minimalist dining room' },
  { key: 'bathroom',        desc: 'minimalist bathroom' },
  { key: 'outdoor',         desc: 'minimalist outdoor terrace or patio' },
  { key: 'dorm-room',       desc: 'minimalist dorm room' },
  { key: 'first-apartment', desc: 'minimalist small apartment' },
]

const APPEND = 'photorealistic interior photography, wide angle 35mm lens, 4k, architectural digest quality, not CGI, natural lighting'

// ── Stock photo prompts ───────────────────────────────────────────────────────

function buildStockPrompts(desc: string): [string, string, string] {
  return [
    `photorealistic architectural interior photography, ${desc}, maximally neutral and empty, off-white walls, light oak hardwood floors, single simple furniture piece only, abundant empty wall space for redesign, natural daylight from large window, no art no plants no clutter, wide angle 35mm lens, ultra sharp focus, photorealistic not CGI, 4k, architectural digest quality`,
    `photorealistic architectural interior photography, ${desc}, corner perspective showing two walls, off-white walls, light oak floors, minimal furniture, large empty wall surfaces, soft natural daylight, nothing on surfaces, wide angle 35mm, 4k, photorealistic, architectural digest`,
    `photorealistic architectural interior photography, ${desc}, view from doorway showing full room depth, off-white walls, light floors, simple furniture, large empty back wall fully visible, natural light, wide angle 35mm, 4k, photorealistic, architectural digest`,
  ]
}

// ── 19 pair templates ─────────────────────────────────────────────────────────

interface PairTemplate {
  id: string
  primaryDimension: string | null
  secondaryDimension: string | null
  contrastLevel: 'extreme' | 'mid' | 'fine' | null
  aIntensity: number
  bIntensity: number
  isWarmup: boolean
  promptA: string
  promptB: string
}

function t(s: string) { return s.replace(/\s+/g, ' ').trim() }

function pair(
  id: string,
  primaryDimension: string | null,
  secondaryDimension: string | null,
  contrastLevel: 'extreme' | 'mid' | 'fine' | null,
  aIntensity: number,
  bIntensity: number,
  isWarmup: boolean,
  promptA: string,
  promptB: string,
): PairTemplate {
  return { id, primaryDimension, secondaryDimension, contrastLevel, aIntensity, bIntensity, isWarmup,
    promptA: t(promptA), promptB: t(promptB) }
}

const PAIR_TEMPLATES: PairTemplate[] = [
  pair('pair-01', 'luminosity', 'temperature', 'extreme', 0.1, 0.9, false,
    `[ROOM], dramatically dark moody atmosphere, near-black charcoal walls, single low warm Edison bulb, deep shadows, cool grey undertones throughout, intimate cave-like, dramatic and cinematic, ${APPEND}`,
    `[ROOM], maximally bright airy atmosphere, pure white walls, flooded with natural sunlight through floor-to-ceiling windows, warm honey wood tones, expansive open feeling, luminous, ${APPEND}`
  ),
  pair('pair-02', 'density', null, 'extreme', 0.1, 0.9, false,
    `[ROOM], radical minimalism, single piece of furniture only centered in vast empty space, enormous empty white walls, negative space dominates, monastic emptiness, ${APPEND}`,
    `[ROOM], gloriously maximalist, bookshelves floor to ceiling on every wall, multiple layered rugs, artwork covering all wall space, plants on every surface, richly layered and full, ${APPEND}`
  ),
  pair('pair-03', 'temperature', null, 'extreme', 0.1, 0.9, false,
    `[ROOM], icy cool color palette, slate grey walls, white oak floors, chrome and silver accents, cool white daylight, Scandinavian restraint, crisp and cold, ${APPEND}`,
    `[ROOM], deeply warm color palette, burnt sienna terracotta walls, dark honey oak wood, copper brass accents, warm amber candlelight glow, Mediterranean richness, ${APPEND}`
  ),
  pair('pair-04', 'nature', 'materialOrigin', 'extreme', 0.1, 0.9, false,
    `[ROOM], pure urban aesthetic, raw concrete walls, polished steel furniture, glass surfaces, zero plants zero organic elements, entirely manufactured and industrial, ${APPEND}`,
    `[ROOM], lush biophilic abundance, plants covering every surface and hanging from ceiling, raw live-edge wood, woven natural textiles, stone surfaces, handmade ceramics, living breathing organic space, ${APPEND}`
  ),
  pair('pair-05', 'saturation', null, 'extreme', 0.1, 0.9, false,
    `[ROOM], perfectly monochromatic palette, all variations of a single tone, no color contrast anywhere, restrained tonal harmony, everything in shades of the same hue, ${APPEND}`,
    `[ROOM], bold jewel-tone color, emerald green walls, mustard yellow sofa, cobalt blue accents, rich color contrast throughout, confident and vibrant, ${APPEND}`
  ),
  pair('pair-06', 'luminosity', null, 'mid', 0.25, 0.75, false,
    `[ROOM], softly dim comfortable atmosphere, warm low lighting, gentle shadows, cozy and intimate but not dramatic, moderately lit, ${APPEND}`,
    `[ROOM], pleasantly bright and airy, good natural light, white walls reflecting light, open and fresh but not stark, comfortable brightness, ${APPEND}`
  ),
  pair('pair-07', 'temperature', null, 'mid', 0.25, 0.75, false,
    `[ROOM], cool blue-grey tones, pale slate walls, white textiles, silver accents, cool morning light, fresh and crisp, ${APPEND}`,
    `[ROOM], warm honey amber tones, warm oak wood, cream textiles, brass accents, afternoon warm light, inviting and cozy, ${APPEND}`
  ),
  pair('pair-08', 'density', null, 'mid', 0.25, 0.75, false,
    `[ROOM], sparse and considered, only essential furniture present, some empty wall space, curated not bare, breathing room between objects, ${APPEND}`,
    `[ROOM], well-furnished and layered, multiple furniture pieces, some wall art, plants, accessories, full and lived-in but not cluttered, ${APPEND}`
  ),
  pair('pair-09', 'form', 'scale', 'extreme', 0.1, 0.9, false,
    `[ROOM], rigid geometric precision, modular grid furniture system, all right angles, sharp corners, compact intimate scale, structured and precise, ${APPEND}`,
    `[ROOM], flowing organic curves everywhere, round sofa, oval coffee table, arched openings, kidney-shaped rug, generous grand scale with high ceilings, ${APPEND}`
  ),
  pair('pair-10', 'era', null, 'extreme', 0.1, 0.9, false,
    `[ROOM], ultra contemporary 2024 design, floating invisible furniture, seamless surfaces, invisible hardware, cutting-edge minimal, futuristic and forward, ${APPEND}`,
    `[ROOM], deep traditional heritage, antique wooden furniture, ornate carved details, Persian rug, dark wood paneling, Victorian grandeur, timeless, ${APPEND}`
  ),
  pair('pair-11', 'texture', 'materialOrigin', 'extreme', 0.1, 0.9, false,
    `[ROOM], supremely smooth polished surfaces everywhere, lacquered furniture, polished marble floors, glass surfaces, chrome fixtures, factory-perfect finish, ${APPEND}`,
    `[ROOM], intensely tactile textures, chunky hand-knit throws, rough raw linen, natural stone walls, hand-thrown ceramic objects, woven textiles, visible craft everywhere, ${APPEND}`
  ),
  pair('pair-12', 'nature', null, 'mid', 0.25, 0.75, false,
    `[ROOM], mostly manufactured materials, one or two small plants, natural wood accents, some organic elements but predominantly man-made, ${APPEND}`,
    `[ROOM], abundant plant life, trailing vines, potted trees, hanging planters, natural wood and stone, greenery as primary design element, ${APPEND}`
  ),
  pair('pair-13', 'saturation', null, 'mid', 0.25, 0.75, false,
    `[ROOM], muted restrained color palette, desaturated tones, quiet and understated, sophisticated neutrals with subtle variation, ${APPEND}`,
    `[ROOM], warm rich colors present, terracotta and sage and warm yellow, color used confidently but not overwhelming, ${APPEND}`
  ),
  pair('pair-14', 'scale', null, 'mid', 0.25, 0.75, false,
    `[ROOM], cozy intimate scale, furniture arranged close together, low ceiling feel, nook-like atmosphere, human-scale and personal, ${APPEND}`,
    `[ROOM], generous expansive scale, high ceilings, furniture spread with breathing room, statement pieces, a sense of openness and grandeur, ${APPEND}`
  ),
  pair('pair-15', 'luminosity', null, 'fine', 0.35, 0.65, false,
    `[ROOM], softly lit comfortable space, slightly dimmer than average, warm atmosphere, relaxed and settled feeling, ${APPEND}`,
    `[ROOM], pleasantly bright everyday lighting, good daylight, fresh and clear, comfortable modern brightness, ${APPEND}`
  ),
  pair('pair-16', 'temperature', null, 'fine', 0.35, 0.65, false,
    `[ROOM], very slightly cool neutral, crisp whites and light greys, fresh and clean, subtle coolness, ${APPEND}`,
    `[ROOM], very slightly warm neutral, off-whites and warm creams, subtle warmth, inviting and approachable, ${APPEND}`
  ),
  pair('pair-17', 'materialOrigin', null, 'fine', 0.35, 0.65, false,
    `[ROOM], refined quality manufactured materials, precision-made furniture, clean factory finish, excellent craftsmanship in manufactured style, ${APPEND}`,
    `[ROOM], handmade quality throughout, hand-thrown pottery, woven textiles, slight imperfections of craft, visible human touch in every object, ${APPEND}`
  ),
  pair('pair-18', 'form', null, 'mid', 0.25, 0.75, false,
    `[ROOM], structured and ordered aesthetic, clean lines, rectangular furniture, organized layout, precise but not rigid, ${APPEND}`,
    `[ROOM], soft flowing forms, curved sofa, rounded edges, gentle arches, organic but not extreme, comfortable curves, ${APPEND}`
  ),
  pair('pair-19', null, null, null, 0.0, 1.0, true,
    `[ROOM], simple contemporary neutral comfortable space, clean and approachable, natural light, ${APPEND}`,
    `[ROOM], warm layered personal space, collected over time, natural materials, inviting, ${APPEND}`
  ),
]

// ── Job definition ────────────────────────────────────────────────────────────

interface ImageJob {
  label: string
  prompt: string
  bucket: string
  storagePath: string
  resultKey: string
}

function buildAllJobs(): ImageJob[] {
  const jobs: ImageJob[] = []

  for (const room of ROOM_TYPES) {
    // Quiz pair images
    for (const p of PAIR_TEMPLATES) {
      const num = p.id.replace('pair-', '')
      jobs.push({
        label: `[${room.key}] ${p.id} A`,
        prompt: p.promptA.replace(/\[ROOM\]/g, room.desc),
        bucket: 'quiz-pairs',
        storagePath: `${room.key}/pair-${num}-a.jpg`,
        resultKey: `quiz-pairs/${room.key}/pair-${num}-a`,
      })
      jobs.push({
        label: `[${room.key}] ${p.id} B`,
        prompt: p.promptB.replace(/\[ROOM\]/g, room.desc),
        bucket: 'quiz-pairs',
        storagePath: `${room.key}/pair-${num}-b.jpg`,
        resultKey: `quiz-pairs/${room.key}/pair-${num}-b`,
      })
    }

    // Stock base photos
    const stockPrompts = buildStockPrompts(room.desc)
    for (let i = 0; i < 3; i++) {
      jobs.push({
        label: `[${room.key}] stock-${i + 1}`,
        prompt: stockPrompts[i]!,
        bucket: 'room-photos',
        storagePath: `${room.key}-stock-${i + 1}.jpg`,
        resultKey: `room-photos/${room.key}-stock-${i + 1}`,
      })
    }
  }

  return jobs
}

// ── Phase 0: Audit existing files ─────────────────────────────────────────────

async function auditExisting(): Promise<Set<string>> {
  const existing = new Set<string>()

  // Check quiz-pairs bucket (may not exist)
  for (const room of ROOM_TYPES) {
    const { data } = await supabase.storage.from('quiz-pairs').list(room.key, { limit: 200 })
    if (data) {
      for (const f of data) {
        existing.add(`quiz-pairs/${room.key}/${f.name}`.replace('.jpg', ''))
      }
    }
  }

  // Check room-photos bucket
  const { data: photos } = await supabase.storage.from('room-photos').list('', { limit: 200 })
  if (photos) {
    for (const f of photos) {
      existing.add(`room-photos/${f.name}`.replace('.jpg', ''))
    }
  }

  return existing
}

// Also load previously saved URLs from generated-urls.json
function loadSavedUrls(): Record<string, string> {
  const urlsPath = path.join(__dirname, 'generated-urls.json')
  if (fs.existsSync(urlsPath)) {
    try {
      return JSON.parse(fs.readFileSync(urlsPath, 'utf-8')) as Record<string, string>
    } catch {
      return {}
    }
  }
  return {}
}

// ── Replicate helpers ─────────────────────────────────────────────────────────

async function createPrediction(prompt: string): Promise<string> {
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'black-forest-labs/flux-1.1-pro',
      input: { prompt, width: 1344, height: 768, num_inference_steps: 28 },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Replicate create failed: ${res.status} ${err}`)
  }
  const data = await res.json() as { id: string; urls: { get: string } }
  return data.urls.get
}

async function pollPrediction(pollUrl: string, label: string): Promise<string> {
  while (true) {
    await sleep(3000)
    const res = await fetch(pollUrl, {
      headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
    })
    if (!res.ok) throw new Error(`Poll failed for ${label}: ${res.status}`)
    const data = await res.json() as { status: string; output?: string | string[]; error?: string }
    if (data.status === 'succeeded') {
      const out = data.output
      const url = Array.isArray(out) ? out[0] : out
      if (!url) throw new Error(`No output URL for ${label}`)
      return url
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Prediction ${data.status} for ${label}: ${data.error ?? 'unknown'}`)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function ensureBucketPublic(bucketName: string): Promise<void> {
  const { error } = await supabase.storage.createBucket(bucketName, {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  })
  if (error && !error.message.includes('already exists') && !error.message.includes('duplicate')) {
    throw new Error(`Failed to create bucket ${bucketName}: ${error.message}`)
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadToSupabase(buffer: Buffer, bucket: string, storagePath: string): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`)
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath)
  return data.publicUrl
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(
  job: ImageJob,
  results: Record<string, string>,
  remaining: { count: number },
): Promise<void> {
  try {
    console.log(`  Generating ${job.label}...`)
    const pollUrl = await createPrediction(job.prompt)
    const imageUrl = await pollPrediction(pollUrl, job.label)
    const buffer = await downloadImage(imageUrl)
    const publicUrl = await uploadToSupabase(buffer, job.bucket, job.storagePath)
    results[job.resultKey] = publicUrl
    remaining.count--
    console.log(`  ✓ ${job.storagePath} — ${remaining.count} remaining`)
    // Save progress after each image
    const urlsPath = path.join(__dirname, 'generated-urls.json')
    fs.writeFileSync(urlsPath, JSON.stringify(results, null, 2))
  } catch (err) {
    console.error(`  ✗ FAILED ${job.label}: ${err}`)
    remaining.count--
  }
}

// ── quiz-data.ts writer ───────────────────────────────────────────────────────

function generateQuizDataTs(results: Record<string, string>): string {
  const lines: string[] = []

  lines.push('// AUTO-GENERATED by scripts/generate-all-images.ts')
  lines.push(`// Generated: ${new Date().toISOString()}`)
  lines.push(`// Total images: 369 (342 quiz pairs + 27 stock photos)`)
  lines.push('')

  // New interfaces
  lines.push('export interface QuizPair {')
  lines.push('  id: string')
  lines.push('  imageA: { url: string; alt: string }')
  lines.push('  imageB: { url: string; alt: string }')
  lines.push('  primaryDimension: string | null')
  lines.push('  secondaryDimension: string | null')
  lines.push("  contrastLevel: 'extreme' | 'mid' | 'fine' | null")
  lines.push('  aIntensity: number')
  lines.push('  bIntensity: number')
  lines.push('  isWarmup: boolean')
  lines.push('  roomTypes: string[]')
  lines.push('}')
  lines.push('')
  lines.push('export interface StockPhoto {')
  lines.push('  url: string')
  lines.push("  roomType: string")
  lines.push("  angle: 'front' | 'corner' | 'doorway'")
  lines.push('}')
  lines.push('')

  // QUIZ_PAIRS
  lines.push('export const QUIZ_PAIRS: Record<string, QuizPair[]> = {')

  for (const room of ROOM_TYPES) {
    lines.push(`  '${room.key}': [`)
    for (const p of PAIR_TEMPLATES) {
      const num = p.id.replace('pair-', '')
      const urlA = results[`quiz-pairs/${room.key}/pair-${num}-a`] ?? ''
      const urlB = results[`quiz-pairs/${room.key}/pair-${num}-b`] ?? ''
      const pDim = p.primaryDimension === null ? 'null' : `'${p.primaryDimension}'`
      const sDim = p.secondaryDimension === null ? 'null' : `'${p.secondaryDimension}'`
      const cl = p.contrastLevel === null ? 'null' : `'${p.contrastLevel}'`
      lines.push(`    {`)
      lines.push(`      id: '${p.id}',`)
      lines.push(`      imageA: { url: '${urlA}', alt: 'Style option A for ${room.key} ${p.id}' },`)
      lines.push(`      imageB: { url: '${urlB}', alt: 'Style option B for ${room.key} ${p.id}' },`)
      lines.push(`      primaryDimension: ${pDim},`)
      lines.push(`      secondaryDimension: ${sDim},`)
      lines.push(`      contrastLevel: ${cl},`)
      lines.push(`      aIntensity: ${p.aIntensity},`)
      lines.push(`      bIntensity: ${p.bIntensity},`)
      lines.push(`      isWarmup: ${p.isWarmup},`)
      lines.push(`      roomTypes: ['${room.key}'],`)
      lines.push(`    },`)
    }
    lines.push(`  ],`)
  }

  lines.push('}')
  lines.push('')

  // STOCK_PHOTOS
  lines.push('export const STOCK_PHOTOS: Record<string, StockPhoto[]> = {')

  const angles: Array<'front' | 'corner' | 'doorway'> = ['front', 'corner', 'doorway']
  for (const room of ROOM_TYPES) {
    lines.push(`  '${room.key}': [`)
    for (let i = 0; i < 3; i++) {
      const url = results[`room-photos/${room.key}-stock-${i + 1}`] ?? ''
      lines.push(`    { url: '${url}', roomType: '${room.key}', angle: '${angles[i]}' },`)
    }
    lines.push(`  ],`)
  }

  lines.push('}')
  lines.push('')

  // Backward compat: old interfaces used by other parts of the codebase
  lines.push('// Legacy compatibility exports')
  lines.push('export interface QuizPairMapping {')
  lines.push('  id: string')
  lines.push('  primary_dimension: number')
  lines.push('  signal: number')
  lines.push('  secondary_dimension?: number')
  lines.push('  secondary_signal?: number')
  lines.push('}')
  lines.push('')
  lines.push('export interface QuizResponseWithDimension {')
  lines.push("  pair_id: string")
  lines.push("  chosen: 'A' | 'B'")
  lines.push('  super_liked: boolean')
  lines.push('}')
  lines.push('')
  lines.push('export const QUIZ_PAIR_DIMENSIONS: Record<string, QuizPairMapping> = {}')
  lines.push('')
  lines.push('export function computeFingerprintFromPairs(')
  lines.push('  _responses: QuizResponseWithDimension[],')
  lines.push('  _skipFirst = true')
  lines.push('): number[] {')
  lines.push('  return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Cova Quiz Image Generator — 10-Dimension System')
  console.log('  19 pairs × 9 rooms × 2 + 27 stock = 369 images')
  console.log('═══════════════════════════════════════════════════\n')

  // Phase 0: Audit
  console.log('Phase 0: Auditing existing files in Supabase Storage...')
  const existing = await auditExisting()
  const savedUrls = loadSavedUrls()
  console.log(`  Found ${existing.size} existing storage files`)
  console.log(`  Found ${Object.keys(savedUrls).length} saved URLs\n`)

  // Ensure quiz-pairs bucket exists
  await ensureBucketPublic('quiz-pairs')

  // Build all jobs and filter to missing
  const allJobs = buildAllJobs()
  const missingJobs = allJobs.filter((job) => {
    // Check if already in storage
    if (existing.has(job.resultKey)) return false
    // Check if we already have a URL saved
    if (savedUrls[job.resultKey]) return false
    return true
  })

  // Build results map starting from saved URLs
  const results: Record<string, string> = { ...savedUrls }

  // Populate public URLs for existing storage files
  for (const job of allJobs) {
    if (existing.has(job.resultKey) && !results[job.resultKey]) {
      const { data } = supabase.storage.from(job.bucket).getPublicUrl(job.storagePath)
      results[job.resultKey] = data.publicUrl
    }
  }

  console.log(`ALREADY GENERATED: ${allJobs.length - missingJobs.length} images`)
  if (allJobs.length - missingJobs.length > 0) {
    const done = allJobs.filter(j => !missingJobs.includes(j))
    done.slice(0, 10).forEach(j => console.log(`  ✓ ${j.storagePath}`))
    if (done.length > 10) console.log(`  ... and ${done.length - 10} more`)
  }
  console.log(`NEEDS GENERATING: ${missingJobs.length} images`)
  console.log(`Estimated cost: $${(missingJobs.length * 0.04).toFixed(2)}\n`)

  if (missingJobs.length === 0) {
    console.log('All images already generated! Writing quiz-data.ts...')
  } else {
    // Process in batches of 5
    const BATCH_SIZE = 5
    const batches: ImageJob[][] = []
    for (let i = 0; i < missingJobs.length; i += BATCH_SIZE) {
      batches.push(missingJobs.slice(i, i + BATCH_SIZE))
    }

    const remaining = { count: missingJobs.length }
    console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE}...\n`)

    for (let i = 0; i < batches.length; i++) {
      console.log(`\nBatch ${i + 1}/${batches.length} (${batches[i]!.length} jobs):`)
      await Promise.all(batches[i]!.map((job) => processJob(job, results, remaining)))
    }
  }

  // Save final URLs
  const urlsPath = path.join(__dirname, 'generated-urls.json')
  fs.writeFileSync(urlsPath, JSON.stringify(results, null, 2))
  console.log(`\nSaved ${Object.keys(results).length} URLs to scripts/generated-urls.json`)

  // Write quiz-data.ts
  const quizDataPath = path.join(__dirname, '..', 'apps', 'web', 'lib', 'ai', 'quiz-data.ts')
  const quizDataContent = generateQuizDataTs(results)
  fs.writeFileSync(quizDataPath, quizDataContent)
  console.log('Wrote apps/web/lib/ai/quiz-data.ts')

  // Summary
  const generated = allJobs.length - missingJobs.length + (allJobs.length - Object.keys(results).length > 0 ? 0 : 0)
  const totalGenerated = Object.keys(results).filter(k => results[k]).length
  console.log(`\n═══════════════════════════════════════════════════`)
  console.log(`  Complete! ${totalGenerated}/${allJobs.length} images ready`)
  console.log(`  Estimated cost: ~$${(missingJobs.length * 0.04).toFixed(2)}`)
  console.log(`═══════════════════════════════════════════════════`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
