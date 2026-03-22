import { ApifyClient } from 'apify-client'
import * as fs from 'fs'
import * as path from 'path'

const client = new ApifyClient({ token: process.env.APIFY_TOKEN })

const WEST_ELM_URLS = [
  'https://www.westelm.com/shop/furniture/sofas-sectionals/',
  'https://www.westelm.com/shop/furniture/chairs/',
  'https://www.westelm.com/shop/furniture/coffee-tables/',
  'https://www.westelm.com/shop/lighting/floor-lamps/',
]

const CB2_URLS = [
  'https://www.cb2.com/shop/sofas',
  'https://www.cb2.com/shop/chairs',
  'https://www.cb2.com/shop/coffee-tables',
  'https://www.cb2.com/shop/lighting',
]

// pageFunction injected into apify/website-content-crawler.
// Extracts product data from JSON-LD structured data and meta tags.
const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { page, request } = context;

  // Extract JSON-LD structured data (most reliable source)
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  const products = [];

  jsonLdScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '{}');
      const items = Array.isArray(data) ? data : [data];
      items.forEach(item => {
        if (item['@type'] === 'Product' || item['@type'] === 'ItemList') {
          if (item['@type'] === 'Product') {
            const offers = item.offers || {};
            const offerList = Array.isArray(offers) ? offers : [offers];
            const price = offerList[0]?.price || offerList[0]?.lowPrice || null;
            const image = Array.isArray(item.image) ? item.image[0] : item.image;
            if (item.name && price) {
              products.push({
                name: item.name,
                price: String(price),
                image_url: image || null,
                product_url: item.url || request.url,
                description: item.description || null,
              });
            }
          }
        }
      });
    } catch (e) {}
  });

  // Fallback: Open Graph / meta tags on product pages
  if (products.length === 0) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
    const priceEl = document.querySelector('[class*="price"], [data-testid*="price"], .product-price');
    const descEl = document.querySelector('meta[name="description"]')?.getAttribute('content');

    if (ogTitle && ogImage) {
      products.push({
        name: ogTitle,
        price: priceEl ? priceEl.textContent?.trim() || null : null,
        image_url: ogImage,
        product_url: ogUrl || request.url,
        description: descEl || null,
      });
    }
  }

  return products;
}
`

interface RetailerProduct {
  name: string
  price: string
  image_url: string
  product_url: string
  description: string | null
  retailer: string
  source: string
}

function normalise(
  item: Record<string, unknown>,
  retailer: string,
  source: string,
): RetailerProduct | null {
  const name = (item.name ?? item.title) as string | undefined
  const price = item.price != null ? String(item.price) : undefined
  const image_url = (item.image_url ?? item.image ?? item.imageUrl) as string | undefined
  const product_url = (item.product_url ?? item.url ?? item.link) as string | undefined
  const description = (item.description ?? null) as string | null

  if (!name || !price || !image_url || !product_url) return null
  return {
    name: String(name),
    price,
    image_url: String(image_url),
    product_url: String(product_url),
    description,
    retailer,
    source,
  }
}

async function scrapeUrls(
  urls: string[],
  retailer: string,
  source: string,
  linkSelector: string,
): Promise<RetailerProduct[]> {
  const products: RetailerProduct[] = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!
    try {
      const input = {
        startUrls: [{ url }],
        linkSelector,
        maxCrawlPages: 100,
        pageFunction: PAGE_FUNCTION,
      }

      const run = await client.actor('apify/website-content-crawler').call(input)
      const { items } = await client.dataset(run.defaultDatasetId).listItems()

      const pageProducts: RetailerProduct[] = []
      for (const item of items) {
        // Items may be arrays (pageFunction returns array) or individual objects
        const entries = Array.isArray(item) ? item : [item]
        for (const entry of entries) {
          const normalised = normalise(entry as Record<string, unknown>, retailer, source)
          if (normalised) pageProducts.push(normalised)
        }
      }

      console.log(`Scraped ${retailer} URL ${i + 1} of ${urls.length}: ${pageProducts.length} products found`)
      products.push(...pageProducts)
    } catch (err) {
      console.error(
        `Failed to scrape ${retailer} URL ${i + 1} (${url}):`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return products
}

export async function main(): Promise<void> {
  const rawDataDir = path.join(path.dirname(process.argv[1]!), 'raw-data')
  if (!fs.existsSync(rawDataDir)) fs.mkdirSync(rawDataDir, { recursive: true })

  // Scrape West Elm
  console.log('\n--- Scraping West Elm ---')
  const westElmProducts = await scrapeUrls(
    WEST_ELM_URLS,
    'West Elm',
    'westelm',
    'a[href*="/products/"]',
  )
  const westElmPath = path.join(rawDataDir, `westelm-${Date.now()}.json`)
  fs.writeFileSync(westElmPath, JSON.stringify(westElmProducts, null, 2))
  console.log(`\nSaved ${westElmProducts.length} West Elm products to ${westElmPath}`)

  // Scrape CB2
  console.log('\n--- Scraping CB2 ---')
  const cb2Products = await scrapeUrls(
    CB2_URLS,
    'CB2',
    'cb2',
    'a[href*="/products/"]',
  )
  const cb2Path = path.join(rawDataDir, `cb2-${Date.now()}.json`)
  fs.writeFileSync(cb2Path, JSON.stringify(cb2Products, null, 2))
  console.log(`Saved ${cb2Products.length} CB2 products to ${cb2Path}`)
}

main()
