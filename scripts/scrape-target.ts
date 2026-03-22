import { ApifyClient } from 'apify-client'
import * as fs from 'fs'
import * as path from 'path'

const client = new ApifyClient({ token: process.env.APIFY_TOKEN })

const SEARCH_QUERIES = [
  'sofa couch living room',
  'accent chair',
  'coffee table',
  'bed frame',
  'dresser chest drawers',
  'floor lamp',
  'area rug',
  'dining table set',
]

interface TargetProduct {
  name: string
  price: string
  image_url: string
  product_url: string
  description: string | null
  retailer: string
  source: string
}

function normalise(item: Record<string, unknown>): TargetProduct | null {
  const name = (item.name ?? item.title ?? item.productTitle ?? item.product_title) as string | undefined
  const priceRaw = item.price ?? item.currentPrice ?? item.salePrice ?? item.regularPrice ?? item.offer_price ?? item.list_price ?? item.currentPriceValue
  const price = priceRaw != null ? String(priceRaw) : undefined
  const image_url = (item.image ?? item.imageUrl ?? item.primaryImageUrl ?? item.imageLink ?? item.primary_image ?? item.main_image) as string | undefined
  const product_url = (item.url ?? item.productUrl ?? item.link ?? item.product_url) as string | undefined
  const description = (item.description ?? item.shortDescription ?? null) as string | null

  if (!name || !price || !image_url || !product_url) return null
  return {
    name: String(name),
    price,
    image_url: String(image_url),
    product_url: String(product_url),
    description,
    retailer: 'Target',
    source: 'target',
  }
}

export async function main(): Promise<void> {
  const rawDataDir = path.join(path.dirname(process.argv[1]!), 'raw-data')
  if (!fs.existsSync(rawDataDir)) fs.mkdirSync(rawDataDir, { recursive: true })

  const allProducts: TargetProduct[] = []

  try {
    const run = await client.actor('automation-lab/target-scraper').call({
      searchQueries: SEARCH_QUERIES,
      maxProductsPerSearch: 75,
      maxSearchPages: 4,
      sort: 'relevance',
    })

    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    console.log(`Raw items from actor: ${items.length}`)

    if (items.length > 0) {
      console.log('Sample item fields:', Object.keys(items[0] as Record<string, unknown>).join(', '))
      console.log('Sample item:', JSON.stringify(items[0], null, 2).slice(0, 800))
    }

    for (const item of items) {
      const normalised = normalise(item as Record<string, unknown>)
      if (normalised) allProducts.push(normalised)
    }

    console.log(`Normalised ${allProducts.length} products from ${items.length} raw items`)
  } catch (err) {
    console.error('Failed to scrape Target:', err instanceof Error ? err.message : err)
  }

  const outputPath = path.join(rawDataDir, `target-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2))
  console.log(`\nSaved ${allProducts.length} total products to ${outputPath}`)
}

main()
