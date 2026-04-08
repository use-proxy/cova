import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { StyleFingerprint } from '@/types/fingerprint'

interface MatchRequestBody {
  fingerprint: StyleFingerprint
  room_type: string
  count?: number
}

function cosineSim(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = Object.keys(a)
  const dot = keys.reduce((s, k) => s + a[k] * (b[k] ?? 0), 0)
  const magA = Math.sqrt(keys.reduce((s, k) => s + a[k] ** 2, 0))
  const magB = Math.sqrt(keys.reduce((s, k) => s + (b[k] ?? 0) ** 2, 0))
  return dot / (magA * magB + 1e-8)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MatchRequestBody
    const { fingerprint, room_type, count = 3 } = body

    if (!fingerprint?.dimensions || !room_type) {
      return NextResponse.json(
        { error: 'Missing fingerprint or room_type' },
        { status: 400 },
      )
    }

    const admin = createAdminSupabaseClient()
    const { data: refs, error } = await admin
      .from('style_references')
      .select('id, image_url, room_type, dimension_labels, style_name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!refs || refs.length === 0) {
      return NextResponse.json({ references: [] })
    }

    const dims = fingerprint.dimensions as Record<string, number>

    // Score each reference
    const scored = refs
      .filter((ref) => ref.dimension_labels != null)
      .map((ref) => {
        const refDims = ref.dimension_labels as Record<string, number>
        let similarity = cosineSim(dims, refDims)
        // Room type boost
        if (ref.room_type === room_type) similarity *= 1.3
        return {
          id: ref.id as string,
          image_url: ref.image_url as string,
          style_name: ref.style_name as string,
          similarity,
        }
      })

    // Sort DESC by similarity, take top N
    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored.slice(0, Math.max(1, Math.min(count, 10)))

    return NextResponse.json({ references: top })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
