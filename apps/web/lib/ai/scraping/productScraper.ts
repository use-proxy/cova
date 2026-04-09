/**
 * Product URL scraper.
 *
 * Used by /api/design-chat when the user pastes a product link on the
 * "Specific Products" tab. Fetches the page HTML, hands the first ~8kb
 * to Claude, asks for strict JSON, and returns a typed product record.
 *
 * Failure mode: returns null. The chatbot's system prompt is written
 * so it handles the null case gracefully ("I couldn't pull details
 * from that link — can you describe what you're looking for?").
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ScrapedProduct {
  name: string
  brand: string | null
  price: number | null
  dimensions: string | null
  color: string | null
  imageUrl: string | null
  retailerUrl: string
}

const SCRAPE_SYSTEM = `Extract product information from this HTML. Return ONLY valid JSON — no markdown fences, no prose.

Schema: {
  "name": string,
  "brand": string | null,
  "price": number | null,
  "dimensions": string | null,
  "color": string | null,
  "imageUrl": string | null
}

Rules:
- price must be a number (USD) or null — never a string
- imageUrl must be the primary product image URL if present in the HTML
- If a field is not found, use null
- If this page is clearly not a product page, return all-null fields`

export async function scrapeProductUrl(
  url: string
): Promise<ScrapedProduct | null> {
  try {
    const pageResponse = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Cova/1.0; +https://covainterior.com)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })
    if (!pageResponse.ok) return null
    const html = await pageResponse.text()

    const extraction = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SCRAPE_SYSTEM,
      messages: [{ role: 'user', content: html.slice(0, 8000) }],
    })

    const text =
      extraction.content[0]?.type === 'text'
        ? extraction.content[0].text
        : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as Omit<ScrapedProduct, 'retailerUrl'>
    return {
      name: parsed.name ?? 'Unknown product',
      brand: parsed.brand ?? null,
      price: typeof parsed.price === 'number' ? parsed.price : null,
      dimensions: parsed.dimensions ?? null,
      color: parsed.color ?? null,
      imageUrl: parsed.imageUrl ?? null,
      retailerUrl: url,
    }
  } catch {
    return null
  }
}
