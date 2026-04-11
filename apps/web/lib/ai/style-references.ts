import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { StyleFingerprint } from '@/types/fingerprint'

// Server-side helper that returns the closest anchor style image to a user's
// fingerprint. Used by /api/render to drive the multi-image kontext path —
// the returned image_url becomes the style reference passed to flux-kontext.
//
// Migrated from style_references → quiz_anchor_images in Session C cleanup.
// Cosine similarity over the 12-dim style_vector. Higher = closer.

const DIMENSION_ORDER = [
  'colorTemperature', 'colorSaturation', 'density', 'formality',
  'era', 'material', 'texture', 'pattern',
  'lineQuality', 'lightPreference', 'nature', 'culturalInfluence',
] as const

function cosineSim(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (const k of DIMENSION_ORDER) {
    const av = a[k] ?? 0.5
    const bv = b[k] ?? 0.5
    dot += av * bv
    magA += av * av
    magB += bv * bv
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8)
}

export interface StyleReferenceMatch {
  id: string
  image_url: string
  style_name: string
  similarity: number
}

export async function fetchTopStyleReference(
  fingerprint: StyleFingerprint,
  // Kept in the signature for backwards compatibility with the render route.
  // quiz_anchor_images is room-agnostic, so the parameter is unused.
  _roomType: string,
): Promise<StyleReferenceMatch | null> {
  try {
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('quiz_anchor_images')
      .select('id, image_url, style_name, style_vector')

    if (error || !data || data.length === 0) return null

    const dims = fingerprint.dimensions as unknown as Record<string, number>

    let best: StyleReferenceMatch | null = null
    for (const row of data) {
      const sv = row.style_vector as Record<string, number>
      const similarity = cosineSim(dims, sv)
      if (!best || similarity > best.similarity) {
        best = {
          id: row.id as string,
          image_url: row.image_url as string,
          style_name: (row.style_name ?? '') as string,
          similarity,
        }
      }
    }
    const MINIMUM_SIMILARITY = 0.60
    return best && best.similarity >= MINIMUM_SIMILARITY ? best : null
  } catch (err) {
    console.error('[style-references] fetchTopStyleReference failed:', err)
    return null
  }
}
