import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Fingerprint dimension indices (10-dim system):
// 0: Luminosity     0=Dark/Moody         1=Bright/Airy
// 1: Density        0=Minimal            1=Maximalist
// 2: Temperature    0=Cool/Slate         1=Warm/Amber
// 3: Form           0=Geometric          1=Organic/Curved
// 4: Era            0=Contemporary       1=Traditional
// 5: Texture        0=Smooth             1=Tactile/Rough
// 6: Scale          0=Intimate           1=Grand/Expansive
// 7: Nature         0=Urban/Manufactured 1=Biophilic
// 8: Saturation     0=Muted/Mono         1=Bold/Colorful
// 9: MaterialOrigin 0=Manufactured       1=Artisanal

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

export function buildFluxPrompt(
  fingerprint: number[],
  roomType: string,
  budgetTier: 'budget' | 'mid' | 'premium' | 'luxury',
  inclusions: string[],
  constraints: string[],
  roomContext?: RoomPhysicalContext,
  keptItems?: string[],
): { positive: string; negative: string } {

  const [
    luminosity, density, temperature, form, era,
    texture, scale, nature, saturation, materialOrigin
  ] = fingerprint

  const hi = (v: number) => (v ?? 0.5) > 0.65
  const lo = (v: number) => (v ?? 0.5) < 0.35

  // Build style description — SHORT and specific for Kontext
  // Max 3-4 style descriptors, each concrete and visual
  const styleTerms: string[] = []

  // Mood/atmosphere (1 term)
  if (hi(luminosity)) styleTerms.push('bright airy natural light')
  else if (lo(luminosity)) styleTerms.push('moody intimate warm lighting')

  // Material palette (1-2 terms, most important)
  if (hi(temperature) && hi(texture))
    styleTerms.push('warm walnut wood, bouclé upholstery, aged brass, terracotta')
  else if (hi(temperature))
    styleTerms.push('warm oak, linen, honey tones, brass fixtures')
  else if (lo(temperature) && lo(texture))
    styleTerms.push('cool concrete, polished chrome, grey stone, glass')
  else if (lo(temperature))
    styleTerms.push('cool greys, brushed steel, white marble')
  else
    styleTerms.push('natural wood tones, neutral textiles')

  // Furniture character (1 term)
  if (hi(form) && hi(era))
    styleTerms.push('organic curved vintage furniture')
  else if (hi(form))
    styleTerms.push('curved organic contemporary furniture')
  else if (lo(form) && lo(era))
    styleTerms.push('geometric ultra-modern furniture')
  else if (lo(form))
    styleTerms.push('clean-lined structured furniture')

  // Plants/nature (optional, only if strong signal)
  if (hi(nature)) styleTerms.push('abundant indoor plants')

  // Color pop (optional, only if strong signal)
  if (hi(saturation)) styleTerms.push('bold jewel-tone accent colors')
  else if (lo(saturation)) styleTerms.push('muted monochromatic palette')

  // Suppress unused vars (density, scale, materialOrigin used for future expansion)
  void density; void scale; void materialOrigin

  const styleDesc = styleTerms.join(', ')

  // Budget qualifier
  const budgetQualifier = {
    budget: 'affordable IKEA and Wayfair pieces',
    mid: 'quality mid-range furniture',
    premium: 'premium designer furniture',
    luxury: 'luxury bespoke furniture',
  }[budgetTier]

  // Inclusions (keep short)
  const inclusionText = inclusions.length > 0
    ? `Include: ${inclusions.slice(0, 3).join(', ')}.`
    : ''

  // Constraints
  const constraintText = constraints.includes('I rent')
    ? 'No wall modifications.'
    : ''

  // Kept items — critical: tell Kontext exactly what NOT to change
  const keptText = keptItems && keptItems.length > 0
    ? `Keep unchanged: ${keptItems.join(', ')}.`
    : ''

  // Room context — only most important physical facts
  const contextParts: string[] = []
  if (roomContext?.floorType && roomContext.floorType !== 'Unsure') {
    contextParts.push(`${roomContext.floorType.toLowerCase()} floor`)
  }
  if (roomContext?.wallFinish && !['Painted (standard)', 'Unsure'].includes(roomContext.wallFinish)) {
    contextParts.push(roomContext.wallFinish.toLowerCase())
  }
  const contextText = contextParts.length > 0
    ? `Existing: ${contextParts.join(', ')}.`
    : ''

  // KONTEXT PROMPT: Short editing instruction format
  // Target: under 80 words total
  const positive = [
    `Redesign this ${roomType.replace(/_/g, ' ')} interior completely.`,
    `Style: ${styleDesc}.`,
    `Use ${budgetQualifier}.`,
    keptText,
    inclusionText,
    constraintText,
    contextText,
    'Photorealistic interior design photo. Magazine quality. No people.',
  ].filter(Boolean).join(' ')

  const negative = [
    'text in image, words visible, prompt text rendered,',
    'blurry, distorted, low quality, watermark,',
    'cartoon, illustration, 3D render look,',
    'people, faces, animals,',
    'rotated, sideways, upside down,',
  ].join(' ')

  return { positive, negative }
}

export async function runFluxRender(
  photoUrl: string,
  _depthMapUrl: string,
  prompt: string,
  _negativePrompt: string,
  styleStrength: number = 0.85
): Promise<string> {
  const output = await replicate.run('black-forest-labs/flux-kontext-pro', {
    input: {
      prompt,
      input_image: photoUrl,
      guidance: styleStrength * 10,
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })

  if (Array.isArray(output) && output.length > 0) {
    return output[0] as string
  }

  if (typeof output === 'string') {
    return output
  }

  throw new Error('Unexpected output format from FLUX render')
}
