import { ScraperConfig } from '../types'

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
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    url,
    maxItems: 150,
  },
  maxItems: 150,
  label: `Best Buy ${i + 1}/${BEST_BUY_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
