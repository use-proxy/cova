/**
 * Pipeline 2 — Redesign
 * Fires on step-7d page mount after all personalization is complete.
 * Calls the Modal redesign_webhook to run FLUX Kontext Pro on the room panorama.
 *
 * Input:  { room_id: string, user_id: string }
 * Output: { status, room_id, redesigned_pano_url, perspective_render_url, ... }
 * Saves:  rooms.redesign_pano_url, rooms.perspective_render_url,
 *         rooms.redesign_status ("kontext_processing" -> "kontext_complete")
 *         (all written by the Modal pipeline directly to Supabase)
 *
 * Client should poll /api/rooms/status?roomId=X every 3s for redesign_status.
 * Navigate to step-8a when redesign_status reaches "kontext_complete" or later.
 * Timeout: 5 minutes.
 */

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface RedesignBody {
  room_id?: string
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as RedesignBody
  const { room_id } = body

  if (!room_id) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  const webhookUrl = process.env.REDESIGN_PIPELINE_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'REDESIGN_PIPELINE_WEBHOOK_URL not configured' },
      { status: 503 }
    )
  }

  try {
    // Fire-and-forget style: send the request to Modal but don't wait for the full
    // pipeline to complete. The Modal function writes directly to Supabase, so the
    // client polls /api/rooms/status for progress.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id, user_id: user.id }),
      signal: AbortSignal.timeout(295_000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[redesign] Modal webhook error:', response.status, text)
      return NextResponse.json(
        { error: 'Redesign pipeline failed', detail: text },
        { status: 502 }
      )
    }

    const result = (await response.json()) as {
      status: string
      room_id?: string
      redesigned_pano_url?: string
      perspective_render_url?: string | null
      prompt?: string
      dominant_styles?: string[]
      error?: string
    }

    if (result.status === 'error') {
      console.error('[redesign] Pipeline error:', result.error)
      return NextResponse.json(
        { error: result.error ?? 'Redesign pipeline failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: result.status,
      room_id: result.room_id,
      redesigned_pano_url: result.redesigned_pano_url ?? null,
      perspective_render_url: result.perspective_render_url ?? null,
      dominant_styles: result.dominant_styles ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[redesign] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
