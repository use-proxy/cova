import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildFluxPrompt, submitRender, submitMultiImageRender, submitSchnellRender, submitDepthRender, type RoomPhysicalContext } from '@/lib/ai/flux'
import { analyzeRoomArchitecture, buildPreservationInstructions } from '@/lib/ai/room-analyzer'
import { fetchTopStyleReference } from '@/lib/ai/style-references'
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
      const [arch, topRef] = await Promise.all([
        analyzeRoomArchitecture(photo_url),
        fetchTopStyleReference(fingerprint_vector, room_type),
      ])
      const prompt = buildFluxPrompt({
        fingerprint: fingerprint_vector,
        roomType: room_type,
        budgetTier: budget ?? 'mid',
        inclusions: inclusions ?? [],
        constraints: constraints ?? [],
        keptItemLabels: [],
        roomAnalysis: null,
        preservationInstructions: buildPreservationInstructions(arch),
      })
      const predictionId = topRef?.image_url
        ? await submitMultiImageRender(photo_url, topRef.image_url, prompt)
        : await submitRender(photo_url, reference_image_urls ?? [], prompt)
      return NextResponse.json({ prediction_id: predictionId })
    }

    const keptItems = keep_mask?.filter(m => m.keep === true) ?? []

    const normalizedMask = keep_mask?.map(m => ({ ...m, keep: m.keep ?? false })) ?? []

    // Analyze the real room's architecture in parallel with the inpainting
    // mask generation and the top style reference lookup. Gemini output drives
    // the preservation clause; the style reference (if any) drives multi-image
    // Kontext.
    const [arch, inpaintingMaskUrl, topStyleRef] = await Promise.all([
      analyzeRoomArchitecture(photo_url),
      keptItems.length > 0
        ? generateInpaintingMask(photo_url, normalizedMask, room_id)
        : Promise.resolve(null),
      fetchTopStyleReference(fingerprint_vector, room_type),
    ])

    const preservationInstructions = buildPreservationInstructions(arch)

    const positiveBase = buildFluxPrompt({
      fingerprint: fingerprint_vector,
      roomType: room_type,
      budgetTier: budget,
      inclusions: inclusions ?? [],
      constraints: constraints ?? [],
      keptItemLabels: keptItems.map(m => m.label),
      roomAnalysis: room_analysis ?? null,
      preservationInstructions,
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

    const styleReferenceUrl = topStyleRef?.image_url ?? null

    if (inpaintingMaskUrl) {
      // TWO-STAGE RENDER: FLUX.2 [pro] generates full redesign, fill-pro preserves kept items via mask
      predictionId = styleReferenceUrl
        ? await submitMultiImageRender(photo_url, styleReferenceUrl, positive)
        : await submitRender(photo_url, reference_image_urls ?? [], positive)

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
      // TWO-PASS KONTEXT PRO: pass 1 = style transform (submitted now),
      // pass 2 = architecture correction (submitted by status route when
      // pass 1 completes). Schnell runs in parallel as the fast preview.
      //
      // Prefer depth-conditioned render when no items need preserving.
      // Depth Pro preserves room geometry while allowing full style transformation.
      let pipeline: 'depth_pro' | 'kontext_multi' | 'kontext_single'
      if (styleReferenceUrl) {
        predictionId = await submitMultiImageRender(photo_url, styleReferenceUrl, positive)
        pipeline = 'kontext_multi'
      } else {
        predictionId = await submitDepthRender(photo_url, positive)
        pipeline = 'depth_pro'
      }

      await supabase
        .from('rooms')
        .update({
          pipeline_cost_log: {
            two_pass: true,
            pass1_prediction_id: predictionId,
            pass2_prediction_id: null,
            arch_analysis: arch,
            positive_prompt: positive,
            schnell_prediction_id: schnellPredictionId,
            pipeline,
          },
        } as Record<string, unknown>)
        .eq('id', room_id)
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
