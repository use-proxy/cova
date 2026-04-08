import Replicate from 'replicate'
import type { StyleFingerprint } from '@/types/fingerprint'
import type { RoomAnalysis } from '@/lib/store/room'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

const MODEL = 'black-forest-labs/flux-2-pro'

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

const NEGATIVE_SUFFIX =
  'Negative: distorted walls, wrong perspective, AI artifacts, text, watermarks, people, animals'

// ── buildFluxPrompt ───────────────────────────────────────────────────────────

export interface BuildFluxPromptParams {
  fingerprint: StyleFingerprint
  roomType: string
  budgetTier: 'budget' | 'mid' | 'premium' | 'luxury'
  inclusions: string[]
  constraints: string[]
  keptItemLabels: string[]
  roomAnalysis: RoomAnalysis | null
}

export function buildFluxPrompt(params: BuildFluxPromptParams): string {
  const { fingerprint, roomType, budgetTier, inclusions, constraints, keptItemLabels, roomAnalysis } = params
  const d = fingerprint.dimensions

  // 1. Room type opener
  const parts: string[] = [`A ${roomType.replace(/_/g, ' ')},`]

  // 2. Active dimension descriptors (only outside neutral band)
  const descriptorParts: string[] = []
  for (const [key, { lo, hi }] of Object.entries(DESCRIPTORS) as [DimKey, { lo: string; hi: string }][]) {
    const v = d[key]
    if (v < -NEUTRAL_BAND) descriptorParts.push(lo)
    else if (v > NEUTRAL_BAND) descriptorParts.push(hi)
    // values in [-0.3, 0.3] are skipped entirely
  }
  if (descriptorParts.length > 0) parts.push(descriptorParts.join(', '))

  // 3. Budget modifier
  parts.push(BUDGET_MODIFIERS[budgetTier] ?? BUDGET_MODIFIERS.mid)

  // 4. Inclusions (must-haves from user)
  if (inclusions.length > 0) {
    parts.push(`including ${inclusions.slice(0, 4).join(', ')}`)
  }

  // 5. Constraints (e.g. "I rent", "I have pets")
  if (constraints.length > 0) {
    parts.push(`constraints: ${constraints.slice(0, 3).join(', ')}`)
  }

  // 6. Room analysis context (floor type, architectural features)
  if (roomAnalysis) {
    const feats = roomAnalysis.architectural_features?.slice(0, 2) ?? []
    if (feats.length > 0 || roomAnalysis.floor_type) {
      const contextParts: string[] = []
      if (roomAnalysis.floor_type) contextParts.push(`${roomAnalysis.floor_type} floors`)
      if (feats.length > 0) contextParts.push(feats.join(', '))
      parts.push(`existing: ${contextParts.join(', ')}`)
    }
  }

  // 7. Kept items
  if (keptItemLabels.length > 0) {
    parts.push(`preserving existing ${keptItemLabels.join(', ')}`)
  }

  // 8. Fixed negative suffix
  parts.push(NEGATIVE_SUFFIX)

  const prompt = parts.join('. ')

  // 400-word hard limit
  const wordCount = prompt.split(/\s+/).length
  if (wordCount > 400) {
    throw new Error(
      `buildFluxPrompt: prompt exceeds 400 words (${wordCount} words). Trim inclusions or keptItems.`
    )
  }

  return prompt
}

// ── submitSchnellRender — fast Schnell preview, no input images ───────────────

export async function submitSchnellRender(prompt: string): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: 'black-forest-labs/flux-schnell',
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

// ── submitRender — async, returns prediction_id immediately ───────────────────

export async function submitRender(
  photoUrl: string,
  referenceImageUrls: string[],
  prompt: string,
): Promise<string> {
  const inputImages = [photoUrl, ...referenceImageUrls].filter(Boolean)

  const prediction = await replicate.predictions.create({
    model: MODEL,
    input: {
      prompt,
      input_images: inputImages,
      aspect_ratio: inputImages.length > 0 ? 'match_input_image' : '1:1',
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })

  return prediction.id
}

// ── runFluxRender — synchronous, polls until complete (used by refine route) ──

export async function runFluxRender(
  photoUrl: string,
  _depthMapUrl: string,
  prompt: string,
  _negativePrompt: string,
  _styleStrength: number = 0.85,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: MODEL,
    input: {
      prompt,
      input_images: [photoUrl],
      aspect_ratio: 'match_input_image',
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })

  // Poll until complete
  let p = prediction
  while (p.status !== 'succeeded' && p.status !== 'failed' && p.status !== 'canceled') {
    await new Promise((r) => setTimeout(r, 3000))
    p = await replicate.predictions.get(p.id)
  }

  if (p.status !== 'succeeded') {
    throw new Error(`FLUX render failed: ${p.error ?? p.status}`)
  }

  const output = p.output
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output.length > 0) return output[0] as string

  throw new Error('Unexpected output format from FLUX render')
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
