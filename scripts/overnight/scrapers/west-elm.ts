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

const WEST_ELM_URLS = [
  'https://www.westelm.com/shop/furniture/sofas-couches/',
  'https://www.westelm.com/shop/furniture/chairs/',
  'https://www.westelm.com/shop/furniture/beds-headboards/',
  'https://www.westelm.com/shop/furniture/dining-room-furniture/',
  'https://www.westelm.com/shop/furniture/office-furniture/',
  'https://www.westelm.com/shop/furniture/coffee-tables/',
  'https://www.westelm.com/shop/furniture/side-end-tables/',
  'https://www.westelm.com/shop/furniture/dressers-nightstands/',
  'https://www.westelm.com/shop/lighting/floor-lamps/',
  'https://www.westelm.com/shop/lighting/pendant-lights/',
  'https://www.westelm.com/shop/lighting/table-lamps/',
  'https://www.westelm.com/shop/rugs/',
  'https://www.westelm.com/shop/outdoor/',
  'https://www.westelm.com/shop/art-decor/wall-art/',
  'https://www.westelm.com/shop/art-decor/mirrors/',
]

export const westElmConfigs: ScraperConfig[] = WEST_ELM_URLS.map((url, i) => ({
  retailer: 'west_elm' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `West Elm ${i + 1}/${WEST_ELM_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
