import { ScraperConfig } from '../types'

// JSON-LD + meta fallback page function for generic product listing pages
const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

  // Extract JSON-LD structured data
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '{}');
      const items = Array.isArray(data) ? data : [data];
      items.forEach(item => {
        if (item['@type'] === 'Product') {
          const offers = item.offers || {};
          const offerList = Array.isArray(offers) ? offers : [offers];
          const price = offerList[0]?.price || offerList[0]?.lowPrice || null;
          const image = Array.isArray(item.image) ? item.image[0] : item.image;
          if (item.name && price && image) {
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
        if (item['@type'] === 'ItemList') {
          (item.itemListElement || []).forEach(el => {
            const product = el.item || el;
            if (product['@type'] === 'Product' && product.name) {
              const offers = product.offers || {};
              const offerList = Array.isArray(offers) ? offers : [offers];
              const price = offerList[0]?.price || null;
              const image = Array.isArray(product.image) ? product.image[0] : product.image;
              if (price && image) {
                products.push({
                  name: product.name,
                  price: parseFloat(String(price).replace(/[^0-9.]/g, '')),
                  image_url: image,
                  product_url: product.url || request.url,
                  description: product.description || '',
                  material: '',
                  dimensions: '',
                });
              }
            }
          });
        }
      });
    } catch(e) {}
  });

  // Wayfair-specific extraction if JSON-LD insufficient
  if (products.length === 0) {
    const cards = document.querySelectorAll('[data-hb-id], [class*="ProductCard"], [class*="productCard"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[class*="ProductName"], [class*="productName"], h3, h2, a[href*="/product"]');
      const priceEl = card.querySelector('[class*="Price"], [data-testid*="price"]');
      const imgEl = card.querySelector('img[src*="wayfair"], img[data-src]');
      const linkEl = card.querySelector('a[href*="/product"], a[href*="wayfair.com"]');
      if (nameEl && priceEl && imgEl) {
        const priceStr = priceEl.textContent?.replace(/[^0-9.]/g, '') || '';
        const price = parseFloat(priceStr);
        const imgSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
        const href = linkEl?.getAttribute('href') || request.url;
        if (price > 0 && imgSrc.startsWith('http')) {
          products.push({
            name: nameEl.textContent?.trim() || '',
            price,
            image_url: imgSrc,
            product_url: href.startsWith('http') ? href : 'https://www.wayfair.com' + href,
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

const WAYFAIR_URLS = [
  'https://www.wayfair.com/furniture/cat/sofas-c413892.html',
  'https://www.wayfair.com/furniture/cat/sectional-sofas-c413893.html',
  'https://www.wayfair.com/furniture/cat/accent-chairs-c1780251.html',
  'https://www.wayfair.com/furniture/cat/beds-c1840413.html',
  'https://www.wayfair.com/furniture/cat/dining-tables-c215323.html',
  'https://www.wayfair.com/furniture/cat/dining-chairs-c215325.html',
  'https://www.wayfair.com/furniture/cat/desks-c45974.html',
  'https://www.wayfair.com/furniture/cat/office-chairs-c45971.html',
  'https://www.wayfair.com/furniture/cat/dressers-chests-c215330.html',
  'https://www.wayfair.com/furniture/cat/coffee-tables-c45825.html',
  'https://www.wayfair.com/furniture/cat/side-end-tables-c45829.html',
  'https://www.wayfair.com/furniture/sb0/tv-stands-media-consoles-c414636.html',
  'https://www.wayfair.com/furniture/sb0/bookcases-storage-c414626.html',
  'https://www.wayfair.com/furniture/sb0/nightstands-c414641.html',
  'https://www.wayfair.com/lighting/cat/floor-lamps-c215291.html',
  'https://www.wayfair.com/lighting/cat/pendant-lights-c215293.html',
  'https://www.wayfair.com/lighting/cat/table-lamps-c215292.html',
  'https://www.wayfair.com/rugs/cat/area-rugs-c215288.html',
  'https://www.wayfair.com/outdoor/cat/outdoor-sofas-c215361.html',
  'https://www.wayfair.com/outdoor/cat/outdoor-dining-sets-c215360.html',
  'https://www.wayfair.com/home-improvement/cat/smart-lighting-c1779020.html',
  'https://www.wayfair.com/furniture/sb0/bar-stools-c414606.html',
]

export const wayfairConfigs: ScraperConfig[] = WAYFAIR_URLS.map((url, i) => ({
  retailer: 'wayfair' as const,
  // Use the known-working Wayfair-specific actor
  actorId: '123webdata/wayfair-scraper',
  input: {
    categoryUrls: [url],
    usePagination: true,
    maxResultsPerScrape: 500,
  },
  maxItems: 500,
  label: `Wayfair ${i + 1}/${WAYFAIR_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))

// Also add a generic web-scraper fallback config for additional pages
export const wayfairGenericConfigs: ScraperConfig[] = WAYFAIR_URLS.slice(0, 5).map((url, i) => ({
  retailer: 'wayfair' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 3,
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 500,
  label: `Wayfair-generic ${i + 1}: ${url.split('/').slice(-1)[0]}`,
}))
