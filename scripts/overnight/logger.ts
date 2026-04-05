import * as fs from 'fs'
import * as path from 'path'

const LOG_FILE = path.join(process.cwd(), 'docs', 'sessions', 'overnight-progress.md')

// Ensure log file directory exists
const logDir = path.dirname(LOG_FILE)
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

// Initialize log file with header if new
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, `# Cova Overnight Run Log\nStarted: ${new Date().toISOString()}\n\n`)
}

interface RunStats {
  scraped: number
  embedded: number
  failed: number
  showcaseGenerated: number
}

const stats: RunStats = {
  scraped: 0,
  embedded: 0,
  failed: 0,
  showcaseGenerated: 0,
}

const startTime = Date.now()

// ANSI color codes
const COLORS = {
  INFO: '\x1b[37m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  SUCCESS: '\x1b[32m',
  RESET: '\x1b[0m',
}

export function log(job: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${job}] [${level}] ${message}`

  // Console with color
  const color = COLORS[level] ?? COLORS.INFO
  console.log(`${color}${line}${COLORS.RESET}`)

  // File without color codes
  try {
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch {
    // Don't fail on log write error
  }

  // Update stats counters based on message patterns
  if (level === 'SUCCESS') {
    if (job === 'EMBED') stats.embedded++
    if (job === 'SCRAPE') stats.scraped++
    if (job === 'SHOWCASE') stats.showcaseGenerated++
  }
  if (level === 'ERROR' && job === 'EMBED') stats.failed++
}

export function incrementStat(key: keyof RunStats, amount = 1): void {
  stats[key] += amount
}

export function getStats(): RunStats {
  return { ...stats }
}

export function writeSummary(): void {
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const elapsedMin = Math.floor(elapsed / 60)
  const elapsedSec = elapsed % 60

  const s = getStats()
  const summary = [
    '',
    '─'.repeat(60),
    `SUMMARY — ${new Date().toISOString()}`,
    `Elapsed: ${elapsedMin}m ${elapsedSec}s`,
    `Scraped: ${s.scraped}`,
    `Embedded: ${s.embedded}`,
    `Failed: ${s.failed}`,
    `Showcase: ${s.showcaseGenerated}/144`,
    '─'.repeat(60),
    '',
  ].join('\n')

  try {
    fs.appendFileSync(LOG_FILE, summary)
  } catch {
    // Don't fail on write error
  }

  console.log(summary)
}

// Auto-write summary every 15 minutes
setInterval(() => {
  writeSummary()
}, 15 * 60 * 1000)
