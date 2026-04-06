import { ApifyClient } from 'apify-client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: 'apps/web/.env.local' })

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? '' })

async function main() {
  console.log('Testing junglee/free-amazon-product-scraper...')
  const run = await client.actor('junglee/free-amazon-product-scraper').call({
    categoryUrls: [{ url: 'https://www.amazon.com/s?k=sofa+couch&rh=n%3A1055398' }],
    maxItems: 10
  })
  console.log('Status:', run.status)
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  console.log('Items:', items.length)
  if (items[0]) console.log('Sample:', JSON.stringify(items[0], null, 2))
}

main().catch(console.error)
