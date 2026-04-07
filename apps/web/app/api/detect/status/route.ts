import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

interface KeepMaskItem {
  type: string
  label: string
  bbox: [number, number, number, number]
  confidence: number
  keep: boolean | null
  showToUser?: boolean
  mask_url?: string
}

type StatusNotReady = { ready: false }
type StatusReady = {
  ready: true
  detections: KeepMaskItem[]
  depth_map_url: string
}
type StatusResponse = StatusNotReady | StatusReady

export async function GET(request: NextRequest): Promise<NextResponse<StatusResponse>> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ready: false }, { status: 401 })
  }

  const roomId = request.nextUrl.searchParams.get('room_id')
  if (!roomId) {
    return NextResponse.json({ ready: false }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('rooms')
    .select('depth_map_url, keep_mask')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ ready: false })
  }

  const { depth_map_url, keep_mask } = data as {
    depth_map_url: string | null
    keep_mask: KeepMaskItem[] | null
  }

  if (depth_map_url && keep_mask) {
    // Re-apply current showToUser threshold — stored data may predate threshold changes
    const detections = keep_mask.map((d) => ({ ...d, showToUser: d.confidence >= 0.35 }))
    return NextResponse.json({
      ready: true,
      detections,
      depth_map_url,
    })
  }

  return NextResponse.json({ ready: false })
}
