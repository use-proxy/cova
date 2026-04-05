import { ApifyClient } from 'apify-client'
import pLimit from 'p-limit'
import * as fs from 'fs'
import * as path from 'path'
import { ScraperConfig, RawProduct, RunState, RetailerSlug } from './types'
import { log, incrementStat } from './logger'
import { saveState, markScraped, isAlreadyScraped } from './state'
import { normalizeProduct } from './normalizer'
import { filterDuplicates, addUrlToMemory } from './deduplicator'
import { hasCreditsToRun, isAllStopped } from './credit-monitor'

// Scraper config imports
import { wayfairConfigs } from './scrapers/wayfair'
import { amazonConfigs } from './scrapers/amazon'
import { ikeaConfigs } from './scrapers/ikea'
import { westElmConfigs } from './scrapers/west-elm'
import { crateBarrelConfigs } from './scrapers/crate-barrel'
import { articleConfigs } from './scrapers/article'
import { targetConfigs } from './scrapers/target'
import { bestBuyConfigs } from './scrapers/best-buy'
import { bhConfigs } from './scrapers/bh'
import { dtcConfigs } from './scrapers/dtc'

const APIFY_TOKEN = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? ''
const client = new ApifyClient({ token: APIFY_TOKEN })

const SCRAPED_DIR = path.join(process.cwd(), 'data', 'scraped')
const PROCESSED_DIR = path.join(process.cwd(), 'data', 'processed')

function ensureDirs(): void {
  for (const dir of [SCRAPED_DIR, PROCESSED_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

// Retailer → config map with display priority
// Tier 1: highest quality data (run first)
// Tier 2: broad coverage
// Tier 3: tech/fallback (run if credits remain)
interface ConfigGroup {
  tier: 1 | 2 | 3
  configs: ScraperConfig[]
}

function getAllConfigGroups(): ConfigGroup[] {
  return [
    { tier: 1, configs: articleConfigs },
    { tier: 1, configs: westElmConfigs },
    { tier: 1, configs: dtcConfigs },
    { tier: 1, configs: wayfairConfigs },
    { tier: 2, configs: ikeaConfigs },
    { tier: 2, configs: crateBarrelConfigs },
    { tier: 2, configs: targetConfigs },
    { tier: 3, configs: amazonConfigs },
    { tier: 3, configs: bestBuyConfigs },
    { tier: 3, configs: bhConfigs },
  ]
}

function normalizeRawItem(item: Record<string, unknown>, retailer: RetailerSlug): RawProduct | null {
  // Name: handle title (e-commerce tool, Amazon junglee) + name (Wayfair, web-scraper)
  const name = String(item.name ?? item.title ?? item.productName ?? '').trim()

  // Price: handle string ("$299.99", "$1,299.00") or number — strip all non-numeric except dot
  const priceRaw = item.price ?? item.salePrice ?? item.regularPrice ?? item.currentPrice
  if (priceRaw == null) return null
  const priceStr = typeof priceRaw === 'number' ? String(priceRaw) : String(priceRaw).replace(/,/g, '')
  const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''))

  // Image: handle images[] array (may be strings or objects with url/src), image, imageUrl
  let image_url = ''
  if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images[0]
    if (typeof first === 'string') {
      image_url = first
    } else if (first && typeof first === 'object') {
      const imgObj = first as Record<string, unknown>
      image_url = String(imgObj.url ?? imgObj.src ?? imgObj.href ?? '')
    }
  }
  if (!image_url) {
    image_url = String(
      item.image_url ?? item.imageUrl ?? item.image ??
      item.thumbnailUrl ?? item.imageLink ?? item.thumbnailImage ?? item.mainImage ?? ''
    )
  }
  // Handle protocol-relative URLs
  if (image_url.startsWith('//')) image_url = 'https:' + image_url

  // URL: handle url (e-commerce, Amazon, Wayfair), productUrl, product_url
  const product_url = String(item.url ?? item.productUrl ?? item.product_url ?? item.link ?? '')

  const raw_description = String(item.description ?? item.shortDescription ?? item.desc ?? '')
  const raw_category = String(item.category ?? item.categoryName ?? item.breadcrumbs ?? '')
  const raw_material = item.material != null ? String(item.material) : undefined
  const raw_dimensions = item.dimensions != null ? String(item.dimensions) : undefined

  if (!name || name.length < 3) return null
  if (!image_url.startsWith('http')) return null
  if (!product_url.startsWith('http')) return null
  if (!isFinite(price) || price <= 0) return null

  return {
    name,
    price,
    currency: 'USD',
    image_url,
    product_url,
    retailer,
    raw_category,
    raw_description,
    raw_material,
    raw_dimensions,
    scraped_at: new Date().toISOString(),
  }
}

async function runSingleConfig(config: ScraperConfig, state: RunState): Promise<void> {
  const configKey = `${config.retailer}:${config.label}`

  if (isAlreadyScraped(configKey, state)) {
    log('SCRAPE', 'INFO', `Skipping already-scraped config: ${config.label}`)
    return
  }

  log('SCRAPE', 'INFO', `Starting actor: ${config.label} (${config.actorId})`)
  log('SCRAPE', 'INFO', `Actor input: ${JSON.stringify(config.input)}`)

  try {
    // Launch actor — input passed directly, no wrapper
    const run = await client.actor(config.actorId).call(config.input, {
      memory: 1024,
      timeout: 3600, // 1 hour max per run
    })

    state.apify_runs.push(run.id)
    log('SCRAPE', 'INFO', `Actor started: ${config.label} — runId: ${run.id}`)

    // Wait for completion
    const finishedRun = await client.run(run.id).waitForFinish({ waitSecs: 3600 })

    if (finishedRun.status !== 'SUCCEEDED') {
      log('SCRAPE', 'WARN', `Actor ended with status ${finishedRun.status}: ${config.label}`)
      if (finishedRun.status === 'FAILED' || finishedRun.status === 'ABORTED') {
        markScraped(configKey, state)
        saveState(state)
        return
      }
    }

    // Fetch dataset
    const { items } = await client.dataset(finishedRun.defaultDatasetId).listItems({ limit: config.maxItems })

    if (!items || items.length === 0) {
      log('SCRAPE', 'WARN', `Empty dataset for: ${config.label}`)
      markScraped(configKey, state)
      saveState(state)
      return
    }

    log('SCRAPE', 'INFO', `Dataset fetched: ${items.length} raw items for ${config.label}`)

    // Save raw JSON
    const rawFile = path.join(SCRAPED_DIR, `${config.retailer}-${Date.now()}-${run.id.slice(0, 8)}.json`)
    fs.writeFileSync(rawFile, JSON.stringify(items, null, 2))

    // Normalize items
    const rawProducts: RawProduct[] = []
    for (const item of items) {
      const raw = normalizeRawItem(item as Record<string, unknown>, config.retailer)
      if (raw) rawProducts.push(raw)
    }

    log('SCRAPE', 'INFO', `Normalized ${rawProducts.length}/${items.length} items for ${config.label}`)

    // Normalize to NormalizedProduct
    const normalized = rawProducts
      .map((raw) => normalizeProduct(raw))
      .filter((p): p is NonNullable<typeof p> => p !== null)

    // Deduplicate
    const deduped = await filterDuplicates(normalized, state)

    log('SCRAPE', 'INFO', `After dedup: ${deduped.length}/${normalized.length} products for ${config.label}`)

    if (deduped.length === 0) {
      markScraped(configKey, state)
      saveState(state)
      return
    }

    // Track scraped URLs in memory
    for (const p of deduped) {
      addUrlToMemory(p.product_url)
    }

    // Save processed batch
    const processedFile = path.join(PROCESSED_DIR, `${config.retailer}-${Date.now()}-${run.id.slice(0, 8)}.json`)
    fs.writeFileSync(processedFile, JSON.stringify(deduped, null, 2))

    incrementStat('scraped', deduped.length)
    markScraped(configKey, state)
    saveState(state)

    log('SCRAPE', 'SUCCESS', `Batch saved: ${deduped.length} products → ${path.basename(processedFile)}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log('SCRAPE', 'ERROR', `Actor failed for ${config.label}: ${msg}`)
    // Mark as scraped to skip on resume (failed configs won't be retried automatically)
    markScraped(configKey, state)
    saveState(state)
  }
}

export async function runScraping(state: RunState): Promise<void> {
  ensureDirs()
  log('SCRAPE', 'INFO', 'Scraping job starting')

  const groups = getAllConfigGroups()

  // Flatten configs in tier order
  const tier1 = groups.filter((g) => g.tier === 1).flatMap((g) => g.configs)
  const tier2 = groups.filter((g) => g.tier === 2).flatMap((g) => g.configs)
  const tier3 = groups.filter((g) => g.tier === 3).flatMap((g) => g.configs)

  // Non-Wayfair: up to 3 concurrent actors
  // Wayfair: serial (1 at a time) with 10s delay between launches to avoid rate limits
  const limit = pLimit(3)
  const wayfairLimit = pLimit(1)

  const allConfigs = [...tier1, ...tier2, ...tier3]
  const total = allConfigs.length
  let completed = 0

  log('SCRAPE', 'INFO', `Total scraper configs: ${total} (Tier1: ${tier1.length}, Tier2: ${tier2.length}, Tier3: ${tier3.length})`)
  log('SCRAPE', 'INFO', 'Wayfair configs will run serially (1 at a time) with 10s delay between runs')

  let wayfairLaunchCount = 0

  await Promise.allSettled(
    allConfigs.map((config) => {
      const queue = config.retailer === 'wayfair' ? wayfairLimit : limit

      return queue(async () => {
        if (isAllStopped()) {
          log('SCRAPE', 'WARN', `Credits exhausted — skipping: ${config.label}`)
          return
        }

        const canRun = await hasCreditsToRun()
        if (!canRun) {
          log('SCRAPE', 'WARN', `Insufficient credits — skipping: ${config.label}`)
          return
        }

        // 10s delay between Wayfair launches (skip delay on first run)
        if (config.retailer === 'wayfair' && wayfairLaunchCount > 0) {
          log('SCRAPE', 'INFO', `Wayfair rate-limit pause: 15s before ${config.label}`)
          await new Promise((r) => setTimeout(r, 15000))
        }
        if (config.retailer === 'wayfair') wayfairLaunchCount++

        await runSingleConfig(config, state)
        completed++
        log('SCRAPE', 'INFO', `Progress: ${completed}/${total} configs completed`)
      })
    })
  )

  log('SCRAPE', 'SUCCESS', `Scraping complete. Processed ${completed}/${total} configs`)
}
