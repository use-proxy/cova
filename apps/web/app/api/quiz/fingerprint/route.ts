import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { StyleFingerprint } from '@/types/fingerprint'
import { toDisplayName } from '@/lib/ai/anchor-display'

// ── 12-dimension system ───────────────────────────────────────────────────────
// All dimensions are in [0, 1] with 0.5 as the neutral midpoint.
// Indices:
//   0=colorTemperature  1=colorSaturation  2=density          3=formality
//   4=era               5=material         6=texture          7=pattern
//   8=lineQuality       9=lightPreference  10=nature          11=culturalInfluence

interface PairwiseResponse {
  /** quiz_comparison_pairs.id (single id, post-Session-C). */
  pairId: string
  /** Which image of the pair the user picked. 'skip' = no preference. */
  chosenSide: 'A' | 'B' | 'skip'
  responseTimeMs: number
}

// New 3-phase API format
interface NewFingerprintRequest {
  phase_a_selections: string[]
  phase_b_responses: PairwiseResponse[]
  room_type: string
  household_composition?: string
  free_text?: string
  budget_tier?: 'budget' | 'mid' | 'premium' | 'luxury' | null
  // When true, the client has confirmed a (possibly tweaked) fingerprint
  // from the Phase C validation-render flow. When set together with
  // confirmed_fingerprint, the route skips recomputation and saves the
  // client-confirmed vector directly.
  phase_c_confirmation?: boolean
  confirmed_fingerprint?: StyleFingerprint
}

const DIMENSION_ORDER = [
  'colorTemperature', 'colorSaturation', 'density', 'formality',
  'era', 'material', 'texture', 'pattern',
  'lineQuality', 'lightPreference', 'nature', 'culturalInfluence',
] as const

type DimKey = typeof DIMENSION_ORDER[number]

const DIM_COUNT = DIMENSION_ORDER.length // 12

const NEUTRAL_MIDPOINT = 0.5
const STRONG_BAND = 0.2 // |v - 0.5| > 0.2 → directional

// ── 9 named anchor styles ─────────────────────────────────────────────────────
// Vectors in DIMENSION_ORDER. Sourced from the quiz library spec — these are
// the same vectors used to generate the quiz_anchor_images library. Style
// names are INTERNAL ONLY and never surfaced to user-facing UI strings
// (CLAUDE.md hard rule #8).

interface StyleDefinition {
  name: string
  chips: string[]
  center: number[]
}

const STYLES: StyleDefinition[] = [
  {
    name: 'Warm Japandi',
    chips: ['warm neutrals', 'organic textures', 'natural materials', 'minimal layers'],
    center: [0.80, 0.25, 0.30, 0.40, 0.45, 0.85, 0.55, 0.10, 0.75, 0.65, 0.60, 0.25],
  },
  {
    name: 'Dark Moody Glam',
    chips: ['dramatic depth', 'velvet richness', 'brass accents', 'jewel tones'],
    center: [0.25, 0.80, 0.65, 0.85, 0.35, 0.25, 0.80, 0.55, 0.20, 0.10, 0.05, 0.30],
  },
  {
    name: 'Coastal Bright',
    chips: ['airy whites', 'natural rattan', 'sea breeze palette', 'sun-filled'],
    center: [0.50, 0.20, 0.35, 0.25, 0.40, 0.70, 0.30, 0.20, 0.60, 0.95, 0.75, 0.20],
  },
  {
    name: 'Industrial Loft',
    chips: ['raw concrete', 'aged leather', 'matte black steel', 'urban grit'],
    center: [0.15, 0.30, 0.55, 0.50, 0.30, 0.05, 0.45, 0.05, 0.05, 0.50, 0.05, 0.15],
  },
  {
    name: 'Maximalist Eclectic',
    chips: ['bold pattern', 'layered color', 'global influences', 'curated chaos'],
    center: [0.60, 0.90, 0.95, 0.30, 0.50, 0.60, 0.85, 0.95, 0.70, 0.60, 0.65, 0.90],
  },
  {
    name: 'Heritage Traditional',
    chips: ['mahogany panel', 'tufted leather', 'ornate detail', 'old library'],
    center: [0.55, 0.45, 0.70, 0.95, 0.95, 0.80, 0.80, 0.85, 0.25, 0.45, 0.20, 0.35],
  },
  {
    name: 'Pure Minimal White',
    chips: ['architectural calm', 'pristine white', 'zero clutter', 'silent space'],
    center: [0.30, 0.05, 0.05, 0.55, 0.10, 0.20, 0.05, 0.00, 0.10, 0.90, 0.15, 0.10],
  },
  {
    name: 'Biophilic Jungle',
    chips: ['floor-to-ceiling plants', 'natural stone', 'wood beams', 'living walls'],
    center: [0.65, 0.55, 0.75, 0.20, 0.25, 0.95, 0.70, 0.30, 0.80, 0.70, 1.00, 0.50],
  },
  {
    name: 'Retro Mid-Century',
    chips: ['walnut tapered legs', 'avocado and ochre', 'sunburst motif', '1960s vibe'],
    center: [0.70, 0.65, 0.45, 0.60, 0.75, 0.65, 0.40, 0.70, 0.35, 0.65, 0.35, 0.30],
  },
]

// Per-dimension weights for weighted Euclidean style matching. Tuned so that
// the most discriminative anchor dimensions (color, light, material, era)
// dominate the distance metric.
const DIMENSION_MATCH_WEIGHTS: number[] = [
  1.5, 1.2, 1.1, 0.9, 1.0, 1.3, 0.9, 1.0, 0.9, 1.4, 1.2, 0.8,
]

// ── New 3-phase fingerprint computation ───────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function neutralDims(): Record<DimKey, number> {
  const d = {} as Record<DimKey, number>
  for (const k of DIMENSION_ORDER) d[k] = NEUTRAL_MIDPOINT
  return d
}

function identityCov(scale: number): number[][] {
  return Array.from({ length: DIM_COUNT }, (_, i) =>
    Array.from({ length: DIM_COUNT }, (__, j) => (i === j ? scale : 0))
  )
}

async function computeNewFingerprint(
  body: NewFingerprintRequest
): Promise<{ fingerprint: StyleFingerprint; styleName: string; styleTags: string[] }> {
  const { phase_a_selections, phase_b_responses } = body

  // ── Step 1 — Phase A warm start ───────────────────────────────────────────
  const meanDims = neutralDims()
  const covariance = identityCov(0.5)
  let confidence = 0.3

  if (phase_a_selections.length > 0) {
    // Phase A selections are now quiz_anchor_images.id values (Session C
    // wiring). Read the 12-dim style_vector for each selected anchor and
    // average them as the warm start.
    const admin = createAdminSupabaseClient()
    const { data: selectedAnchors } = await admin
      .from('quiz_anchor_images')
      .select('style_vector')
      .in('id', phase_a_selections)
      .not('style_vector', 'is', null)

    if (selectedAnchors && selectedAnchors.length > 0) {
      // Reset to 0 before averaging actual vectors
      for (const k of DIMENSION_ORDER) meanDims[k] = 0
      for (const anchor of selectedAnchors) {
        const sv = anchor.style_vector as Record<string, number>
        for (const k of DIMENSION_ORDER) {
          meanDims[k] += (sv[k] ?? NEUTRAL_MIDPOINT) / selectedAnchors.length
        }
      }
    }
  }

  // ── Step 2 — Apply Phase B updates ───────────────────────────────────────
  // Reads each pair from quiz_comparison_pairs by id (Session C wiring).
  // For each non-skip response: chosen side vs other side gives a delta
  // applied to meanDims with a response-time lambda. Per-dimension response
  // counts are tracked and converted to a confidence formula:
  //     covariance[i][i] = 1 - min(1, responses_for_dim / 4)
  // — so a dim with 4+ responses → diagonal=0 (full confidence), a dim with
  // 0 responses → diagonal=1 (no confidence). This encoding is consumed by
  // /api/quiz/next-pair to pick the next least-confident dimension.
  //
  // NOTE: full Bradley-Terry inference (with explicit 'strong' vs 'normal'
  // intensity weights and explicit 'skip' records) is deferred to a future UI
  // session — it requires a "super-like" gesture that doesn't exist in the
  // current step-3 client. The minimum wiring here keeps the response-time
  // lambda as a proxy for intensity. See docs/sessions/session-quiz-wiring-progress.md
  // for the deferred items.
  const responsesPerDim: Record<DimKey, number> =
    Object.fromEntries(DIMENSION_ORDER.map((d) => [d, 0])) as Record<DimKey, number>

  if (phase_b_responses.length > 0) {
    const admin = createAdminSupabaseClient()
    const pairIds = Array.from(new Set(phase_b_responses.map((r) => r.pairId).filter(Boolean)))

    const { data: pairRows } = await admin
      .from('quiz_comparison_pairs')
      .select('id, dimension, image_a_vector, image_b_vector')
      .in('id', pairIds)

    const pairsById = new Map<string, {
      dimension: string
      image_a_vector: Record<string, number>
      image_b_vector: Record<string, number>
    }>()
    for (const row of pairRows ?? []) {
      pairsById.set(row.id as string, {
        dimension: row.dimension as string,
        image_a_vector: row.image_a_vector as Record<string, number>,
        image_b_vector: row.image_b_vector as Record<string, number>,
      })
    }

    for (const resp of phase_b_responses) {
      if (resp.chosenSide === 'skip') continue
      const pair = pairsById.get(resp.pairId)
      if (!pair) continue

      const chosenVec = resp.chosenSide === 'A' ? pair.image_a_vector : pair.image_b_vector
      const rejectedVec = resp.chosenSide === 'A' ? pair.image_b_vector : pair.image_a_vector

      const lambda = Math.min(3, 1 + 500 / Math.max(resp.responseTimeMs, 100))

      for (const k of DIMENSION_ORDER) {
        const delta = ((chosenVec[k] ?? NEUTRAL_MIDPOINT) - (rejectedVec[k] ?? NEUTRAL_MIDPOINT)) * 0.15 * lambda
        meanDims[k] = clamp(meanDims[k] + delta, 0, 1)
      }

      // Increment per-dim response counter for the pair's primary dimension.
      if (pair.dimension && pair.dimension in responsesPerDim) {
        responsesPerDim[pair.dimension as DimKey] += 1
      }
    }

    // Confidence encoding: cov[i][i] = 1 - min(1, count / 4)
    let confSum = 0
    for (let i = 0; i < DIMENSION_ORDER.length; i++) {
      const k = DIMENSION_ORDER[i]!
      const dimConfidence = Math.min(1, responsesPerDim[k] / 4)
      covariance[i]![i] = 1 - dimConfidence
      confSum += dimConfidence
    }
    confidence = confSum / DIM_COUNT
  }

  const fingerprint: StyleFingerprint = {
    dimensions: { ...meanDims } as StyleFingerprint['dimensions'],
    covariance,
    confidence,
  }

  // ── Step 3 — Style name from weighted distance to anchors ─────────────────
  // Match against the 9 named anchors. If the fingerprint is too neutral
  // (no dimension exceeds the strong band), return a placeholder.
  const d = fingerprint.dimensions
  const strongDims = DIMENSION_ORDER.filter(k => Math.abs(d[k] - NEUTRAL_MIDPOINT) > STRONG_BAND)

  // Internal anchor name (e.g. "Warm Japandi") is used by server-side
  // matching only. The user-facing label goes through toDisplayName() so
  // CLAUDE.md hard rule #8 (no forbidden style names in user-facing strings)
  // is honored at the route boundary — this is the *only* place where the
  // raw anchor name leaves the server.
  let styleName: string
  if (strongDims.length === 0) {
    styleName = 'Your Unique Style'
  } else {
    const fpVec = DIMENSION_ORDER.map((k) => d[k])
    styleName = toDisplayName(matchStyle(fpVec).name)
  }

  // ── Step 4 — Style tags (only directional dimensions) ─────────────────────
  // A dimension is "directional" when it deviates from 0.5 by more than the
  // strong band. Tags are drawn from those, ranked by deviation. If fewer
  // than 4 strong dimensions exist, fill with neutral fillers.
  const DIM_LABELS: Record<DimKey, [string, string]> = {
    colorTemperature:  ['Cool Palette',     'Warm Tones'],
    colorSaturation:   ['Neutral Palette',  'Bold Color'],
    density:           ['Clean & Spare',    'Richly Layered'],
    formality:         ['Casual & Relaxed', 'Formal & Structured'],
    era:               ['Ultra-Modern',     'Heritage Craft'],
    material:          ['Manufactured',     'Natural & Organic'],
    texture:           ['Sleek Surfaces',   'Tactile Rich'],
    pattern:           ['Pattern-Free',     'Pattern-Rich'],
    lineQuality:       ['Geometric Lines',  'Organic Forms'],
    lightPreference:   ['Cozy & Intimate',  'Sun-Drenched'],
    nature:            ['Urban Edge',       'Biophilic Warmth'],
    culturalInfluence: ['Western Modern',   'Globally Eclectic'],
  }

  const NEUTRAL_FILLERS = [
    'Balanced Style',
    'Versatile Space',
    'Open to Ideas',
    'Your Taste',
  ]

  const strong = DIMENSION_ORDER
    .map((k) => ({ key: k, dev: d[k] - NEUTRAL_MIDPOINT, mag: Math.abs(d[k] - NEUTRAL_MIDPOINT) }))
    .filter((x) => x.mag > STRONG_BAND)
    .sort((a, b) => b.mag - a.mag)

  const styleTags: string[] = strong.slice(0, 4).map(({ key, dev }) => {
    const labels = DIM_LABELS[key]
    return dev > 0 ? labels[1] : labels[0]
  })

  // Fill remaining slots with neutral tags
  let fillerIdx = 0
  while (styleTags.length < 4 && fillerIdx < NEUTRAL_FILLERS.length) {
    styleTags.push(NEUTRAL_FILLERS[fillerIdx]!)
    fillerIdx++
  }

  return { fingerprint, styleName, styleTags }
}

// ── Style matching ────────────────────────────────────────────────────────────

function matchStyle(fp: number[]): StyleDefinition {
  let bestStyle = STYLES[0]!
  let bestDist = Infinity
  for (const style of STYLES) {
    const dist = Math.sqrt(
      fp.reduce((sum, val, i) => {
        const diff = val - (style.center[i] ?? NEUTRAL_MIDPOINT)
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
    d.colorTemperature  >= NEUTRAL_MIDPOINT ? 'warm'        : 'cool',
    d.colorSaturation   >= NEUTRAL_MIDPOINT ? 'colorful'    : 'muted',
    d.density           >= NEUTRAL_MIDPOINT ? 'layered'     : 'minimal',
    d.formality         >= NEUTRAL_MIDPOINT ? 'formal'      : 'casual',
    d.era               >= NEUTRAL_MIDPOINT ? 'traditional' : 'modern',
    d.material          >= NEUTRAL_MIDPOINT ? 'natural'     : 'manufactured',
    d.texture           >= NEUTRAL_MIDPOINT ? 'textured'    : 'smooth',
    d.pattern           >= NEUTRAL_MIDPOINT ? 'patterned'   : 'plain',
    d.lineQuality       >= NEUTRAL_MIDPOINT ? 'organic'     : 'geometric',
    d.lightPreference   >= NEUTRAL_MIDPOINT ? 'bright'      : 'moody',
    d.nature            >= NEUTRAL_MIDPOINT ? 'biophilic'   : 'urban',
    d.culturalInfluence >= NEUTRAL_MIDPOINT ? 'global'      : 'western',
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

    {
      // ── 3-phase format ────────────────────────────────────────────────────
      const body = rawBody as unknown as NewFingerprintRequest
      if (!body.room_type) {
        return NextResponse.json({ error: 'room_type required' }, { status: 400 })
      }

      // Phase C confirmation path: the client has already confirmed a
      // (possibly tweaked) fingerprint from the validation-render flow.
      // Skip recomputation and save the client-confirmed vector directly —
      // still re-derives style name and tags from that vector for display.
      let fingerprint: StyleFingerprint
      let styleName: string
      let styleTags: string[]

      if (body.phase_c_confirmation && body.confirmed_fingerprint) {
        fingerprint = body.confirmed_fingerprint
        const d = fingerprint.dimensions
        const strongDims = DIMENSION_ORDER.filter(
          (k) => Math.abs((d[k] ?? NEUTRAL_MIDPOINT) - NEUTRAL_MIDPOINT) > STRONG_BAND
        )
        if (strongDims.length === 0) {
          styleName = 'Your Unique Style'
        } else {
          const fpVec = DIMENSION_ORDER.map((k) => d[k] ?? NEUTRAL_MIDPOINT)
          styleName = toDisplayName(matchStyle(fpVec).name)
        }
        styleTags = fingerprintToStyleTags(fingerprint).slice(0, 4)
      } else {
        const result = await computeNewFingerprint(body)
        fingerprint = result.fingerprint
        styleName = result.styleName
        styleTags = result.styleTags
      }

      // Guard: require authenticated user before attempting any DB insert.
      // Do not silently skip the save — return 401 so the client knows
      // the fingerprint was not persisted. The cookie-based pre-auth flow
      // (cova_anon_fingerprint) handles the unauthenticated case.
      if (!user) {
        return NextResponse.json(
          { success: false, error: 'unauthenticated' },
          { status: 401 }
        )
      }

      // Save to DB. NOTE: the supabase-js query builder is a thenable, NOT
      // a real Promise — `.catch()` is not a method on it. Use try/catch on
      // the awaited builder. Both network errors (thrown exceptions) and
      // Supabase-returned errors (error field on the response) are handled.
      try {
        const admin = createAdminSupabaseClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error: insertErr } = await (admin.from('style_fingerprints') as any)
          .insert({
            user_id: user.id,
            dimensions: fingerprint.dimensions,
            covariance: fingerprint.covariance,
            confidence: fingerprint.confidence,
            style_name: styleName,
            room_type: body.room_type,
            budget_tier: body.budget_tier ?? null,
            quiz_responses: body.phase_b_responses ?? [],
            entry_path: 'pairs',
          })
          .select('id')
          .single()
        if (insertErr) {
          console.error(`[fingerprint-save] ERROR: ${JSON.stringify(insertErr)}`)
          return NextResponse.json(
            { success: false, error: 'fingerprint_save_failed', detail: insertErr.message },
            { status: 500 }
          )
        }
        console.log('[fingerprint] saved to DB:', {
          userId: user.id,
          styleId: inserted?.id ?? null,
          styleName,
        })

        // Also mirror the fingerprint onto the users row so downstream
        // routes (/api/render) can fall back to it when the client omits
        // fingerprint_vector from the request body. Quiz runs at step-3,
        // before room creation at step-6, so there is no room_id to
        // attach the fingerprint to — the users table is the only
        // user-scoped destination available at quiz time.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: userErr } = await (admin.from('users') as any)
          .update({
            style_fingerprint: fingerprint,
            style_blend: fingerprint.dimensions,
          })
          .eq('id', user.id)
        if (userErr) {
          console.error(`[fingerprint-save] users update error: ${JSON.stringify(userErr)}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[fingerprint-save] ERROR: ${JSON.stringify({ message: msg })}`)
        return NextResponse.json(
          { success: false, error: 'fingerprint_save_failed', detail: msg },
          { status: 500 }
        )
      }

      return NextResponse.json({
        fingerprint,
        style_name: styleName,
        style_tags: styleTags,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
