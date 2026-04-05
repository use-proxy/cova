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
              material: (item.material || '') + ' ' + (item.additionalProperty ? item.additionalProperty.map(p => p.value).join(' ') : ''),
              dimensions: '',
            });
          }
        }
      });
    } catch(e) {}
  });

  // West Elm product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[class*="product-card"], [data-element="product"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[class*="product-name"], [class*="product-title"], h3');
      const priceEl = card.querySelector('[class*="product-price"], [class*="price-value"]');
      const imgEl = card.querySelector('img[src*="westelm"], img[src*="pottery"], img[src*="assets"]');
      const linkEl = card.querySelector('a[href*="/products/"]');
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
            product_url: href.startsWith('http') ? href : 'https://www.westelm.com' + href,
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
    maxPagesPerCrawl: 4,
    waitUntil: ['networkidle2'],
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `West Elm ${i + 1}/${WEST_ELM_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
