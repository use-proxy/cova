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
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { compilePromptWithClaude } from '@/lib/ai/prompt-compiler'
import { buildFluxPrompt } from '@/lib/ai/flux'
import { fetchTopStyleReference } from '@/lib/ai/style-references'
import { analyzeRoomArchitecture, type RoomArchitecture } from '@/lib/ai/room-analyzer'
import type { StyleFingerprint } from '@/types/fingerprint'

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

  // Read personalization data
  const admin = createAdminSupabaseClient()

  let room: any = null
  let userRow: any = null
  try {
    const [roomRes, userRes] = await Promise.all([
      admin
        .from('rooms')
        .select('render_context, room_type, style_blend, original_image_url, original_photo_url')
        .eq('id', room_id)
        .single(),
      admin
        .from('users')
        .select('style_fingerprint')
        .eq('id', user.id)
        .single(),
    ])
    room = roomRes.data
    userRow = userRes.data
  } catch (err) {
    console.error('[redesign] DB read failed:', err)
    // continue — compiled_prompt will be null, Modal uses Python fallback
  }

  const renderContext = (room?.render_context as any) ?? null
  const roomType = room?.room_type ?? 'living room'

  // Resolve fingerprint — render_context first, then users fallback
  let fingerprint: StyleFingerprint | null = null
  if (
    renderContext?.fingerprint &&
    typeof renderContext.fingerprint === 'object' &&
    'dimensions' in renderContext.fingerprint
  ) {
    fingerprint = renderContext.fingerprint as StyleFingerprint
  } else if (
    userRow?.style_fingerprint &&
    typeof userRow.style_fingerprint === 'object' &&
    'dimensions' in (userRow.style_fingerprint as object)
  ) {
    fingerprint = userRow.style_fingerprint as StyleFingerprint
  }

  // Persist the full StyleFingerprint back to rooms.render_context so
  // downstream stages always see { dimensions, covariance, confidence }
  // rather than a bare dimensions record. Fire-and-forget.
  if (fingerprint && room_id) {
    void admin
      .from('rooms')
      .update({
        render_context: {
          ...(renderContext ?? {}),
          fingerprint,
        },
      } as Record<string, unknown>)
      .eq('id', room_id)
      .then(({ error }) => {
        if (error) console.error('[redesign] render_context write failed:', error)
      })
  }

  // Fetch style reference anchor
  let anchorPrompt: string | null = null
  let styleReferenceUrl: string | null = null
  if (fingerprint) {
    const styleRef = await fetchTopStyleReference(fingerprint, roomType).catch(
      () => null,
    )
    anchorPrompt = styleRef?.flux_prompt ?? null
    styleReferenceUrl = styleRef?.image_url ?? null
  }

  // Gemini room architecture analysis (non-blocking)
  let roomAnalysis: RoomArchitecture | null = null
  try {
    const originalPhotoUrl =
      (room as any)?.original_image_url ??
      (room as any)?.original_photo_url ??
      null
    if (originalPhotoUrl) {
      roomAnalysis = await analyzeRoomArchitecture(originalPhotoUrl)
    }
  } catch (err) {
    console.error('[redesign] Gemini analysis failed:', err)
  }

  // Compile prompt
  let compiledPrompt: string | null = null
  if (fingerprint) {
    compiledPrompt = await compilePromptWithClaude(
      renderContext,
      roomType,
      fingerprint,
      anchorPrompt,
      roomAnalysis,
    ).catch(() => null)

    // Fallback to buildFluxPrompt if Claude compile fails
    if (!compiledPrompt) {
      const budgetStrategy = renderContext?.budget?.strategy
      const budgetTier: 'budget' | 'mid' | 'premium' | 'luxury' =
        budgetStrategy === 'budget' ||
        budgetStrategy === 'mid' ||
        budgetStrategy === 'premium' ||
        budgetStrategy === 'luxury'
          ? budgetStrategy
          : 'mid'
      compiledPrompt = buildFluxPrompt({
        fingerprint,
        roomType,
        budgetTier,
        inclusions:
          renderContext?.requestedProducts?.map((p: any) => p.name) ?? [],
        constraints: renderContext?.roomConstraints
          ? Object.entries(renderContext.roomConstraints)
              .filter(([, v]) => v === true)
              .map(([k]) => k)
          : [],
        keptItemLabels: [],
        roomAnalysis: null,
        anchorPrompt: anchorPrompt ?? undefined,
      })
    }
  }

  console.log('[redesign] compiled_prompt length:', compiledPrompt?.length ?? 0)
  console.log('[redesign] prompt preview:', compiledPrompt?.slice(0, 120))

  try {
    // Fire-and-forget style: send the request to Modal but don't wait for the full
    // pipeline to complete. The Modal function writes directly to Supabase, so the
    // client polls /api/rooms/status for progress.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id,
        user_id: user.id,
        compiled_prompt: compiledPrompt ?? null,
        anchor_prompt: anchorPrompt ?? null,
        style_reference_url: styleReferenceUrl ?? null,
      }),
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
