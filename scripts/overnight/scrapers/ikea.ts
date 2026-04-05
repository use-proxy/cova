import { ScraperConfig } from '../types'

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
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url }],
    maxItems: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `IKEA ${i + 1}/${IKEA_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
