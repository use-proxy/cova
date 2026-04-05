import { ScraperConfig } from '../types'

const ARTICLE_URLS = [
  'https://www.article.com/en-us/categories/sofas',
  'https://www.article.com/en-us/categories/sectionals',
  'https://www.article.com/en-us/categories/accent-chairs',
  'https://www.article.com/en-us/categories/lounge-chairs',
  'https://www.article.com/en-us/categories/beds',
  'https://www.article.com/en-us/categories/dining-tables',
  'https://www.article.com/en-us/categories/dining-chairs',
  'https://www.article.com/en-us/categories/coffee-tables',
  'https://www.article.com/en-us/categories/side-tables',
  'https://www.article.com/en-us/categories/outdoor',
  'https://www.article.com/en-us/categories/lighting',
  'https://www.article.com/en-us/categories/rugs',
  'https://www.article.com/en-us/categories/storage',
  'https://www.article.com/en-us/categories/desks',
]

export const articleConfigs: ScraperConfig[] = ARTICLE_URLS.map((url, i) => ({
  retailer: 'article' as const,
  actorId: 'apify/e-commerce-scraping-tool',
  input: {
    startUrls: [{ url }],
    maxItems: 150,
    proxyConfiguration: { useApifyProxy: true },
  },
  maxItems: 150,
  label: `Article ${i + 1}/${ARTICLE_URLS.length}: ${url.split('/').slice(-1)[0]}`,
}))
