import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

const STYLE_DIMENSIONS: Record<string, Record<string, number>> = {
  bohemian: {
    luminosity: 0.2, density: 0.8, temperature: 0.7, form: 0.8,
    era: 0.5, texture: 0.9, scale: -0.2, nature: 0.8,
    saturation: 0.5, materialOrigin: 0.7
  },
  coastal: {
    luminosity: 0.8, density: -0.4, temperature: -0.3, form: 0.3,
    era: -0.2, texture: 0.2, scale: 0.0, nature: 0.6,
    saturation: -0.2, materialOrigin: 0.1
  },
  japandi: {
    luminosity: 0.5, density: -0.6, temperature: 0.4, form: 0.6,
    era: 0.2, texture: 0.3, scale: -0.3, nature: 0.7,
    saturation: -0.5, materialOrigin: 0.6
  },
  mid_century: {
    luminosity: 0.4, density: 0.1, temperature: 0.5, form: -0.5,
    era: 0.6, texture: 0.1, scale: 0.3, nature: 0.1,
    saturation: 0.3, materialOrigin: -0.2
  },
  minimalist: {
    luminosity: 0.7, density: -0.8, temperature: -0.1, form: -0.6,
    era: -0.4, texture: -0.7, scale: 0.0, nature: -0.3,
    saturation: -0.6, materialOrigin: -0.4
  }
}

function inferStyleName(dims: Record<string, number>): string {
  let bestStyle = 'minimalist'
  let bestSim = -Infinity
  for (const [style, ref] of Object.entries(STYLE_DIMENSIONS)) {
    const keys = Object.keys(dims)
    const dot = keys.reduce((s, k) => s + dims[k]! * (ref[k] ?? 0), 0)
    const magA = Math.sqrt(keys.reduce((s, k) => s + dims[k]! ** 2, 0))
    const magB = Math.sqrt(keys.reduce((s, k) => s + (ref[k] ?? 0) ** 2, 0))
    const sim = dot / (magA * magB + 1e-8)
    if (sim > bestSim) { bestSim = sim; bestStyle = style }
  }
  return bestStyle
}

async function labelImage(imageUrl: string): Promise<Record<string, number>> {
  const resp = await fetch(imageUrl)
  if (!resp.ok) throw new Error('Image fetch failed: ' + resp.status)
  const buffer = await resp.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  const prompt = `Analyze this interior design image. Rate it on exactly these
10 dimensions. Return ONLY a valid JSON object, no markdown, no explanation.
Each value must be a number between -1.0 and 1.0.

{
  "luminosity": <-1=very dark, 1=very bright/sun-drenched>,
  "density": <-1=near-empty/stark, 1=maximalist/richly layered>,
  "temperature": <-1=icy cool/steel/slate, 1=warm amber/honey/terracotta>,
  "form": <-1=hyper-geometric/sharp angles, 1=organic curves/natural shapes>,
  "era": <-1=ultra-modern/futuristic, 1=traditional/heritage/antique>,
  "texture": <-1=mirror-smooth/lacquered, 1=tactile/rough linen/rattan>,
  "scale": <-1=petite/delicate, 1=oversized/grand proportions>,
  "nature": <-1=synthetic/industrial/no plants, 1=abundant natural/plants/wood>,
  "saturation": <-1=achromatic/greige/neutral, 1=rich saturated/bold hues>,
  "materialOrigin": <-1=factory-made/concrete/steel, 1=handmade/artisanal/ceramic>
}`

  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: base64 } },
    prompt
  ])

  const text = result.response.text().trim()
  const cleaned = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned) as Record<string, number>

  const dims: Record<string, number> = {}
  const keys = ['luminosity', 'density', 'temperature', 'form', 'era',
    'texture', 'scale', 'nature', 'saturation', 'materialOrigin']
  keys.forEach(k => {
    dims[k] = Math.max(-1, Math.min(1, Number(parsed[k]) ?? 0))
  })
  return dims
}

async function run() {
  const roomTypes = [
    'bathroom', 'bedroom', 'dining-room', 'dorm-room', 'first-apartment',
    'home-office', 'living-room', 'outdoor', 'studio'
  ]

  const { data: existing } = await sb
    .from('swipe_cards')
    .select('pair_id, room_type')
    .eq('phase', 'pairwise')
  const existingKeys = new Set(
    existing?.map(r => (r.room_type as string) + '_' + (r.pair_id as string)) ?? []
  )
  console.log('Existing Phase B cards:', existing?.length ?? 0)

  let seeded = 0
  let failed = 0

  for (const roomType of roomTypes) {
    for (let pairNum = 1; pairNum <= 19; pairNum++) {
      const pairId = roomType + '-pair-' + String(pairNum).padStart(2, '0')
      const roomTypeNorm = roomType.replace(/-/g, '_')
      if (existingKeys.has(roomTypeNorm + '_' + pairId)) {
        console.log('Skip (exists):', pairId)
        continue
      }

      const cards: Record<string, unknown>[] = []
      for (const side of ['a', 'b']) {
        const filename = 'pair-' + String(pairNum).padStart(2, '0') + '-' + side + '.jpg'
        const { data: urlData } = sb.storage
          .from('quiz-pairs')
          .getPublicUrl(roomType + '/' + filename)
        const imageUrl = urlData.publicUrl

        try {
          console.log('Labeling:', roomType + '/' + filename)
          const dims = await labelImage(imageUrl)
          const styleName = inferStyleName(dims)
          cards.push({
            room_type: roomTypeNorm,
            style: styleName,
            image_url: imageUrl,
            phase: 'pairwise',
            pair_id: pairId,
            pair_side: side,
            dimension_labels: dims,
            active: true,
            discriminability_score: 1,
            style_weights: {}
          })
          await new Promise(r => setTimeout(r, 1500))
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('FAILED:', roomType + '/' + filename, message)
          failed++
        }
      }

      if (cards.length === 2) {
        const { error } = await sb.from('swipe_cards').insert(cards)
        if (error) {
          console.error('Insert failed:', error.message)
          failed += 2
        } else {
          seeded += 2
          console.log('Seeded pair:', pairId, '| total seeded:', seeded)
        }
      }
    }
  }

  console.log('\nDone. Seeded:', seeded, '| Failed:', failed)
}

run()
