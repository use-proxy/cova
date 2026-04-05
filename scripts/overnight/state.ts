import * as fs from 'fs'
import * as path from 'path'
import { RunState } from './types'
import { log } from './logger'

const STATE_FILE = path.join(process.cwd(), 'data', 'state', 'run-state.json')

export function loadState(): RunState {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const loaded = JSON.parse(raw) as RunState
      log('STATE', 'INFO', `Resuming previous run started at ${loaded.started_at}`)
      log('STATE', 'INFO', `Already scraped: ${loaded.total_scraped}, embedded: ${loaded.total_embedded}, failed: ${loaded.total_failed}`)
      return loaded
    } catch {
      log('STATE', 'WARN', 'Could not parse existing state file — starting fresh')
    }
  }

  const fresh: RunState = {
    started_at: new Date().toISOString(),
    scraped_urls: [],
    embedded_product_ids: [],
    failed_product_urls: [],
    showcase_completed: [],
    total_scraped: 0,
    total_embedded: 0,
    total_failed: 0,
    apify_runs: [],
  }

  log('STATE', 'INFO', 'Starting fresh run')
  saveState(fresh)
  return fresh
}

export function saveState(state: RunState): void {
  try {
    const dir = path.dirname(STATE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (err) {
    log('STATE', 'WARN', `Failed to save state: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function markScraped(url: string, state: RunState): void {
  if (!state.scraped_urls.includes(url)) {
    state.scraped_urls.push(url)
    state.total_scraped++
  }
}

export function markEmbedded(id: string, state: RunState): void {
  if (!state.embedded_product_ids.includes(id)) {
    state.embedded_product_ids.push(id)
    state.total_embedded++
  }
}

export function markFailed(url: string, state: RunState): void {
  if (!state.failed_product_urls.includes(url)) {
    state.failed_product_urls.push(url)
    state.total_failed++
  }
}

export function isAlreadyScraped(url: string, state: RunState): boolean {
  return state.scraped_urls.includes(url)
}

export function isAlreadyEmbedded(id: string, state: RunState): boolean {
  return state.embedded_product_ids.includes(id)
}
