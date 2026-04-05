import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Replicate from 'replicate'
import type { InsertTables } from '@/types/supabase'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const predictionId = searchParams.get('prediction_id')
  const roomId = searchParams.get('room_id')

  if (!predictionId || !roomId) {
    return NextResponse.json({ error: 'Missing prediction_id or room_id' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    // Extract render URL from prediction output
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

    // Persist to DB
    const admin = createAdminSupabaseClient()

    const input = prediction.input as Record<string, unknown> | undefined
    const prompt = (input?.prompt as string | undefined) ?? ''
    const styleStrength = (input?._style_strength as number | undefined) ?? 0.85

    const renderSessionInsert: InsertTables<'render_sessions'> = {
      room_id: roomId,
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

    return NextResponse.json({
      status: 'complete',
      render_url: renderUrl,
      render_session_id: renderSession?.id ?? null,
    })
  }

  // Unexpected status
  return NextResponse.json({ status: 'processing' })
}
