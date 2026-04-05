import { ScraperConfig } from '../types'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

  // Article uses JSON-LD extensively
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '{}');
      const items = Array.isArray(data) ? data : [data];
      items.forEach(item => {
        if (item['@type'] === 'Product' && item.name) {
          const offers = item.offers || {};
          const offerList = Array.isArray(offers) ? offers : [offers];
          const price = offerList[0]?.price || null;
          const image = Array.isArray(item.image) ? item.image[0] : item.image;
          if (price && image) {
            products.push({
              name: item.name,
              price: parseFloat(String(price).replace(/[^0-9.]/g, '')),
              image_url: image,
              product_url: item.url || request.url,
              description: item.description || '',
              material: '',
              dimensions: '',
            });
          }
        }
      });
    } catch(e) {}
  });

  // Article product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[data-testid="product-name"], [class*="product-name"], h3');
      const priceEl = card.querySelector('[data-testid="product-price"], [class*="price"]');
      const imgEl = card.querySelector('img');
      const linkEl = card.querySelector('a[href*="/en-us/p/"]');
      if (nameEl && priceEl && imgEl) {
        const priceStr = priceEl.textContent?.replace(/[^0-9.]/g, '') || '0';
        const price = parseFloat(priceStr);
        const imgSrc = imgEl.getAttribute('src') || '';
        const href = linkEl?.getAttribute('href') || request.url;
        if (price > 0 && imgSrc.startsWith('http')) {
          products.push({
            name: nameEl.textContent?.trim() || '',
            price,
            image_url: imgSrc,
            product_url: href.startsWith('http') ? href : 'https://www.article.com' + href,
            description: '',
            material: '',
            dimensions: '',
          });
        }
      }
    });
  }

  return products;
}
`

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
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 100,
  label: `Article ${i + 1}/${ARTICLE_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))
