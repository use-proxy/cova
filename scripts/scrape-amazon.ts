import { ApifyClient } from 'apify-client'
import * as fs from 'fs'
import * as path from 'path'

const client = new ApifyClient({ token: process.env.APIFY_TOKEN })

const KEYWORDS = [
  'modern sofa living room',
  'accent chair bedroom',
  'coffee table wood',
  'floor lamp modern',
  'dining table set',
  'bookshelf wood',
  'area rug 8x10',
  'bed frame platform',
  'dresser 6 drawer',
  'pendant light dining room',
  'nightstand wood',
  'tv console modern',
  'rattan accent chair',
  'velvet sofa',
  'marble coffee table',
  'boucle chair',
  'mid century sofa',
  'japandi desk',
  'wicker chair indoor',
  'ceramic table lamp',
]

interface AmazonProduct {
  name: string
  price: string
  image_url: string
  product_url: string
  description: string | null
  retailer: string
  source: string
}

function normalise(item: Record<string, unknown>): AmazonProduct | null {
  const name = (item.title ?? item.name ?? item.productName) as string | undefined
  const priceRaw = item.price ?? item.salePrice ?? item.currentPrice ?? item.wholeSalePrice
  const price = priceRaw != null ? String(priceRaw) : undefined
  const image_url = (item.thumbnailImage ?? item.imageUrl ?? item.image ?? item.imgUrl ?? item.mainImage) as string | undefined
  const asin = item.asin as string | undefined
  const product_url = (item.url ?? item.productUrl ?? item.link ??
    (asin ? `https://www.amazon.com/dp/${asin}` : undefined)) as string | undefined
  const description = (item.description ?? null) as string | null

  if (!name || !price || !image_url || !product_url) return null
  return {
    name: String(name),
    price,
    image_url: String(image_url),
    product_url: String(product_url),
    description,
    retailer: 'Amazon',
    source: 'amazon',
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function main(): Promise<void> {
  const rawDataDir = path.join(path.dirname(process.argv[1]!), 'raw-data')
  if (!fs.existsSync(rawDataDir)) fs.mkdirSync(rawDataDir, { recursive: true })

  const allProducts: AmazonProduct[] = []
  const outputPath = path.join(rawDataDir, `amazon-${Date.now()}.json`)

  for (let i = 0; i < KEYWORDS.length; i++) {
    const keyword = KEYWORDS[i]!

    if (i > 0) {
      console.log(`Waiting 30s before next keyword...`)
      await sleep(30_000)
    }

    console.log(`[${i + 1}/${KEYWORDS.length}] Searching: "${keyword}"`)

    try {
      const run = await client.actor('sovereigntaylor/amazon-product-scraper').call({
        searchQuery: keyword,
        marketplace: 'amazon.com',
        maxProducts: 60,
      })

      const { items } = await client.dataset(run.defaultDatasetId).listItems()
      const products: AmazonProduct[] = []
      for (const item of items) {
        const normalised = normalise(item as Record<string, unknown>)
        if (normalised) products.push(normalised)
      }

      allProducts.push(...products)
      console.log(`[${i + 1}/${KEYWORDS.length}] Done: ${products.length} products (total: ${allProducts.length})`)
    } catch (err) {
      console.error(`[${i + 1}/${KEYWORDS.length}] Failed "${keyword}": ${err instanceof Error ? err.message : err}`)
    }

    // Checkpoint after every keyword
    fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2))
    console.log(`[${i + 1}/${KEYWORDS.length}] Checkpoint saved: ${allProducts.length} total products`)
  }

  console.log(`\nFinal total: ${allProducts.length} products saved to ${outputPath}`)
}

main()
