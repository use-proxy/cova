import { ScraperConfig, RetailerSlug } from '../types'

const DTC_URLS: Array<{ url: string; retailer: RetailerSlug }> = [
  { url: 'https://burrow.com/collections/all', retailer: 'burrow' },
  { url: 'https://burrow.com/collections/sofas', retailer: 'burrow' },
  { url: 'https://burrow.com/collections/sectionals', retailer: 'burrow' },
  { url: 'https://floydhome.com/collections/all', retailer: 'floyd' },
  { url: 'https://floydhome.com/collections/beds', retailer: 'floyd' },
  { url: 'https://www.maidenhome.com/collections/all', retailer: 'maiden_home' },
  { url: 'https://www.maidenhome.com/collections/sofas', retailer: 'maiden_home' },
  { url: 'https://www.maidenhome.com/collections/chairs', retailer: 'maiden_home' },
]

export const dtcConfigs: ScraperConfig[] = DTC_URLS.map((entry, i) => ({
  retailer: entry.retailer,
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url: entry.url }],
    maxItems: 150,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `DTC ${entry.retailer} ${i + 1}/${DTC_URLS.length}: ${entry.url.split('/').slice(-1)[0]}`,
}))
