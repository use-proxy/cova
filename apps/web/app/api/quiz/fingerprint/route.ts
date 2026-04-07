import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { StyleFingerprint } from '@/types/fingerprint'

// ── 10-dimension system ───────────────────────────────────────────────────────
// Indices: 0=luminosity, 1=density, 2=temperature, 3=form, 4=era,
//          5=texture, 6=scale, 7=nature, 8=saturation, 9=materialOrigin

interface QuizResponse {
  pair_id: string
  chosen: string
  super_liked: boolean
}

interface PairwiseResponse {
  pairId: string
  chosenId: string
  responseTimeMs: number
}

// New 3-phase API format
interface NewFingerprintRequest {
  phase_a_selections: string[]
  phase_b_responses: PairwiseResponse[]
  room_type: string
  household_composition: string
  free_text?: string
}

// Legacy API format (kept for backward compat with existing quiz)
interface LegacyFingerprintRequest {
  responses: QuizResponse[]
  entry_path: 'pairs' | 'natural_language' | 'inspo_photo'
  room_type: string
}

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

const CONTRAST_WEIGHTS: Record<string, number> = {
  extreme: 0.25,
  mid:     0.35,
  fine:    0.40,
}

const DIMENSION_ORDER = [
  'luminosity', 'density', 'temperature', 'form', 'era',
  'texture', 'scale', 'nature', 'saturation', 'materialOrigin',
] as const

// ── 12 named styles ───────────────────────────────────────────────────────────

interface StyleDefinition {
  name: string
  chips: string[]
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

const DIMENSION_MATCH_WEIGHTS = [
  1.5, 1.2, 1.5, 1.0, 0.6, 0.8, 0.9, 1.1, 1.0, 0.8,
]

// ── Legacy fingerprint computation (pair-based) ───────────────────────────────

function computeRawVector(responses: QuizResponse[]): number[] {
  const dimVoteSum: Record<string, number> = {}
  const dimWeightSum: Record<string, number> = {}
  for (const dim of DIMENSION_ORDER) {
    dimVoteSum[dim] = 0
    dimWeightSum[dim] = 0
  }
  for (const response of responses) {
    const def = PAIR_DEFINITIONS[response.pair_id]
    if (!def || def.isWarmup) continue
    const chosenA = response.chosen === 'A'
    const superLikeMultiplier = response.super_liked ? 3 : 1
    const contrastWeight = def.contrastLevel ? (CONTRAST_WEIGHTS[def.contrastLevel] ?? 0.35) : 0.35
    if (def.primaryDimension) {
      const primaryVote = chosenA ? def.aIntensity : def.bIntensity
      const effectiveWeight = contrastWeight * superLikeMultiplier
      dimVoteSum[def.primaryDimension]! += primaryVote * effectiveWeight
      dimWeightSum[def.primaryDimension]! += effectiveWeight
    }
    if (def.secondaryDimension) {
      const secondaryVote = chosenA ? def.aIntensity : def.bIntensity
      const effectiveWeight = contrastWeight * superLikeMultiplier * 0.5
      dimVoteSum[def.secondaryDimension]! += secondaryVote * effectiveWeight
      dimWeightSum[def.secondaryDimension]! += effectiveWeight
    }
  }
  return DIMENSION_ORDER.map((dim) => {
    const wSum = dimWeightSum[dim] ?? 0
    if (wSum === 0) return 0.5
    const val = (dimVoteSum[dim] ?? 0) / wSum
    return Math.max(0, Math.min(1, val))
  })
}

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

// ── New 3-phase fingerprint computation ───────────────────────────────────────

type DimKey = typeof DIMENSION_ORDER[number]

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function zeroDims(): Record<DimKey, number> {
  const d = {} as Record<DimKey, number>
  for (const k of DIMENSION_ORDER) d[k] = 0
  return d
}

function identityCov(scale: number): number[][] {
  return Array.from({ length: 10 }, (_, i) =>
    Array.from({ length: 10 }, (__, j) => (i === j ? scale : 0))
  )
}

async function computeNewFingerprint(
  body: NewFingerprintRequest
): Promise<{ fingerprint: StyleFingerprint; styleName: string; styleTags: string[] }> {
  const { phase_a_selections, phase_b_responses } = body

  // ── Step 1 — Phase A warm start ───────────────────────────────────────────
  const meanDims = zeroDims()
  const covariance = identityCov(0.5)
  let confidence = 0.3

  if (phase_a_selections.length > 0) {
    const admin = createAdminSupabaseClient()
    const { data: selectedCards } = await admin
      .from('swipe_cards')
      .select('dimension_labels')
      .in('id', phase_a_selections)
      .not('dimension_labels', 'is', null)

    if (selectedCards && selectedCards.length > 0) {
      for (const card of selectedCards) {
        const dl = card.dimension_labels as Record<string, number>
        for (const k of DIMENSION_ORDER) {
          meanDims[k] += (dl[k] ?? 0) / selectedCards.length
        }
      }
    }
  }

  // ── Step 2 — Apply Phase B updates ───────────────────────────────────────
  if (phase_b_responses.length > 0) {
    const admin = createAdminSupabaseClient()
    for (const resp of phase_b_responses) {
      const ids = resp.pairId.split('_').filter(Boolean)
      if (ids.length < 2) continue

      const { data: pairCards } = await admin
        .from('swipe_cards')
        .select('id, dimension_labels')
        .in('id', ids)
        .not('dimension_labels', 'is', null)

      if (!pairCards || pairCards.length < 2) continue

      const chosen = pairCards.find(c => c.id === resp.chosenId)
      const rejected = pairCards.find(c => c.id !== resp.chosenId)
      if (!chosen || !rejected) continue

      const lambda = Math.min(3, 1 + 500 / Math.max(resp.responseTimeMs, 100))
      const chosenDims = chosen.dimension_labels as Record<string, number>
      const rejectedDims = rejected.dimension_labels as Record<string, number>

      for (let i = 0; i < DIMENSION_ORDER.length; i++) {
        const k = DIMENSION_ORDER[i]!
        const delta = ((chosenDims[k] ?? 0) - (rejectedDims[k] ?? 0)) * 0.15 * lambda
        meanDims[k] = clamp(meanDims[k] + delta, -1, 1)
        covariance[i]![i] = (covariance[i]![i] ?? 0.5) * 0.85
      }
    }
    const diagSum = covariance.reduce((s, row, i) => s + (row[i] ?? 0), 0)
    confidence = Math.min(1, Math.max(0, 1 - (diagSum / 10) / 0.5))
  }

  const fingerprint: StyleFingerprint = {
    dimensions: { ...meanDims } as StyleFingerprint['dimensions'],
    covariance,
    confidence,
  }

  // ── Step 3 — Style name from dominant dimensions ──────────────────────────
  const d = fingerprint.dimensions
  let styleName = 'Contemporary Eclectic'
  if      (d.temperature > 0.3 && d.nature > 0.3 && d.form > 0.3)             styleName = 'Warm Japandi'
  else if (d.temperature > 0.3 && d.texture > 0.3 && d.era > 0.3)             styleName = 'Cozy Heritage'
  else if (d.luminosity > 0.3 && d.density < -0.3 && d.form < -0.3)           styleName = 'Nordic Minimal'
  else if (d.luminosity < -0.3 && d.saturation > 0.3 && d.era < -0.3)         styleName = 'Dark Contemporary'
  else if (d.temperature > 0.3 && d.density > 0.3 && d.materialOrigin > 0.3)  styleName = 'Artisanal Maximalist'
  else if (d.luminosity > 0.3 && d.nature > 0.3 && d.saturation < -0.3)       styleName = 'Coastal Organic'
  else if (d.form < -0.3 && d.materialOrigin < -0.3 && d.luminosity < -0.3)   styleName = 'Industrial Modern'
  else if (d.era > 0.3 && d.temperature > 0.3 && d.texture > 0.3)             styleName = 'Traditional Warmth'
  else if (d.density > 0.3 && d.saturation > 0.3)                             styleName = 'Eclectic Maximalist'

  // ── Step 4 — Style tags (top 4 dominant dimensions) ──────────────────────
  const DIM_LABELS: Record<string, [string, string]> = {
    luminosity:     ['Sun-Drenched', 'Moody & Dark'],
    density:        ['Richly Layered', 'Clean & Spare'],
    temperature:    ['Warm Tones', 'Cool Palette'],
    form:           ['Organic Forms', 'Geometric Lines'],
    era:            ['Heritage Craft', 'Ultra-Modern'],
    texture:        ['Tactile Rich', 'Sleek Surfaces'],
    scale:          ['Grand Scale', 'Delicate Scale'],
    nature:         ['Natural Warmth', 'Industrial Edge'],
    saturation:     ['Bold Color', 'Neutral Palette'],
    materialOrigin: ['Handcrafted', 'Precision Made'],
  }

  const dimsWithMag = DIMENSION_ORDER.map(k => ({
    key: k,
    value: d[k as DimKey],
    mag: Math.abs(d[k as DimKey]),
  })).sort((a, b) => b.mag - a.mag)

  const styleTags = dimsWithMag.slice(0, 4).map(({ key, value }) => {
    const labels = DIM_LABELS[key]!
    return value > 0 ? labels[0] : labels[1]
  })

  return { fingerprint, styleName, styleTags }
}

// ── Style matching (legacy) ───────────────────────────────────────────────────

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
    if (dist < bestDist) { bestDist = dist; bestStyle = style }
  }
  return bestStyle
}

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

    const rawBody = (await request.json()) as Record<string, unknown>

    // Detect which API format
    const isNewFormat = 'phase_a_selections' in rawBody

    if (isNewFormat) {
      // ── New 3-phase format ────────────────────────────────────────────────
      const body = rawBody as unknown as NewFingerprintRequest
      if (!body.room_type) {
        return NextResponse.json({ error: 'room_type required' }, { status: 400 })
      }

      const { fingerprint, styleName, styleTags } = await computeNewFingerprint(body)

      // Save if authenticated
      if (user) {
        const admin = createAdminSupabaseClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('style_fingerprints') as any).insert({
          user_id: user.id,
          vector_data: Object.values(fingerprint.dimensions),
          style_name: styleName,
          room_type: body.room_type,
          entry_path: 'pairs',
        }).catch(() => { /* non-fatal */ })
      }

      return NextResponse.json({
        fingerprint,
        style_name: styleName,
        style_tags: styleTags,
      })
    } else {
      // ── Legacy format ─────────────────────────────────────────────────────
      const body = rawBody as unknown as LegacyFingerprintRequest
      const { responses, entry_path, room_type } = body

      if (!responses || responses.length === 0) {
        return NextResponse.json({ error: 'responses are required' }, { status: 400 })
      }

      const rawVector = computeRawVector(responses)
      const matchedStyle = matchStyle(rawVector)
      const styleName = matchedStyle.name
      const styleChips = matchedStyle.chips
      const fingerprint = toStyleFingerprint(rawVector)

      if (user) {
        const admin = createAdminSupabaseClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('style_fingerprints') as any).insert({
          user_id: user.id,
          vector_data: rawVector,
          style_name: styleName,
          room_type,
          entry_path,
          quiz_responses: responses,
        }).catch(() => { /* non-fatal */ })
      }

      return NextResponse.json({
        fingerprint,
        style_name: styleName,
        style_chips: styleChips,
        style_tags: fingerprintToStyleTags(fingerprint),
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
