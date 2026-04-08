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
// Multi-image Kontext takes two input images (input_image_1 = style reference,
// input_image_2 = user's room photo). Verified 2026-04-08 end-to-end: the
// output adopts the interior-design style of image 1 while preserving the
// layout, architecture and camera angle of image 2. This is the highest-impact
// upgrade for style accuracy over the single-image Kontext endpoint.
const MULTI_KONTEXT_MODEL = 'flux-kontext-apps/multi-image-kontext-pro'

// ── Descriptor table — authoritative, do not modify ───────────────────────────

type DimKey = keyof StyleFingerprint['dimensions']

// All dimension values are in the [0, 1] range with 0.5 as the neutral midpoint.
// `lo` describes values approaching 0; `hi` describes values approaching 1.
const DESCRIPTORS: Record<DimKey, { lo: string; hi: string }> = {
  colorTemperature: {
    lo: 'icy cool, concrete grey, slate, steel blue, cold whites',
    hi: 'warm amber tones, honey wood, terracotta, beeswax',
  },
  colorSaturation: {
    lo: 'achromatic palette, near-neutral, greige, white, grey, black',
    hi: 'rich saturated color, bold hues, high-contrast palette, vivid accents',
  },
  density: {
    lo: 'stark, near-empty, intentional void, almost no objects',
    hi: 'richly layered, curated objects, maximalist, every surface considered',
  },
  formality: {
    lo: 'casual relaxed setting, lived-in, nothing perfectly arranged',
    hi: 'formal structured arrangement, symmetrical, precisely placed',
  },
  era: {
    lo: 'ultra-modern, futuristic, cutting-edge contemporary, no historical reference',
    hi: 'classic heritage, antique references, traditional craft, heirloom quality',
  },
  material: {
    lo: 'synthetic manufactured surfaces, polished steel, glass, lacquered panels',
    hi: 'natural organic materials, raw linen, reclaimed wood, stone, rattan, jute',
  },
  texture: {
    lo: 'mirror-smooth, lacquered, polished stone, glass, zero tactile variation',
    hi: 'tactile richness, chunky knits, rough linen, natural stone, woven rattan',
  },
  pattern: {
    lo: 'pattern-free, solid colors throughout, plain surfaces, no prints',
    hi: 'pattern-rich, geometric wallpaper, printed textiles, layered prints',
  },
  lineQuality: {
    lo: 'hyper-geometric, hard right angles, razor-sharp lines, zero curves',
    hi: 'organic curves, soft rounded forms, arched silhouettes, no hard edges',
  },
  lightPreference: {
    lo: 'cozy intimate lamp light, warm pools of golden light, soft shadows',
    hi: 'bright airy space, flooded with natural daylight, sun-drenched',
  },
  nature: {
    lo: 'urban no-plant interior, no greenery, no botanical elements',
    hi: 'biophilic abundance, monstera, ferns, trailing pothos, living moss',
  },
  culturalInfluence: {
    lo: 'pure Western contemporary, no cultural references, mainstream',
    hi: 'globally eclectic, Moroccan tile, Japanese ceramics, kente textiles',
  },
}

// Strong band: a dimension is "directional" when it deviates from 0.5 by more
// than NEUTRAL_BAND (i.e. v < 0.3 or v > 0.7). Values inside the neutral band
// produce no descriptor text.
const NEUTRAL_MIDPOINT = 0.5
const NEUTRAL_BAND = 0.2

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

// Material palette derived from fingerprint dimensions. Stating materials up
// front gives Kontext a concrete target to latch onto (research finding: the
// model responds better to material names than abstract style adjectives).
// Keep tight — at most 3 comma-separated items so the full prompt stays
// inside Kontext's 80-word sweet spot.
function getMaterialPalette(d: StyleFingerprint['dimensions']): string {
  const items: string[] = []
  if (d.nature > 0.7) items.push('rattan', 'linen', 'live plants')
  if (d.texture > 0.7) items.push('rough linen', 'woven cotton')
  if (d.texture < 0.3) items.push('polished marble', 'glass')
  if (d.colorTemperature > 0.7) items.push('warm oak', 'aged brass')
  if (d.colorTemperature < 0.3) items.push('concrete', 'brushed steel')
  if (d.material > 0.7) items.push('hand-thrown ceramics')
  if (d.era > 0.7) items.push('heirloom textiles')
  if (d.era < 0.3) items.push('brushed nickel')
  const deduped = Array.from(new Set(items)).slice(0, 3)
  if (deduped.length === 0) return ''
  return 'Materials: ' + deduped.join(', ')
}

function getLightingInstruction(d: StyleFingerprint['dimensions']): string {
  if (d.lightPreference > 0.7) return 'Bright natural daylight, airy atmosphere'
  if (d.lightPreference < 0.3) return 'Warm intimate lamp light, cozy shadows'
  return 'Balanced natural ambient light'
}

// Select the top-K dominant descriptors (by distance from the neutral midpoint).
function dominantDescriptors(
  d: StyleFingerprint['dimensions'],
  k: number,
): string[] {
  const entries = (Object.keys(DESCRIPTORS) as DimKey[])
    .map((key) => ({ key, v: d[key], dev: d[key] - NEUTRAL_MIDPOINT }))
    .filter((e) => Math.abs(e.dev) > NEUTRAL_BAND)
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
    .slice(0, k)
  return entries.map((e) =>
    e.dev > 0 ? DESCRIPTORS[e.key].hi : DESCRIPTORS[e.key].lo,
  )
}

export function buildFluxPrompt(params: BuildFluxPromptParams): string {
  const { fingerprint, roomType, budgetTier, inclusions, keptItemLabels, preservationInstructions } = params
  const d = fingerprint.dimensions
  const roomTypeStr = roomType.replace(/_/g, ' ')

  // Research findings incorporated here (2026-04-08):
  //   • Declare material palette before abstract style words.
  //   • Lead with transformation intent.
  //   • State lighting explicitly (derived from luminosity dimension).
  //   • Include one "lived-in" realism cue.
  //   • End with camera/lens language — Kontext uses the closer as a strong
  //     rendering style hint.
  //   • Target <80 words; trim descriptors to top-4 dominant dimensions.

  // Per-part word budget accounting — the goal is ≤80 words for the
  // "core" prompt (intent + descriptors + REPLACE/ADD + lighting + camera),
  // and the Gemini preservation line + kept items are appended on top since
  // they're hard constraints the model must honor regardless of length.
  const buildAt = (descriptorCount: number): { prompt: string; coreWords: number } => {
    const core: string[] = []

    // 1. Transformation intent (lean)
    core.push(`Redesign this ${roomTypeStr}`)

    // 2. Material palette (concrete names beat abstract style words)
    const palette = getMaterialPalette(d)
    if (palette) core.push(palette)

    // 3. Top-N dominant style descriptors
    const descriptors = dominantDescriptors(d, descriptorCount)
    if (descriptors.length > 0) core.push(descriptors.join(', '))

    // 4. REPLACE clause (tight)
    core.push('Replace all furniture, bedding, rugs, art and decor')

    // 5. ADD clause — user's inclusion list
    if (inclusions.length > 0) {
      core.push('Add: ' + inclusions.slice(0, 3).join(', '))
    }

    // 6. Lived-in realism cue (single short phrase)
    core.push('One lived-in detail: a book on a nightstand or throw on an armrest')

    // 7. Lighting (derived from luminosity)
    core.push(getLightingInstruction(d))

    // 8. Budget tier
    core.push(BUDGET_MODIFIERS[budgetTier] ?? BUDGET_MODIFIERS.mid)

    // 9. Camera closer — strong rendering hint (final position)
    core.push(
      'Shot on Canon R5 24mm f/8, soft window light with warm 2700K lamps, photorealistic, Architectural Digest',
    )

    const coreStr = core.join('. ')
    const coreWords = coreStr.split(/\s+/).length

    // Append preserve clauses as hard constraints — excluded from the 80-word
    // core budget because Gemini output is variable-length and non-negotiable.
    const tail: string[] = []
    if (preservationInstructions && preservationInstructions.trim()) {
      tail.push(preservationInstructions.trim())
    } else {
      tail.push(
        'PRESERVE exactly: wall color, ceiling, floor, windows, wall decor, camera angle, room layout',
      )
    }
    if (keptItemLabels.length > 0) {
      tail.push('Keep unchanged: ' + keptItemLabels.join(', '))
    }

    const prompt = [coreStr, ...tail].join('. ')
    return { prompt, coreWords }
  }

  // Try with 4 descriptors, fall back to fewer if core exceeds 80-word budget.
  let result = buildAt(4)
  if (result.coreWords > 80) result = buildAt(3)
  if (result.coreWords > 80) result = buildAt(2)
  if (result.coreWords > 80) result = buildAt(1)
  if (result.coreWords > 80) result = buildAt(0)

  // 350-word absolute cap — Kontext Pro's real limit is ~512 tokens (≈380
  // words for English). We target 350 to leave a safe buffer for tokenization
  // overhead. If the combined prompt exceeds this, truncate silently (never
  // throw): a truncated prompt still produces a render, while an error
  // produces nothing. The tail (Gemini preservation + kept items) is what
  // typically blows past budget, so we truncate it word-by-word from the end
  // while preserving the core transformation prompt in full.
  const MAX_WORDS = 350
  const totalWords = result.prompt.split(/\s+/).filter(Boolean).length
  if (totalWords > MAX_WORDS) {
    const words = result.prompt.split(/\s+/).filter(Boolean)
    const truncated = words.slice(0, MAX_WORDS).join(' ')
    console.warn(
      `[buildFluxPrompt] Prompt was ${totalWords} words, truncated to ${MAX_WORDS} ` +
        `(preservation detail trimmed; core transformation preserved).`,
    )
    return truncated
  }

  return result.prompt
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
      output_format: 'png',
    },
  })
  return prediction.id
}

// Multi-image Kontext Pro — accepts a style reference image + the user's room
// photo and produces a redesign that adopts the style of image 1 while
// preserving the layout of image 2. Field names verified from the endpoint
// schema on 2026-04-08: input_image_1 and input_image_2 (not image_1/image_2).
export async function submitMultiImageRender(
  photoUrl: string,
  styleReferenceUrl: string,
  prompt: string,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: MULTI_KONTEXT_MODEL,
    input: {
      input_image_1: styleReferenceUrl, // image 1 drives style
      input_image_2: photoUrl,          // image 2 = room to transform
      prompt,
      output_format: 'png',
      safety_tolerance: 2,
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
      output_format: 'png',
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
      output_format: 'png',
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
      output_format: 'png',
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
