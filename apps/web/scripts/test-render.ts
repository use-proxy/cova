#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ─── Arg parsing ─────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

// ─── Required args ────────────────────────────────────────────
const photo = getArg('--photo')
const fingerprintStr = getArg('--fingerprint')
const room = getArg('--room')

if (!photo || !fingerprintStr || !room) {
  console.error('❌ Required: --photo <url> --fingerprint <json> --room <type>')
  process.exit(1)
}

let fingerprint: number[]
try {
  fingerprint = JSON.parse(fingerprintStr)
  if (!Array.isArray(fingerprint) || fingerprint.length !== 10) {
    throw new Error('Must be array of 10 numbers')
  }
} catch {
  console.error('❌ --fingerprint must be valid JSON array of 10 numbers')
  process.exit(1)
}

// ─── Test ─────────────────────────────────────────────────────
async function main() {
  console.log(`\nTesting render pipeline...`)
  console.log(`Room: ${room}`)
  console.log(`Photo: ${photo.substring(0, 60)}...\n`)

  const startTime = Date.now()

  // Step 1: POST /api/render
  const renderPayload = {
    photo_url: photo,
    depth_map_url: '', // May not be available for test
    keep_mask: null,
    fingerprint_vector: fingerprint,
    room_type: room,
    budget: 'mid' as const,
    inclusions: [],
    constraints: [],
    room_id: `test-room-${Date.now()}`,
    style_strength: 0.85,
    showcase_mode: true, // Avoid DB writes
  }

  let renderResponse: Response
  try {
    renderResponse = await fetch('http://localhost:3001/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(renderPayload),
    })
  } catch (err) {
    console.error('❌ FAIL — Network error:', err)
    console.error('(Is dev server running on port 3001?)')
    process.exit(1)
  }

  if (renderResponse.status === 401) {
    console.error('❌ FAIL — Unauthorized (401)')
    console.error('(Must be authenticated. Run: npm run dev)')
    process.exit(1)
  }

  if (!renderResponse.ok) {
    const text = await renderResponse.text()
    console.error(`❌ FAIL — POST /api/render returned HTTP ${renderResponse.status}`)
    console.error(`Response: ${text}`)
    process.exit(1)
  }

  let renderData: unknown
  try {
    renderData = await renderResponse.json()
  } catch {
    console.error('❌ FAIL — Invalid JSON from /api/render')
    process.exit(1)
  }

  const rData = renderData as { prediction_id?: string }
  const predictionId = rData.prediction_id

  if (!predictionId) {
    console.error('❌ FAIL — No prediction_id in response')
    process.exit(1)
  }

  const renderTimeMs = Date.now() - startTime
  console.log(`✓ Render request accepted in ${renderTimeMs}ms`)
  console.log(`  Prediction ID: ${predictionId}\n`)

  // Step 2: Poll /api/render/status until complete or timeout
  const POLL_INTERVAL = 2000 // 2 seconds
  const MAX_WAIT = 120000 // 2 minutes
  const startPoll = Date.now()

  let renderUrl: string | null = null
  let renderComplete = false

  while (Date.now() - startPoll < MAX_WAIT) {
    try {
      const statusResponse = await fetch(
        `http://localhost:3001/api/render/status?prediction_id=${predictionId}&showcase_mode=true`,
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      if (!statusResponse.ok) {
        console.error(`Unexpected status response: ${statusResponse.status}`)
        await new Promise((r) => setTimeout(r, POLL_INTERVAL))
        continue
      }

      const statusData = (await statusResponse.json()) as { status?: string; render_url?: string; error?: string }
      const status = statusData.status

      if (status === 'complete') {
        renderUrl = statusData.render_url ?? null
        renderComplete = true
        break
      }

      if (status === 'failed') {
        console.error(`❌ Render failed: ${statusData.error ?? 'Unknown error'}`)
        process.exit(1)
      }

      if (status === 'processing') {
        const elapsed = Math.round((Date.now() - startPoll) / 1000)
        console.log(`  [${elapsed}s] Still processing...`)
      }
    } catch (err) {
      console.error(`Poll error: ${err}`)
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }

  const totalTimeMs = Date.now() - startTime

  // ─── Validate ───────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail: string }> = []

  checks.push({
    name: 'Prediction ID returned',
    pass: Boolean(predictionId),
    detail: `${predictionId ?? 'none'}`,
  })

  checks.push({
    name: 'Render completed',
    pass: renderComplete,
    detail: renderComplete ? `in ${totalTimeMs}ms` : `timeout after ${MAX_WAIT}ms`,
  })

  checks.push({
    name: 'Render URL returned',
    pass: Boolean(renderUrl),
    detail: renderUrl ? renderUrl.substring(0, 60) + '...' : 'none',
  })

  // Verify render URL is accessible
  let renderUrlValid = false
  if (renderUrl) {
    try {
      const headResponse = await fetch(renderUrl, { method: 'HEAD' })
      const contentType = headResponse.headers.get('content-type') ?? ''
      renderUrlValid = headResponse.ok && contentType.startsWith('image/')
    } catch {
      renderUrlValid = false
    }
  }

  checks.push({
    name: 'Render URL accessible',
    pass: renderUrlValid,
    detail: renderUrl ? 'HTTP GET returns 200 and image/* content-type' : 'N/A',
  })

  // ─── Report ─────────────────────────────────────────────────
  let allPassed = true
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`\n${icon} ${check.name}: ${check.detail}`)
    if (!check.pass) allPassed = false
  }

  console.log(`\nTotal time: ${totalTimeMs}ms`)
  console.log(`\n${allPassed ? '✅ PASS' : '❌ FAIL'}`)
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
