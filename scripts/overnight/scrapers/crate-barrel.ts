import { ScraperConfig } from '../types'

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
          const price = offerList[0]?.price || offerList[0]?.lowPrice || null;
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

  // C&B / CB2 product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[class*="product-card"], [data-component="product-card"], [class*="ProductCard"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[class*="product-name"], [class*="productName"], h3, h2');
      const priceEl = card.querySelector('[class*="product-price"], [class*="price"]');
      const imgEl = card.querySelector('img');
      const linkEl = card.querySelector('a[href]');
      if (nameEl && priceEl && imgEl && linkEl) {
        const priceStr = priceEl.textContent?.replace(/[^0-9.]/g, '') || '0';
        const price = parseFloat(priceStr);
        const imgSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
        const href = linkEl.getAttribute('href') || request.url;
        if (price > 0 && imgSrc.startsWith('http')) {
          const isCB2 = request.url.includes('cb2.com');
          products.push({
            name: nameEl.textContent?.trim() || '',
            price,
            image_url: imgSrc,
            product_url: href.startsWith('http') ? href : (isCB2 ? 'https://www.cb2.com' : 'https://www.crateandbarrel.com') + href,
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
    maxPagesPerCrawl: 4,
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `${entry.retailer === 'cb2' ? 'CB2' : 'C&B'} ${i + 1}/${CB_URLS.length}: ${entry.url.split('/').slice(-2, -1)[0]}`,
}))
