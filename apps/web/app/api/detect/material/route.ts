/**
 * POST /api/detect/material
 *
 * Background material+color read for a single KEPT object from Screen C.
 * The client fires this fire-and-forget when the user first marks an
 * object as "keep". Falls back to neutral defaults on any error.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractObjectMaterial } from '@/lib/ai/detection/objectMaterial'

export const maxDuration = 60

interface Body {
  imageUrl: string
  bbox: [number, number, number, number]
  label: string
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as Body
  if (
    !body.imageUrl ||
    !Array.isArray(body.bbox) ||
    body.bbox.length !== 4 ||
    !body.label
  ) {
    return NextResponse.json(
      { error: 'imageUrl, bbox[4], and label are required' },
      { status: 400 }
    )
  }

  const result = await extractObjectMaterial(
    body.imageUrl,
    body.bbox,
    body.label
  )
  return NextResponse.json(result)
}
