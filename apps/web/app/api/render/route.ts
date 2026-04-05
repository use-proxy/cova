import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildFluxPrompt } from '@/lib/ai/flux'
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
    keep: boolean
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
      fingerprint_vector,
      room_type,
      budget,
      inclusions,
      constraints,
      room_id,
      style_strength = 0.85,
      refinement_text,
    } = body

    if (!photo_url || !fingerprint_vector || !room_type || !budget || !room_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { positive: positiveBase, negative } = buildFluxPrompt(
      fingerprint_vector,
      room_type,
      budget,
      inclusions ?? [],
      constraints ?? []
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

    const prediction = await replicate.predictions.create({
      model: 'black-forest-labs/flux-kontext-pro',
      input: {
        prompt: positive,
        input_image: photo_url,
        guidance: style_strength * 10,
        output_format: 'jpg',
        output_quality: 90,
        safety_tolerance: 2,
        // metadata carried through for status route DB write
        _room_id: room_id,
        _negative_prompt: negative,
        _style_strength: style_strength,
      },
    })

    return NextResponse.json({ prediction_id: prediction.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
