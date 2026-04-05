import { v4 as uuidv4 } from 'uuid'
import { RawProduct, NormalizedProduct, ProductCategory, RoomType, StyleTag, RetailerSlug } from './types'
import { log } from './logger'

// ─── Category keyword map ─────────────────────────────────────────────────────
// Each entry: [keyword, category]. First match wins.
const CATEGORY_KEYWORD_MAP: Array<[string, ProductCategory]> = [
  // Seating
  ['sectional', 'sectional'],
  ['loveseat', 'loveseat'],
  ['chaise lounge', 'chaise'],
  ['chaise', 'chaise'],
  ['recliner', 'recliner'],
  ['rocker recliner', 'recliner'],
  ['accent chair', 'accent_chair'],
  ['armchair', 'accent_chair'],
  ['arm chair', 'accent_chair'],
  ['accent chair', 'accent_chair'],
  ['club chair', 'accent_chair'],
  ['wingback', 'accent_chair'],
  ['barrel chair', 'accent_chair'],
  ['papasan', 'accent_chair'],
  ['egg chair', 'accent_chair'],
  ['sofa', 'sofa'],
  ['couch', 'sofa'],
  ['settee', 'sofa'],
  ['daybed', 'daybed'],
  // Beds
  ['bed frame', 'bed_frame'],
  ['bedframe', 'bed_frame'],
  ['platform bed', 'bed_frame'],
  ['canopy bed', 'bed_frame'],
  ['bunk bed', 'bed_frame'],
  ['murphy bed', 'bed_frame'],
  ['headboard', 'headboard'],
  ['footboard', 'headboard'],
  ['mattress', 'mattress'],
  ['memory foam', 'mattress'],
  // Dining
  ['dining table', 'dining_table'],
  ['kitchen table', 'dining_table'],
  ['pedestal table', 'dining_table'],
  ['dining chair', 'dining_chair'],
  ['kitchen chair', 'dining_chair'],
  ['bar stool', 'bar_stool'],
  ['counter stool', 'bar_stool'],
  ['barstool', 'bar_stool'],
  ['bench', 'bench'],
  // Office
  ['filing cabinet', 'filing_cabinet'],
  ['file cabinet', 'filing_cabinet'],
  ['office chair', 'office_chair'],
  ['task chair', 'office_chair'],
  ['gaming chair', 'office_chair'],
  ['desk', 'desk'],
  ['writing desk', 'desk'],
  ['standing desk', 'desk'],
  ['computer desk', 'desk'],
  ['bookshelf', 'bookshelf'],
  ['bookcase', 'bookshelf'],
  ['shelving unit', 'bookshelf'],
  ['shelf unit', 'bookshelf'],
  ['etagere', 'bookshelf'],
  // Storage
  ['wardrobe', 'wardrobe'],
  ['armoire', 'wardrobe'],
  ['closet organizer', 'wardrobe'],
  ['dresser', 'dresser'],
  ['chest of drawers', 'dresser'],
  ['drawer chest', 'dresser'],
  ['nightstand', 'nightstand'],
  ['night stand', 'nightstand'],
  ['bedside table', 'nightstand'],
  ['end table', 'side_table'],
  ['vanity', 'vanity'],
  ['makeup vanity', 'vanity'],
  // Tables
  ['coffee table', 'coffee_table'],
  ['cocktail table', 'coffee_table'],
  ['side table', 'side_table'],
  ['accent table', 'side_table'],
  ['nesting table', 'side_table'],
  ['console table', 'console_table'],
  ['sofa table', 'console_table'],
  ['entryway table', 'console_table'],
  ['tv stand', 'tv_stand'],
  ['tv console', 'tv_stand'],
  ['media console', 'tv_stand'],
  ['entertainment center', 'tv_stand'],
  ['media cabinet', 'tv_stand'],
  // Lighting
  ['floor lamp', 'floor_lamp'],
  ['arc lamp', 'floor_lamp'],
  ['torchiere', 'floor_lamp'],
  ['torchère', 'floor_lamp'],
  ['table lamp', 'table_lamp'],
  ['desk lamp', 'table_lamp'],
  ['bedside lamp', 'table_lamp'],
  ['pendant light', 'pendant_light'],
  ['hanging light', 'pendant_light'],
  ['pendant lamp', 'pendant_light'],
  ['chandelier', 'chandelier'],
  ['crystal chandelier', 'chandelier'],
  ['ceiling fan', 'ceiling_fan'],
  ['ceiling fan', 'ceiling_fan'],
  ['wall sconce', 'wall_sconce'],
  ['sconce', 'wall_sconce'],
  ['wall lamp', 'wall_sconce'],
  // Smart lighting
  ['smart bulb', 'smart_lighting'],
  ['led bulb', 'smart_lighting'],
  ['smart light strip', 'smart_lighting'],
  ['led strip', 'led_strip'],
  ['light strip', 'led_strip'],
  ['hue bulb', 'smart_lighting'],
  ['tradfri', 'smart_lighting'],
  ['govee', 'smart_lighting'],
  ['lifx', 'smart_lighting'],
  ['smart lamp', 'smart_lighting'],
  // Smart home tech
  ['echo show', 'smart_display'],
  ['nest hub', 'smart_display'],
  ['portal', 'smart_display'],
  ['smart display', 'smart_display'],
  ['echo dot', 'smart_speaker'],
  ['echo studio', 'smart_speaker'],
  ['echo plus', 'smart_speaker'],
  ['homepod', 'smart_speaker'],
  ['google home', 'smart_speaker'],
  ['google nest audio', 'smart_speaker'],
  ['sonos', 'smart_speaker'],
  ['bose home speaker', 'smart_speaker'],
  ['smart speaker', 'smart_speaker'],
  ['soundbar', 'soundbar'],
  ['sound bar', 'soundbar'],
  ['home theater bar', 'soundbar'],
  ['subwoofer combo', 'soundbar'],
  ['roomba', 'robot_vacuum'],
  ['roborock', 'robot_vacuum'],
  ['eufy robovac', 'robot_vacuum'],
  ['robot vacuum', 'robot_vacuum'],
  ['robotic vacuum', 'robot_vacuum'],
  ['air purifier', 'air_purifier'],
  ['hepa purifier', 'air_purifier'],
  ['air cleaner', 'air_purifier'],
  ['smart thermostat', 'smart_thermostat'],
  ['nest thermostat', 'smart_thermostat'],
  ['ecobee', 'smart_thermostat'],
  ['smart plug', 'smart_plug'],
  ['smart outlet', 'smart_plug'],
  ['wifi plug', 'smart_plug'],
  ['security camera', 'security_camera'],
  ['smart camera', 'security_camera'],
  ['indoor camera', 'security_camera'],
  ['television', 'tv'],
  [' tv ', 'tv'],
  ['4k tv', 'tv'],
  ['qled', 'tv'],
  ['oled tv', 'tv'],
  ['smart tv', 'tv'],
  // Outdoor
  ['outdoor sofa', 'outdoor_sofa'],
  ['patio sofa', 'outdoor_sofa'],
  ['outdoor sectional', 'outdoor_sofa'],
  ['patio sectional', 'outdoor_sofa'],
  ['outdoor chair', 'outdoor_chair'],
  ['patio chair', 'outdoor_chair'],
  ['adirondack', 'outdoor_chair'],
  ['outdoor dining table', 'outdoor_dining_table'],
  ['patio dining table', 'outdoor_dining_table'],
  ['outdoor dining chair', 'outdoor_dining_chair'],
  ['patio dining chair', 'outdoor_dining_chair'],
  ['outdoor lounge', 'outdoor_lounge'],
  ['chaise lounge outdoor', 'outdoor_lounge'],
  ['patio lounge', 'outdoor_lounge'],
  ['hammock', 'hammock'],
  ['patio umbrella', 'umbrella'],
  ['outdoor umbrella', 'umbrella'],
  ['outdoor rug', 'outdoor_rug'],
  ['patio rug', 'outdoor_rug'],
  ['fire pit', 'fire_pit'],
  ['firepit', 'fire_pit'],
  ['large planter', 'planter_large'],
  ['tall planter', 'planter_large'],
  ['garden planter', 'planter_large'],
  // Decor / soft furnishings
  ['area rug', 'rug'],
  ['area-rug', 'rug'],
  ['runner rug', 'runner'],
  ['rug runner', 'runner'],
  ['curtain', 'curtains'],
  ['drape', 'curtains'],
  ['window panel', 'curtains'],
  ['blind', 'blinds'],
  ['shade', 'blinds'],
  ['throw pillow', 'throw_pillow'],
  ['accent pillow', 'throw_pillow'],
  ['decorative pillow', 'throw_pillow'],
  ['throw blanket', 'blanket'],
  ['blanket', 'blanket'],
  ['plaid throw', 'blanket'],
  ['wall art', 'wall_art'],
  ['canvas art', 'wall_art'],
  ['framed print', 'wall_art'],
  ['wall decor', 'wall_art'],
  ['canvas print', 'wall_art'],
  ['mirror', 'mirror'],
  ['wall mirror', 'mirror'],
  ['decorative mirror', 'mirror'],
  ['sculpture', 'sculpture'],
  ['figurine', 'sculpture'],
  ['statue', 'sculpture'],
  ['vase', 'vase'],
  ['ceramic vase', 'vase'],
  ['planter', 'planter'],
  ['plant pot', 'planter'],
  ['flower pot', 'planter'],
  ['candle', 'candle'],
  ['candle holder', 'candle'],
  ['candlestick', 'candle'],
]

// ─── Room type mapping ────────────────────────────────────────────────────────
const CATEGORY_TO_ROOMS: Record<ProductCategory, RoomType[]> = {
  sofa: ['living_room', 'studio'],
  sectional: ['living_room', 'studio'],
  loveseat: ['living_room', 'studio', 'dorm'],
  chaise: ['living_room', 'bedroom'],
  accent_chair: ['living_room', 'bedroom', 'home_office', 'studio'],
  recliner: ['living_room', 'studio'],
  bed_frame: ['bedroom'],
  headboard: ['bedroom'],
  mattress: ['bedroom', 'dorm'],
  daybed: ['bedroom', 'studio', 'dorm'],
  dining_table: ['dining_room'],
  dining_chair: ['dining_room'],
  bar_stool: ['dining_room', 'first_apartment'],
  bench: ['dining_room', 'bedroom', 'living_room'],
  desk: ['home_office', 'studio', 'dorm', 'bedroom'],
  office_chair: ['home_office', 'studio', 'dorm'],
  bookshelf: ['home_office', 'studio', 'living_room', 'bedroom'],
  filing_cabinet: ['home_office'],
  dresser: ['bedroom'],
  wardrobe: ['bedroom'],
  nightstand: ['bedroom'],
  vanity: ['bedroom', 'bathroom'],
  coffee_table: ['living_room', 'studio'],
  side_table: ['living_room', 'bedroom', 'studio'],
  console_table: ['living_room', 'first_apartment'],
  tv_stand: ['living_room', 'bedroom', 'studio'],
  floor_lamp: ['living_room', 'bedroom', 'home_office', 'studio'],
  table_lamp: ['living_room', 'bedroom', 'home_office', 'studio'],
  pendant_light: ['living_room', 'dining_room', 'bedroom'],
  chandelier: ['living_room', 'dining_room'],
  ceiling_fan: ['living_room', 'bedroom'],
  wall_sconce: ['living_room', 'bedroom', 'bathroom'],
  led_strip: ['living_room', 'bedroom', 'home_office', 'studio'],
  smart_lighting: ['living_room', 'bedroom', 'home_office', 'dining_room', 'studio'],
  rug: ['living_room', 'bedroom', 'dining_room', 'studio'],
  runner: ['living_room', 'dining_room'],
  curtains: ['living_room', 'bedroom', 'home_office'],
  blinds: ['living_room', 'bedroom', 'home_office'],
  throw_pillow: ['living_room', 'bedroom', 'studio'],
  blanket: ['living_room', 'bedroom', 'studio', 'dorm'],
  wall_art: ['living_room', 'bedroom', 'home_office', 'dining_room', 'studio'],
  mirror: ['living_room', 'bedroom', 'bathroom'],
  sculpture: ['living_room', 'home_office'],
  vase: ['living_room', 'dining_room', 'bedroom'],
  planter: ['living_room', 'bedroom', 'home_office', 'studio'],
  candle: ['living_room', 'bedroom', 'dining_room'],
  outdoor_sofa: ['outdoor'],
  outdoor_chair: ['outdoor'],
  outdoor_dining_table: ['outdoor'],
  outdoor_dining_chair: ['outdoor'],
  outdoor_lounge: ['outdoor'],
  hammock: ['outdoor'],
  umbrella: ['outdoor'],
  outdoor_rug: ['outdoor'],
  fire_pit: ['outdoor'],
  planter_large: ['outdoor', 'living_room'],
  tv: ['living_room', 'bedroom', 'studio', 'dorm'],
  soundbar: ['living_room', 'bedroom', 'studio', 'dorm'],
  smart_speaker: ['living_room', 'bedroom', 'home_office', 'dining_room', 'studio'],
  smart_display: ['living_room', 'bedroom', 'home_office', 'studio'],
  smart_plug: ['living_room', 'bedroom', 'home_office', 'dining_room', 'studio'],
  robot_vacuum: ['living_room', 'bedroom', 'home_office', 'dining_room', 'studio'],
  air_purifier: ['living_room', 'bedroom', 'home_office', 'studio'],
  smart_thermostat: ['living_room', 'home_office'],
  security_camera: ['living_room', 'home_office'],
  other: ['living_room'],
}

// ─── Style tag keywords ───────────────────────────────────────────────────────
interface StyleKeywordEntry {
  keywords: string[]
  tags: StyleTag[]
}

const STYLE_KEYWORD_ENTRIES: StyleKeywordEntry[] = [
  { keywords: ['japandi', 'wabi-sabi', 'wabi sabi'], tags: ['japandi', 'minimalist'] },
  { keywords: ['walnut', 'oak', 'teak', 'rattan', 'linen', 'natural fiber', 'bamboo', 'jute', 'seagrass'], tags: ['scandinavian', 'japandi'] },
  { keywords: ['nordic', 'scandinavian', 'scandi', 'hygge', 'danish'], tags: ['scandinavian', 'minimalist'] },
  { keywords: ['velvet', 'gold', 'brass', 'marble', 'crystal', 'jewel'], tags: ['glam', 'art_deco'] },
  { keywords: ['reclaimed', 'distressed', 'barn wood', 'shiplap', 'farmhouse', 'rustic', 'whitewash'], tags: ['rustic', 'farmhouse'] },
  { keywords: ['hairpin leg', 'tapered leg', 'mid-century', 'mid century', 'mcm', 'eames', 'retro 50', '1950s', '1960s', 'tulip'], tags: ['mid_century'] },
  { keywords: ['concrete', 'steel', 'industrial', 'pipe', 'exposed', 'raw metal', 'iron'], tags: ['industrial'] },
  { keywords: ['white', 'clean lines', 'simple design', 'minimal', 'minimalist', 'streamlined', 'pure', 'spare'], tags: ['minimalist', 'scandinavian'] },
  { keywords: ['macrame', 'fringe', 'tassel', 'boho', 'bohemian', 'eclectic', 'global', 'tribal', 'woven'], tags: ['bohemian', 'eclectic'] },
  { keywords: ['coastal', 'beach', 'nautical', 'seaside', 'driftwood', 'blue white', 'wicker', 'natural rope'], tags: ['coastal'] },
  { keywords: ['art deco', 'geometric pattern', 'chevron', 'herringbone', 'gatsby'], tags: ['art_deco'] },
  { keywords: ['traditional', 'classic', 'antique', 'heritage', 'heirloom', 'victorian', 'colonial'], tags: ['traditional'] },
  { keywords: ['modern', 'contemporary', 'current', 'sleek'], tags: ['modern', 'contemporary'] },
  { keywords: ['maximalist', 'layered', 'pattern mix', 'rich color', 'bold print'], tags: ['maximalist', 'eclectic'] },
  { keywords: ['zen', 'meditative', 'serene', 'peaceful', 'tranquil', 'sanctuary'], tags: ['zen', 'minimalist'] },
  { keywords: ['mediterranean', 'tuscan', 'spanish', 'terracotta', 'wrought iron'], tags: ['mediterranean'] },
  { keywords: ['transitional', 'timeless', 'classic modern', 'updated traditional'], tags: ['transitional'] },
]

// ─── Commission rate by retailer ─────────────────────────────────────────────
const COMMISSION_RATES: Record<RetailerSlug, number> = {
  amazon: 0.03,
  wayfair: 0.05,
  west_elm: 0.03,
  crate_barrel: 0.05,
  cb2: 0.05,
  article: 0.08,
  target: 0.05,
  ikea: 0.0,
  best_buy: 0.02,
  bh: 0.02,
  burrow: 0.07,
  floyd: 0.07,
  maiden_home: 0.08,
}

// ─── Affiliate URL builder ────────────────────────────────────────────────────
function buildAffiliateUrl(productUrl: string, retailer: RetailerSlug): string {
  switch (retailer) {
    case 'amazon': {
      const tag = process.env.AMAZON_AFFILIATE_TAG ?? 'cova03-20'
      const asinMatch = productUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)
      if (asinMatch) return `https://www.amazon.com/dp/${asinMatch[1]}?tag=${tag}`
      const sep = productUrl.includes('?') ? '&' : '?'
      return `${productUrl}${sep}tag=${tag}`
    }
    case 'west_elm': {
      const id = process.env.WEST_ELM_AFFILIATE_ID
      if (!id) return productUrl
      return `https://www.shareasale.com/r.cfm?u=${id}&urllink=${encodeURIComponent(productUrl)}`
    }
    case 'crate_barrel': {
      const id = process.env.CRATE_BARREL_AFFILIATE_ID
      if (!id) return productUrl
      return `https://redirect.viglink.com?key=${id}&u=${encodeURIComponent(productUrl)}`
    }
    case 'cb2': {
      const id = process.env.CB2_AFFILIATE_ID
      if (!id) return productUrl
      return `https://redirect.viglink.com?key=${id}&u=${encodeURIComponent(productUrl)}`
    }
    case 'article': {
      const id = process.env.ARTICLE_AFFILIATE_ID
      if (!id) return productUrl
      const sep = productUrl.includes('?') ? '&' : '?'
      return `${productUrl}${sep}awc=${id}`
    }
    case 'ikea':
    case 'best_buy':
    case 'bh':
    case 'target':
    case 'burrow':
    case 'floyd':
    case 'maiden_home':
    case 'wayfair':
    default:
      return productUrl
  }
}

// ─── Price tier ───────────────────────────────────────────────────────────────
function getPriceTier(dollars: number): 'budget' | 'mid' | 'premium' {
  if (dollars < 100) return 'budget'
  if (dollars < 500) return 'mid'
  return 'premium'
}

// ─── Inference helpers ────────────────────────────────────────────────────────
function inferCategory(raw: string, name: string): ProductCategory {
  const combined = `${name} ${raw}`.toLowerCase()
  for (const [keyword, category] of CATEGORY_KEYWORD_MAP) {
    if (combined.includes(keyword)) return category
  }
  return 'other'
}

function inferRoomTypes(category: ProductCategory): RoomType[] {
  return CATEGORY_TO_ROOMS[category] ?? ['living_room']
}

function inferStyleTags(name: string, description: string, material?: string): StyleTag[] {
  const combined = `${name} ${description} ${material ?? ''}`.toLowerCase()
  const tags = new Set<StyleTag>()

  for (const entry of STYLE_KEYWORD_ENTRIES) {
    for (const kw of entry.keywords) {
      if (combined.includes(kw)) {
        for (const tag of entry.tags) tags.add(tag)
        break
      }
    }
  }

  // Skip tech products — no style tags
  const techCategories: ProductCategory[] = ['tv', 'soundbar', 'smart_speaker', 'smart_display', 'smart_plug', 'robot_vacuum', 'air_purifier', 'smart_thermostat', 'security_camera', 'smart_lighting', 'led_strip']
  const category = inferCategory('', name)
  if (techCategories.includes(category)) return []

  const tagArr = Array.from(tags)
  return tagArr.slice(0, 4) as StyleTag[]
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function normalizeProduct(raw: RawProduct): NormalizedProduct | null {
  try {
    // Validate
    if (!raw.name || raw.name.length < 3) return null
    if (!raw.image_url?.startsWith('http')) return null
    if (!raw.product_url?.startsWith('http')) return null
    if (raw.price <= 0 || raw.price > 50000) return null

    const category = inferCategory(raw.raw_category, raw.name)
    const roomTypes = inferRoomTypes(category)
    const styleTags = inferStyleTags(raw.name, raw.raw_description, raw.raw_material)
    const affiliateUrl = buildAffiliateUrl(raw.product_url, raw.retailer)
    const priceTier = getPriceTier(raw.price)

    const product: NormalizedProduct = {
      id: uuidv4(),
      name: raw.name.trim().slice(0, 200),
      price: raw.price,
      retailer: raw.retailer,
      category,
      room_types: roomTypes,
      style_tags: styleTags,
      affiliate_url: affiliateUrl,
      product_url: raw.product_url,
      image_url: raw.image_url,
      supabase_image_url: raw.image_url, // will be overwritten by embed.ts after upload
      clip_embedding_data: null,
      in_stock: true,
      commission_rate: COMMISSION_RATES[raw.retailer] ?? 0,
      created_at: raw.scraped_at,
    }

    void priceTier // used in DB insert, not stored on NormalizedProduct

    return product
  } catch (err) {
    log('NORMALIZER', 'WARN', `Failed to normalize product: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
