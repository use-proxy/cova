import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const PROGRESS_MAP: Record<string, { percent: number; message: string }> = {
  pending: { percent: 0, message: 'Getting ready...' },
  queued: { percent: 5, message: 'Queued for processing...' },
  uploading_photos: { percent: 5, message: 'Uploading your photos...' },
  generating_mini_world: { percent: 15, message: 'Scanning your room...' },
  mini_world_ready: { percent: 25, message: 'Room captured!' },
  awaiting_furniture_selection: { percent: 30, message: 'Waiting for your selections...' },
  kontext_processing: { percent: 45, message: 'Redesigning your room...' },
  kontext_complete: { percent: 60, message: 'Design complete. Building your world...' },
  depth_processing: { percent: 70, message: 'Analyzing your space...' },
  video_processing: { percent: 85, message: 'Crafting your walkthrough...' },
  video_ready: { percent: 95, message: 'Almost ready...' },
  matching_products: { percent: 97, message: 'Finding your furniture...' },
  matching_queued: { percent: 92, message: 'Queued for furniture matching...' },
  plus_processing: { percent: 98, message: 'Enhancing 3D quality...' },
  complete: { percent: 100, message: 'Your room is ready!' },
  error: { percent: 0, message: 'Something went wrong. Please try again.' },
  // Legacy statuses
  video_processing_legacy: { percent: 10, message: 'Processing your video...' },
  marble_generating: { percent: 25, message: 'Building your room...' },
  pano_ready: { percent: 35, message: 'Room captured! Redesigning...' },
  marble_plus_queued: { percent: 68, message: 'Queued for 3D generation...' },
  marble_plus_processing: { percent: 80, message: 'Creating your 3D world...' },
  marble_plus_complete: { percent: 90, message: 'Finding matching furniture...' },
}

export async function GET(request: NextRequest) {
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
            // Ignore
          }
        },
      },
    }
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId')
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  const { data: room } = await supabase
    .from('rooms')
    .select(
      `id, status, redesign_status, render_url,
       marble_spz_url, marble_spz_url_500k, marble_spz_url_100k,
       marble_mini_spz_url, marble_plus_thumbnail_url,
       furniture_matches_count, redesign_pano_url,
       flythrough_ready, flythrough_video_url, flythrough_duration_seconds,
       plus_upgrade_ready, plus_started_at, plus_completed_at,
       hotspot_timing, pipeline_mode, pipeline_cost_log,
       pre_detection_result, fixed_furniture, capture_mode`
    )
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  const { data: roomProducts } = await supabase
    .from('room_products')
    .select('id, hotspot_x, hotspot_y, furniture_label, matches')
    .eq('room_id', roomId)

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const statusKey = room.redesign_status ?? 'pending'
  const statusInfo = PROGRESS_MAP[statusKey] ?? { percent: 50, message: 'Processing...' }

  const isComplete =
    statusKey === 'complete' ||
    (!!room.render_url && (!room.redesign_status || room.redesign_status === 'pending')) ||
    !!room.redesign_pano_url
  const panoUrlForTrigger = room.redesign_pano_url ?? room.render_url ?? null

  if (
    isComplete &&
    panoUrlForTrigger &&
    !room.flythrough_ready &&
    !room.flythrough_video_url
  ) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://covainterior.com'
    fetch(`${baseUrl}/api/pipeline/depth-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      },
      body: JSON.stringify({ room_id: roomId, pano_url: panoUrlForTrigger }),
    }).catch((err) => console.error('[status] depth-video trigger:', err))

    fetch(`${baseUrl}/api/detect/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      },
      body: JSON.stringify({ roomId }),
    }).catch((err) => console.error('[status] detect/render trigger:', err))
  }

  // Compute Plus ETA
  let plusEtaSeconds: number | null = null
  if (room.plus_started_at && !room.plus_upgrade_ready) {
    const elapsed = (Date.now() - new Date(room.plus_started_at).getTime()) / 1000
    plusEtaSeconds = Math.max(0, Math.round(330 - elapsed))
  }

  return NextResponse.json({
    roomId,
    redesign_status: statusKey,
    progress_percent: statusInfo.percent,
    progress_message: statusInfo.message,
    isComplete: statusKey === 'complete' || (!!room.render_url && (!room.redesign_status || room.redesign_status === 'pending')),
    isError: statusKey === 'error',

    // Flythrough video
    flythrough_ready: room.flythrough_ready ?? false,
    flythrough_video_url: room.flythrough_video_url ?? null,
    flythrough_duration_seconds: room.flythrough_duration_seconds ?? null,

    // Plus upgrade
    plus_upgrade_ready: room.plus_upgrade_ready ?? false,
    plus_started_at: room.plus_started_at ?? null,
    plus_completed_at: room.plus_completed_at ?? null,
    plus_eta_seconds: plusEtaSeconds,

    // SPZ URLs
    marble_spz_url: room.marble_spz_url ?? null,
    marble_mini_spz_url: room.marble_mini_spz_url ?? null,
    marble_spz_url_500k: room.marble_spz_url_500k ?? null,
    marble_spz_url_100k: room.marble_spz_url_100k ?? null,

    // Hotspot timing
    hotspot_timing: room.hotspot_timing ?? null,

    // Pipeline info
    pipeline_mode: room.pipeline_mode ?? 'full',
    pipeline_cost_log: room.pipeline_cost_log ?? null,

    // Pre-detection
    pre_detection_result: room.pre_detection_result ?? null,
    fixed_furniture: room.fixed_furniture ?? null,

    // Perspective render + hotspots
    perspective_render_url: room.redesign_pano_url ?? room.render_url ?? null,
    room_products: roomProducts ?? [],

    // Legacy compat
    spzUrl: room.marble_spz_url,
    spzUrl500k: room.marble_spz_url_500k,
    thumbnailUrl: room.marble_plus_thumbnail_url,
    furnitureCount: room.furniture_matches_count ?? 0,
    redesignPanoUrl: room.redesign_pano_url ?? room.render_url ?? null,
  })
}
