import { ScraperConfig } from '../types'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { request } = context;
  const products = [];

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

  // B&H product listing fallback
  if (products.length === 0) {
    const cards = document.querySelectorAll('[class*="productItem"], [data-selenium="miniProductPage"]');
    cards.forEach(card => {
      const nameEl = card.querySelector('[data-selenium="itemName"], [class*="productName"]');
      const priceEl = card.querySelector('[data-selenium="price"], [class*="price"]');
      const imgEl = card.querySelector('img[src*="bhphotovideo"]');
      const linkEl = card.querySelector('a[href*="/c/product/"]');
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
            product_url: href.startsWith('http') ? href : 'https://www.bhphotovideo.com' + href,
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

const BH_URLS = [
  'https://www.bhphotovideo.com/c/browse/Smart-Home/ci/53450',
  'https://www.bhphotovideo.com/c/browse/Portable-Bluetooth-Speakers/ci/13761',
  'https://www.bhphotovideo.com/c/browse/Home-Theater-Receivers/ci/180',
  'https://www.bhphotovideo.com/c/browse/Smart-Displays/ci/58793',
]

export const bhConfigs: ScraperConfig[] = BH_URLS.map((url, i) => ({
  retailer: 'bh' as const,
  actorId: 'apify/web-scraper',
  input: {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    maxPagesPerCrawl: 5,
    waitUntil: 'networkidle2',
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `B&H ${i + 1}/${BH_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))
