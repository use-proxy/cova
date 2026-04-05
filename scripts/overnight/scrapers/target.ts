import { ScraperConfig } from '../types'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

  // Target uses JSON-LD
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

  // Target product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[data-test="product-details"], [class*="ProductCard"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[data-test="product-title"], a[href*="/p/"]');
      const priceEl = card.querySelector('[data-test="product-price"], [class*="Price"]');
      const imgEl = card.querySelector('img[src*="target.scene7"]');
      const linkEl = card.querySelector('a[href*="/p/"]');
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
            product_url: href.startsWith('http') ? href : 'https://www.target.com' + href,
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
    maxPagesPerCrawl: 4,
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 100,
  label: `Target ${i + 1}/${TARGET_URLS.length}: ${url.split('-/')[1]?.slice(0, 10) ?? url.split('/').slice(-2, -1)[0]}`,
}))
