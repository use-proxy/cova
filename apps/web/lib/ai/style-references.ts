import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { StyleFingerprint } from '@/types/fingerprint'

// Same cosine similarity + room-type boost as the /api/style-references/match
// route. Kept server-side so the render route can resolve the top style
// reference directly without making an internal HTTP round-trip.

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

export interface StyleReferenceMatch {
  id: string
  image_url: string
  style_name: string
  similarity: number
}

export async function fetchTopStyleReference(
  fingerprint: StyleFingerprint,
  roomType: string,
): Promise<StyleReferenceMatch | null> {
  try {
    const admin = createAdminSupabaseClient()
    const { data: refs, error } = await admin
      .from('style_references')
      .select('id, image_url, room_type, dimension_labels, style_name')

    if (error || !refs || refs.length === 0) return null

    const dims = fingerprint.dimensions as unknown as Record<string, number>

    const scored = refs
      .filter((ref) => ref.dimension_labels != null)
      .map((ref) => {
        const refDims = ref.dimension_labels as Record<string, number>
        let similarity = cosineSim(dims, refDims)
        if (ref.room_type === roomType) similarity *= 1.3
        return {
          id: ref.id as string,
          image_url: ref.image_url as string,
          style_name: (ref.style_name ?? '') as string,
          similarity,
        }
      })

    scored.sort((a, b) => b.similarity - a.similarity)
    return scored[0] ?? null
  } catch (err) {
    console.error('[style-references] fetchTopStyleReference failed:', err)
    return null
  }
}
