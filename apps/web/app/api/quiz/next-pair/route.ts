import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { StyleFingerprint } from '@/types/fingerprint'

interface NextPairRequest {
  fingerprint: StyleFingerprint
  answered_pairs: string[]
  room_type: string
}

interface CardRow {
  id: string
  image_url: string
  style: string
  dimension_labels: Record<string, number>
  pair_id: string
  pair_side: string
}

const DIM_KEYS = [
  'colorTemperature', 'colorSaturation', 'density', 'formality',
  'era', 'material', 'texture', 'pattern',
  'lineQuality', 'lightPreference', 'nature', 'culturalInfluence',
] as const

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NextPairRequest
    const { fingerprint, answered_pairs = [], room_type } = body

    const admin = createAdminSupabaseClient()
    const normalizedRoom = (room_type ?? 'bedroom').replace(/-/g, '_')

    // Find highest-variance dimension from covariance diagonal
    const diag = fingerprint.covariance.map((row: number[], i: number) => row[i] ?? 0)
    const maxIdx = diag.indexOf(Math.max(...diag))
    const targetDim = DIM_KEYS[maxIdx] ?? 'colorTemperature'

    // Get Phase B pairs for room_type not in answered_pairs
    const { data: initialPairCards, error: pairError } = await admin
      .from('swipe_cards')
      .select('id, image_url, style, dimension_labels, pair_id, pair_side')
      .eq('phase', 'pairwise')
      .eq('room_type', normalizedRoom)
      .not('dimension_labels', 'is', null)

    if (pairError) {
      return NextResponse.json({ error: pairError.message }, { status: 500 })
    }
    let pairCards = initialPairCards

    // Fall back to any room_type if no pairs found
    if (!pairCards || pairCards.length === 0) {
      const { data: fallback, error: fallbackError } = await admin
        .from('swipe_cards')
        .select('id, image_url, style, dimension_labels, pair_id, pair_side')
        .eq('phase', 'pairwise')
        .not('dimension_labels', 'is', null)

      if (!fallbackError && fallback) {
        pairCards = fallback
      }
    }

    if (!pairCards || pairCards.length === 0) {
      return NextResponse.json({ error: 'No pairs available' }, { status: 404 })
    }

    // Group by pair_id, filter out answered pairs
    const pairMap = new Map<string, { a?: CardRow; b?: CardRow }>()
    for (const card of pairCards as CardRow[]) {
      if (!card.pair_id || answered_pairs.includes(card.pair_id)) continue
      if (!pairMap.has(card.pair_id)) pairMap.set(card.pair_id, {})
      const entry = pairMap.get(card.pair_id)!
      if (card.pair_side === 'a') entry.a = card
      else if (card.pair_side === 'b') entry.b = card
    }

    // Only complete pairs (both sides)
    const completePairs: Array<{ pairId: string; a: CardRow; b: CardRow; contrast: number }> = []
    for (const entry of Array.from(pairMap.entries())) {
      const [pairId, sides] = entry
      if (!sides.a || !sides.b) continue
      const dimA = sides.a.dimension_labels[targetDim] ?? 0
      const dimB = sides.b.dimension_labels[targetDim] ?? 0
      const contrast = Math.abs(dimA - dimB)
      completePairs.push({ pairId, a: sides.a, b: sides.b, contrast })
    }

    if (completePairs.length === 0) {
      return NextResponse.json({ error: 'No unanswered pairs available' }, { status: 404 })
    }

    // Sort by contrast descending, pick highest
    completePairs.sort((x, y) => y.contrast - x.contrast)
    const best = completePairs[0]!

    const makeCard = (card: CardRow) => ({
      id: card.id,
      imageUrl: card.image_url,
      alt: 'Interior design style option',
      dimensionLabels: card.dimension_labels,
      pair_id: card.pair_id,
    })

    return NextResponse.json({
      pair: {
        imageA: makeCard(best.a),
        imageB: makeCard(best.b),
      },
      targetDimension: targetDim,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
