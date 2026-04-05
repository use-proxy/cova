import { ScraperConfig, RetailerSlug } from '../types'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

  // JSON-LD extraction
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
              material: item.material || '',
              dimensions: '',
            });
          }
        }
      });
    } catch(e) {}
  });

  // Shopify-based DTC store product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[class*="product-card"], [class*="ProductCard"], .product-item');
    cards.forEach(card => {
      const nameEl = card.querySelector('[class*="product-title"], [class*="productTitle"], h3, h2, .product-card__title');
      const priceEl = card.querySelector('[class*="price"], .price');
      const imgEl = card.querySelector('img');
      const linkEl = card.querySelector('a[href*="/products/"]');
      if (nameEl && priceEl && imgEl && linkEl) {
        const priceStr = priceEl.textContent?.replace(/[^0-9.]/g, '') || '0';
        const price = parseFloat(priceStr);
        const imgSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
        const fullImgSrc = imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
        const href = linkEl.getAttribute('href') || request.url;
        if (price > 0 && fullImgSrc.startsWith('http')) {
          products.push({
            name: nameEl.textContent?.trim() || '',
            price,
            image_url: fullImgSrc,
            product_url: href.startsWith('http') ? href : new URL(href, request.url).href,
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
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `DTC ${entry.retailer} ${i + 1}/${DTC_URLS.length}: ${entry.url.split('/').slice(-1)[0]}`,
}))
