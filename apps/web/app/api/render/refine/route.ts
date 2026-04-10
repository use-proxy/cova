import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { runFluxRender } from '@/lib/ai/flux'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()

interface RefineRequestBody {
  current_render_url: string
  refinement_text: string
  room_id: string
  current_prompt: string
  style_strength?: number
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

    const body = (await request.json()) as RefineRequestBody
    const {
      current_render_url,
      refinement_text,
      room_id,
      current_prompt: providedPrompt,
      style_strength = 0.85,
    } = body

    // Load current prompt from Supabase if not provided by the client
    let current_prompt = providedPrompt
    if (!current_prompt) {
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('render_context')
        .eq('id', room_id)
        .eq('user_id', user.id)
        .single()
      current_prompt = (roomRow?.render_context as { fluxPrompt?: string } | null)?.fluxPrompt ?? ''
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a FLUX image generation prompt engineer for an interior design app.

            Current render prompt: "${current_prompt}"

            User refinement request: "${refinement_text}"

            Modify the prompt to incorporate the user's request while maintaining the overall style and quality.
            Keep the same format and level of detail.
            Return only the modified prompt text, nothing else.`,
        },
      ],
    })

    const modifiedPrompt =
      message.content[0].type === 'text' ? message.content[0].text.trim() : current_prompt

    const renderUrl = await runFluxRender(
      current_render_url,
      '',
      modifiedPrompt,
      'distorted walls, wrong perspective, AI artifacts, blurry',
      style_strength
    )

    const admin = createAdminSupabaseClient()

    const { data: existingSessions } = await admin
      .from('render_sessions')
      .select('iteration')
      .eq('room_id', room_id)
      .order('iteration', { ascending: false })
      .limit(1)

    const nextIteration =
      existingSessions && existingSessions.length > 0
        ? (existingSessions[0]!.iteration ?? 1) + 1
        : 2

    const { data: renderSession } = await admin
      .from('render_sessions')
      .insert({
        room_id,
        render_url: renderUrl,
        prompt: modifiedPrompt,
        style_strength,
        iteration: nextIteration,
      })
      .select('id')
      .single()

    await admin.from('rooms').update({ render_url: renderUrl }).eq('id', room_id)

    return NextResponse.json({
      render_url: renderUrl,
      render_session_id: renderSession?.id,
      modified_prompt: modifiedPrompt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
