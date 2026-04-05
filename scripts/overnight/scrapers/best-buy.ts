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

const BEST_BUY_URLS = [
  'https://www.bestbuy.com/site/smart-home/smart-lighting/pcmcat380300050004.c',
  'https://www.bestbuy.com/site/speakers/smart-speakers/pcmcat256000050003.c',
  'https://www.bestbuy.com/site/home-theater/soundbars/abcat0204000.c',
  'https://www.bestbuy.com/site/tvs/all-flat-screen-tvs/abcat0101001.c',
  'https://www.bestbuy.com/site/smart-home/smart-plugs-outlets/pcmcat310200050009.c',
  'https://www.bestbuy.com/site/vacuums-floor-care/robot-vacuums/pcmcat398100050001.c',
  'https://www.bestbuy.com/site/air-quality/air-purifiers/pcmcat310200050010.c',
  'https://www.bestbuy.com/site/smart-home/smart-displays/pcmcat1567534571558.c',
]

export const bestBuyConfigs: ScraperConfig[] = BEST_BUY_URLS.map((url, i) => ({
  retailer: 'best_buy' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 150,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `Best Buy ${i + 1}/${BEST_BUY_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
