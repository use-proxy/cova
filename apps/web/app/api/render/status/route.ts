import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Replicate from 'replicate'
import type { InsertTables } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { submitArchitectureCorrection } from '@/lib/ai/flux'
import { upscaleRender } from '@/lib/ai/upscaler'
import type { RoomArchitecture } from '@/lib/ai/room-analyzer'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// Async re-detection on the rendered image.
// Rendered images are clean AI images — GroundingDINO gets better results on them.
// Merges render detections with user's keep=true choices from the original photo.
async function triggerRenderDetection(
  renderUrl: string,
  roomId: string,
  admin: SupabaseClient,
): Promise<void> {
  try {
    const { detectFurniture } = await import('@/lib/ai/grounding')

    const renderDetections = await detectFurniture(renderUrl)
    if (renderDetections.length === 0) return

    // Load existing keep_mask to preserve user's keep=true choices
    const { data: room } = await admin
      .from('rooms')
      .select('keep_mask')
      .eq('id', roomId)
      .single()

    type MaskItem = {
      type: string; label: string
      bbox: [number, number, number, number]
      confidence: number; keep: boolean | null
    }
    const existingMask = (room?.keep_mask ?? []) as MaskItem[]
    const keptItems = existingMask.filter((m) => m.keep === true)

    // Add render detections that aren't already in the kept set
    const renderItems = renderDetections
      .filter((d) => d.confidence >= 0.30)
      .filter((d) => !keptItems.some((k) => k.label === d.label))
      .map((d) => ({
        type: d.type,
        label: d.label,
        bbox: d.bbox,
        confidence: d.confidence,
        keep: null as null,
      }))

    const mergedMask = [...keptItems, ...renderItems]
    if (mergedMask.length === 0) return

    await admin
      .from('rooms')
      .update({ keep_mask: mergedMask })
      .eq('id', roomId)

    console.log(`[render-detect] Wrote ${renderItems.length} render detections for room ${roomId}`)
  } catch (err) {
    console.error('[render-detect] Failed:', err)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const predictionId = searchParams.get('prediction_id')
  const roomId = searchParams.get('room_id')
  const schnellPredictionId = searchParams.get('schnell_prediction_id')
  const isShowcaseMode = searchParams.get('showcase_mode') === 'true'
  const renderIteration = parseInt(searchParams.get('render_iteration') ?? '1', 10)

  if (!predictionId || (!isShowcaseMode && !roomId)) {
    return NextResponse.json({ error: 'Missing prediction_id or room_id' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Showcase mode: just check Replicate status, skip all DB operations
  if (isShowcaseMode) {
    const prediction = await replicate.predictions.get(predictionId)
    if (prediction.status === 'starting' || prediction.status === 'processing') {
      return NextResponse.json({ status: 'processing' })
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return NextResponse.json({ status: 'failed', error: prediction.error ?? 'Render failed' })
    }
    if (prediction.status === 'succeeded') {
      const output = prediction.output
      let renderUrl: string | null = null
      if (Array.isArray(output) && output.length > 0) {
        renderUrl = output[0] as string
      } else if (typeof output === 'string') {
        renderUrl = output
      }
      if (!renderUrl) {
        return NextResponse.json({ status: 'failed', error: 'No output URL' })
      }
      return NextResponse.json({ status: 'complete', render_url: renderUrl })
    }
    return NextResponse.json({ status: 'processing' })
  }

  const admin = createAdminSupabaseClient()

  // Fetch room metadata up front so we can route into the two-pass branch
  // before touching Replicate. The two-pass flow needs to poll pass 2's
  // prediction id (not the pass 1 id the frontend sends) as soon as pass 2
  // has been kicked off.
  const { data: roomRaw } = await admin
    .from('rooms')
    .select('pipeline_cost_log, inpainting_mask_url, original_photo_url')
    .eq('id', roomId)
    .single()

  type CostLog = {
    two_stage?: boolean
    stage1_prediction_id?: string
    stage2_pending?: boolean
    stage2_prediction_id?: string
    positive_prompt?: string
    style_strength?: number
    quality_check_attempts?: number
    // Two-pass Kontext Pro fields
    two_pass?: boolean
    pass1_prediction_id?: string
    pass2_prediction_id?: string | null
    pass1_url?: string
    pass2_url?: string
    arch_analysis?: RoomArchitecture
    schnell_prediction_id?: string | null
  }
  const roomMeta = roomRaw as {
    pipeline_cost_log?: unknown
    inpainting_mask_url?: string
    original_photo_url?: string
  } | null
  const costLog = roomMeta?.pipeline_cost_log as CostLog | null
  const maskUrl = roomMeta?.inpainting_mask_url ?? null
  const schnellIdForPreview = schnellPredictionId ?? costLog?.schnell_prediction_id ?? null

  // Helper: fetch Schnell preview URL for in-flight responses (non-fatal)
  async function getSchnellPreviewUrl(): Promise<string | null> {
    if (!schnellIdForPreview) return null
    try {
      const schnell = await replicate.predictions.get(schnellIdForPreview)
      if (schnell.status !== 'succeeded') return null
      const out = schnell.output
      if (Array.isArray(out) && out.length > 0) return out[0] as string
      if (typeof out === 'string') return out
    } catch {
      /* non-fatal */
    }
    return null
  }

  // ── TWO-PASS KONTEXT PRO BRANCH ─────────────────────────────────────────────
  // Pass 1 (style) runs first. When it completes, we submit pass 2
  // (architecture correction) automatically and start polling it. The frontend
  // sees progressive improvement:
  //   Schnell preview → Pass 1 output → Pass 2 final
  if (costLog?.two_pass) {
    // If pass 2 is already running, poll that
    if (costLog.pass2_prediction_id) {
      const pass2 = await replicate.predictions.get(costLog.pass2_prediction_id)

      if (pass2.status === 'starting' || pass2.status === 'processing') {
        return NextResponse.json({
          status: 'processing',
          preview_url: costLog.pass1_url ?? (await getSchnellPreviewUrl()) ?? null,
        })
      }

      if (pass2.status === 'failed' || pass2.status === 'canceled') {
        // Fall back to pass 1 output — better to show a stylistically correct
        // render than to fail outright.
        console.error('[render-status] Pass 2 failed, falling back to pass 1:', pass2.error)
        const fallbackUrl = costLog.pass1_url
        if (!fallbackUrl) {
          return NextResponse.json({ status: 'failed', error: pass2.error ?? 'Pass 2 failed' })
        }
        await admin.from('rooms').update({ render_url: fallbackUrl }).eq('id', roomId)
        const fallbackSession: InsertTables<'render_sessions'> = {
          room_id: roomId!,
          render_url: fallbackUrl,
          prompt: costLog.positive_prompt ?? '',
          style_strength: 0.85,
          iteration: renderIteration,
        }
        const { data: session } = await admin
          .from('render_sessions')
          .insert(fallbackSession)
          .select('id')
          .single()
        void triggerRenderDetection(fallbackUrl, roomId!, admin)
        return NextResponse.json({
          status: 'complete',
          render_url: fallbackUrl,
          preview_url: fallbackUrl,
          render_session_id: session?.id ?? null,
        })
      }

      if (pass2.status === 'succeeded') {
        const out = pass2.output
        const pass2Url = Array.isArray(out) ? (out[0] as string) : (out as string)
        if (!pass2Url || typeof pass2Url !== 'string' || !pass2Url.startsWith('http')) {
          return NextResponse.json({ status: 'failed', error: 'No valid pass 2 URL' })
        }

        // Post-process the final render through Clarity Upscaler to add
        // photorealistic fabric textures and material detail. Non-fatal:
        // falls back to the original pass 2 output if upscaling fails.
        const finalUrl = await upscaleRender(pass2Url, 'interior design')

        await admin
          .from('rooms')
          .update({
            render_url: finalUrl,
            pipeline_cost_log: { ...costLog, pass2_url: finalUrl },
          } as Record<string, unknown>)
          .eq('id', roomId)

        const finalSession: InsertTables<'render_sessions'> = {
          room_id: roomId!,
          render_url: finalUrl,
          prompt: costLog.positive_prompt ?? '',
          style_strength: 0.85,
          iteration: renderIteration,
        }
        const { data: session } = await admin
          .from('render_sessions')
          .insert(finalSession)
          .select('id')
          .single()

        void triggerRenderDetection(finalUrl, roomId!, admin)

        return NextResponse.json({
          status: 'complete',
          render_url: finalUrl,
          preview_url: costLog.pass1_url ?? finalUrl,
          render_session_id: session?.id ?? null,
        })
      }

      return NextResponse.json({ status: 'processing' })
    }

    // Pass 1 still running / just completed
    const pass1 = await replicate.predictions.get(predictionId)

    if (pass1.status === 'starting' || pass1.status === 'processing') {
      return NextResponse.json({
        status: 'processing',
        preview_url: (await getSchnellPreviewUrl()) ?? null,
      })
    }

    if (pass1.status === 'failed' || pass1.status === 'canceled') {
      return NextResponse.json({
        status: 'failed',
        error: pass1.error ?? 'Pass 1 failed',
      })
    }

    if (pass1.status === 'succeeded') {
      const out = pass1.output
      const pass1Url = Array.isArray(out) ? (out[0] as string) : (out as string)
      if (!pass1Url || typeof pass1Url !== 'string' || !pass1Url.startsWith('http')) {
        return NextResponse.json({ status: 'failed', error: 'No valid pass 1 URL' })
      }

      const arch = costLog.arch_analysis
      if (!arch) {
        // Missing arch metadata — treat pass 1 output as final
        await admin.from('rooms').update({ render_url: pass1Url }).eq('id', roomId)
        return NextResponse.json({ status: 'complete', render_url: pass1Url })
      }

      let pass2Id: string
      try {
        pass2Id = await submitArchitectureCorrection(
          pass1Url,
          roomMeta?.original_photo_url ?? pass1Url,
          arch,
        )
      } catch (err) {
        // Pass 2 submission failed — use pass 1 output as final
        console.error('[render-status] Failed to submit pass 2:', err)
        await admin.from('rooms').update({ render_url: pass1Url }).eq('id', roomId)
        return NextResponse.json({ status: 'complete', render_url: pass1Url, preview_url: pass1Url })
      }

      await admin
        .from('rooms')
        .update({
          pipeline_cost_log: {
            ...costLog,
            pass1_url: pass1Url,
            pass2_prediction_id: pass2Id,
          },
        } as Record<string, unknown>)
        .eq('id', roomId)

      return NextResponse.json({ status: 'processing', preview_url: pass1Url })
    }

    return NextResponse.json({ status: 'processing' })
  }

  // ── LEGACY SINGLE-STAGE / TWO-STAGE (FLUX FILL PRO) BRANCH ──────────────────
  const prediction = await replicate.predictions.get(predictionId)

  const status = prediction.status

  if (status === 'starting' || status === 'processing') {
    const previewUrl = await getSchnellPreviewUrl()
    if (previewUrl) {
      return NextResponse.json({ status: 'processing', preview_url: previewUrl })
    }
    return NextResponse.json({ status: 'processing' })
  }

  if (status === 'failed' || status === 'canceled') {
    return NextResponse.json({
      status: 'failed',
      error: prediction.error ?? 'Render failed',
    })
  }

  if (status === 'succeeded') {

    // Stage 2 orchestration: Stage 1 just completed — fire Stage 2
    if (costLog?.two_stage && costLog?.stage2_pending && !costLog?.stage2_prediction_id) {
      const stage1Output = prediction.output
      const stage1OutputUrl = Array.isArray(stage1Output)
        ? (stage1Output[0] as string)
        : (stage1Output as string)

      const stage2 = await replicate.predictions.create({
        model: 'black-forest-labs/flux-fill-pro',
        input: {
          image: stage1OutputUrl,
          mask: maskUrl,
          prompt: costLog.positive_prompt ?? '',
          steps: 28,
          guidance: 30,
          output_format: 'jpg',
          output_quality: 90,
          safety_tolerance: 2,
        },
      })

      await admin
        .from('rooms')
        .update({
          pipeline_cost_log: {
            ...costLog,
            stage2_pending: false,
            stage2_prediction_id: stage2.id,
          },
        } as Record<string, unknown>)
        .eq('id', roomId)

      return NextResponse.json({ status: 'processing' })
    }

    // Stage 2 orchestration: poll Stage 2 prediction
    if (costLog?.two_stage && costLog?.stage2_prediction_id) {
      const stage2Prediction = await replicate.predictions.get(costLog.stage2_prediction_id)

      if (stage2Prediction.status === 'failed' || stage2Prediction.status === 'canceled') {
        return NextResponse.json({ status: 'failed', error: 'Stage 2 render failed' })
      }

      if (stage2Prediction.status !== 'succeeded') {
        return NextResponse.json({ status: 'processing' })
      }

      // Stage 2 succeeded — extract final render URL
      const stage2Output = stage2Prediction.output
      let finalRenderUrl: string | null = null
      if (Array.isArray(stage2Output) && stage2Output.length > 0) {
        finalRenderUrl = stage2Output[0] as string
      } else if (typeof stage2Output === 'string') {
        finalRenderUrl = stage2Output
      }

      if (!finalRenderUrl) {
        return NextResponse.json({ status: 'failed', error: 'No output URL from Stage 2 render' })
      }

      // Quality gate — URL existence check (CDN HEAD requests are not reliably requestable from server)
      const stage2Valid = typeof finalRenderUrl === 'string' && finalRenderUrl.startsWith('http')
      if (!stage2Valid) {
        return NextResponse.json({ status: 'failed', error: 'No valid output URL from Stage 2 render' })
      }

      const prompt = costLog.positive_prompt ?? ''
      const styleStrength = costLog.style_strength ?? 0.85

      const stage2SessionInsert: InsertTables<'render_sessions'> = {
        room_id: roomId!,
        render_url: finalRenderUrl,
        prompt,
        style_strength: styleStrength,
        iteration: renderIteration,
      }

      const { data: stage2Session, error: stage2SessionError } = await admin
        .from('render_sessions')
        .insert(stage2SessionInsert)
        .select('id')
        .single()

      if (stage2SessionError) {
        console.error('Failed to save render session (stage 2):', stage2SessionError.message)
      }

      await admin.from('rooms').update({ render_url: finalRenderUrl }).eq('id', roomId)

      // Re-detect on the rendered image (async — don't block response)
      void triggerRenderDetection(finalRenderUrl, roomId!, admin)

      return NextResponse.json({
        status: 'complete',
        render_url: finalRenderUrl,
        render_session_id: stage2Session?.id ?? null,
      })
    }

    // SINGLE STAGE: extract render URL from prediction output
    const output = prediction.output
    let renderUrl: string | null = null
    if (Array.isArray(output) && output.length > 0) {
      renderUrl = output[0] as string
    } else if (typeof output === 'string') {
      renderUrl = output
    }

    if (!renderUrl) {
      return NextResponse.json({ status: 'failed', error: 'No output URL from render' })
    }

    // Quality gate — URL existence check (CDN HEAD requests are not reliably requestable from server)
    const singleStageValid = typeof renderUrl === 'string' && renderUrl.startsWith('http')
    if (!singleStageValid) {
      return NextResponse.json({ status: 'failed', error: 'No valid output URL from render' })
    }

    const input = prediction.input as Record<string, unknown> | undefined
    const prompt = (input?.prompt as string | undefined) ?? ''
    const styleStrength = (input?._style_strength as number | undefined) ?? 0.85

    const renderSessionInsert: InsertTables<'render_sessions'> = {
      room_id: roomId!,
      render_url: renderUrl,
      prompt,
      style_strength: styleStrength,
      iteration: 1,
    }

    const { data: renderSession, error: renderSessionError } = await admin
      .from('render_sessions')
      .insert(renderSessionInsert)
      .select('id')
      .single()

    if (renderSessionError) {
      // Non-fatal — still return the URL so the user can proceed
      console.error('Failed to save render session:', renderSessionError.message)
    }

    await admin.from('rooms').update({ render_url: renderUrl }).eq('id', roomId)

    // Re-detect on the rendered image (async — don't block response)
    // Rendered images are clean AI images, detection works better on them
    void triggerRenderDetection(renderUrl, roomId!, admin)

    return NextResponse.json({
      status: 'complete',
      render_url: renderUrl,
      render_session_id: renderSession?.id ?? null,
    })
  }

  // Unexpected status
  return NextResponse.json({ status: 'processing' })
}
