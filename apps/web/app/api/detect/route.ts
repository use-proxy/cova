export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { detectFurniture, detectArchitecture } from '@/lib/ai/grounding'
import { estimateDepth } from '@/lib/ai/depth'
import { NextResponse } from 'next/server'

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 15000  // 15 seconds — Replicate rate limit resets in ~10s
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes('429')
      if (is429 && attempt < maxRetries) {
        console.log(`[detect] Rate limited, retrying in ${baseDelay / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(r => setTimeout(r, baseDelay))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}

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
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHENTICATED' },
        { status: 401 }
      )
    }

    const body = (await request.json()) as DetectRequestBody
    const { photo_url, room_id } = body

    if (!photo_url) {
      return NextResponse.json({ error: 'photo_url is required' }, { status: 400 })
    }

    const [furniture, architecture, depthResult] = await Promise.all([
      withRetry(() => detectFurniture(photo_url)),
      withRetry(() => detectArchitecture(photo_url)),
      estimateDepth(photo_url).catch((err: Error) => {
        console.error('[detect] Depth estimation failed (non-fatal):', err.message)
        return { depth_map_url: null, quality_score: 0 }
      }),
    ])

    const allDetections = [...furniture, ...architecture]

    if (room_id) {
      const admin = createAdminSupabaseClient()
      // Map detections to KeepMaskItems (keep: null = undecided)
      const keepMask = allDetections.map((d) => ({
        type: d.type,
        label: d.label,
        bbox: d.bbox,
        confidence: d.confidence,
        keep: null as boolean | null,
        ...(d.mask_url !== undefined && { mask_url: d.mask_url }),
      }))
      const updateResult = await admin
        .from('rooms')
        .update({
          depth_map_url: depthResult.depth_map_url,
          keep_mask: keepMask,
        })
        .eq('id', room_id)
      if (updateResult.error) {
        console.error('[detect] Failed to update room:', updateResult.error.message)
      } else {
        console.log('[detect] Updated room', room_id, 'depth_map_url:', depthResult.depth_map_url, 'detections:', keepMask.length)
      }
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
