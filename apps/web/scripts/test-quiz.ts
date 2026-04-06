#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ─── Arg parsing ─────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}
const hasFlag = (flag: string): boolean => args.includes(flag)

// ─── Required args ────────────────────────────────────────────
const responsesStr = getArg('--responses')
if (!responsesStr) {
  console.error('❌ --responses <n> required')
  process.exit(1)
}

const numResponses = parseInt(responsesStr, 10)
if (isNaN(numResponses) || numResponses < 1) {
  console.error('❌ --responses must be a positive integer')
  process.exit(1)
}

const includeRT = hasFlag('--include-rt')

// ─── Quiz pair definitions ────────────────────────────────────
const PAIR_IDS = [
  'pair-01', 'pair-02', 'pair-03', 'pair-04', 'pair-05',
  'pair-06', 'pair-07', 'pair-08', 'pair-09', 'pair-10',
  'pair-11', 'pair-12', 'pair-13', 'pair-14', 'pair-15',
  'pair-16', 'pair-17', 'pair-18', 'pair-19',
]

// ─── Generate synthetic responses ─────────────────────────────
function generateSyntheticResponses(count: number) {
  const responses: Array<{
    pair_id: string
    chosen: 'A' | 'B'
    super_liked: boolean
    response_time_ms?: number
  }> = []

  for (let i = 0; i < count; i++) {
    const pairId = PAIR_IDS[i % PAIR_IDS.length]!
    const chosen = Math.random() > 0.5 ? 'A' : 'B'
    const super_liked = Math.random() > 0.7

    const response: typeof responses[0] = {
      pair_id: pairId,
      chosen,
      super_liked,
    }

    if (includeRT) {
      response.response_time_ms = Math.floor(Math.random() * 4800) + 200 // 200-5000ms
    }

    responses.push(response)
  }

  return responses
}

// ─── Test ─────────────────────────────────────────────────────
async function main() {
  console.log(`\nTesting quiz fingerprint computation...`)
  console.log(`Generating ${numResponses} synthetic responses (${includeRT ? 'with' : 'without'} response times)\n`)

  const responses = generateSyntheticResponses(numResponses)

  const payload = {
    responses,
    entry_path: 'pairs',
    room_type: 'living-room',
  }

  let apiResponse: Response
  try {
    apiResponse = await fetch('http://localhost:3001/api/quiz/fingerprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('❌ FAIL — Network error:', err)
    console.error('(Is dev server running on port 3001?)')
    process.exit(1)
  }

  if (!apiResponse.ok) {
    const text = await apiResponse.text()
    console.error(`❌ FAIL — HTTP ${apiResponse.status}`)
    console.error(`Response: ${text}`)
    process.exit(1)
  }

  let data: unknown
  try {
    data = await apiResponse.json()
  } catch {
    console.error('❌ FAIL — Invalid JSON response')
    process.exit(1)
  }

  const result = data as {
    fingerprint?: unknown
    style_name?: string
    style_chips?: unknown[]
    style_tags?: unknown[]
  }

  const fingerprint = result.fingerprint as unknown
  const styleName = result.style_name as string | undefined

  // ─── Validate ───────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail: string }> = []

  // Check fingerprint is array of 10 floats
  let fpValid = false
  if (Array.isArray(fingerprint) && fingerprint.length === 10) {
    fpValid = fingerprint.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
  }

  checks.push({
    name: 'Fingerprint structure',
    pass: fpValid,
    detail: fpValid ? '10 floats between 0-1' : 'Invalid format',
  })

  // Check not all 0.5 (no computation)
  let notAllNeutral = true
  if (Array.isArray(fingerprint)) {
    const allExactlyHalf = fingerprint.every((v) => v === 0.5)
    notAllNeutral = !allExactlyHalf
  }

  checks.push({
    name: 'Non-neutral computation',
    pass: notAllNeutral,
    detail: notAllNeutral ? 'Values vary based on responses' : 'All values are 0.5 (no signal)',
  })

  // Check standard deviation > 0.05
  let stdDevGood = false
  if (Array.isArray(fingerprint) && fingerprint.every((v) => typeof v === 'number')) {
    const fp = fingerprint as number[]
    const mean = fp.reduce((a, b) => a + b, 0) / fp.length
    const variance = fp.reduce((sum, v) => sum + (v - mean) ** 2, 0) / fp.length
    const stdDev = Math.sqrt(variance)
    stdDevGood = stdDev > 0.05
    checks.push({
      name: 'Standard deviation',
      pass: stdDevGood,
      detail: `${stdDev.toFixed(4)} (threshold: 0.05)`,
    })
  } else {
    checks.push({
      name: 'Standard deviation',
      pass: false,
      detail: 'Cannot compute',
    })
  }

  // Check style_name is non-empty
  checks.push({
    name: 'Style name',
    pass: typeof styleName === 'string' && styleName.length > 0,
    detail: styleName ? styleName : 'Missing',
  })

  // ─── Report ─────────────────────────────────────────────────
  let allPassed = true
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`${icon} ${check.name}: ${check.detail}`)
    if (!check.pass) allPassed = false
  }

  if (Array.isArray(fingerprint)) {
    console.log('\nFingerprint values:')
    const dims = ['Luminosity', 'Density', 'Temperature', 'Form', 'Era', 'Texture', 'Scale', 'Nature', 'Saturation', 'MaterialOrigin']
    for (let i = 0; i < 10; i++) {
      const v = (fingerprint as number[])[i]!
      const bar = '█'.repeat(Math.round(v * 10)) + '░'.repeat(10 - Math.round(v * 10))
      console.log(`  ${dims[i]!.padEnd(15)}: ${bar} ${v.toFixed(2)}`)
    }
  }

  console.log(`\n${allPassed ? '✅ PASS' : '❌ FAIL'}`)
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
