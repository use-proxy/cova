import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  seating: [
    'sofa', 'couch', 'chair', 'sectional', 'loveseat', 'ottoman',
    'bench', 'stool', 'recliner', 'armchair', 'settee', 'chaise', 'futon',
  ],
  tables: [
    'table', 'desk', 'nightstand', 'console', 'credenza', 'sideboard',
    'buffet', 'vanity',
  ],
  lighting: [
    'lamp', 'light', 'chandelier', 'sconce', 'pendant', 'lantern',
    'fixture', 'luminary',
  ],
  storage: [
    'bookshelf', 'bookcase', 'cabinet', 'dresser', 'wardrobe', 'shelving',
    'rack', 'trunk', 'chest', 'tv stand', 'media console', 'armoire',
  ],
  decor: [
    'rug', 'mirror', 'pillow', 'throw', 'vase', 'art', 'frame', 'curtain',
    'basket', 'tray', 'candle', 'clock', 'sculpture',
  ],
  plants: [
    'plant', 'planter', 'pot', 'fern', 'succulent', 'tree', 'monstera',
    'fiddle', 'cactus', 'botanical',
  ],
  beds: ['bed', 'headboard', 'mattress', 'daybed', 'bunk', 'bedframe'],
}

const STYLE_KEYWORDS: Record<string, string[]> = {
  coastal: [
    'linen', 'rattan', 'wicker', 'jute', 'seagrass', 'driftwood',
    'nautical', 'beach', 'coastal', 'seaside', 'whitewash', 'natural fiber',
  ],
  japandi: [
    'oak', 'walnut', 'minimal', 'zen', 'muted', 'neutral', 'bamboo',
    'japandi', 'scandinavian', 'nordic', 'functional', 'clean lines',
  ],
  bohemian: [
    'macrame', 'fringe', 'tassel', 'colorful', 'eclectic', 'woven',
    'boho', 'bohemian', 'maximalist', 'global', 'ethnic', 'tribal',
  ],
  mid_century: [
    'brass', 'retro', 'hairpin', 'tulip', 'eames', 'mid-century',
    'teak', 'mcm', 'organic shape', 'tapered leg', 'walnut',
  ],
  minimalist: [
    'minimal', 'minimalist', 'sleek', 'monochrome', 'streamlined',
    'pure', 'hidden storage', 'simple', 'clean', 'white', 'grey',
  ],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PriceTier = 'budget' | 'mid' | 'premium'
type Retailer = 'wayfair' | 'amazon' | 'ikea' | 'cb2'

interface RawProduct {
  name?: unknown
  title?: unknown
  price?: unknown
  cost?: unknown
  image?: unknown
  image_url?: unknown
  main_image?: unknown
  images?: unknown[]
  url?: unknown
  product_url?: unknown
  link?: unknown
  description?: unknown
  desc?: unknown
  source?: unknown
  retailer?: unknown
  external_id?: unknown
  [key: string]: unknown
}

interface CleanProduct {
  external_id: string
  name: string
  retailer: Retailer
  price: number
  currency: string
  category: string
  image_url: string
  affiliate_url_base: string
  style_tags: string[]
  room_types: string[]
  price_tier: PriceTier | null
  in_stock: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category
  }
  return 'decor'
}

function detectStyleTags(name: string, description: string): string[] {
  const combined = (name + ' ' + description).toLowerCase()
  const tags: string[] = []
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) tags.push(style)
  }
  return tags.length > 0 ? tags : ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist']
}

const ROOM_KEYWORDS: Record<string, string[]> = {
  living_room: ['sofa', 'couch', 'sectional', 'coffee table', 'tv stand',
    'accent chair', 'ottoman', 'living room', 'lounge'],
  bedroom: ['bed', 'mattress', 'dresser', 'nightstand', 'wardrobe',
    'bedroom', 'headboard', 'bedframe', 'blanket', 'pillow'],
  dining_room: ['dining table', 'dining chair', 'bar stool', 'buffet',
    'sideboard', 'dining room', 'bench seat'],
  home_office: ['desk', 'office chair', 'bookshelf', 'bookcase',
    'filing cabinet', 'monitor stand', 'home office'],
  kitchen: ['bar cart', 'kitchen island', 'kitchen stool',
    'kitchen storage', 'kitchen'],
  bathroom: ['vanity', 'bathroom', 'mirror', 'towel rack',
    'shower', 'bath mat', 'toilet'],
  entryway: ['entryway', 'console table', 'coat rack', 'bench',
    'hallway', 'foyer', 'shoe rack'],
}

function inferRoomTypes(name: string, description: string): string[] {
  const combined = (name + ' ' + description).toLowerCase()
  const rooms: string[] = []
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) rooms.push(room)
  }
  return rooms.length > 0 ? rooms : ['living_room']
}

/**
 * Parse a price string like "$299.99" or "299.99" to integer cents (29999).
 * Returns null if unparseable or non-positive.
 */
function parsePriceCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const str = String(raw).replace(/[^0-9.]/g, '')
  const dollars = parseFloat(str)
  if (!isFinite(dollars) || dollars <= 0) return null
  return Math.round(dollars * 100)
}

function priceTier(cents: number): PriceTier | null {
  if (cents < 10000) return 'budget'   // < $100
  if (cents < 50000) return 'mid'      // $100–$500
  return 'premium'                     // $500+ (schema has no 'luxury')
}

function detectRetailer(source: string | undefined, filename: string): Retailer | null {
  const s = (source ?? filename).toLowerCase()
  if (s.includes('wayfair')) return 'wayfair'
  if (s.includes('amazon')) return 'amazon'
  if (s.includes('ikea')) return 'ikea'
  if (s.includes('cb2')) return 'cb2'
  return null
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function processProduct(raw: RawProduct, filename: string): CleanProduct | null {
  // 1. name — trim, strip HTML, truncate to 200 chars
  const rawName = stripHtml(String(raw.name ?? raw.title ?? '')).trim().slice(0, 200)
  if (!rawName) return null

  // 2. price — parse to integer cents; skip if invalid
  const cents = parsePriceCents(raw.price ?? raw.cost)
  if (cents === null) return null

  // 3. retailer — detect from source field or filename; must match allowed set
  const rawSource =
    typeof raw.source === 'string'
      ? raw.source
      : typeof raw.retailer === 'string'
        ? raw.retailer
        : undefined
  const retailer = detectRetailer(rawSource, filename)
  if (retailer === null) return null

  // 4. affiliate_url_base — raw product URL, no tracking tag
  // Amazon tag cova03-20 added later via SQL
  // Other tags pending affiliate approval
  const productUrl = String(raw.url ?? raw.product_url ?? raw.link ?? '').trim()
  if (!productUrl) return null

  // 10. image_url — first image from images[] or main_image or image_url or image
  let imageUrl = ''
  if (Array.isArray(raw.images) && raw.images.length > 0) {
    imageUrl = String(raw.images[0])
  } else if (raw.image_url) {
    imageUrl = String(raw.image_url)
  } else if (raw.main_image) {
    imageUrl = String(raw.main_image)
  } else if (raw.image) {
    imageUrl = String(raw.image)
  }
  if (!imageUrl.startsWith('http')) return null

  // 5. category — first keyword match, default decor
  const category = detectCategory(rawName)

  // 8. description — strip HTML, truncate 500 (not a DB column; used for style detection only)
  const description = stripHtml(String(raw.description ?? raw.desc ?? '')).trim().slice(0, 500)

  // 7. style_tags — all matches against name + description
  const styleTags = detectStyleTags(rawName, description)

  // 8b. room_types — all matching rooms, default ['living_room'] if none
  const roomTypes = inferRoomTypes(rawName, description)

  // external_id — product URL or provided id, max 500 chars
  const externalId = String(raw.external_id ?? productUrl).slice(0, 500)

  return {
    external_id: externalId,
    name: rawName,
    retailer,
    price: cents,
    currency: 'USD',
    category,
    image_url: imageUrl.slice(0, 2000),
    affiliate_url_base: productUrl.slice(0, 2000),
    style_tags: styleTags,
    room_types: roomTypes,
    price_tier: priceTier(cents),
    in_stock: true,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const rawDataDir = path.join(path.dirname(process.argv[1]!), 'raw-data')

  if (!fs.existsSync(rawDataDir)) {
    console.error(`raw-data directory not found: ${rawDataDir}`)
    process.exit(1)
  }

  const files = fs.readdirSync(rawDataDir).filter((f) => f.endsWith('.json'))
  console.log(`Found ${files.length} JSON file(s) in raw-data/`)

  let totalProcessed = 0
  let totalInserted = 0
  let totalDuplicates = 0
  let totalInvalid = 0
  let embeddingFailures = 0

  const byCategory: Record<string, number> = {}
  const byRetailer: Record<string, number> = {}
  const byPriceTier: Record<string, number> = {}

  let batchNum = 0
  const pending: CleanProduct[] = []

  async function flushBatch(batch: CleanProduct[]): Promise<void> {
    if (batch.length === 0) return
    batchNum++

    const { error } = await supabase.from('products').insert(batch)
    if (error) {
      console.error(`Batch ${batchNum} insert error:`, error.message)
      return
    }

    totalInserted += batch.length
    console.log(
      `Inserted batch ${batchNum}: ${batch.length} products - Running total: ${totalInserted}`
    )

    // CLIP embedding — called for each product after batch insert
    for (const product of batch) {
      const response = await fetch(
        process.env.SUPABASE_URL! + '/functions/v1/clip-embed',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_url: product.image_url }),
        }
      )

      if (response.ok) {
        const json = (await response.json()) as { embedding?: number[] }
        if (json.embedding) {
          await supabase
            .from('products')
            .update({ clip_embedding: json.embedding })
            .eq('affiliate_url_base', product.affiliate_url_base)
            .eq('name', product.name)
        }
      } else {
        console.log(`EMBEDDING FAILED: ${product.name}`)
        embeddingFailures++
      }
    }
  }

  for (const filename of files) {
    const filePath = path.join(rawDataDir, filename)
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const items: RawProduct[] = Array.isArray(parsed) ? (parsed as RawProduct[]) : [parsed as RawProduct]

    for (const item of items) {
      totalProcessed++

      const product = processProduct(item, filename)
      if (!product) {
        totalInvalid++
        continue
      }

      // Deduplication check
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('name', product.name)
        .eq('retailer', product.retailer)
        .single()

      if (existing) {
        console.log(`DUPLICATE: ${product.name} (${product.retailer})`)
        totalDuplicates++
        continue
      }

      pending.push(product)
      byCategory[product.category] = (byCategory[product.category] ?? 0) + 1
      byRetailer[product.retailer] = (byRetailer[product.retailer] ?? 0) + 1
      const tier = product.price_tier ?? 'unknown'
      byPriceTier[tier] = (byPriceTier[tier] ?? 0) + 1

      if (pending.length === 25) {
        await flushBatch([...pending])
        pending.length = 0
      }
    }
  }

  // Flush remaining products
  if (pending.length > 0) {
    await flushBatch([...pending])
    pending.length = 0
  }

  // Final summary
  console.log('\n--- FINAL SUMMARY ---')
  console.log(`Total processed:       ${totalProcessed}`)
  console.log(`Successfully inserted: ${totalInserted}`)
  console.log(`Skipped duplicates:    ${totalDuplicates}`)
  console.log(`Skipped invalid:       ${totalInvalid}`)
  console.log(`Embedding failures:    ${embeddingFailures}`)

  const pad = (s: string, n: number) => s.padEnd(n)

  console.log('\nBy category:')
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${pad(cat, 14)} ${count}`)
  }

  console.log('\nBy retailer:')
  for (const [ret, count] of Object.entries(byRetailer)) {
    console.log(`  ${pad(ret, 14)} ${count}`)
  }

  console.log('\nBy price tier:')
  for (const [tier, count] of Object.entries(byPriceTier)) {
    console.log(`  ${pad(tier, 14)} ${count}`)
  }
}

main()
