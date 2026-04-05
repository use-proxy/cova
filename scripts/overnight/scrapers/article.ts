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

const ARTICLE_URLS = [
  'https://www.article.com/en-us/categories/sofas',
  'https://www.article.com/en-us/categories/sectionals',
  'https://www.article.com/en-us/categories/accent-chairs',
  'https://www.article.com/en-us/categories/lounge-chairs',
  'https://www.article.com/en-us/categories/beds',
  'https://www.article.com/en-us/categories/dining-tables',
  'https://www.article.com/en-us/categories/dining-chairs',
  'https://www.article.com/en-us/categories/coffee-tables',
  'https://www.article.com/en-us/categories/side-tables',
  'https://www.article.com/en-us/categories/outdoor',
  'https://www.article.com/en-us/categories/lighting',
  'https://www.article.com/en-us/categories/rugs',
  'https://www.article.com/en-us/categories/storage',
  'https://www.article.com/en-us/categories/desks',
]

export const articleConfigs: ScraperConfig[] = ARTICLE_URLS.map((url, i) => ({
  retailer: 'article' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    maxResultsPerCrawl: 150,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `Article ${i + 1}/${ARTICLE_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))
