/**
 * Verify product matching data sources:
 *  - Serper shopping returns real products with valid URLs + prices
 *  - SearchApi Google Lens returns visual matches (if configured)
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function verifySerper() {
  console.log('=== PRODUCT MATCHING VERIFICATION ===')
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error('SERPER_API_KEY not configured')

  console.log('1. Testing Serper shopping...')
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 'modern minimalist sofa under $2000', num: 10 }),
  })
  if (!res.ok) throw new Error('Serper failed: ' + res.status)
  const data = (await res.json()) as {
    shopping?: Array<{
      title: string
      price: string
      link: string
      imageUrl?: string
    }>
  }

  const products = data.shopping ?? []
  if (products.length === 0) throw new Error('Serper returned 0 products')
  console.log('OK Serper returned', products.length, 'products')

  let validCount = 0
  products.forEach((p, i) => {
    const price = parseFloat(String(p.price).replace(/[^0-9.]/g, ''))
    const hasUrl = p.link?.startsWith('https://')
    const hasPrice = price > 0
    const hasImage = !!p.imageUrl
    if (hasUrl && hasPrice) validCount++
    if (i < 3) {
      console.log(
        '  ',
        (p.title ?? '').slice(0, 40),
        '| $' + price,
        '| url:',
        hasUrl ? 'Y' : 'N',
        '| img:',
        hasImage ? 'Y' : 'N'
      )
    }
  })
  if (validCount < 3) throw new Error('Too few valid products: ' + validCount)
  console.log('OK Valid products:', validCount + '/' + products.length)

  const searchApiKey = process.env.SEARCHAPI_KEY
  if (searchApiKey) {
    console.log('2. Testing SearchApi Google Lens...')
    const lensUrl =
      'https://www.searchapi.io/api/v1/search?' +
      new URLSearchParams({
        engine: 'google_lens',
        search_type: 'products',
        url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400',
        api_key: searchApiKey,
      })
    const lensRes = await fetch(lensUrl)
    if (!lensRes.ok) {
      console.warn('WARN SearchApi failed:', lensRes.status, '— continuing without')
    } else {
      const lensData = (await lensRes.json()) as {
        visual_matches?: Array<{ title?: string; price?: { value?: string } | string; link?: string }>
      }
      const matches = lensData.visual_matches ?? []
      console.log('OK Google Lens returned', matches.length, 'visual matches')
      if (matches.length > 0) {
        const first = matches[0]
        const priceStr =
          typeof first.price === 'string' ? first.price : first.price?.value ?? 'no price'
        console.log('  First:', (first.title ?? '').slice(0, 40), '|', priceStr)
      }
    }
  } else {
    console.log('WARN SEARCHAPI_KEY not configured — visual matching disabled')
  }

  console.log('PASS PRODUCT MATCHING: VERIFIED')
}

verifySerper().catch((e) => {
  console.error('FAIL MATCHING:', e.message)
  process.exit(1)
})
