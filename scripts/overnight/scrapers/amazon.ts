import { ScraperConfig } from '../types'

const AMAZON_URLS = [
  'https://www.amazon.com/s?k=sofa+couch&rh=n%3A1055398',
  'https://www.amazon.com/s?k=bed+frame&rh=n%3A3732961',
  'https://www.amazon.com/s?k=dining+table+set&rh=n%3A3733551',
  'https://www.amazon.com/s?k=desk+home+office&rh=n%3A1069242',
  'https://www.amazon.com/s?k=floor+lamp&rh=n%3A1063306',
  'https://www.amazon.com/s?k=area+rug+8x10&rh=n%3A684541011',
  'https://www.amazon.com/s?k=outdoor+patio+furniture&rh=n%3A3732961',
  'https://www.amazon.com/s?k=smart+light+bulb+alexa&rh=n%3A6291368011',
  'https://www.amazon.com/s?k=soundbar+tv&rh=n%3A667846011',
  'https://www.amazon.com/s?k=echo+show+smart+display&rh=n%3A9818047011',
  'https://www.amazon.com/s?k=robot+vacuum+wifi&rh=n%3A17333483011',
  'https://www.amazon.com/s?k=air+purifier+bedroom&rh=n%3A2619526011',
  'https://www.amazon.com/s?k=accent+chair+living+room&rh=n%3A1055398',
  'https://www.amazon.com/s?k=coffee+table+modern&rh=n%3A3733551',
  'https://www.amazon.com/s?k=nightstand+set+of+2&rh=n%3A3732961',
  'https://www.amazon.com/s?k=bookshelf+wood&rh=n%3A1069242',
  'https://www.amazon.com/s?k=dresser+6+drawer&rh=n%3A3732961',
  'https://www.amazon.com/s?k=pendant+light+kitchen&rh=n%3A1063306',
  'https://www.amazon.com/s?k=smart+plug+outlet&rh=n%3A6291368011',
  'https://www.amazon.com/s?k=large+indoor+planter+pot&rh=n%3A3734641',
]

export const amazonConfigs: ScraperConfig[] = AMAZON_URLS.map((url, i) => ({
  retailer: 'amazon' as const,
  actorId: 'junglee/free-amazon-product-scraper',
  input: {
    categoryUrls: [url],
    maxItems: 300,
  },
  maxItems: 300,
  label: `Amazon ${i + 1}/${AMAZON_URLS.length}: ${url.split('k=')[1]?.split('&')[0]?.replace(/\+/g, ' ') ?? url.slice(-20)}`,
}))
