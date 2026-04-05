import { ScraperConfig } from '../types'

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
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url }],
    maxItems: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `West Elm ${i + 1}/${WEST_ELM_URLS.length}: ${url.split('/').slice(-2, -1)[0]}`,
}))
