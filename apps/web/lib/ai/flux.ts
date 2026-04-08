import Replicate from 'replicate'
import type { StyleFingerprint } from '@/types/fingerprint'
import type { RoomAnalysis } from '@/lib/store/room'
import { buildPreservationInstructions, type RoomArchitecture } from './room-analyzer'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// ── Model constants ───────────────────────────────────────────────────────────
// FLUX Kontext Pro is an image-edit model: it takes `input_image` (singular)
// and preserves the composition, camera angle, and architecture of the input
// while modifying the scene according to the prompt. This is exactly what
// Cova promises: "Your room, redesigned". Verified 2026-04-08 with Daksh's
// actual bedroom (blue walls, ceiling fan, DAKSH letters) — output preserved
// all architecture and only swapped the rug/decor. DO NOT swap this model
// without re-running the live architecture-preservation test.
//
// FLUX Schnell is a text-to-image model used for the fast preview during
// render loading. It does NOT support input_image and is not expected to
// preserve architecture — it just shows a plausible style while Kontext
// Pro runs.
const KONTEXT_MODEL = 'black-forest-labs/flux-kontext-pro'
const SCHNELL_MODEL = 'black-forest-labs/flux-schnell'

// ── Descriptor table — authoritative, do not modify ───────────────────────────

type DimKey = keyof StyleFingerprint['dimensions']

const DESCRIPTORS: Record<DimKey, { lo: string; hi: string }> = {
  luminosity: {
    lo: 'very dark, moody, dramatic, candlelit, cave-like atmosphere',
    hi: 'bright airy space, flooded with natural light, sun-drenched',
  },
  density: {
    lo: 'stark, near-empty, intentional void, almost no objects',
    hi: 'richly layered, curated objects, maximalist, every surface considered',
  },
  temperature: {
    lo: 'icy cool, concrete grey, slate, steel blue, cold whites',
    hi: 'warm amber tones, honey wood, terracotta, beeswax',
  },
  form: {
    lo: 'hyper-geometric, hard right angles, razor-sharp lines, zero curves',
    hi: 'organic curves, soft rounded forms, natural shapes, no hard edges',
  },
  era: {
    lo: 'ultra-modern, futuristic, cutting-edge contemporary, no historical reference',
    hi: 'classic heritage, antique references, traditional craft, heirloom quality',
  },
  texture: {
    lo: 'mirror-smooth, lacquered, polished stone, glass, zero tactile variation',
    hi: 'tactile richness, chunky knits, rough linen, natural stone, woven rattan',
  },
  scale: {
    lo: 'petite furnishings, delicate proportions, small-scale pieces',
    hi: 'oversized statement pieces, large-scale furnishings, grand proportions',
  },
  nature: {
    lo: 'synthetic materials, industrial, man-made surfaces, no plants',
    hi: 'abundant natural materials, wood grain, stone, live plants, rattan, linen',
  },
  saturation: {
    lo: 'achromatic palette, near-neutral, greige, white, grey, black',
    hi: 'rich saturated color, bold hues, high-contrast palette, vivid accents',
  },
  materialOrigin: {
    lo: 'industrial materials, concrete, steel, factory-made, precision-manufactured',
    hi: 'artisanal craft, hand-thrown ceramics, hand-woven textiles, bespoke joinery',
  },
}

const NEUTRAL_BAND = 0.3

const BUDGET_MODIFIERS: Record<string, string> = {
  budget:  'affordable accessible pieces, high-street furniture',
  mid:     'quality mid-range furniture, well-made everyday pieces',
  premium: 'premium materials, considered investment pieces',
  luxury:  'designer furniture, investment pieces, bespoke details',
}

// ── buildFluxPrompt ───────────────────────────────────────────────────────────
//
// Kontext Pro is an edit-instruction model, not a scene-description model.
// Live-tested 2026-04-08 against Daksh's actual bedroom (IMG_2093): a
// transformation-first structure produced a 9/10 coastal redesign that
// preserved the ceiling fan, DAKSH letters, photo string, window blinds,
// bed frame, wall color and carpet, while swapping in rattan chairs,
// nightstand with lamp, coastal art, jute rug and fresh bedding.
//
// The winning structure:
//
//   1. Transformation intent — "Interior design makeover: this {room} needs
//      a {style} redesign." Signals the before/after frame up front so
//      Kontext actually redesigns instead of applying a color filter.
//   2. REPLACE section — explicit before → after swaps ("messy bedding →
//      crisp white duvet"). This is the single most important part of the
//      prompt and must be present for actual transformation.
//   3. ADD section — new decor items ("woven jute rug, coastal art…").
//   4. PRESERVE section — architectural elements from Gemini analysis.
//      Leads with the literal string "PRESERVE exactly:".
//   5. Kept items — user's explicit keep-selections from step-5.
//   6. Budget modifier.
//   7. Quality closer — "photorealistic, professionally staged".
//
// PRESERVE was moved out of the opening position because live testing
// showed that leading with preservation produced color-filter outputs,
// not true redesigns. Kontext needs the transformation framing first.

export interface BuildFluxPromptParams {
  fingerprint: StyleFingerprint
  roomType: string
  budgetTier: 'budget' | 'mid' | 'premium' | 'luxury'
  inclusions: string[]
  constraints: string[]
  keptItemLabels: string[]
  roomAnalysis: RoomAnalysis | null
  // Precise, Gemini-derived preservation instructions describing the actual
  // walls, ceiling, floor, windows, camera angle and fixed elements of the
  // user's room. When present, this is used instead of the generic fallback.
  preservationInstructions?: string
}

export function buildFluxPrompt(params: BuildFluxPromptParams): string {
  const { fingerprint, roomType, budgetTier, inclusions, keptItemLabels, preservationInstructions } = params
  const d = fingerprint.dimensions

  const parts: string[] = []
  const roomTypeStr = roomType.replace(/_/g, ' ')

  // 1. Transformation intent — transformation-first framing (live-tested
  //    winner against PRESERVE-first, which produced color-filter outputs).
  parts.push(
    `Interior design makeover: this ${roomTypeStr} needs a complete redesign`
  )

  // 2. REPLACE section — tell Kontext explicitly to swap out old furniture.
  //    Without this, Kontext hedges and keeps the original items.
  parts.push(
    `REPLACE all existing furniture, bedding, soft furnishings, rugs, ` +
    `artwork, lamps and decor with new pieces in this style`
  )

  // 3. Style descriptors — active dimensions only (outside neutral band)
  const descriptorParts: string[] = []
  for (const [key, { lo, hi }] of Object.entries(DESCRIPTORS) as [DimKey, { lo: string; hi: string }][]) {
    const v = d[key]
    if (v < -NEUTRAL_BAND) descriptorParts.push(lo)
    else if (v > NEUTRAL_BAND) descriptorParts.push(hi)
  }
  if (descriptorParts.length > 0) {
    parts.push(descriptorParts.join(', '))
  }

  // 4. ADD section — new decor items from the quiz
  if (inclusions.length > 0) {
    parts.push('ADD: ' + inclusions.slice(0, 4).join(', '))
  }

  // 5. Remove clutter instruction — critical for turning lived-in rooms
  //    into staged design shots
  parts.push(
    `Remove all clutter, personal items, backpacks, cords, laundry and ` +
    `mess so the room looks professionally staged`
  )

  // 6. PRESERVE section — Gemini-derived architectural description.
  //    Leads with literal "PRESERVE exactly:" so Kontext recognizes the
  //    keep-list as a hard constraint.
  if (preservationInstructions && preservationInstructions.trim()) {
    parts.push(preservationInstructions.trim())
  } else {
    parts.push(
      'PRESERVE exactly: wall color, ceiling and any ceiling fixtures, ' +
      'floor material, windows and window coverings, all wall decor ' +
      'including any letters, photos, art or signage, the existing bed ' +
      'frame if visible, camera angle, room layout and proportions'
    )
  }

  // 7. Kept items — user's explicit keep-selections from step-5
  if (keptItemLabels.length > 0) {
    parts.push('Keep these existing items unchanged: ' + keptItemLabels.join(', '))
  }

  // 8. Budget tier
  parts.push(BUDGET_MODIFIERS[budgetTier] ?? BUDGET_MODIFIERS.mid)

  // 9. Quality closer
  parts.push(
    'Result: the same physical room, transformed into a beautifully staged ' +
    'space. Photorealistic interior design photography, professional staging, ' +
    'same lighting as the original photo'
  )

  const prompt = parts.join('. ')

  // 400-word hard limit (same as before — Kontext has similar context budget)
  const wordCount = prompt.split(/\s+/).length
  if (wordCount > 400) {
    throw new Error(
      `buildFluxPrompt: prompt exceeds 400 words (${wordCount} words). Trim inclusions or keptItems.`
    )
  }

  return prompt
}

// ── submitSchnellRender — text-to-image preview, no input_image ───────────────
// Schnell doesn't support input_image. Keep it as text-to-image for the fast
// preview shown during render loading — it just needs to look like a
// plausible redesign, not preserve architecture.

export async function submitSchnellRender(prompt: string): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: SCHNELL_MODEL,
    input: {
      prompt,
      num_outputs: 1,
      aspect_ratio: '4:3',
      output_format: 'jpg',
      output_quality: 80,
    },
  })
  return prediction.id
}

// ── submitRender — Kontext Pro edit on the user's actual room photo ──────────
// Takes the original room photo as `input_image` so the model preserves the
// composition and architecture. Returns prediction_id immediately — the
// status route polls until the render completes.

export async function submitRender(
  photoUrl: string,
  _referenceImageUrls: string[],
  prompt: string,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: KONTEXT_MODEL,
    input: {
      input_image: photoUrl,
      prompt,
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })
  return prediction.id
}

// ── submitArchitectureCorrection — Kontext Pro pass 2 ────────────────────────
// Pass 1 redesigns style; pass 2 takes that output and corrects any
// architectural drift (wall color, window position, ceiling fan, decor text
// on walls, etc.) so the final render unambiguously looks like the same
// physical room. Called automatically by the render status route when pass 1
// completes — returns a new prediction id to poll.

export async function submitArchitectureCorrection(
  pass1OutputUrl: string,
  _originalPhotoUrl: string,
  arch: RoomArchitecture,
): Promise<string> {
  const fixed =
    arch.fixedElements.length > 0
      ? ` Do not change: ${arch.fixedElements.join(', ')}.`
      : ''

  const correctionPrompt =
    `This is a redesigned version of a room. Correct any architectural ` +
    `differences so it looks like the original physical room. ` +
    buildPreservationInstructions(arch) +
    ` The furniture style and decor are correct — only fix the architecture ` +
    `if walls, floor, ceiling, windows, or camera angle changed.` +
    fixed +
    ` If architecture is already correct, keep the image exactly as is.`

  const prediction = await replicate.predictions.create({
    model: KONTEXT_MODEL,
    input: {
      input_image: pass1OutputUrl,
      prompt: correctionPrompt,
      output_format: 'jpg',
      output_quality: 92,
      safety_tolerance: 2,
    },
  })
  return prediction.id
}

// ── runFluxRender — synchronous variant used by the refine route ─────────────

export async function runFluxRender(
  photoUrl: string,
  _depthMapUrl: string,
  prompt: string,
  _negativePrompt: string,
  _styleStrength: number = 0.85,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: KONTEXT_MODEL,
    input: {
      input_image: photoUrl,
      prompt,
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })

  let p = prediction
  while (p.status !== 'succeeded' && p.status !== 'failed' && p.status !== 'canceled') {
    await new Promise((r) => setTimeout(r, 3000))
    p = await replicate.predictions.get(p.id)
  }

  if (p.status !== 'succeeded') {
    throw new Error(`Kontext render failed: ${p.error ?? p.status}`)
  }

  const output = p.output
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output.length > 0) return String(output[0])

  throw new Error('Unexpected output format from Kontext render')
}

// ── Re-export RoomPhysicalContext for backward compat ────────────────────────

export type RoomPhysicalContext = {
  roomLength?: number | null
  roomWidth?: number | null
  ceilingHeight?: number | null
  naturalLight?: string | null
  floorType?: string | null
  wallFinish?: string | null
  fixedElements?: string[]
  wallLayout?: {
    top: Array<{ type: string; position: number }>
    bottom: Array<{ type: string; position: number }>
    left: Array<{ type: string; position: number }>
    right: Array<{ type: string; position: number }>
  } | null
}
