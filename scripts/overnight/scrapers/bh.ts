import { ScraperConfig } from '../types'

const PAGE_FUNCTION = `async function pageFunction(context) {
  const { $, request } = context;
  const products = [];
  $('[data-testid="product-card"], .product-card, .product-item, article').each((i, el) => {
    const name = $(el).find('h2, h3, .product-name, .product-title').first().text().trim();
    const priceText = $(el).find('.price, [data-testid="price"], .product-price').first().text().trim();
    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
    const image = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';
    const link = $(el).find('a').first().attr('href') || '';
    const url = link.startsWith('http') ? link : request.url.split('/').slice(0,3).join('/') + link;
    if (name && price > 0 && image && url) {
      products.push({ name, price, image_url: image, product_url: url });
    }
  });
  return products;
}`

const BH_URLS = [
  'https://www.bhphotovideo.com/c/browse/Smart-Home/ci/53450',
  'https://www.bhphotovideo.com/c/browse/Portable-Bluetooth-Speakers/ci/13761',
  'https://www.bhphotovideo.com/c/browse/Home-Theater-Receivers/ci/180',
  'https://www.bhphotovideo.com/c/browse/Smart-Displays/ci/58793',
]

export const bhConfigs: ScraperConfig[] = BH_URLS.map((url, i) => ({
  retailer: 'bh' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 100,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 100,
  label: `B&H ${i + 1}/${BH_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))
