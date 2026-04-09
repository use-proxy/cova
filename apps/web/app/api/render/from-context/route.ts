/**
 * POST /api/render/from-context
 *
 * Fires the initial FLUX redesign using the assembled RenderContext from
 * `rooms.render_context`. The prompt is rebuilt fresh from the context on
 * every call so any fingerprint data stored in the context flows through —
 * rather than trusting the cached fluxPrompt string verbatim.
 *
 * Body: { room_id: string }
 * Returns: { prediction_id: string }
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  submitRender,
  submitDepthRender,
  submitSchnellRender,
  buildFluxPromptFromContext,
} from '@/lib/ai/flux'
import { checkRateLimit } from '@/lib/rateLimit'
import type { RenderContext } from '@/lib/types/area2'

interface Body {
  room_id?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { room_id } = (await request.json()) as Body
    if (!room_id) {
      return NextResponse.json({ error: 'Missing room_id' }, { status: 400 })
    }

    const rateLimit = checkRateLimit(user.id, 'render')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const admin = createAdminSupabaseClient()
    const { data: room, error: roomErr } = await admin
      .from('rooms')
      .select('original_photo_url, render_context, user_id, inpainting_mask_url')
      .eq('id', room_id)
      .single()

    if (roomErr || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }
    if (room.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!room.original_photo_url) {
      return NextResponse.json({ error: 'Room has no original photo' }, { status: 400 })
    }

    const ctx = room.render_context as RenderContext | null
    if (!ctx) {
      return NextResponse.json(
        { error: 'render_context missing — complete the Area 2 flow first' },
        { status: 400 }
      )
    }
    // Rebuild the prompt fresh so fingerprint data stored in the context flows
    // through — do NOT use ctx.fluxPrompt which may predate fingerprint wiring.
    const prompt = buildFluxPromptFromContext(ctx).trim()
    if (!prompt) {
      return NextResponse.json(
        { error: 'Failed to build prompt from render_context' },
        { status: 400 }
      )
    }

    // Fire Schnell preview in parallel — fast text-to-image for loading state (non-fatal)
    const schnellId = await submitSchnellRender(prompt).catch(() => null)

    // Determine pipeline:
    // - If keepMask has kept/immovable items AND an inpainting mask exists → Kontext Pro
    //   (preserves items the user wants to keep while redesigning the rest)
    // - Otherwise → Depth Pro (better geometry preservation for clean redesigns)
    const keptItems = (ctx.keepMask?.objects ?? []).filter(
      (o) => o.keep === true || o.immovable === true,
    )
    const hasInpaintingMask = Boolean((room as { inpainting_mask_url?: string }).inpainting_mask_url)

    let predictionId: string
    let pipelineType: 'kontext_preserve' | 'depth_pro'

    if (keptItems.length > 0 && hasInpaintingMask) {
      predictionId = await submitRender(room.original_photo_url, [], prompt)
      pipelineType = 'kontext_preserve'
    } else {
      predictionId = await submitDepthRender(room.original_photo_url, prompt)
      pipelineType = 'depth_pro'
    }

    await admin
      .from('rooms')
      .update({
        pipeline_cost_log: {
          from_context: true,
          pipeline: pipelineType,
          pass1_prediction_id: predictionId,
          schnell_prediction_id: schnellId,
          positive_prompt: prompt,
          prompt_char_count: prompt.length,
          prompt_word_count: prompt.split(/\s+/).filter(Boolean).length,
        },
      } as Record<string, unknown>)
      .eq('id', room_id)

    return NextResponse.json({
      prediction_id: predictionId,
      ...(schnellId ? { schnell_prediction_id: schnellId } : {}),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
