import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const predictionId = searchParams.get('prediction_id')
  const roomId = searchParams.get('room_id')

  if (!predictionId) {
    return NextResponse.json({ error: 'prediction_id is required' }, { status: 400 })
  }

  const prediction = await replicate.predictions.get(predictionId)

  if (prediction.status === 'starting' || prediction.status === 'processing') {
    return NextResponse.json({ status: 'processing' })
  }

  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    return NextResponse.json({
      status: 'failed',
      error: prediction.error ?? 'Swap render failed',
    })
  }

  if (prediction.status === 'succeeded') {
    const output = prediction.output
    let swapRenderUrl: string | null = null
    if (Array.isArray(output) && output.length > 0) {
      swapRenderUrl = output[0] as string
    } else if (typeof output === 'string') {
      swapRenderUrl = output
    }

    if (!swapRenderUrl) {
      return NextResponse.json({ status: 'failed', error: 'No output URL from swap render' })
    }

    // Store swap result in room if room_id provided
    if (roomId) {
      const admin = createAdminSupabaseClient()
      await admin
        .from('rooms')
        .update({ render_url: swapRenderUrl })
        .eq('id', roomId)
    }

    return NextResponse.json({
      status: 'complete',
      swap_render_url: swapRenderUrl,
    })
  }

  return NextResponse.json({ status: 'processing' })
}
