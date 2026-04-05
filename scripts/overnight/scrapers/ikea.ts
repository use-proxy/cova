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

const IKEA_URLS = [
  'https://www.ikea.com/us/en/cat/sofas-sectionals-fu003/',
  'https://www.ikea.com/us/en/cat/beds-bm003/',
  'https://www.ikea.com/us/en/cat/dining-tables-chairs-fu004/',
  'https://www.ikea.com/us/en/cat/desks-20649/',
  'https://www.ikea.com/us/en/cat/wardrobes-19053/',
  'https://www.ikea.com/us/en/cat/chests-of-drawers-36487/',
  'https://www.ikea.com/us/en/cat/coffee-tables-side-tables-10705/',
  'https://www.ikea.com/us/en/cat/floor-lamps-10731/',
  'https://www.ikea.com/us/en/cat/pendant-lamps-10729/',
  'https://www.ikea.com/us/en/cat/rugs-10653/',
  'https://www.ikea.com/us/en/cat/outdoor-furniture-10186/',
  'https://www.ikea.com/us/en/cat/smart-lighting-36812/',
  'https://www.ikea.com/us/en/cat/armchairs-fu005/',
  'https://www.ikea.com/us/en/cat/bookcases-shelving-units-55002/',
  'https://www.ikea.com/us/en/cat/tv-media-furniture-10705/',
]

export const ikeaConfigs: ScraperConfig[] = IKEA_URLS.map((url, i) => ({
  retailer: 'ikea' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `IKEA ${i + 1}/${IKEA_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
