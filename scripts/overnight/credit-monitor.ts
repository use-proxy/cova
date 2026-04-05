import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: 'apps/web/.env.local' })

import axios from 'axios'
import { log, setLastCreditStatus } from './logger'
import { ApifyCreditStatus } from './types'

// Read token lazily — module loads before dotenv runs in the entry point
function getApifyToken(): string {
  return process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN ?? ''
}

let stopNewRuns = false
let stopAllRuns = false
let lastStatus: ApifyCreditStatus | null = null

export async function getCreditStatus(): Promise<ApifyCreditStatus> {
  const token = getApifyToken()
  if (!token) {
    log('CREDITS', 'WARN', 'No Apify token found — skipping credit check, assuming credits available')
    return lastStatus ?? { remainingCredits: 50, usedCredits: 0, monthlyLimit: 100 }
  }

  try {
    const response = await axios.get<{
      data: {
        plan?: {
          monthlyUsageCreditsUsd?: number
          maxMonthlyUsageCreditsUsd?: number
        }
        usageCycle?: {
          creditsUsd?: number
        }
      }
    }>(`https://api.apify.com/v2/users/me?token=${token}`, {
      timeout: 10000,
    })

    const data = response.data.data
    const monthlyLimit = data.plan?.maxMonthlyUsageCreditsUsd ?? 100
    const usedCredits = data.usageCycle?.creditsUsd ?? 0
    const remainingCredits = Math.max(0, monthlyLimit - usedCredits)

    const status: ApifyCreditStatus = {
      remainingCredits,
      usedCredits,
      monthlyLimit,
    }

    lastStatus = status
    return status
  } catch (err) {
    // Never let a credit check failure stop scraping — log as WARN, return safe defaults
    log('CREDITS', 'WARN', `Credit check failed (${err instanceof Error ? err.message : String(err)}) — assuming credits available`)
    return lastStatus ?? { remainingCredits: 50, usedCredits: 0, monthlyLimit: 100 }
  }
}

export async function hasCreditsToRun(): Promise<boolean> {
  if (stopAllRuns) return false
  if (stopNewRuns) return false
  return true
}

export function isAllStopped(): boolean {
  return stopAllRuns
}

export async function pollCredits(): Promise<void> {
  const status = await getCreditStatus()
  const pct = status.monthlyLimit > 0 ? (status.remainingCredits / status.monthlyLimit) * 100 : 100

  const creditLine = `$${status.remainingCredits.toFixed(2)} remaining ($${status.usedCredits.toFixed(2)} used of $${status.monthlyLimit.toFixed(2)}) — ${pct.toFixed(0)}% left`
  log('CREDITS', 'INFO', `Apify credits: ${creditLine}`)
  setLastCreditStatus(creditLine)

  if (pct <= 5) {
    stopAllRuns = true
    log('CREDITS', 'ERROR', 'Apify credits critical (≤5%) — stopping ALL new runs now')
  } else if (pct <= 10) {
    stopNewRuns = true
    log('CREDITS', 'WARN', 'Apify credits at 10% — stopping new actor runs, letting current finish')
  } else if (pct <= 25) {
    log('CREDITS', 'WARN', 'Apify credits at 25% — prioritizing high-value retailers')
  } else if (pct <= 50) {
    log('CREDITS', 'WARN', 'Apify credits at 50% — continuing')
  }
}

export function startCreditMonitor(): NodeJS.Timeout {
  // Poll immediately, then every 10 minutes
  void pollCredits()
  return setInterval(() => {
    void pollCredits()
  }, 10 * 60 * 1000)
}
