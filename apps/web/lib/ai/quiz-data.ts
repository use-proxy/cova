/**
 * Quiz pair data with dimension tagging.
 * Each pair maps a choice to a directional signal on one or more of the 6 fingerprint dimensions:
 *   [luminosity, density, temperature, form, era, texture]
 *
 * signal: positive = A pushes dimension UP, negative = A pushes dimension DOWN
 * B always pushes the opposite direction.
 */

export interface QuizPair {
  id: string
  primary_dimension: number   // 0-5, which dimension this pair most strongly measures
  signal: number              // +1 or -1: if chosen='A', dimension moves in this direction
  secondary_dimension?: number
  secondary_signal?: number
}

export interface QuizResponseWithDimension {
  pair_id: string
  chosen: 'A' | 'B'
  super_liked: boolean
}

/**
 * Known pair dimension mappings.
 * In production these come from the quiz_cards table style_weights column.
 * This static set covers the most common pair IDs used in V1.
 */
export const QUIZ_PAIR_DIMENSIONS: Record<string, QuizPair> = {
  // Luminosity pairs (dim 0)
  'lum-1': { id: 'lum-1', primary_dimension: 0, signal: 1 },
  'lum-2': { id: 'lum-2', primary_dimension: 0, signal: -1 },
  'lum-3': { id: 'lum-3', primary_dimension: 0, signal: 1 },
  // Density pairs (dim 1)
  'den-1': { id: 'den-1', primary_dimension: 1, signal: 1 },
  'den-2': { id: 'den-2', primary_dimension: 1, signal: -1 },
  'den-3': { id: 'den-3', primary_dimension: 1, signal: 1 },
  // Temperature pairs (dim 2)
  'tmp-1': { id: 'tmp-1', primary_dimension: 2, signal: 1 },
  'tmp-2': { id: 'tmp-2', primary_dimension: 2, signal: -1 },
  'tmp-3': { id: 'tmp-3', primary_dimension: 2, signal: 1 },
  // Form pairs (dim 3)
  'frm-1': { id: 'frm-1', primary_dimension: 3, signal: 1 },
  'frm-2': { id: 'frm-2', primary_dimension: 3, signal: -1 },
  'frm-3': { id: 'frm-3', primary_dimension: 3, signal: 1 },
  // Era pairs (dim 4)
  'era-1': { id: 'era-1', primary_dimension: 4, signal: 1 },
  'era-2': { id: 'era-2', primary_dimension: 4, signal: -1 },
  'era-3': { id: 'era-3', primary_dimension: 4, signal: 1 },
  // Texture pairs (dim 5)
  'tex-1': { id: 'tex-1', primary_dimension: 5, signal: 1 },
  'tex-2': { id: 'tex-2', primary_dimension: 5, signal: -1 },
  'tex-3': { id: 'tex-3', primary_dimension: 5, signal: 1 },
}

/**
 * Compute 6-dim fingerprint from dimension-tagged quiz responses.
 * Falls back to round-robin index assignment when pair_id not in QUIZ_PAIR_DIMENSIONS.
 */
export function computeFingerprintFromPairs(
  responses: QuizResponseWithDimension[],
  skipFirst = true
): number[] {
  const dimensions = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
  const counts = [0, 0, 0, 0, 0, 0]

  responses.forEach((response, index) => {
    if (skipFirst && index === 0) return

    const weight = response.super_liked ? 3 : 1
    const chosenA = response.chosen === 'A'

    const knownPair = QUIZ_PAIR_DIMENSIONS[response.pair_id]

    if (knownPair) {
      const direction = chosenA ? knownPair.signal : -knownPair.signal
      const dim = knownPair.primary_dimension
      dimensions[dim] = (dimensions[dim] ?? 0.5) + 0.1 * weight * direction
      counts[dim] = (counts[dim] ?? 0) + weight

      if (knownPair.secondary_dimension !== undefined && knownPair.secondary_signal !== undefined) {
        const secDir = chosenA ? knownPair.secondary_signal : -knownPair.secondary_signal
        const secDim = knownPair.secondary_dimension
        dimensions[secDim] = (dimensions[secDim] ?? 0.5) + 0.05 * weight * secDir
        counts[secDim] = (counts[secDim] ?? 0) + weight * 0.5
      }
    } else {
      // Fallback: round-robin distribution
      const dimIndex = (index - (skipFirst ? 1 : 0)) % 6
      const signal = chosenA ? 0.1 : -0.1
      dimensions[dimIndex] = (dimensions[dimIndex] ?? 0.5) + signal * weight
      counts[dimIndex] = (counts[dimIndex] ?? 0) + weight
    }
  })

  return dimensions.map((d) => Math.max(0, Math.min(1, d)))
}
