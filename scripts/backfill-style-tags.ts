import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.join(path.dirname(process.argv[1]!), '..', '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  category: string
  subcategory: string | null
  retailer: string
  width_inches: number | null
  depth_inches: number | null
  height_inches: number | null
}

type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'dining_room'
  | 'home_office'
  | 'entryway'
  | 'bathroom'
  | 'kitchen'
  | 'outdoor'

type StyleTag = 'coastal' | 'japandi' | 'bohemian' | 'mid_century' | 'minimalist'

// ── Room Type Inference ────────────────────────────────────────────────────────

const CATEGORY_BASE_ROOMS: Record<string, RoomType[]> = {
  seating:  ['living_room'],
  tables:   ['living_room'],
  lighting: ['living_room', 'bedroom'],
  storage:  ['living_room'],
  beds:     ['bedroom'],
  decor:    ['living_room', 'bedroom'],
  plants:   ['living_room', 'bedroom', 'home_office'],
}

const ROOM_KEYWORD_MAP: Array<{ keywords: string[]; room: RoomType }> = [
  {
    room: 'bedroom',
    keywords: [
      'bedroom', 'bed room', 'nightstand', 'bedside', 'dresser', 'wardrobe',
      'armoire', 'duvet', 'pillow sham', 'comforter', 'mattress', 'headboard',
      'platform bed', 'king', 'queen', 'twin', 'full size bed', 'bunk',
    ],
  },
  {
    room: 'dining_room',
    keywords: [
      'dining', 'dinner', 'dinette', 'kitchen table', 'breakfast', 'bar stool',
      'barstool', 'counter stool', 'kitchen chair', 'bistro', 'pub table',
      'buffet', 'sideboard', 'china cabinet', 'hutch',
    ],
  },
  {
    room: 'home_office',
    keywords: [
      'office', 'desk', 'work from home', 'workstation', 'computer desk',
      'writing desk', 'study', 'bookcase', 'bookshelf', 'filing',
      'monitor stand', 'ergonomic', 'task chair', 'executive chair',
    ],
  },
  {
    room: 'entryway',
    keywords: [
      'entryway', 'entry', 'foyer', 'hallway', 'coat rack', 'shoe rack',
      'shoe bench', 'console table', 'hall tree', 'umbrella', 'mudroom',
      'bench with storage',
    ],
  },
  {
    room: 'bathroom',
    keywords: [
      'bathroom', 'bath', 'shower', 'vanity', 'towel rack', 'medicine cabinet',
      'toilet', 'basin', 'bathtub', 'spa', 'linen tower',
    ],
  },
  {
    room: 'kitchen',
    keywords: [
      'kitchen', 'pantry', 'microwave cart', 'kitchen island', 'bar cart',
      'wine rack', 'coffee station', 'kitchen storage', 'spice rack',
      'kitchen shelf',
    ],
  },
  {
    room: 'outdoor',
    keywords: [
      'outdoor', 'patio', 'garden', 'terrace', 'deck', 'pergola', 'gazebo',
      'bistro set', 'adirondack', 'weatherproof', 'uv resistant', 'all weather',
    ],
  },
  {
    room: 'living_room',
    keywords: [
      'sofa', 'couch', 'sectional', 'loveseat', 'coffee table', 'tv stand',
      'media console', 'accent chair', 'ottoman', 'floor lamp', 'area rug',
      'throw pillow', 'living room', 'lounge',
    ],
  },
]

function inferRoomTypes(product: Product): RoomType[] {
  const rooms = new Set<RoomType>(CATEGORY_BASE_ROOMS[product.category] ?? ['living_room'])
  const searchText = [product.name, product.subcategory ?? ''].join(' ').toLowerCase()

  for (const { keywords, room } of ROOM_KEYWORD_MAP) {
    if (keywords.some((kw) => searchText.includes(kw))) {
      rooms.add(room)
    }
  }

  return Array.from(rooms)
}

// ── Style Tag Inference ────────────────────────────────────────────────────────

interface StyleKeywordGroup {
  style: StyleTag
  keywords: string[]
}

const STYLE_KEYWORD_GROUPS: StyleKeywordGroup[] = [
  {
    style: 'coastal',
    keywords: [
      // materials
      'rattan', 'wicker', 'seagrass', 'jute', 'sisal', 'linen', 'cotton canvas',
      'rope', 'driftwood', 'bamboo', 'whitewash', 'white wash', 'reclaimed wood',
      'teak outdoor', 'natural fiber', 'sea grass', 'water hyacinth',
      // colors
      'ivory', 'cream', 'sand', 'beige', 'sky blue', 'navy', 'turquoise',
      'aqua', 'coral', 'seafoam',
      // descriptors
      'coastal', 'nautical', 'beach', 'seaside', 'hamptons', 'cape cod',
      'island', 'tropical', 'breezy', 'relaxed', 'organic',
      // shapes
      'curved', 'rounded',
    ],
  },
  {
    style: 'japandi',
    keywords: [
      // materials
      'white oak', 'natural oak', 'walnut', 'teak', 'bamboo', 'rice paper',
      'washi', 'linen', 'cotton', 'wool', 'ceramic', 'stone', 'concrete',
      'slate', 'birch', 'ash wood', 'beech', 'pine', 'natural wood grain',
      // colors
      'muted', 'neutral', 'warm white', 'off white', 'greige', 'taupe',
      'warm gray', 'charcoal', 'undyed',
      // descriptors
      'japandi', 'scandinavian', 'nordic', 'japanese', 'zen', 'minimalist',
      'functional', 'simple', 'clean lines', 'understated', 'wabi sabi',
      'hygge', 'handcrafted', 'artisan', 'organic',
      // shapes
      'low profile', 'low to ground', 'simple form', 'tapered legs',
      'clean edges', 'no hardware visible',
    ],
  },
  {
    style: 'bohemian',
    keywords: [
      // materials
      'macrame', 'fringe', 'tassel', 'kilim', 'ikat', 'batik', 'suzani',
      'dhurrie', 'kantha', 'velvet', 'silk', 'embroidered', 'beaded',
      'pom pom', 'feather', 'fur', 'mixed materials', 'hand knotted',
      'hand woven', 'hand loomed',
      // colors
      'colorful', 'multicolor', 'jewel tones', 'terracotta', 'rust',
      'burnt orange', 'mustard', 'deep teal', 'magenta', 'vibrant',
      // descriptors
      'bohemian', 'boho', 'eclectic', 'global', 'worldly', 'vintage',
      'retro', 'maximalist', 'layered', 'collected', 'artsy', 'free spirited',
      'moroccan', 'tribal', 'ethnic', 'folk', 'festival', 'gypsy',
      'wanderer', 'nomadic',
      // patterns
      'pattern', 'printed', 'geometric pattern', 'floral pattern', 'paisley',
      'abstract pattern', 'medallion', 'aztec', 'navajo', 'southwest',
    ],
  },
  {
    style: 'mid_century',
    keywords: [
      // materials
      'walnut', 'teak', 'rosewood', 'brass', 'chrome', 'fiberglass',
      'molded plastic', 'bent plywood', 'cane', 'bouclé', 'tweed',
      // colors
      'mustard yellow', 'olive green', 'burnt orange', 'avocado',
      'harvest gold',
      // descriptors
      'mid century', 'mid-century', 'mcm', 'retro', 'vintage inspired',
      'danish', 'danish modern', 'eames', 'saarinen', 'tulip', 'wegner',
      'nelson', 'atomic age', 'space age', '1950s', '1960s', '1970s',
      'modernist', 'organic modern',
      // shapes
      'tapered legs', 'hairpin legs', 'splayed legs', 'tulip base',
      'pedestal base', 'organic shape', 'compound curves', 'sculptural',
      'floating', 'low slung', 'wide and low',
    ],
  },
  {
    style: 'minimalist',
    keywords: [
      // materials
      'white lacquer', 'matte finish', 'powder coat', 'concrete', 'glass',
      'acrylic', 'lucite', 'steel', 'aluminum', 'white oak', 'integrated handle',
      'handleless',
      // colors
      'pure white', 'off white', 'light gray', 'medium gray', 'monochrome',
      'tone on tone',
      // descriptors
      'minimalist', 'minimal', 'modern', 'contemporary', 'clean', 'sleek',
      'streamlined', 'simple', 'understated', 'refined', 'pure', 'unadorned',
      'functional', 'architectural', 'european', 'italian design',
      'scandinavian modern',
      // shapes
      'straight lines', 'sharp edges', 'flat surfaces', 'hidden storage',
      'integrated', 'flush', 'frameless', 'wall mounted', 'handle free',
      'geometric', 'rectangular', 'square',
    ],
  },
]

// Hard-coded conflict overrides applied AFTER scoring
const HARD_OVERRIDES: Array<{
  require: string[]
  exclude?: string[]
  force: StyleTag
  remove?: StyleTag[]
}> = [
  // macrame → always bohemian
  { require: ['macrame'], force: 'bohemian', remove: ['coastal', 'minimalist'] },
  // kilim → always bohemian
  { require: ['kilim'], force: 'bohemian', remove: ['coastal'] },
  // seagrass → always coastal (unless colorful → bohemian handled by scoring)
  { require: ['seagrass'], force: 'coastal' },
  // hairpin legs → always mid_century
  { require: ['hairpin leg'], force: 'mid_century' },
  // walnut + tapered legs → mid_century wins over japandi
  { require: ['walnut', 'tapered leg'], force: 'mid_century', remove: ['japandi'] },
  // walnut + minimal/clean lines → japandi wins over mid_century
  { require: ['walnut', 'minimal'], force: 'japandi', remove: ['mid_century'] },
  { require: ['walnut', 'clean lines'], force: 'japandi', remove: ['mid_century'] },
  // rattan + colorful/pattern → bohemian wins over coastal
  { require: ['rattan', 'colorful'], force: 'bohemian', remove: ['coastal'] },
  { require: ['rattan', 'pattern'], force: 'bohemian', remove: ['coastal'] },
  // rattan + white/natural → coastal wins
  { require: ['rattan', 'white'], force: 'coastal', remove: ['bohemian'] },
  { require: ['rattan', 'natural'], force: 'coastal', remove: ['bohemian'] },
  // jute + colorful → bohemian
  { require: ['jute', 'colorful'], force: 'bohemian', remove: ['coastal'] },
  // white + minimal (no ornamentation signals) → minimalist
  { require: ['white', 'minimal'], force: 'minimalist' },
  { require: ['white', 'linen'], force: 'coastal', remove: ['minimalist'] },
]

const CATEGORY_FALLBACKS: Record<string, StyleTag[]> = {
  seating:  ['minimalist', 'mid_century'],
  tables:   ['minimalist'],
  lighting: ['minimalist', 'mid_century'],
  storage:  ['minimalist'],
  beds:     ['minimalist', 'japandi'],
  decor:    ['bohemian', 'coastal'],
  plants:   ['coastal', 'bohemian'],
}

function inferStyleTags(product: Product): StyleTag[] {
  const searchText = [product.name, product.subcategory ?? ''].join(' ').toLowerCase()

  // Score each style
  const scores = new Map<StyleTag, number>()
  for (const { style, keywords } of STYLE_KEYWORD_GROUPS) {
    const count = keywords.filter((kw) => searchText.includes(kw)).length
    if (count > 0) scores.set(style, count)
  }

  // Build initial tag set from scoring
  // Include style if: 2+ matches → always; 1 match → only if it's the top scorer
  // or no conflicting style has more matches (tie → include all tied)
  const maxScore = scores.size > 0 ? Math.max(...scores.values()) : 0
  const tags = new Set<StyleTag>()

  for (const [style, score] of scores) {
    if (score >= 2) {
      tags.add(style)
    } else if (score === 1 && maxScore === 1) {
      // All styles have exactly 1 match — include all (conflict resolution will sort it out)
      tags.add(style)
    } else if (score === 1 && maxScore > 1) {
      // A stronger style exists; skip this single-match style
    }
  }

  // Apply hard overrides
  for (const override of HARD_OVERRIDES) {
    const allPresent = override.require.every((kw) => searchText.includes(kw))
    if (!allPresent) continue
    tags.add(override.force)
    if (override.remove) {
      for (const r of override.remove) tags.delete(r)
    }
  }

  // Fallback if nothing matched
  if (tags.size === 0) {
    const fallback = CATEGORY_FALLBACKS[product.category] ?? ['minimalist']
    for (const t of fallback) tags.add(t)
  }

  return Array.from(tags)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch all products (paginate to bypass Supabase's 1000-row default cap)
  console.log('Fetching all products...')
  const PAGE = 1000
  const products: Product[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, name, category, subcategory, retailer, width_inches, depth_inches, height_inches')
      .order('id')
      .range(from, from + PAGE - 1)

    if (error) throw error
    products.push(...(page as Product[]))
    if (page.length < PAGE) break
  }

  if (products.length === 0) {
    console.log('No products found.')
    return
  }

  console.log(`Total products: ${products.length}`)

  const BATCH_SIZE = 100
  let processed = 0
  let noStyleCount = 0
  let noRoomCount = 0

  const styleDistribution = new Map<StyleTag, number>()
  const roomDistribution = new Map<RoomType, number>()

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)

    const updates = batch.map((p) => {
      const style_tags = inferStyleTags(p)
      const room_types = inferRoomTypes(p)
      return { id: p.id, style_tags, room_types }
    })

    // Track distribution
    for (const u of updates) {
      for (const s of u.style_tags) styleDistribution.set(s as StyleTag, (styleDistribution.get(s as StyleTag) ?? 0) + 1)
      for (const r of u.room_types) roomDistribution.set(r as RoomType, (roomDistribution.get(r as RoomType) ?? 0) + 1)
      if (u.style_tags.length === 0) noStyleCount++
      if (u.room_types.length === 0) noRoomCount++
    }

    // Update each product (update only touches existing rows, no NOT NULL issue)
    const updatePromises = updates.map(({ id, style_tags, room_types }) =>
      supabase
        .from('products')
        .update({ style_tags, room_types })
        .eq('id', id),
    )
    const results = await Promise.all(updatePromises)
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      console.error(`Batch ${i / BATCH_SIZE + 1}: ${failed.length} update(s) failed — ${failed[0]!.error!.message}`)
    }

    processed += batch.length

    if (processed % 200 === 0 || processed === products.length) {
      console.log(`${processed}/${products.length} updated`)
    }
  }

  // ── Final report ────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════')
  console.log('  STYLE TAG DISTRIBUTION')
  console.log('═══════════════════════════════════════════')
  const sortedStyles = [...styleDistribution.entries()].sort((a, b) => b[1] - a[1])
  for (const [tag, count] of sortedStyles) {
    const pct = ((count / products.length) * 100).toFixed(1)
    console.log(`  ${tag.padEnd(14)} ${String(count).padStart(5)}  (${pct}%)`)
  }

  console.log('\n═══════════════════════════════════════════')
  console.log('  ROOM TYPE DISTRIBUTION')
  console.log('═══════════════════════════════════════════')
  const sortedRooms = [...roomDistribution.entries()].sort((a, b) => b[1] - a[1])
  for (const [room, count] of sortedRooms) {
    const pct = ((count / products.length) * 100).toFixed(1)
    console.log(`  ${room.padEnd(14)} ${String(count).padStart(5)}  (${pct}%)`)
  }

  console.log('\n═══════════════════════════════════════════')
  console.log('  QUALITY CHECK')
  console.log('═══════════════════════════════════════════')
  console.log(`  Products with no style tags:  ${noStyleCount}`)
  console.log(`  Products with no room types:  ${noRoomCount}`)

  if (noStyleCount === 0 && noRoomCount === 0) {
    console.log('\n  ✓ All products have both style tags and room types.')
  } else {
    console.log(`\n  ✗ ${noStyleCount + noRoomCount} products still missing tags — check fallback logic.`)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
