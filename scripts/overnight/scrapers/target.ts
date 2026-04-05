import { ScraperConfig } from '../types'

const TARGET_URLS = [
  'https://www.target.com/c/furniture/-/N-5xtnr',
  'https://www.target.com/c/sofas-sectionals-living-room-furniture/-/N-55b2n',
  'https://www.target.com/c/accent-chairs-living-room-furniture/-/N-55b2q',
  'https://www.target.com/c/bedroom-furniture/-/N-55b2e',
  'https://www.target.com/c/dining-room-furniture/-/N-55b2d',
  'https://www.target.com/c/home-office-furniture/-/N-55b2f',
  'https://www.target.com/c/lamps-lighting/-/N-55b1m',
  'https://www.target.com/c/rugs-home/-/N-5xu1d',
  'https://www.target.com/c/outdoor-furniture/-/N-5xt2y',
  'https://www.target.com/c/smart-home/-/N-55b2b',
  'https://www.target.com/c/bedding/-/N-5xu19',
]

export const targetConfigs: ScraperConfig[] = TARGET_URLS.map((url, i) => ({
  retailer: 'target' as const,
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url }],
    maxItems: 200,
  },
  maxItems: 200,
  label: `Target ${i + 1}/${TARGET_URLS.length}: ${url.split('/c/')[1]?.split('/')[0] ?? url.split('/').slice(-1)[0]}`,
}))
