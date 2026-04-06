import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildFluxPrompt, type RoomPhysicalContext } from '@/lib/ai/flux'
import { generateInpaintingMask } from '@/lib/ai/inpainting'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'
import Replicate from 'replicate'
import Anthropic from '@anthropic-ai/sdk'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
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
  fingerprint_vector: number[]
  room_type: string
  budget: 'budget' | 'mid' | 'premium' | 'luxury'
  inclusions: string[]
  constraints: string[]
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

    const rateLimit = checkRateLimit(user.id, 'render')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateLimit.retryAfterSeconds },
        { status: 429 }
      )
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
      room_id,
      style_strength = 0.85,
      refinement_text,
      room_length,
      room_width,
      ceiling_height,
      natural_light,
      floor_type,
      wall_finish,
      fixed_elements,
      wall_layout,
      showcase_mode,
    } = body

    if (!photo_url || !fingerprint_vector || !room_type || !budget || (!showcase_mode && !room_id)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Showcase mode: skip inpainting mask and DB writes
    if (showcase_mode) {
      const { positive } = buildFluxPrompt(
        fingerprint_vector,
        room_type,
        budget ?? 'mid',
        inclusions ?? [],
        constraints ?? [],
        undefined
      )
      const prediction = await replicate.predictions.create({
        model: 'black-forest-labs/flux-kontext-pro',
        input: {
          prompt: positive,
          input_image: photo_url,
          guidance: (style_strength ?? 0.85) * 10,
          output_format: 'jpg',
          output_quality: 90,
          safety_tolerance: 2,
        },
      })
      return NextResponse.json({ prediction_id: prediction.id })
    }

    const roomContext: RoomPhysicalContext | undefined =
      room_length || room_width || ceiling_height || natural_light || floor_type || wall_finish
        ? {
            roomLength: room_length ?? null,
            roomWidth: room_width ?? null,
            ceilingHeight: ceiling_height ?? null,
            naturalLight: natural_light ?? null,
            floorType: floor_type ?? null,
            wallFinish: wall_finish ?? null,
            fixedElements: fixed_elements ?? [],
            wallLayout: wall_layout ?? null,
          }
        : undefined

    const inpaintingMaskUrl = keep_mask
      ? await generateInpaintingMask(photo_url, keep_mask, room_id)
      : null

    const keptItems = keep_mask
      ?.filter(m => m.keep === true)
      .map(m => m.label) ?? []

    const { positive: positiveBase, negative } = buildFluxPrompt(
      fingerprint_vector,
      room_type,
      budget,
      inclusions ?? [],
      constraints ?? [],
      roomContext,
      keptItems,
    )

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

    let prediction: { id: string }

    if (inpaintingMaskUrl) {
      // TWO-STAGE RENDER: kontext generates full redesign, fill-pro preserves kept items via mask
      const stage1 = await replicate.predictions.create({
        model: 'black-forest-labs/flux-kontext-pro',
        input: {
          prompt: positive,
          input_image: photo_url,
          guidance: style_strength * 10,
          output_format: 'jpg',
          output_quality: 90,
          safety_tolerance: 2,
        },
      })

      // Store stage info in rooms so status route can orchestrate Stage 2
      await supabase
        .from('rooms')
        .update({
          inpainting_mask_url: inpaintingMaskUrl,
          pipeline_cost_log: {
            two_stage: true,
            stage1_prediction_id: stage1.id,
            stage2_pending: true,
            positive_prompt: positive,
            style_strength: style_strength ?? 0.85,
          },
        } as Record<string, unknown>)
        .eq('id', room_id)

      prediction = stage1
    } else {
      // SINGLE STAGE: no keep mask, regenerate everything
      prediction = await replicate.predictions.create({
        model: 'black-forest-labs/flux-kontext-pro',
        input: {
          prompt: positive,
          input_image: photo_url,
          guidance: style_strength * 10,
          output_format: 'jpg',
          output_quality: 90,
          safety_tolerance: 2,
          _room_id: room_id,
          _negative_prompt: negative,
          _style_strength: style_strength,
        },
      })
    }

    return NextResponse.json({ prediction_id: prediction.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
