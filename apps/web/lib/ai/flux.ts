import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Fingerprint dimension indices per COVA_CONTEXT.md:
// 0: Luminosity  0=Dark/Moody,        1=Bright/Airy
// 1: Density     0=Minimal,           1=Maximal
// 2: Temperature 0=Cool/Slate,        1=Warm/Amber
// 3: Form        0=Geometric,         1=Organic/Curved
// 4: Era         0=Contemporary,      1=Traditional
// 5: Texture     0=Smooth/Polished,   1=Tactile/Rough

const LUMINOSITY_MAP = {
  high: 'bright airy space flooded with natural light, open and inviting',
  low: 'moody dramatic intimate lighting, rich shadows and atmosphere',
}

const DENSITY_MAP = {
  high: 'richly layered maximalist space, curated objects and thoughtful collections',
  low: 'minimal breathing space, intentional emptiness and considered negative space',
}

const TEMPERATURE_MAP = {
  high: 'warm amber tones, honey wood, terracotta, warm whites and golden accents',
  low: 'cool slate concrete steel, cool whites and blue-grey tones',
}

const FORM_MAP = {
  high: 'organic curves natural materials rattan linen woven textures soft silhouettes',
  low: 'geometric precision clean lines structured forms sharp angles and order',
}

const ERA_MAP = {
  high: 'classic heritage antique traditional craft timeless and storied pieces',
  low: 'contemporary cutting edge ultra-modern forward-thinking design',
}

const TEXTURE_MAP = {
  high: 'tactile richness chunky knits rough linen natural stone weathered wood',
  low: 'smooth surfaces polished lacquered sleek refined and frictionless',
}

const BUDGET_MAP = {
  budget: 'affordable accessible pieces from mainstream retailers, practical and value-conscious',
  mid: 'quality mid-range furniture, good materials and solid construction',
  premium: 'elevated premium materials statement furniture investment-worthy pieces',
  luxury: 'designer brands investment pieces bespoke craftsmanship, top-tier materials',
}

function mapDimension(value: number): 'high' | 'low' {
  return value >= 0.5 ? 'high' : 'low'
}

export function buildFluxPrompt(
  fingerprint: number[],
  roomType: string,
  budgetTier: 'budget' | 'mid' | 'premium' | 'luxury',
  inclusions: string[],
  constraints: string[]
): { positive: string; negative: string } {
  const [luminosity, density, temperature, form, era, texture] = fingerprint

  const styleDescriptors = [
    LUMINOSITY_MAP[mapDimension(luminosity ?? 0.5)],
    DENSITY_MAP[mapDimension(density ?? 0.5)],
    TEMPERATURE_MAP[mapDimension(temperature ?? 0.5)],
    FORM_MAP[mapDimension(form ?? 0.5)],
    ERA_MAP[mapDimension(era ?? 0.5)],
    TEXTURE_MAP[mapDimension(texture ?? 0.5)],
  ].join(', ')

  const budgetDescriptor = BUDGET_MAP[budgetTier]

  const inclusionText =
    inclusions.length > 0
      ? `Must include: ${inclusions.map((i) => `a ${i}`).join(', ')}.`
      : ''

  const constraintText =
    constraints.length > 0 ? `Design constraints: ${constraints.join(', ')}.` : ''

  const positive = [
    `Photorealistic interior design render of a ${roomType}.`,
    styleDescriptors,
    budgetDescriptor,
    inclusionText,
    constraintText,
    'Professional interior photography, perfect lighting, high resolution, magazine quality.',
  ]
    .filter(Boolean)
    .join(' ')

  const negative = [
    'distorted walls, wrong perspective, AI artifacts, blurry,',
    'low quality, watermark, text overlay, cartoon, illustration,',
    'fisheye lens, extreme distortion, multiple rooms,',
    'people, faces, animals',
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
