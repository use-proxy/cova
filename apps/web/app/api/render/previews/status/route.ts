import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prediction_id = req.nextUrl.searchParams.get('prediction_id')
    if (!prediction_id) {
      return NextResponse.json({ error: 'prediction_id required' }, { status: 400 })
    }

    const prediction = await replicate.predictions.get(prediction_id)

    let url: string | null = null
    if (prediction.status === 'succeeded' && prediction.output) {
      const out = prediction.output
      if (typeof out === 'string') url = out
      else if (Array.isArray(out) && out.length > 0) url = String(out[0])
    }

    return NextResponse.json({ status: prediction.status, url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
