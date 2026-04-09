import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Replicate from 'replicate'
import { runUpscale } from '@/lib/ai/flux'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const predictionId = searchParams.get('prediction_id')
  const roomId = searchParams.get('room_id')

  if (!predictionId || !roomId) {
    return NextResponse.json({ error: 'Missing prediction_id or room_id' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const prediction = await replicate.predictions.get(predictionId)

    if (prediction.status === 'starting' || prediction.status === 'processing') {
      return NextResponse.json({ status: 'processing' })
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return NextResponse.json({ status: 'failed', error: prediction.error ?? 'Tweak failed' })
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

      // Upscale then persist
      const finalUrl = await runUpscale(renderUrl)

      const admin = createAdminSupabaseClient()

      await admin.from('rooms').update({ render_url: finalUrl }).eq('id', roomId)

      await admin.from('render_sessions').insert({
        room_id: roomId,
        render_url: finalUrl,
        prompt: 'tweak',
        style_strength: 1.0,
        iteration: 1,
      })

      return NextResponse.json({ status: 'complete', render_url: finalUrl })
    }

    return NextResponse.json({ status: 'processing' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
