import { ApifyClient } from 'apify-client'
import * as fs from 'fs'
import * as path from 'path'

const client = new ApifyClient({ token: process.env.APIFY_TOKEN })

// shahidirfan/ikea-product-scraper uses category search terms + country, not startUrls
const CATEGORIES = [
  'sofas',
  'armchairs',
  'coffee tables',
  'dining tables',
  'beds',
  'chests of drawers',
  'bookcases',
  'floor lamps',
]

interface IkeaProduct {
  name: string
  price: string
  image_url: string
  product_url: string
  description: string | null
  retailer: string
  source: string
}

function normalise(item: Record<string, unknown>): IkeaProduct | null {
  const name = (item.name ?? item.title ?? item.productName) as string | undefined
  const priceRaw = item.price ?? item.salesPrice ?? item.regularPrice ?? item.priceNumeral
  const price = priceRaw != null ? String(priceRaw) : undefined
  const image_url = (item.image ?? item.imageUrl ?? item.mainImageUrl ?? item.smallImageUrl) as string | undefined
  const product_url = (item.url ?? item.productUrl ?? item.link) as string | undefined
  const description = (item.description ?? item.typeName ?? item.categoryPath ?? null) as string | null

  if (!name || !price || !image_url || !product_url) return null
  return {
    name: String(name),
    price,
    image_url: String(image_url),
    product_url: String(product_url),
    description,
    retailer: 'IKEA',
    source: 'ikea',
  }
}

export async function main(): Promise<void> {
  const allProducts: IkeaProduct[] = []

  for (let i = 0; i < CATEGORIES.length; i++) {
    const category = CATEGORIES[i]!
    try {
      const input = {
        country: 'us',
        language: 'en',
        category,
        maxProducts: 150,
        maxPages: 5,
        proxyConfiguration: { useApifyProxy: true },
      }

      const run = await client.actor('shahidirfan/ikea-product-scraper').call(input)
      const { items } = await client.dataset(run.defaultDatasetId).listItems()

      const products: IkeaProduct[] = []
      for (const item of items) {
        const normalised = normalise(item as Record<string, unknown>)
        if (normalised) products.push(normalised)
      }

      console.log(`Scraped category ${i + 1} of ${CATEGORIES.length} ("${category}"): ${products.length} products found`)
      allProducts.push(...products)
    } catch (err) {
      console.error(`Failed to scrape category "${category}":`, err instanceof Error ? err.message : err)
    }
  }

  const rawDataDir = path.join(path.dirname(process.argv[1]!), 'raw-data')
  if (!fs.existsSync(rawDataDir)) fs.mkdirSync(rawDataDir, { recursive: true })

  const outputPath = path.join(rawDataDir, `ikea-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2))
  console.log(`\nSaved ${allProducts.length} total products to ${outputPath}`)
}

main()
