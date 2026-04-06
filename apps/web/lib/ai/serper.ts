// apps/web/lib/ai/serper.ts

const SERPER_API_KEY = process.env.SERPER_API_KEY
const SERPER_ENDPOINT = 'https://google.serper.dev/shopping'

export interface SerperProduct {
  title: string
  price: number           // parsed from price string, in USD
  currency: string
  imageUrl: string
  productUrl: string
  retailer: string        // extracted from source field
  rating: number | null   // 0-5
  ratingCount: number | null
  delivery: string | null
  isSale: boolean
}

export interface SerperSearchResult {
  products: SerperProduct[]
  query: string
}

// Parse price string like "$1,299.00" or "£899" to number
function parsePrice(priceStr: string): number {
  const cleaned = priceStr.replace(/[^0-9.]/g, '')
  return parseFloat(cleaned) || 0
}

// Extract retailer name from source URL or source string
function extractRetailer(source: string, link: string): string {
  try {
    const hostname = new URL(link).hostname
    return hostname.replace('www.', '').split('.')[0] ?? source
  } catch {
    return source || 'Unknown'
  }
}

export async function searchProducts(
  query: string,
  maxResults: number = 10,
): Promise<SerperSearchResult> {
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY is not set')
  }

  const response = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
      gl: 'us',
      hl: 'en',
    }),
  })

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as {
    shopping?: Array<{
      title: string
      price: string
      imageUrl: string
      link: string
      source: string
      rating?: number
      ratingCount?: number
      delivery?: string
      badge?: string
    }>
  }

  const products: SerperProduct[] = (data.shopping ?? [])
    .slice(0, maxResults)
    .map((item) => ({
      title: item.title,
      price: parsePrice(item.price),
      currency: 'USD',
      imageUrl: item.imageUrl,
      productUrl: item.link,
      retailer: extractRetailer(item.source, item.link),
      rating: item.rating ?? null,
      ratingCount: item.ratingCount ?? null,
      delivery: item.delivery ?? null,
      isSale: item.badge?.toLowerCase().includes('sale') ?? false,
    }))
    .filter((p) => p.price > 0 && p.imageUrl && p.productUrl)

  return { products, query }
}

// Build search query from Claude Vision description
// isTech: true for TVs, soundbars, lighting, gaming items
export function buildSearchQuery(
  itemDescription: string,
  budgetRange: [number, number] | null,
  isTech: boolean,
): string {
  const currentYear = new Date().getFullYear()
  const parts: string[] = []

  if (isTech) {
    parts.push(itemDescription)
    parts.push(String(currentYear))
  } else {
    parts.push(itemDescription)
  }

  if (budgetRange) {
    parts.push(`under $${budgetRange[1]}`)
  }

  return parts.join(' ')
}

// Tech categories that need year-forced queries
export const TECH_CATEGORIES = new Set([
  'tv', 'television', 'monitor', 'soundbar', 'speaker', 'smart light',
  'smart lighting', 'gaming', 'console', 'display', 'projector',
])

export function isTechItem(label: string): boolean {
  const lower = label.toLowerCase()
  return Array.from(TECH_CATEGORIES).some((cat) => lower.includes(cat))
}
