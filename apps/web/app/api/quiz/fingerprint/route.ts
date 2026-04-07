import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { StyleFingerprint } from '@/types/fingerprint'

interface QuizResponse {
  pair_id: string
  chosen: string
  super_liked: boolean
}

interface FingerprintRequestBody {
  responses: QuizResponse[]
  entry_path: 'pairs' | 'natural_language' | 'inspo_photo'
  room_type: string
}

// ── 10-dimension system ───────────────────────────────────────────────────────
// Indices: 0=luminosity, 1=density, 2=temperature, 3=form, 4=era,
//          5=texture, 6=scale, 7=nature, 8=saturation, 9=materialOrigin

interface PairDefinition {
  primaryDimension: string | null
  secondaryDimension: string | null
  contrastLevel: 'extreme' | 'mid' | 'fine' | null
  aIntensity: number
  bIntensity: number
  isWarmup: boolean
}

const PAIR_DEFINITIONS: Record<string, PairDefinition> = {
  'pair-01': { primaryDimension: 'luminosity',     secondaryDimension: 'temperature',   contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-02': { primaryDimension: 'density',        secondaryDimension: null,            contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-03': { primaryDimension: 'temperature',    secondaryDimension: null,            contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-04': { primaryDimension: 'nature',         secondaryDimension: 'materialOrigin',contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-05': { primaryDimension: 'saturation',     secondaryDimension: null,            contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-06': { primaryDimension: 'luminosity',     secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-07': { primaryDimension: 'temperature',    secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-08': { primaryDimension: 'density',        secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-09': { primaryDimension: 'form',           secondaryDimension: 'scale',         contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-10': { primaryDimension: 'era',            secondaryDimension: null,            contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-11': { primaryDimension: 'texture',        secondaryDimension: 'materialOrigin',contrastLevel: 'extreme', aIntensity: 0.1, bIntensity: 0.9, isWarmup: false },
  'pair-12': { primaryDimension: 'nature',         secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-13': { primaryDimension: 'saturation',     secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-14': { primaryDimension: 'scale',          secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-15': { primaryDimension: 'luminosity',     secondaryDimension: null,            contrastLevel: 'fine',    aIntensity: 0.35,bIntensity: 0.65,isWarmup: false },
  'pair-16': { primaryDimension: 'temperature',    secondaryDimension: null,            contrastLevel: 'fine',    aIntensity: 0.35,bIntensity: 0.65,isWarmup: false },
  'pair-17': { primaryDimension: 'materialOrigin', secondaryDimension: null,            contrastLevel: 'fine',    aIntensity: 0.35,bIntensity: 0.65,isWarmup: false },
  'pair-18': { primaryDimension: 'form',           secondaryDimension: null,            contrastLevel: 'mid',     aIntensity: 0.25,bIntensity: 0.75,isWarmup: false },
  'pair-19': { primaryDimension: null,             secondaryDimension: null,            contrastLevel: null,      aIntensity: 0.0, bIntensity: 1.0, isWarmup: true  },
}


// Contrast-level weights
const CONTRAST_WEIGHTS: Record<string, number> = {
  extreme: 0.25,
  mid:     0.35,
  fine:    0.40,
}

// Dimension order in fingerprint vector
const DIMENSION_ORDER = [
  'luminosity', 'density', 'temperature', 'form', 'era',
  'texture', 'scale', 'nature', 'saturation', 'materialOrigin',
] as const

// ── 12 named styles ───────────────────────────────────────────────────────────

interface StyleDefinition {
  name: string
  chips: string[]
  // 10-float center vector in dimension order above
  center: number[]
}

const STYLES: StyleDefinition[] = [
  {
    name: 'Warm Japandi',
    chips: ['warm neutrals', 'organic textures', 'natural materials', 'minimal layers'],
    center: [0.75, 0.2, 0.8, 0.75, 0.45, 0.7, 0.35, 0.7, 0.35, 0.65],
  },
  {
    name: 'Organic Modern',
    chips: ['curved forms', 'natural wood', 'earthy tones', 'artisan craft'],
    center: [0.7, 0.45, 0.75, 0.8, 0.25, 0.7, 0.5, 0.75, 0.5, 0.7],
  },
  {
    name: 'Scandi Hygge',
    chips: ['cozy textures', 'cool palette', 'soft lighting', 'lived-in warmth'],
    center: [0.6, 0.5, 0.3, 0.5, 0.25, 0.65, 0.35, 0.5, 0.35, 0.55],
  },
  {
    name: 'Coastal Light',
    chips: ['natural light', 'relaxed elegance', 'soft whites', 'organic flow'],
    center: [0.85, 0.3, 0.5, 0.65, 0.2, 0.45, 0.5, 0.6, 0.3, 0.45],
  },
  {
    name: 'Bohemian Layered',
    chips: ['rich layers', 'global influences', 'curated chaos', 'living textures'],
    center: [0.5, 0.8, 0.7, 0.7, 0.5, 0.8, 0.45, 0.85, 0.65, 0.8],
  },
  {
    name: 'Dark Luxe',
    chips: ['dramatic depth', 'velvet richness', 'brass accents', 'intimate scale'],
    center: [0.2, 0.5, 0.65, 0.45, 0.65, 0.75, 0.25, 0.35, 0.45, 0.55],
  },
  {
    name: 'Heritage Maximalist',
    chips: ['antique detail', 'collected over time', 'warm richness', 'storied pieces'],
    center: [0.45, 0.85, 0.65, 0.4, 0.85, 0.75, 0.55, 0.5, 0.55, 0.7],
  },
  {
    name: 'Zen Sanctuary',
    chips: ['intentional emptiness', 'pure light', 'silent spaces', 'mindful living'],
    center: [0.8, 0.1, 0.5, 0.65, 0.2, 0.2, 0.3, 0.5, 0.15, 0.35],
  },
  {
    name: 'Industrial Edge',
    chips: ['raw materials', 'urban grit', 'structural beauty', 'matte finishes'],
    center: [0.3, 0.45, 0.2, 0.15, 0.2, 0.3, 0.5, 0.1, 0.3, 0.2],
  },
  {
    name: 'Moody Eclectic',
    chips: ['dramatic layers', 'bold color', 'collected character', 'rich darkness'],
    center: [0.15, 0.8, 0.6, 0.5, 0.7, 0.75, 0.4, 0.55, 0.7, 0.65],
  },
  {
    name: 'Parisian Chic',
    chips: ['effortless elegance', 'muted sophistication', 'ornate restraint', 'timeless charm'],
    center: [0.55, 0.5, 0.5, 0.45, 0.65, 0.5, 0.5, 0.4, 0.3, 0.5],
  },
  {
    name: 'Desert Modern',
    chips: ['earthy architecture', 'warm terracotta', 'angular forms', 'sun-baked palette'],
    center: [0.75, 0.25, 0.8, 0.2, 0.2, 0.7, 0.45, 0.45, 0.55, 0.6],
  },
]

// Dimension weights for style matching (weighted Euclidean distance)
const DIMENSION_MATCH_WEIGHTS = [
  1.5,  // luminosity
  1.2,  // density
  1.5,  // temperature
  1.0,  // form
  0.6,  // era
  0.8,  // texture
  0.9,  // scale
  1.1,  // nature
  1.0,  // saturation
  0.8,  // materialOrigin
]

// ── Fingerprint computation ───────────────────────────────────────────────────

// Computes raw [0,1] values per dimension (used internally for style matching)
function computeRawVector(responses: QuizResponse[]): number[] {
  // Per-dimension: accumulate weighted votes
  const dimVoteSum: Record<string, number> = {}
  const dimWeightSum: Record<string, number> = {}

  for (const dim of DIMENSION_ORDER) {
    dimVoteSum[dim] = 0
    dimWeightSum[dim] = 0
  }

  for (const response of responses) {
    const def = PAIR_DEFINITIONS[response.pair_id]
    if (!def) continue
    if (def.isWarmup) continue

    const chosenA = response.chosen === 'A'
    const superLikeMultiplier = response.super_liked ? 3 : 1
    const contrastWeight = def.contrastLevel ? (CONTRAST_WEIGHTS[def.contrastLevel] ?? 0.35) : 0.35

    // Primary dimension vote
    if (def.primaryDimension) {
      const primaryVote = chosenA ? def.aIntensity : def.bIntensity
      const effectiveWeight = contrastWeight * superLikeMultiplier
      dimVoteSum[def.primaryDimension]! += primaryVote * effectiveWeight
      dimWeightSum[def.primaryDimension]! += effectiveWeight
    }

    // Secondary dimension vote (half weight signal)
    if (def.secondaryDimension) {
      const secondaryVote = chosenA ? def.aIntensity : def.bIntensity
      const effectiveWeight = contrastWeight * superLikeMultiplier * 0.5
      dimVoteSum[def.secondaryDimension]! += secondaryVote * effectiveWeight
      dimWeightSum[def.secondaryDimension]! += effectiveWeight
    }
  }

  // Normalize: average per dimension, default 0.5 if no votes
  return DIMENSION_ORDER.map((dim) => {
    const wSum = dimWeightSum[dim] ?? 0
    if (wSum === 0) return 0.5
    const val = (dimVoteSum[dim] ?? 0) / wSum
    return Math.max(0, Math.min(1, val))
  })
}

// Convert raw [0,1] vector to StyleFingerprint with [-1,1] dimensions
function toStyleFingerprint(raw: number[]): StyleFingerprint {
  const toUnit = (v: number) => Math.max(-1, Math.min(1, (v - 0.5) * 2))
  return {
    dimensions: {
      luminosity:     toUnit(raw[0] ?? 0.5),
      density:        toUnit(raw[1] ?? 0.5),
      temperature:    toUnit(raw[2] ?? 0.5),
      form:           toUnit(raw[3] ?? 0.5),
      era:            toUnit(raw[4] ?? 0.5),
      texture:        toUnit(raw[5] ?? 0.5),
      scale:          toUnit(raw[6] ?? 0.5),
      nature:         toUnit(raw[7] ?? 0.5),
      saturation:     toUnit(raw[8] ?? 0.5),
      materialOrigin: toUnit(raw[9] ?? 0.5),
    },
    covariance: Array(10).fill(null).map(() => Array(10).fill(0)) as number[][],
    confidence: 0.8,
  }
}

// ── Style matching ────────────────────────────────────────────────────────────

function matchStyle(fp: number[]): StyleDefinition {
  let bestStyle = STYLES[0]!
  let bestDist = Infinity

  for (const style of STYLES) {
    const dist = Math.sqrt(
      fp.reduce((sum, val, i) => {
        const diff = val - (style.center[i] ?? 0.5)
        return sum + diff * diff * (DIMENSION_MATCH_WEIGHTS[i] ?? 1.0)
      }, 0)
    )
    if (dist < bestDist) {
      bestDist = dist
      bestStyle = style
    }
  }

  return bestStyle
}

// ── Style tags (10-dim) ───────────────────────────────────────────────────────

function fingerprintToStyleTags(fp: StyleFingerprint): string[] {
  const d = fp.dimensions
  return [
    d.luminosity >= 0 ? 'bright' : 'moody',
    d.density >= 0 ? 'layered' : 'minimal',
    d.temperature >= 0 ? 'warm' : 'cool',
    d.form >= 0 ? 'organic' : 'geometric',
    d.era >= 0 ? 'traditional' : 'modern',
    d.texture >= 0 ? 'textured' : 'smooth',
    d.scale >= 0 ? 'grand' : 'intimate',
    d.nature >= 0 ? 'biophilic' : 'urban',
    d.saturation >= 0 ? 'colorful' : 'muted',
    d.materialOrigin >= 0 ? 'artisanal' : 'manufactured',
  ]
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const body = (await request.json()) as FingerprintRequestBody
    const { responses, entry_path, room_type } = body

    if (!responses || responses.length === 0) {
      return NextResponse.json({ error: 'responses are required' }, { status: 400 })
    }

    const rawVector = computeRawVector(responses)
    const matchedStyle = matchStyle(rawVector)
    const styleName = matchedStyle.name
    const styleChips = matchedStyle.chips
    const fingerprint = toStyleFingerprint(rawVector)

    // Save fingerprint if user is authenticated
    if (user) {
      const admin = createAdminSupabaseClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('style_fingerprints') as any).insert({
        user_id: user.id,
        vector_data: rawVector,  // DB column still uses vector_data
        style_name: styleName,
        room_type,
        entry_path,
        quiz_responses: responses,
      })
    }

    return NextResponse.json({
      fingerprint,
      style_name: styleName,
      style_chips: styleChips,
      style_tags: fingerprintToStyleTags(fingerprint),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
