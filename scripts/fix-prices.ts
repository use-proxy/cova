import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.join(path.dirname(process.argv[1]!), '..', '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  // ── Step 1: Identify scope ─────────────────────────────────────────────────
  const PAGE = 1000
  const all: { id: string; price: number; price_tier: string; retailer: string }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, price, price_tier, retailer')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(page as typeof all))
    if (page.length < PAGE) break
  }

  // Prices ≥ 1000 with no decimal: clearly stored as cents
  const toCents = all.filter(p => p.price % 1 === 0 && p.price >= 1000)
  const alreadyDollars = all.filter(p => p.price % 1 !== 0)
  const smallIntegers = all.filter(p => p.price % 1 === 0 && p.price < 1000)

  console.log(`Total products:               ${all.length}`)
  console.log(`Prices ≥ 1000 (cents → ÷100): ${toCents.length}`)
  console.log(`Already dollars (decimal):     ${alreadyDollars.length}  [leave as-is]`)
  console.log(`Small integers < 1000:         ${smallIntegers.length}  [seeded placeholders, leave as-is]`)

  // ── Step 2: Divide prices by 100 for the cents group ──────────────────────
  console.log('\nConverting prices ÷ 100...')
  const BATCH = 200
  let updated = 0
  let failed = 0

  for (let i = 0; i < toCents.length; i += BATCH) {
    const batch = toCents.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(({ id, price }) =>
        supabase
          .from('products')
          .update({ price: price / 100 })
          .eq('id', id),
      ),
    )
    for (const r of results) {
      if (r.error) { console.error('Price update failed:', r.error.message); failed++ }
      else updated++
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= toCents.length)
      console.log(`  ${Math.min(i + BATCH, toCents.length)}/${toCents.length} prices converted`)
  }
  console.log(`\nPrice conversion: ${updated} updated, ${failed} failed`)

  // ── Step 3: Re-fetch all prices and re-tier everything ────────────────────
  console.log('\nRe-tiering all products...')
  const fresh: { id: string; price: number }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, price')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    fresh.push(...(page as typeof fresh))
    if (page.length < PAGE) break
  }

  function priceTier(p: number): string {
    if (p < 100)  return 'budget'
    if (p < 500)  return 'mid'
    if (p < 1500) return 'premium'
    return 'luxury'
  }

  let tiered = 0
  let tierFailed = 0
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(({ id, price }) =>
        supabase
          .from('products')
          .update({ price_tier: priceTier(price) })
          .eq('id', id),
      ),
    )
    for (const r of results) {
      if (r.error) { console.error('Tier update failed:', r.error.message); tierFailed++ }
      else tiered++
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= fresh.length)
      console.log(`  ${Math.min(i + BATCH, fresh.length)}/${fresh.length} tiers updated`)
  }
  console.log(`\nPrice tier update: ${tiered} updated, ${tierFailed} failed`)

  // ── Step 4: Final distribution report ────────────────────────────────────
  const { data: tierCounts } = await supabase.from('products').select('price_tier, price')
  const dist = new Map<string, { count: number; min: number; max: number; sum: number }>()
  for (const r of tierCounts ?? []) {
    const t = r.price_tier ?? 'null'
    const v = r.price ?? 0
    if (!dist.has(t)) dist.set(t, { count: 0, min: Infinity, max: -Infinity, sum: 0 })
    const e = dist.get(t)!
    e.count++
    e.min = Math.min(e.min, v)
    e.max = Math.max(e.max, v)
    e.sum += v
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  FINAL PRICE TIER DISTRIBUTION')
  console.log('═══════════════════════════════════════════════════')
  const order = ['budget', 'mid', 'premium', 'luxury']
  for (const tier of order) {
    const e = dist.get(tier)
    if (!e) continue
    console.log(
      `  ${tier.padEnd(8)}  count=${String(e.count).padStart(5)}  ` +
      `min=$${e.min.toFixed(2).padStart(8)}  max=$${e.max.toFixed(2).padStart(10)}  ` +
      `avg=$${(e.sum / e.count).toFixed(2).padStart(8)}`
    )
  }

  // Sanity check: any remaining absurdly high prices?
  const absurd = (tierCounts ?? []).filter((r: any) => r.price > 50000)
  console.log(`\nProducts with price > $50,000: ${absurd.length} (should be 0)`)

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
