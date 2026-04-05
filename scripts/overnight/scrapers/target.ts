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

const TARGET_URLS = [
  'https://www.target.com/c/furniture/-/N-5xtnr',
  'https://www.target.com/c/sofas-sectionals-living-room-furniture/-/N-55b2n',
  'https://www.target.com/c/accent-chairs-living-room-furniture/-/N-55b2q',
  'https://www.target.com/c/bedroom-furniture/-/N-55b2e',
  'https://www.target.com/c/dining-room-furniture/-/N-55b2d',
  'https://www.target.com/c/home-office-furniture/-/N-55b2f',
  'https://www.target.com/c/lamps-lighting/-/N-55b1m',
  'https://www.target.com/c/rugs-home/-/N-5xu1d',
  'https://www.target.com/c/outdoor-furniture/-/N-5xt2y',
  'https://www.target.com/c/smart-home/-/N-55b2b',
  'https://www.target.com/c/bedding/-/N-5xu19',
]

export const targetConfigs: ScraperConfig[] = TARGET_URLS.map((url, i) => ({
  retailer: 'target' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `Target ${i + 1}/${TARGET_URLS.length}: ${url.split('/c/')[1]?.split('/')[0] ?? url.split('/').slice(-1)[0]}`,
}))
