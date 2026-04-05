import { ScraperConfig } from '../types'

const BH_URLS = [
  'https://www.bhphotovideo.com/c/browse/Smart-Home/ci/53450',
  'https://www.bhphotovideo.com/c/browse/Portable-Bluetooth-Speakers/ci/13761',
  'https://www.bhphotovideo.com/c/browse/Home-Theater-Receivers/ci/180',
  'https://www.bhphotovideo.com/c/browse/Smart-Displays/ci/58793',
]

export const bhConfigs: ScraperConfig[] = BH_URLS.map((url, i) => ({
  retailer: 'bh' as const,
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url }],
    maxItems: 100,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 100,
  label: `B&H ${i + 1}/${BH_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))
