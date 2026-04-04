import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildFluxPrompt, runFluxRender } from '@/lib/ai/flux'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { withRetry } from '@/lib/retry'
import { checkRateLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'
import type { InsertTables } from '@/types/supabase'

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
      depth_map_url,
      fingerprint_vector,
      room_type,
      budget,
      inclusions,
      constraints,
      room_id,
      style_strength = 0.85,
    } = body

    if (!photo_url || !fingerprint_vector || !room_type || !budget || !room_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { positive, negative } = buildFluxPrompt(
      fingerprint_vector,
      room_type,
      budget,
      inclusions ?? [],
      constraints ?? []
    )

    const renderUrl = await withRetry(
      () => runFluxRender(photo_url, depth_map_url, positive, negative, style_strength),
      { maxAttempts: 3, initialDelayMs: 2000 }
    )

    const admin = createAdminSupabaseClient()

    const renderSessionInsert: InsertTables<'render_sessions'> = {
      room_id,
      render_url: renderUrl,
      prompt: positive,
      style_strength,
      iteration: 1,
    }

    const { data: renderSession, error: renderSessionError } = await admin
      .from('render_sessions')
      .insert(renderSessionInsert)
      .select('id')
      .single()

    if (renderSessionError) {
      throw new Error(`Failed to save render session: ${renderSessionError.message}`)
    }

    await admin.from('rooms').update({ render_url: renderUrl }).eq('id', room_id)

    return NextResponse.json({
      render_url: renderUrl,
      render_session_id: renderSession.id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
