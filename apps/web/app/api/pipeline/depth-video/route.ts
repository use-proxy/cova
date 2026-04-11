/**
 * Pipeline 5 — Depth Video
 * Fires async after the redesign pipeline completes (render_url is populated).
 * Calls the Modal depth_video_webhook to generate a cinematic flythrough MP4.
 *
 * Input:  { room_id: string, pano_url: string, style_blend?: object, hotspot_azimuths?: array }
 * Output: { status, flythrough_video_url, depth_map_url, hotspot_timing, ... }
 * Saves:  rooms.flythrough_video_url, rooms.flythrough_ready,
 *         rooms.flythrough_duration_seconds, rooms.depth_map_url_v2,
 *         rooms.hotspot_timing, rooms.redesign_status -> "video_ready"
 *         (all written by the Modal pipeline directly to Supabase)
 */

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface DepthVideoBody {
  room_id?: string
  pano_url?: string
  style_blend?: Record<string, number>
  hotspot_azimuths?: unknown[]
}

export async function POST(request: Request) {
  const serviceKey = request.headers.get('x-service-key')
  const isServiceCall =
    !!serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!isServiceCall) {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = (await request.json()) as DepthVideoBody
  const { room_id, pano_url, style_blend, hotspot_azimuths } = body

  if (!room_id || !pano_url) {
    return NextResponse.json(
      { error: 'room_id and pano_url are required' },
      { status: 400 }
    )
  }

  const webhookUrl = process.env.DEPTH_VIDEO_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('[depth-video] DEPTH_VIDEO_WEBHOOK_URL not configured — skipping')
    return NextResponse.json({ flythrough_video_url: null })
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id,
        pano_url,
        style_blend: style_blend ?? {},
        hotspot_azimuths: hotspot_azimuths ?? [],
      }),
      signal: AbortSignal.timeout(295_000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[depth-video] Modal webhook error:', response.status, text)
      return NextResponse.json({ flythrough_video_url: null })
    }

    const result = (await response.json()) as {
      status?: string
      flythrough_video_url?: string
      depth_map_url?: string
      hotspot_timing?: unknown[]
      video_duration_seconds?: number
      video_size_mb?: number
      error?: string
    }

    if (result.error) {
      console.error('[depth-video] Pipeline error:', result.error)
      return NextResponse.json({ flythrough_video_url: null })
    }

    return NextResponse.json({
      status: result.status ?? 'complete',
      flythrough_video_url: result.flythrough_video_url ?? null,
      depth_map_url: result.depth_map_url ?? null,
      hotspot_timing: result.hotspot_timing ?? [],
      video_duration_seconds: result.video_duration_seconds ?? null,
      video_size_mb: result.video_size_mb ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[depth-video] Unexpected error:', message)
    return NextResponse.json({ flythrough_video_url: null })
  }
}
