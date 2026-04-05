import { createClient } from '@supabase/supabase-js'
import { NormalizedProduct, RunState } from './types'
import { log } from './logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-memory URL set for fast O(1) checks within a run
const inMemoryUrlSet = new Set<string>()

export function initInMemorySet(state: RunState): void {
  for (const url of state.scraped_urls) {
    inMemoryUrlSet.add(url)
  }
  log('DEDUP', 'INFO', `Initialized in-memory dedup set with ${inMemoryUrlSet.size} known URLs`)
}

export function isUrlSeenInMemory(url: string): boolean {
  return inMemoryUrlSet.has(url)
}

export function addUrlToMemory(url: string): void {
  inMemoryUrlSet.add(url)
}

export async function filterDuplicates(
  products: NormalizedProduct[],
  _state: RunState
): Promise<NormalizedProduct[]> {
  if (products.length === 0) return []

  // Layer 1: In-memory URL check
  const afterMemory = products.filter((p) => {
    if (inMemoryUrlSet.has(p.product_url)) return false
    inMemoryUrlSet.add(p.product_url)
    return true
  })

  const memoryFiltered = products.length - afterMemory.length
  if (memoryFiltered > 0) {
    log('DEDUP', 'INFO', `In-memory dedup removed ${memoryFiltered} duplicates`)
  }

  if (afterMemory.length === 0) return []

  // Layer 2: DB check in batches of 500
  const BATCH_SIZE = 500
  const deduped: NormalizedProduct[] = []

  for (let i = 0; i < afterMemory.length; i += BATCH_SIZE) {
    const batch = afterMemory.slice(i, i + BATCH_SIZE)
    const urls = batch.map((p) => p.product_url)

    try {
      const { data: existing } = await supabase
        .from('products')
        .select('affiliate_url_base')
        .in('affiliate_url_base', urls)

      const existingUrls = new Set((existing ?? []).map((r: { affiliate_url_base: string }) => r.affiliate_url_base))

      const newInBatch = batch.filter((p) => !existingUrls.has(p.product_url))
      const dbFiltered = batch.length - newInBatch.length

      if (dbFiltered > 0) {
        log('DEDUP', 'INFO', `DB dedup removed ${dbFiltered} products that already exist`)
      }

      deduped.push(...newInBatch)
    } catch (err) {
      log('DEDUP', 'WARN', `DB dedup check failed, including batch without dedup: ${err instanceof Error ? err.message : String(err)}`)
      // On failure, include the batch anyway — ON CONFLICT DO NOTHING handles it
      deduped.push(...batch)
    }
  }

  return deduped
}
