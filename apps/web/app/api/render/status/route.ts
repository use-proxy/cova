import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Replicate from 'replicate'
import type { InsertTables } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// Quality gate: verify render URL is accessible and returns an image
async function verifyRenderUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const contentType = res.headers.get('content-type') ?? ''
    return res.ok && contentType.startsWith('image/')
  } catch {
    return false
  }
}

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

  const prediction = await replicate.predictions.get(predictionId)

  const status = prediction.status

  if (status === 'starting' || status === 'processing') {
    return NextResponse.json({ status: 'processing' })
  }

  if (status === 'failed' || status === 'canceled') {
    return NextResponse.json({
      status: 'failed',
      error: prediction.error ?? 'Render failed',
    })
  }

  if (status === 'succeeded') {
    const admin = createAdminSupabaseClient()

    // Check if this is a two-stage render
    const { data: roomRaw } = await admin
      .from('rooms')
      .select('pipeline_cost_log, inpainting_mask_url')
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
    }
    const roomMeta = roomRaw as { pipeline_cost_log?: unknown; inpainting_mask_url?: string } | null
    const costLog = roomMeta?.pipeline_cost_log as CostLog | null
    const maskUrl = roomMeta?.inpainting_mask_url ?? null

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

      // Quality gate — verify Stage 2 render URL
      const stage2QAAttempts = costLog.quality_check_attempts ?? 0
      const stage2Valid = await verifyRenderUrl(finalRenderUrl)

      if (!stage2Valid && stage2QAAttempts < 2) {
        await admin
          .from('rooms')
          .update({
            pipeline_cost_log: { ...costLog, quality_check_attempts: stage2QAAttempts + 1 },
          } as Record<string, unknown>)
          .eq('id', roomId)
        return NextResponse.json({ status: 'processing' })
      }

      if (!stage2Valid && stage2QAAttempts >= 2) {
        return NextResponse.json({
          status: 'failed',
          error: 'Render quality check failed after retries',
        })
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

    // Quality gate — verify single-stage render URL
    const { data: roomQA } = await admin
      .from('rooms')
      .select('pipeline_cost_log')
      .eq('id', roomId)
      .single()

    const qaCostLog = (roomQA?.pipeline_cost_log ?? {}) as Record<string, unknown>
    const qaAttempts = (qaCostLog.quality_check_attempts as number) ?? 0
    const singleStageValid = await verifyRenderUrl(renderUrl)

    if (!singleStageValid && qaAttempts < 2) {
      await admin
        .from('rooms')
        .update({
          pipeline_cost_log: { ...qaCostLog, quality_check_attempts: qaAttempts + 1 },
        } as Record<string, unknown>)
        .eq('id', roomId)
      return NextResponse.json({ status: 'processing' })
    }

    if (!singleStageValid && qaAttempts >= 2) {
      return NextResponse.json({
        status: 'failed',
        error: 'Render quality check failed after retries',
      })
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
