import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { StyleFingerprint } from '@/types/fingerprint'
import { toDisplayName } from '@/lib/ai/anchor-display'

// ── /api/style-references/match ──────────────────────────────────────────────
// Match a 12-dim style fingerprint to the closest of the 9 anchor styles in
// quiz_anchor_images. All dimensions weighted equally (1.0) per Session C spec.
//
// Body: { fingerprint: StyleFingerprint }
// Response:
//   { styleName, styleIndex, distance, imageUrl, styleVector }
//
// Migrated from style_references (10-dim, wiped in Session A) in Session C.

const DIMENSION_ORDER = [
  'colorTemperature', 'colorSaturation', 'density', 'formality',
  'era', 'material', 'texture', 'pattern',
  'lineQuality', 'lightPreference', 'nature', 'culturalInfluence',
] as const

interface AnchorRow {
  id: string
  style_name: string
  style_index: number
  image_url: string
  style_vector: Record<string, number>
}

interface MatchRequest {
  fingerprint: StyleFingerprint
}

function weightedEuclidean(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  // Weight 1.0 across all 12 dims (per spec).
  let sum = 0
  for (const dim of DIMENSION_ORDER) {
    const av = a[dim] ?? 0.5
    const bv = b[dim] ?? 0.5
    sum += (av - bv) * (av - bv)
  }
  return Math.sqrt(sum)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MatchRequest
    if (!body?.fingerprint?.dimensions) {
      return NextResponse.json(
        { error: 'fingerprint.dimensions required' },
        { status: 400 },
      )
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('quiz_anchor_images')
      .select('id, style_name, style_index, image_url, style_vector')
      .order('style_index', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No anchor images available' }, { status: 503 })
    }

    const dims = body.fingerprint.dimensions as unknown as Record<string, number>

    let bestRow: AnchorRow | null = null
    let bestDist = Infinity
    for (const row of data as AnchorRow[]) {
      const d = weightedEuclidean(dims, row.style_vector)
      if (d < bestDist) {
        bestDist = d
        bestRow = row
      }
    }

    if (!bestRow) {
      return NextResponse.json({ error: 'No match' }, { status: 500 })
    }

    // Return the user-facing display name (rule #8). The internal anchor
    // name `bestRow.style_name` never reaches the client.
    return NextResponse.json({
      styleName: toDisplayName(bestRow.style_name),
      styleIndex: bestRow.style_index,
      distance: bestDist,
      imageUrl: bestRow.image_url,
      styleVector: bestRow.style_vector,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
