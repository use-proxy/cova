import { ScraperConfig } from '../types'

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
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url: entry.url }],
    maxItems: 200,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 200,
  label: `${entry.retailer === 'cb2' ? 'CB2' : 'C&B'} ${i + 1}/${CB_URLS.length}: ${entry.url.split('/').slice(-2, -1)[0]}`,
}))
