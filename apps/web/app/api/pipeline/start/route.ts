import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPipelineConfig } from '@/lib/pipelineConfig'
import { waitForStatus } from '@/lib/pipelinePoller'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in route handlers
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomId } = await request.json()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  const config = getPipelineConfig()

  // Store pipeline mode and initial status
  await supabase
    .from('rooms')
    .update({
      status: 'processing',
      redesign_status: 'queued',
      pipeline_mode: config.mode,
      pipeline_cost_log: { mode: config.mode, started_at: new Date().toISOString() },
    })
    .eq('id', roomId)

  if (config.mode === 'full') {
    // New architecture: multi-image + flythrough + async Plus
    orchestrateFullPipeline(roomId, user.id).catch((err) =>
      console.error('[pipeline] Full orchestrator error:', err)
    )
  } else {
    // Legacy pipeline paths
    const marbleWebhook = process.env.MARBLE_PIPELINE_WEBHOOK_URL
    if (marbleWebhook) {
      triggerWebhook(marbleWebhook, roomId, user.id)
    }
    orchestrateLegacyPipeline(roomId, user.id, config.useMiniFinal).catch((err) =>
      console.error('[pipeline] Legacy orchestrator error:', err)
    )
  }

  return NextResponse.json({
    success: true,
    roomId,
    pipelineMode: config.mode,
    estimatedSeconds: config.estimatedTotalSeconds,
  })
}

function triggerWebhook(url: string, roomId: string, userId: string) {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, user_id: userId }),
  }).catch((err) => console.error(`[pipeline] Webhook failed: ${err}`))
}

// ── Full Pipeline (new architecture) ──────────────────────────────────────
async function orchestrateFullPipeline(roomId: string, userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  function updateRoom(data: Record<string, unknown>) {
    return fetch(`${supabaseUrl}/rest/v1/rooms?id=eq.${roomId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    })
  }

  try {
    // Stage 1: Multi-image Mini — fires after photos uploaded
    const multiImageUrl = process.env.MARBLE_MULTI_IMAGE_WEBHOOK_URL
    if (multiImageUrl) {
      // Read photo URLs from room
      const roomResp = await fetch(
        `${supabaseUrl}/rest/v1/rooms?id=eq.${roomId}&select=capture_photo_urls`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      )
      const roomData = await roomResp.json()
      const photoUrls = roomData[0]?.capture_photo_urls ?? []

      if (photoUrls.length >= 4) {
        const selectedPhotos = photoUrls.slice(0, 8)
        fetch(multiImageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomId,
            photo_urls: selectedPhotos,
          }),
        }).catch((err) => console.error('[pipeline] Multi-image webhook failed:', err))
      }
    }

    await waitForStatus(roomId, 'mini_world_ready', { timeoutMs: 120000, pollMs: 2000 })

    // Stage 2: Pipeline PAUSES — awaiting user furniture selection
    await updateRoom({ redesign_status: 'awaiting_furniture_selection' })

    // Pipeline resumes when client calls /api/pipeline/resume
    // The resume endpoint triggers FLUX, which fires depth-video + matching + Plus
    await waitForStatus(roomId, 'kontext_complete', { timeoutMs: 180000, pollMs: 2000 })

    // Stage 4: Three parallel fires after FLUX completes
    const [depthVideoUrl, furnitureUrl, plusUrl] = [
      process.env.DEPTH_VIDEO_WEBHOOK_URL,
      process.env.FURNITURE_MATCHING_WEBHOOK_URL,
      process.env.MARBLE_PLUS_WEBHOOK_URL,
    ]

    // Read redesign pano and style data
    const roomResp2 = await fetch(
      `${supabaseUrl}/rest/v1/rooms?id=eq.${roomId}&select=redesign_pano_url,style_blend`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    const roomData2 = await roomResp2.json()
    const panoUrl = roomData2[0]?.redesign_pano_url
    const styleBlend = roomData2[0]?.style_blend ?? {}

    // Fire all three in parallel
    const fires: Promise<void>[] = []

    if (depthVideoUrl && panoUrl) {
      fires.push(
        fetch(depthVideoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomId,
            pano_url: panoUrl,
            style_blend: styleBlend,
            hotspot_azimuths: [],
          }),
        }).then(() => undefined)
      )
    }

    if (furnitureUrl) {
      fires.push(
        fetch(furnitureUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, user_id: userId }),
        }).then(() => undefined)
      )
    }

    if (plusUrl) {
      await updateRoom({ plus_started_at: new Date().toISOString() })
      fires.push(
        fetch(plusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, user_id: userId }),
        }).then(() => undefined)
      )
    }

    await Promise.allSettled(fires)

    // Wait only for video_ready — user sees video first
    await waitForStatus(roomId, 'video_ready', { timeoutMs: 120000, pollMs: 1000 })

    // Plus and furniture matching continue in background
  } catch (err) {
    console.error('[pipeline] Full pipeline error:', err)
    await updateRoom({ redesign_status: 'error' })
  }
}

// ── Legacy Pipeline (backward compat) ─────────────────────────────────────
async function orchestrateLegacyPipeline(
  roomId: string,
  userId: string,
  useMiniFinal: boolean
) {
  try {
    await waitForStatus(roomId, 'pano_ready', { timeoutMs: 900000, pollMs: 5000 })

    const redesignUrl = process.env.REDESIGN_PIPELINE_WEBHOOK_URL
    if (redesignUrl) {
      triggerWebhook(redesignUrl, roomId, userId)
    }
    await waitForStatus(roomId, 'kontext_complete', { timeoutMs: 900000, pollMs: 5000 })

    if (useMiniFinal) {
      const miniUrl = process.env.MARBLE_MINI_FINAL_WEBHOOK_URL
      if (miniUrl) triggerWebhook(miniUrl, roomId, userId)
      await waitForStatus(roomId, 'marble_mini_final_complete', {
        timeoutMs: 900000,
        pollMs: 5000,
      })
    } else {
      const plusUrl = process.env.MARBLE_PLUS_WEBHOOK_URL
      if (plusUrl) triggerWebhook(plusUrl, roomId, userId)
      await waitForStatus(roomId, 'marble_plus_complete', {
        timeoutMs: 900000,
        pollMs: 5000,
      })
    }

    const matchUrl = process.env.FURNITURE_MATCHING_WEBHOOK_URL
    if (matchUrl) triggerWebhook(matchUrl, roomId, userId)
    await waitForStatus(roomId, 'complete', { timeoutMs: 900000, pollMs: 5000 })
  } catch (err) {
    console.error('[pipeline] Legacy stage failed:', err)
  }
}
