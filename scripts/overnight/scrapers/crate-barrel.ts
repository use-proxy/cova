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

const CB_URLS: Array<{ url: string; retailer: 'crate_barrel' | 'cb2' }> = [
  // Crate & Barrel
  { url: 'https://www.crateandbarrel.com/furniture/sofas/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/furniture/chairs/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/furniture/beds/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/furniture/dining-tables/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/furniture/dining-chairs/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/furniture/desks-and-office-chairs/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/lighting/floor-lamps/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/rugs/1', retailer: 'crate_barrel' },
  { url: 'https://www.crateandbarrel.com/outdoor/1', retailer: 'crate_barrel' },
  // CB2
  { url: 'https://www.cb2.com/sofas/f0', retailer: 'cb2' },
  { url: 'https://www.cb2.com/chairs/f0', retailer: 'cb2' },
  { url: 'https://www.cb2.com/beds/f0', retailer: 'cb2' },
  { url: 'https://www.cb2.com/dining-tables/f0', retailer: 'cb2' },
  { url: 'https://www.cb2.com/lighting/f0', retailer: 'cb2' },
  { url: 'https://www.cb2.com/rugs/f0', retailer: 'cb2' },
  { url: 'https://www.cb2.com/outdoor/f0', retailer: 'cb2' },
]

export const crateBarrelConfigs: ScraperConfig[] = CB_URLS.map((entry, i) => ({
  retailer: entry.retailer,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url: entry.url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `${entry.retailer === 'cb2' ? 'CB2' : 'C&B'} ${i + 1}/${CB_URLS.length}: ${entry.url.split('/').slice(-2, -1)[0]}`,
}))
