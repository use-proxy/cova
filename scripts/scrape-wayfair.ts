import { ApifyClient } from 'apify-client'
import * as fs from 'fs'
import * as path from 'path'

const client = new ApifyClient({ token: process.env.APIFY_TOKEN })

// URLs 1-6 already saved (712 products). Resume from URL 7.
const REMAINING_URLS = [
  'https://www.wayfair.com/furniture/sb0/floor-lamps-c414610.html',
  'https://www.wayfair.com/lighting/sb0/pendant-lights-c215416.html',
  'https://www.wayfair.com/furniture/sb0/bookcases-storage-c414626.html',
  'https://www.wayfair.com/furniture/sb0/dressers-c414644.html',
  'https://www.wayfair.com/furniture/sb0/tv-stands-media-consoles-c414636.html',
  'https://www.wayfair.com/furniture/sb0/bed-frames-c414820.html',
  'https://www.wayfair.com/rugs/sb0/area-rugs-c1781871.html',
]

const EXISTING_FILE = path.join(path.dirname(process.argv[1]!), 'raw-data', 'wayfair-1774078218229.json')
const RAW_DATA_DIR = path.join(path.dirname(process.argv[1]!), 'raw-data')

interface WayfairProduct {
  name: string
  price: string
  image_url: string
  product_url: string
  description: string | null
  retailer: string
  source: string
}

function normalise(item: Record<string, unknown>): WayfairProduct | null {
  const name = (item.name ?? item.title ?? item.productName) as string | undefined
  const price = (item.price ?? item.salePrice ?? item.regularPrice) as string | number | undefined
  const image_url = (item.image ?? item.imageUrl ?? item.thumbnailUrl ?? item.imageLink ?? item.images) as string | undefined
  const product_url = (item.url ?? item.productUrl ?? item.link) as string | undefined
  const description = (item.description ?? item.shortDescription ?? null) as string | null

  if (!name || !price || !image_url || !product_url) return null
  return {
    name: String(name),
    price: String(price),
    image_url: String(image_url),
    product_url: String(product_url),
    description,
    retailer: 'Wayfair',
    source: 'wayfair',
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function main(): Promise<void> {
  if (!fs.existsSync(RAW_DATA_DIR)) fs.mkdirSync(RAW_DATA_DIR, { recursive: true })

  // Load existing 712 products from URLs 1-6
  const allProducts: WayfairProduct[] = JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf8'))
  console.log(`Loaded ${allProducts.length} existing products from prior run (URLs 1-6)`)

  // Output file — written after every URL so crashes don't lose data
  const outputPath = path.join(RAW_DATA_DIR, `wayfair-resume-${Date.now()}.json`)

  for (let i = 0; i < REMAINING_URLS.length; i++) {
    const url = REMAINING_URLS[i]!
    const urlNum = i + 7

    if (i > 0) {
      console.log(`Waiting 30s before next URL...`)
      await sleep(30_000)
    }

    console.log(`[${urlNum}/13] Starting: ${url}`)

    try {
      const run = await client.actor('123webdata/wayfair-scraper').call({
        categoryUrls: [url],
        usePagination: true,
        maxResultsPerScrape: 200,
      })

      const { items } = await client.dataset(run.defaultDatasetId).listItems()
      const products: WayfairProduct[] = []
      for (const item of items) {
        const n = normalise(item as Record<string, unknown>)
        if (n) products.push(n)
      }

      allProducts.push(...products)
      console.log(`[${urlNum}/13] Done: ${products.length} products (running total: ${allProducts.length})`)
    } catch (err) {
      console.error(`[${urlNum}/13] Failed: ${err instanceof Error ? err.message : err}`)
    }

    // Save after every URL so a crash doesn't lose previously collected data
    fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2))
    console.log(`[${urlNum}/13] Saved checkpoint: ${allProducts.length} total products`)
  }

  console.log(`\nFinal total: ${allProducts.length} products saved to ${outputPath}`)
}

main()
