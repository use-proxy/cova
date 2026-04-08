import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildFluxPrompt, submitRender, submitSchnellRender, type RoomPhysicalContext } from '@/lib/ai/flux'
import type { RoomAnalysis } from '@/lib/store/room'
import { generateInpaintingMask } from '@/lib/ai/inpainting'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { StyleFingerprint } from '@/types/fingerprint'

const anthropic = new Anthropic()

interface RenderRequestBody {
  photo_url: string
  depth_map_url: string
  keep_mask: Array<{
    type: string
    bbox: [number, number, number, number]
    confidence: number
    keep: boolean | null
    label: string
  }> | null
  fingerprint_vector: StyleFingerprint
  room_type: string
  budget: 'budget' | 'mid' | 'premium' | 'luxury'
  inclusions: string[]
  constraints: string[]
  reference_image_urls?: string[]
  room_id: string
  style_strength?: number
  refinement_text?: string
  // Room physical context — collected in step-4
  room_length?: number | null
  room_width?: number | null
  ceiling_height?: number | null
  natural_light?: string | null
  floor_type?: string | null
  wall_finish?: string | null
  fixed_elements?: string[]
  wall_layout?: RoomPhysicalContext['wallLayout']
  showcase_mode?: boolean
  style_name?: string
  render_iteration?: number
  room_analysis?: RoomAnalysis | null
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

    const body = (await request.json()) as RenderRequestBody

    const {
      photo_url,
      keep_mask,
      fingerprint_vector,
      room_type,
      budget,
      inclusions,
      constraints,
      reference_image_urls,
      room_id,
      room_analysis,
      style_strength = 0.85,
      refinement_text,
      showcase_mode,
    } = body

    // Validate required fields BEFORE rate limit — returns 400 without consuming a rate limit slot
    if (!photo_url || !fingerprint_vector || !room_type || !budget || (!showcase_mode && !room_id)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const rateLimit = checkRateLimit(user.id, 'render')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    // Showcase mode: skip inpainting mask and DB writes
    if (showcase_mode) {
      const prompt = buildFluxPrompt({
        fingerprint: fingerprint_vector,
        roomType: room_type,
        budgetTier: budget ?? 'mid',
        inclusions: inclusions ?? [],
        constraints: constraints ?? [],
        keptItemLabels: [],
        roomAnalysis: null,
      })
      const predictionId = await submitRender(photo_url, reference_image_urls ?? [], prompt)
      return NextResponse.json({ prediction_id: predictionId })
    }

    const keptItems = keep_mask?.filter(m => m.keep === true) ?? []

    const normalizedMask = keep_mask?.map(m => ({ ...m, keep: m.keep ?? false })) ?? []

    const inpaintingMaskUrl = keptItems.length > 0
      ? await generateInpaintingMask(photo_url, normalizedMask, room_id)
      : null

    const positiveBase = buildFluxPrompt({
      fingerprint: fingerprint_vector,
      roomType: room_type,
      budgetTier: budget,
      inclusions: inclusions ?? [],
      constraints: constraints ?? [],
      keptItemLabels: keptItems.map(m => m.label),
      roomAnalysis: room_analysis ?? null,
    })

    let positive = positiveBase

    if (refinement_text && refinement_text.trim()) {
      const refineResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are modifying an interior design render prompt.

Current prompt: "${positive}"
User instruction: "${refinement_text}"

Modify the prompt to incorporate the user's instruction while preserving the core style, room type, and budget constraints. Return only the modified prompt string. No explanation, no quotes, no preamble.`,
        }],
      })

      const refined = refineResponse.content[0]
      if (refined.type === 'text' && refined.text.trim()) {
        positive = refined.text.trim()
      }
    }

    let predictionId: string

    // Fire Schnell preview in parallel (non-fatal — best-effort quick preview)
    let schnellPredictionId: string | null = null
    try {
      schnellPredictionId = await submitSchnellRender(positiveBase)
    } catch {
      // Schnell is optional — continue without it
    }

    if (inpaintingMaskUrl) {
      // TWO-STAGE RENDER: FLUX.2 [pro] generates full redesign, fill-pro preserves kept items via mask
      predictionId = await submitRender(photo_url, reference_image_urls ?? [], positive)

      // Store stage info + schnell ID in rooms so status route can orchestrate Stage 2 + preview
      await supabase
        .from('rooms')
        .update({
          inpainting_mask_url: inpaintingMaskUrl,
          pipeline_cost_log: {
            two_stage: true,
            stage1_prediction_id: predictionId,
            stage2_pending: true,
            positive_prompt: positive,
            style_strength: style_strength ?? 0.85,
            schnell_prediction_id: schnellPredictionId,
          },
        } as Record<string, unknown>)
        .eq('id', room_id)
    } else {
      // SINGLE STAGE: no keep mask, regenerate everything
      predictionId = await submitRender(photo_url, reference_image_urls ?? [], positive)

      // Store schnell ID so status route can return preview_url
      if (schnellPredictionId) {
        await supabase
          .from('rooms')
          .update({
            pipeline_cost_log: {
              schnell_prediction_id: schnellPredictionId,
              positive_prompt: positive,
            },
          } as Record<string, unknown>)
          .eq('id', room_id)
      }
    }

    return NextResponse.json({
      prediction_id: predictionId,
      ...(schnellPredictionId ? { schnell_prediction_id: schnellPredictionId } : {}),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
