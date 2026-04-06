import { ApifyClient } from 'apify-client'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: 'apps/web/.env.local' })

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? '' })

async function test() {
  console.log('Testing apify/web-scraper with Article sofas page...')
  const run = await client.actor('apify/web-scraper').call({
    startUrls: [{ url: 'https://www.article.com/en-us/categories/sofas' }],
    pageFunction: `async function pageFunction(context) {
      const { $, request, log } = context;
      const products = [];
      $('a[href*="/products/"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const url = href.startsWith('http') ? href : 'https://www.article.com' + href;
        const img = $(el).find('img').first();
        const name = img.attr('alt') || $(el).text().trim();
        const priceEl = $(el).find('[class*="price"], [data-price]');
        const priceText = priceEl.text().trim();
        const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
        const image_url = img.attr('src') || img.attr('data-src') || '';
        if (name && name.length > 3 && url.includes('/products/')) {
          products.push({ name, price: price || 0, image_url, product_url: url });
        }
      });
      log.info('Found products: ' + products.length);
      return products;
    }`,
    injectJQuery: true,
    useChrome: true,
    maxPagesPerCrawl: 1,
    maxResultsPerCrawl: 20,
    proxyConfiguration: { useApifyProxy: true }
  })

  console.log('Run ID:', run.id, '| Status:', run.status)
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  console.log('Items returned:', items.length)
  if (items.length > 0) console.log('Sample:', JSON.stringify(items[0], null, 2))
}

test().catch(console.error)
