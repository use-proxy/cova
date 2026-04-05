import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load env from apps/web/.env.local (canonical location)
dotenv.config({ path: path.join(process.cwd(), 'apps', 'web', '.env.local') })
// Fallback to root .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { log, writeSummary } from './overnight/logger'
import { loadState, saveState } from './overnight/state'
import { startCreditMonitor, getCreditStatus } from './overnight/credit-monitor'
import { initInMemorySet } from './overnight/deduplicator'
import { runScraping } from './overnight/scrape'
import { runEmbeddingWithTimeout } from './overnight/embed'
import { runShowcase } from './overnight/showcase'
import { runStorageEmbed } from './overnight/storage-embed'

// ─── Environment validation ────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REPLICATE_API_TOKEN',
  'ANTHROPIC_API_KEY',
]

// Accept either APIFY_API_TOKEN or APIFY_TOKEN
const hasApifyToken = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN

function validateEnv(): void {
  const missing: string[] = []

  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) missing.push(key)
  }

  if (!hasApifyToken) {
    missing.push('APIFY_API_TOKEN (or APIFY_TOKEN)')
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:')
    for (const key of missing) {
      console.error(`   - ${key}`)
    }
    console.error('\nAdd these to apps/web/.env.local and restart.\n')
    process.exit(1)
  }
}

// ─── Startup banner ────────────────────────────────────────────────────────────
function printBanner(startedAt: string): void {
  const banner = [
    '╔═══════════════════════════════════════╗',
    '║   COVA OVERNIGHT RUN                  ║',
    `║   Started: ${startedAt.slice(0, 19)}     ║`,
    '║   Jobs: Scrape + Embed + Showcase + Storage ║',
    '╚═══════════════════════════════════════╝',
  ].join('\n')

  console.log('\n' + banner + '\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  validateEnv()

  const startedAt = new Date().toISOString()
  printBanner(startedAt)

  // Check Apify credit balance
  try {
    const credits = await getCreditStatus()
    log('MAIN', 'INFO', `Apify credits: $${credits.remainingCredits.toFixed(2)} remaining of $${credits.monthlyLimit.toFixed(2)}`)
    if (credits.remainingCredits < 5) {
      log('MAIN', 'WARN', '⚠️  Apify credits below $5 — continuing but watch carefully')
    }
  } catch {
    log('MAIN', 'WARN', 'Could not fetch Apify credit balance — continuing anyway')
  }

  // Load or initialize run state
  const state = loadState()

  // Initialize in-memory dedup set
  initInMemorySet(state)

  // Ensure data directories exist
  for (const dir of ['data/scraped', 'data/processed', 'data/state', 'data/failed']) {
    const fullPath = path.join(process.cwd(), dir)
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true })
  }

  // Graceful shutdown handler
  process.on('SIGINT', () => {
    log('MAIN', 'INFO', 'Shutdown signal received — saving state and exiting cleanly')
    saveState(state)
    writeSummary()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    log('MAIN', 'INFO', 'SIGTERM received — saving state and exiting cleanly')
    saveState(state)
    writeSummary()
    process.exit(0)
  })

  // 1. Start credit monitor (background polling every 10 minutes)
  const creditMonitorInterval = startCreditMonitor()

  log('MAIN', 'INFO', 'Launching all jobs concurrently...')
  log('MAIN', 'INFO', '  Job A: Scraping (all retailers, async Apify actors)')
  log('MAIN', 'INFO', '  Job B: Embedding (watching processed/ for batches)')
  log('MAIN', 'INFO', '  Job C: Showcase (144 FLUX renders across 12 styles × 4 rooms)')
  log('MAIN', 'INFO', '  Job D: Storage embed (existing images in Supabase Storage)')

  // Run all jobs concurrently — no failure kills others
  const results = await Promise.allSettled([
    // Job A: Scraping
    runScraping(state),
    // Job B: Embedding (runs for duration of scraping + 2h buffer = ~8h)
    runEmbeddingWithTimeout(state, 8 * 60 * 60 * 1000),
    // Job C: Style showcase
    runShowcase(state),
    // Job D: Embed existing storage images
    runStorageEmbed(),
  ])

  // Clear credit monitor
  clearInterval(creditMonitorInterval)

  // Report any job-level failures
  for (const [i, result] of results.entries()) {
    const jobName = ['Scraping', 'Embedding', 'Showcase', 'StorageEmbed'][i] ?? `Job${i}`
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      log('MAIN', 'ERROR', `${jobName} job crashed: ${reason}`)
    } else {
      log('MAIN', 'SUCCESS', `${jobName} job completed`)
    }
  }

  // Final summary
  const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
  const elapsedH = Math.floor(elapsed / 3600)
  const elapsedM = Math.floor((elapsed % 3600) / 60)

  const finalSummary = [
    '',
    '═'.repeat(60),
    '  COVA OVERNIGHT RUN — FINAL SUMMARY',
    '═'.repeat(60),
    `  Total elapsed: ${elapsedH}h ${elapsedM}m`,
    `  Products scraped: ${state.total_scraped}`,
    `  Products embedded: ${state.total_embedded}`,
    `  Showcase renders: ${state.showcase_completed.length}/144`,
    `  Total failed: ${state.total_failed}`,
    `  Failed products for review: data/failed/`,
    `  Full log: docs/sessions/overnight-progress.md`,
    '═'.repeat(60),
    '',
  ].join('\n')

  console.log(finalSummary)
  log('MAIN', 'SUCCESS', 'Overnight run complete')

  // Write final summary to log file
  writeSummary()
  saveState(state)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
