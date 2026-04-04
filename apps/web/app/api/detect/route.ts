import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { detectFurniture, detectArchitecture } from '@/lib/ai/grounding'
import { estimateDepth } from '@/lib/ai/depth'
import { NextResponse } from 'next/server'

interface DetectRequestBody {
  photo_url: string
  room_id?: string
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

    const body = (await request.json()) as DetectRequestBody
    const { photo_url, room_id } = body

    if (!photo_url) {
      return NextResponse.json({ error: 'photo_url is required' }, { status: 400 })
    }

    const [furniture, architecture, depthResult] = await Promise.all([
      detectFurniture(photo_url),
      detectArchitecture(photo_url),
      estimateDepth(photo_url),
    ])

    const allDetections = [...furniture, ...architecture]

    if (room_id) {
      const admin = createAdminSupabaseClient()
      await admin
        .from('rooms')
        .update({ depth_map_url: depthResult.depth_map_url })
        .eq('id', room_id)
    }

    return NextResponse.json({
      detections: allDetections,
      depth_map_url: depthResult.depth_map_url,
      depth_quality: depthResult.quality_score,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
