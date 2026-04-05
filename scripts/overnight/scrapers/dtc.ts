import { ScraperConfig, RetailerSlug } from '../types'

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

const DTC_URLS: Array<{ url: string; retailer: RetailerSlug }> = [
  { url: 'https://burrow.com/collections/all', retailer: 'burrow' },
  { url: 'https://burrow.com/collections/sofas', retailer: 'burrow' },
  { url: 'https://burrow.com/collections/sectionals', retailer: 'burrow' },
  { url: 'https://floydhome.com/collections/all', retailer: 'floyd' },
  { url: 'https://floydhome.com/collections/beds', retailer: 'floyd' },
  { url: 'https://www.maidenhome.com/collections/all', retailer: 'maiden_home' },
  { url: 'https://www.maidenhome.com/collections/sofas', retailer: 'maiden_home' },
  { url: 'https://www.maidenhome.com/collections/chairs', retailer: 'maiden_home' },
]

export const dtcConfigs: ScraperConfig[] = DTC_URLS.map((entry, i) => ({
  retailer: entry.retailer,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url: entry.url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 150,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `DTC ${entry.retailer} ${i + 1}/${DTC_URLS.length}: ${entry.url.split('/').slice(-1)[0]}`,
}))
