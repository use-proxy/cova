/**
 * Render Pipeline E2E Tests
 *
 * Verifies the full render pipeline end-to-end without human interaction.
 * Bypasses steps 1-5 by injecting Zustand store state directly into sessionStorage.
 *
 * Requires:
 *   - Dev server running at BASE_URL
 *   - E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env.local
 *   - Valid REPLICATE_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { test, expect } from '@playwright/test'
import { injectTestAuth } from './helpers/auth'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? '3001'}`
const TEST_PHOTO_PATH = path.join(__dirname, '../../fixtures/test-room.jpg')

// ── Shared admin client ──────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Pre-flight: server readiness + fixture download ──────────────────────────

test.beforeAll(async () => {
  // Wait for dev server to be fully compiled and serving 200 before any API calls.
  // This guards against hitting the server mid-recompile (which returns 500).
  const maxAttempts = 30
  let ready = false
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(BASE_URL)
      if (res.ok) {
        ready = true
        // Extra 2s buffer after first 200 to let webpack finish any pending chunks
        await new Promise(r => setTimeout(r, 2000))
        break
      }
    } catch {
      // server not accepting connections yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!ready) throw new Error(`Dev server at ${BASE_URL} not ready after ${maxAttempts}s`)

  if (!fs.existsSync(TEST_PHOTO_PATH)) {
    console.log('[fixture] Downloading test room photo...')
    const res = await fetch(
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024'
    )
    if (!res.ok) throw new Error(`Failed to download fixture: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.mkdirSync(path.dirname(TEST_PHOTO_PATH), { recursive: true })
    fs.writeFileSync(TEST_PHOTO_PATH, buffer)
    console.log('[fixture] Saved to', TEST_PHOTO_PATH)
  }
})

// ── Test 1: Full render pipeline end-to-end ───────────────────────────────────

test.describe('Render Pipeline', () => {
  test('render completes end-to-end with no kept items', async ({ browser }) => {
    test.setTimeout(180_000) // 3 minutes

    const context = await browser.newContext()
    await injectTestAuth(context)
    const page = await context.newPage()
    await page.goto(BASE_URL)

    // ── Step 1: Create a room via API ─────────────────────────────────────
    const createRes = await page.request.post(`${BASE_URL}/api/rooms/create`, {
      data: { room_type: 'bedroom' },
    })
    if (createRes.status() !== 200) {
      const body = await createRes.text()
      throw new Error(`Room create failed (${createRes.status()}): ${body}`)
    }
    const { id: roomId } = await createRes.json() as { id: string }
    expect(roomId).toBeTruthy()
    console.log('[test] Room created:', roomId)

    // ── Step 2: Upload photo via API ─────────────────────────────────────
    const photoBuffer = fs.readFileSync(TEST_PHOTO_PATH)
    const captureRes = await page.request.post(`${BASE_URL}/api/rooms/capture`, {
      multipart: {
        photo: {
          name: 'test-room.jpg',
          mimeType: 'image/jpeg',
          buffer: photoBuffer,
        },
        room_id: roomId,
      },
    })
    if (captureRes.status() !== 200) {
      const body = await captureRes.text()
      throw new Error(`Photo upload failed (${captureRes.status()}): ${body}`)
    }
    const { photo_url: photoUrl } = await captureRes.json() as { photo_url: string; room_id: string }
    expect(photoUrl).toBeTruthy()
    console.log('[test] Photo uploaded:', photoUrl.substring(0, 60))

    // ── Step 3: Kick off render via API ───────────────────────────────────
    // Call /api/render directly — avoids browser navigation and auth cookie
    // issues. Tests the full pipeline: render fires → Replicate prediction →
    // status polling writes render_url to DB.
    const renderRes = await page.request.post(`${BASE_URL}/api/render`, {
      data: {
        photo_url: photoUrl,
        fingerprint_vector: {
          dimensions: {
            luminosity: 0.4, density: -0.4, temperature: 0.6, form: -0.2,
            era: -0.6, texture: 0.4, scale: 0.0, nature: 0.2,
            saturation: -0.2, materialOrigin: -0.4,
          },
          covariance: Array(10).fill(Array(10).fill(0)),
          confidence: 0.8,
        },
        room_type: 'bedroom',
        budget: 'mid',
        budget_tier: 'mid',
        inclusions: [],
        constraints: [],
        keep_mask: [],     // EMPTY — single-stage render, no inpainting
        room_id: roomId,
        room_length: 14,
        room_width: 12,
        ceiling_height: 9,
        natural_light: 'Multiple windows',
        floor_type: 'Hardwood',
        wall_finish: 'Painted (standard)',
        fixed_elements: [],
        render_iteration: 1,
      },
    })
    if (renderRes.status() !== 200) {
      const body = await renderRes.text()
      throw new Error(`Render API failed (${renderRes.status()}): ${body}`)
    }
    const { prediction_id: predictionId } = await renderRes.json() as { prediction_id: string }
    expect(predictionId).toBeTruthy()
    console.log('[test] Render started, prediction_id:', predictionId)

    // ── Step 4: Poll render/status until render_url appears ──────────────
    // The status endpoint polls Replicate and writes render_url to the DB
    // when the prediction completes.
    const admin = adminClient()
    let renderUrl: string | null = null
    const maxAttempts = 30 // 30 × 5s = 150s
    let attempts = 0

    while (attempts < maxAttempts) {
      await page.waitForTimeout(5000)
      attempts++

      // Poll via the status API (same as step-7 UI does every 3s)
      const statusRes = await page.request.get(
        `${BASE_URL}/api/render/status?prediction_id=${predictionId}&room_id=${roomId}&render_iteration=1`
      )
      if (statusRes.ok()) {
        const statusData = await statusRes.json() as
          | { status: 'processing' }
          | { status: 'complete'; render_url: string }
          | { status: 'failed'; error?: string }
        if (statusData.status === 'complete') {
          renderUrl = statusData.render_url
          console.log('[test] Status: complete')
          break
        }
        if (statusData.status === 'failed') {
          throw new Error(`Render failed: ${'error' in statusData ? statusData.error : 'unknown'}`)
        }
      }

      // Also check the DB directly as fallback
      const { data } = await admin
        .from('rooms')
        .select('render_url, pipeline_cost_log')
        .eq('id', roomId)
        .single()

      type CostLog = { two_stage?: boolean }
      const costLog = data?.pipeline_cost_log as CostLog | null
      const renderPreview = data?.render_url?.substring(0, 40) ?? 'null'
      console.log(
        `[test] Poll ${attempts}/${maxAttempts}: render_url=${renderPreview}, two_stage=${costLog?.two_stage ?? 'not set'}`
      )

      if (data?.render_url) {
        renderUrl = data.render_url
        break
      }
    }

    // ── Step 5: Final assertions ──────────────────────────────────────────
    const { data: finalRoom } = await admin
      .from('rooms')
      .select('render_url, pipeline_cost_log')
      .eq('id', roomId)
      .single()

    type CostLog = { two_stage?: boolean }
    const finalCostLog = finalRoom?.pipeline_cost_log as CostLog | null
    console.log('[test] pipeline_cost_log:', JSON.stringify(finalCostLog))
    console.log('[test] two_stage:', finalCostLog?.two_stage ?? 'not set')

    expect(finalCostLog?.two_stage).toBeFalsy()
    expect(finalRoom?.render_url).toBeTruthy()
    expect(finalRoom?.render_url).toMatch(/^https:\/\//)

    console.log('[TEST PASSED] Render completed successfully')
    console.log('[TEST PASSED] Render URL:', finalRoom?.render_url)

    await context.close()
  })

  // ── Test 2: Inpainting gate — does NOT fire when no items are kept ────────

  test('inpainting does NOT fire when no items are kept', async ({ browser }) => {
    test.setTimeout(60_000)

    const context = await browser.newContext()
    await injectTestAuth(context)
    const page = await context.newPage()
    await page.goto(BASE_URL)

    // Create a room to get a real room_id for the DB check
    const createRes = await page.request.post(`${BASE_URL}/api/rooms/create`, {
      data: { room_type: 'bedroom' },
    })
    expect(createRes.status()).toBe(200)
    const { id: roomId } = await createRes.json() as { id: string }
    console.log('[test2] Room created:', roomId)

    // Call render API directly with empty keep_mask (no showcase_mode)
    // This goes through the real pipeline path
    const renderRes = await page.request.post(`${BASE_URL}/api/render`, {
      data: {
        photo_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024',
        fingerprint_vector: {
          dimensions: {
            luminosity: 0.4, density: -0.4, temperature: 0.6, form: -0.2,
            era: -0.6, texture: 0.4, scale: 0.0, nature: 0.2,
            saturation: -0.2, materialOrigin: -0.4,
          },
          covariance: Array(10).fill(Array(10).fill(0)),
          confidence: 0.8,
        },
        room_type: 'bedroom',
        budget: 'mid',
        inclusions: [],
        constraints: [],
        keep_mask: [],     // EMPTY — must NOT trigger inpainting
        room_id: roomId,
      },
    })

    if (renderRes.status() !== 200) {
      const body = await renderRes.text()
      throw new Error(`Render API failed (${renderRes.status()}): ${body}`)
    }

    const { prediction_id: predictionId } = await renderRes.json() as { prediction_id: string }
    expect(predictionId).toBeTruthy()
    console.log('[test2] prediction_id:', predictionId)

    // Check DB immediately — pipeline_cost_log.two_stage must NOT be set
    // (it's only set when keptItems.length > 0 triggers inpainting)
    const admin = adminClient()
    const { data: room } = await admin
      .from('rooms')
      .select('pipeline_cost_log')
      .eq('id', roomId)
      .single()

    type CostLog = { two_stage?: boolean }
    const costLog = room?.pipeline_cost_log as CostLog | null
    console.log('[test2] pipeline_cost_log:', JSON.stringify(costLog))
    console.log('[test2] two_stage:', costLog?.two_stage ?? 'not set')

    // If two_stage is set, inpainting was incorrectly triggered
    expect(costLog?.two_stage).toBeFalsy()

    console.log('[TEST PASSED] Inpainting gate works — single-stage render confirmed')

    await context.close()
  })
})
