/**
 * Pipeline 3 — Furniture Matching
 * Fires when user reaches step-9 (shoppable room).
 * Calls the Modal furniture_matching_webhook to detect furniture via Claude Vision
 * and match to real products via CLIP similarity search.
 *
 * Input:  { room_id: string, fixed_furniture?: array }
 * Output: { status, room_id, furniture_count, matches_stored, matches }
 * Saves:  room_products table (inserts), rooms.furniture_matches_count
 *         (all written by the Modal pipeline directly to Supabase)
 */

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface FurnitureMatchBody {
  room_id?: string
  fixed_furniture?: unknown[]
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as FurnitureMatchBody
  const { room_id, fixed_furniture } = body

  if (!room_id) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  const webhookUrl = process.env.FURNITURE_MATCHING_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'FURNITURE_MATCHING_WEBHOOK_URL not configured' },
      { status: 503 }
    )
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id,
        user_id: user.id,
        fixed_furniture: fixed_furniture ?? [],
      }),
      signal: AbortSignal.timeout(295_000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      console.error('[furniture-match] Modal webhook error:', response.status, text)
      return NextResponse.json(
        { error: 'Furniture matching pipeline failed', detail: text },
        { status: 502 }
      )
    }

    const result = (await response.json()) as {
      status: string
      room_id?: string
      furniture_count?: number
      matches_stored?: number
      detection_source?: string
      matches?: unknown[]
      error?: string
    }

    if (result.status === 'error') {
      console.error('[furniture-match] Pipeline error:', result.error)
      return NextResponse.json(
        { error: result.error ?? 'Furniture matching failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: result.status,
      room_id: result.room_id,
      furniture_count: result.furniture_count ?? 0,
      matches_stored: result.matches_stored ?? 0,
      detection_source: result.detection_source ?? 'unknown',
      matches: result.matches ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[furniture-match] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
