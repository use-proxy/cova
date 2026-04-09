import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── /api/quiz/next-pair ──────────────────────────────────────────────────────
// Phase B selector. Returns one validated comparison pair from
// quiz_comparison_pairs, or quizComplete=true when responseCount >= 12.
//
// Selection logic (per Session C spec):
//   • responses 1-4: spread across 4 distinct dimensions not yet covered by
//     completedPairIds. Random pick from the validated pool for that dim.
//   • responses 5-12: pick the dimension with the LOWEST confidence in the
//     client's currentFingerprint (= MAX value on the covariance diagonal,
//     under the per-dim confidence encoding `cov[i][i] = 1 - confidence`).
//     Random pick from the validated pool for that dim.
//   • Always exclude any id in completedPairIds.
//   • Return null + quizComplete=true when responseCount >= 12 or there are
//     no remaining unshown validated pairs.
//
// Migrated from swipe_cards in Session C.

interface NextPairRequest {
  completedPairIds?: string[]
  currentFingerprint?: StyleFingerprint
  responseCount?: number
}

interface PairRow {
  id: string
  dimension: string
  dimension_index: number
  image_a_url: string
  image_b_url: string
  image_a_vector: Record<string, number>
  image_b_vector: Record<string, number>
}

const DIMENSION_ORDER = [
  'colorTemperature', 'colorSaturation', 'density', 'formality',
  'era', 'material', 'texture', 'pattern',
  'lineQuality', 'lightPreference', 'nature', 'culturalInfluence',
] as const
type DimKey = typeof DIMENSION_ORDER[number]

const TOTAL_PAIRS = 12

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)] ?? null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NextPairRequest
    const completedPairIds = body.completedPairIds ?? []
    const currentFingerprint = body.currentFingerprint
    const responseCount = body.responseCount ?? completedPairIds.length

    // Quiz complete by count
    if (responseCount >= TOTAL_PAIRS) {
      return NextResponse.json({ pair: null, quizComplete: true })
    }

    const admin = createAdminSupabaseClient()

    // 1. Discover which dimensions are already covered by completed pairs.
    const coveredDims = new Set<string>()
    if (completedPairIds.length > 0) {
      const { data: completedRows, error: completedErr } = await admin
        .from('quiz_comparison_pairs')
        .select('dimension')
        .in('id', completedPairIds)
      if (completedErr) {
        return NextResponse.json({ error: completedErr.message }, { status: 500 })
      }
      for (const r of completedRows ?? []) {
        coveredDims.add(r.dimension as string)
      }
    }

    // 2. Choose target dimension.
    let targetDim: DimKey | null = null

    if (responseCount < 4) {
      // Spread phase: pick a dim NOT yet covered.
      const uncoveredDims = DIMENSION_ORDER.filter((d) => !coveredDims.has(d))
      targetDim = pickRandom<DimKey>([...uncoveredDims]) ?? DIMENSION_ORDER[0]
    } else {
      // Refine phase: pick the dim with lowest confidence in currentFingerprint.
      // Encoding: cov[i][i] = 1 - confidence_i, so highest diagonal = lowest confidence.
      if (currentFingerprint && Array.isArray(currentFingerprint.covariance)) {
        const diag = currentFingerprint.covariance.map((row, i) => row[i] ?? 0)
        let maxIdx = 0
        let maxVal = -Infinity
        for (let i = 0; i < diag.length && i < DIMENSION_ORDER.length; i++) {
          const v = diag[i] ?? 0
          if (v > maxVal) { maxVal = v; maxIdx = i }
        }
        targetDim = DIMENSION_ORDER[maxIdx] ?? DIMENSION_ORDER[0]
      } else {
        // No fingerprint sent — fall back to a random uncovered dim, then any.
        const uncoveredDims = DIMENSION_ORDER.filter((d) => !coveredDims.has(d))
        targetDim =
          (uncoveredDims.length > 0
            ? pickRandom<DimKey>([...uncoveredDims])
            : pickRandom<DimKey>([...DIMENSION_ORDER])) ?? DIMENSION_ORDER[0]
      }
    }

    // 3. Query validated pairs for the target dimension, exclude completed.
    //    Filter completedPairIds in JS to avoid PostgREST IN() escaping issues.
    const { data: candidates, error: candErr } = await admin
      .from('quiz_comparison_pairs')
      .select('id, dimension, dimension_index, image_a_url, image_b_url, image_a_vector, image_b_vector')
      .eq('dimension', targetDim)
      .eq('is_validated', true)

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 })
    }

    let pool = (candidates ?? []).filter((c) => !completedPairIds.includes(c.id as string))

    // 4. Fallback: if the target dim has nothing left, pick from ANY validated dim.
    if (pool.length === 0) {
      const { data: anyValidated, error: anyErr } = await admin
        .from('quiz_comparison_pairs')
        .select('id, dimension, dimension_index, image_a_url, image_b_url, image_a_vector, image_b_vector')
        .eq('is_validated', true)
      if (anyErr) {
        return NextResponse.json({ error: anyErr.message }, { status: 500 })
      }
      pool = (anyValidated ?? []).filter((c) => !completedPairIds.includes(c.id as string))
    }

    if (pool.length === 0) {
      // Library exhausted — quiz complete.
      return NextResponse.json({ pair: null, quizComplete: true })
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)] as PairRow
    return NextResponse.json({
      pair: {
        id: chosen.id,
        dimension: chosen.dimension,
        dimension_index: chosen.dimension_index,
        image_a_url: chosen.image_a_url,
        image_b_url: chosen.image_b_url,
        image_a_vector: chosen.image_a_vector,
        image_b_vector: chosen.image_b_vector,
      },
      quizComplete: false,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
