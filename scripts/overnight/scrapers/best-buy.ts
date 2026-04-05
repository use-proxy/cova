import { ScraperConfig } from '../types'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

  // Best Buy uses JSON-LD
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
            // Filter TV sizes: must mention 40-75 inch or no size mentioned
            const name = item.name || '';
            const sizeMatch = name.match(/(\d+)[- ]?inch|(\d+)"/i);
            if (sizeMatch) {
              const size = parseInt(sizeMatch[1] || sizeMatch[2] || '0');
              if (size > 0 && (size < 40 || size > 75)) return; // skip non-room TVs
            }
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

  // Best Buy product grid fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('.sku-item, [class*="ProductListing"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('.sku-title, h4 a');
      const priceEl = card.querySelector('.priceView-customer-price span, [aria-label*="Your price"]');
      const imgEl = card.querySelector('img[src*="bestbuy"]');
      const linkEl = card.querySelector('a.image-link, a[href*="/site/"]');
      if (nameEl && priceEl && imgEl) {
        const priceStr = priceEl.getAttribute('aria-label') || priceEl.textContent || '0';
        const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
        const imgSrc = imgEl.getAttribute('src') || '';
        const href = linkEl?.getAttribute('href') || request.url;
        // TV size filter
        const name = nameEl.textContent?.trim() || '';
        const sizeMatch = name.match(/(\d+)[- ]?inch|(\d+)"/i);
        if (sizeMatch) {
          const size = parseInt(sizeMatch[1] || sizeMatch[2] || '0');
          if (size > 0 && (size < 40 || size > 75)) return;
        }
        if (price > 0 && imgSrc.startsWith('http')) {
          products.push({
            name,
            price,
            image_url: imgSrc,
            product_url: href.startsWith('http') ? href : 'https://www.bestbuy.com' + href,
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
    maxPagesPerCrawl: 4,
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 120,
  label: `Best Buy ${i + 1}/${BEST_BUY_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
