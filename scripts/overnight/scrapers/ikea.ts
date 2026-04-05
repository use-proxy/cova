import { ScraperConfig } from '../types'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

  // Try JSON-LD first
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
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

  // IKEA product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[class*="plp-product-card"], [class*="pip-product-summary"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[class*="pip-header__title"], [class*="plp-product__name"], h3');
      const priceEl = card.querySelector('[class*="pip-price"], [class*="plp-price"]');
      const imgEl = card.querySelector('img');
      const linkEl = card.querySelector('a[href*="/p/"]');
      if (nameEl && priceEl && imgEl && linkEl) {
        const priceStr = priceEl.textContent?.replace(/[^0-9.]/g, '') || '0';
        const price = parseFloat(priceStr);
        const imgSrc = imgEl.getAttribute('src') || '';
        const href = linkEl.getAttribute('href') || '';
        if (price > 0 && imgSrc.startsWith('http') && href) {
          products.push({
            name: nameEl.textContent?.trim() || '',
            price,
            image_url: imgSrc,
            product_url: href.startsWith('http') ? href : 'https://www.ikea.com' + href,
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
    waitUntil: ['networkidle2'],
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `IKEA ${i + 1}/${IKEA_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
