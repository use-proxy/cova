import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.join(path.dirname(process.argv[1]!), '..', '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const AMAZON_TAG = 'tag=cova03-20'

function buildAffiliateUrl(externalId: string, retailer: string): string {
  if (retailer === 'amazon') {
    // Append affiliate tag — handle existing query string
    const sep = externalId.includes('?') ? '&' : '?'
    return `${externalId}${sep}${AMAZON_TAG}`
  }
  return externalId
}

async function main() {
  // Paginate through all products with NULL affiliate_url
  const PAGE = 1000
  const products: { id: string; external_id: string; retailer: string }[] = []

  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, external_id, retailer')
      .is('affiliate_url', null)
      .order('id')
      .range(from, from + PAGE - 1)

    if (error) throw error
    products.push(...(page as typeof products))
    if (page.length < PAGE) break
  }

  console.log(`Products with NULL affiliate_url: ${products.length}`)

  const eligible = products.filter((p) => p.external_id?.startsWith('http'))
  const skipped = products.length - eligible.length

  console.log(`  Eligible (external_id starts with http): ${eligible.length}`)
  console.log(`  Skipped  (external_id is placeholder):   ${skipped}`)

  if (eligible.length === 0) {
    console.log('Nothing to update.')
    return
  }

  // Update in batches of 100 (individual updates to avoid upsert conflicts)
  const BATCH = 100
  let updated = 0
  let failed = 0

  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(({ id, external_id, retailer }) =>
        supabase
          .from('products')
          .update({ affiliate_url: buildAffiliateUrl(external_id, retailer) })
          .eq('id', id),
      ),
    )
    for (const r of results) {
      if (r.error) {
        console.error('Update failed:', r.error.message)
        failed++
      } else {
        updated++
      }
    }

    if ((i + BATCH) % 500 === 0 || i + BATCH >= eligible.length) {
      console.log(`  ${Math.min(i + BATCH, eligible.length)}/${eligible.length} processed`)
    }
  }

  console.log(`\nDone. ${updated} affiliate_urls written, ${failed} failed.`)

  // Breakdown by retailer
  const byRetailer = new Map<string, number>()
  for (const p of eligible) {
    byRetailer.set(p.retailer, (byRetailer.get(p.retailer) ?? 0) + 1)
  }
  console.log('\nBreakdown by retailer:')
  for (const [r, c] of [...byRetailer.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(12)} ${c}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
