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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
const TEST_PHOTO_PATH = path.join(__dirname, '../../fixtures/test-room.jpg')

// ── Shared admin client ──────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Download test fixture if missing ─────────────────────────────────────────

test.beforeAll(async () => {
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

    // ── Step 3: Navigate to step-6, inject store state via sessionStorage ─
    // sessionStorage is origin-scoped — navigate first to establish origin,
    // then set storage, then reload so Zustand re-hydrates from sessionStorage.
    await page.goto(`${BASE_URL}/design/step-6`)

    const fpState = {
      state: {
        roomType: 'bedroom',
        budgetTier: 'mid',
        budgetRange: [500, 2000],
        quizResponses: [],
        fingerprint: [0.7, 0.3, 0.8, 0.4, 0.2, 0.7, 0.5, 0.6, 0.4, 0.3],
        styleName: 'Contemporary',
        entryPath: 'pairs',
        dimensions: null,
        constraints: [],
        inclusions: [],
        roomLength: 14,
        roomWidth: 12,
        ceilingHeight: 9,
        naturalLight: 'Multiple windows',
        wallLayout: { top: [], bottom: [], left: [], right: [] },
        fixedElements: [],
        floorType: 'Hardwood',
        wallFinish: 'Painted (standard)',
        hasCloset: false,
        closetWall: null,
        showcasePredictionIds: null,
      },
      version: 0,
    }

    const roomState = {
      state: {
        roomId,
        originalPhotoUrl: photoUrl,
        depthMapUrl: null,
        renderUrl: null,
        keepMask: [],       // Empty array — triggers fallback UI + skips inpainting
        renderSessions: [],
        currentRenderIteration: 1,
      },
      version: 0,
    }

    await page.evaluate(
      ({ fp, room }) => {
        // Stores use sessionStorage (per CLAUDE.md Rule 1 — no localStorage)
        sessionStorage.setItem('cova-fingerprint-v1', JSON.stringify(fp))
        sessionStorage.setItem('cova-room-v1', JSON.stringify(room))
      },
      { fp: fpState, room: roomState }
    )

    await page.reload()
    await page.waitForTimeout(1000) // Let Zustand hydrate

    // ── Step 4: Click "Design My Room" without touching any detection dots ─
    // keepMask=[] means showFallback=true on step-6, which shows the CTA immediately
    const designBtn = page.locator('button', { hasText: 'Design My Room' })
    await expect(designBtn).toBeVisible({ timeout: 15_000 })
    console.log('[test] "Design My Room" button is visible — clicking')
    await designBtn.click()

    // ── Step 5: Wait for step-7 to load ──────────────────────────────────
    await page.waitForURL(/step-7/, { timeout: 15_000 })
    console.log('[test] Navigated to step-7 — render firing...')

    // ── Step 6: Poll the DB until render_url appears ──────────────────────
    const admin = adminClient()
    let renderUrl: string | null = null
    const maxAttempts = 30 // 30 × 5s = 150s
    let attempts = 0

    while (attempts < maxAttempts) {
      await page.waitForTimeout(5000)
      attempts++

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

      // Check if page navigated away (to step-8 on success, or error screen)
      const currentUrl = page.url()
      if (currentUrl.includes('step-8')) {
        console.log('[test] Page navigated to step-8 — render complete')
        break
      }
    }

    // ── Step 7: Final assertions ──────────────────────────────────────────
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
        fingerprint_vector: [0.7, 0.3, 0.8, 0.4, 0.2, 0.7, 0.5, 0.6, 0.4, 0.3],
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
