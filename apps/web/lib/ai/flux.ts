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

function dimDesc(value: number, high: string, mid: string, low: string): string {
  if (value >= 0.7) return high
  if (value <= 0.3) return low
  return mid
}

const BUDGET_MAP = {
  budget: 'affordable accessible pieces from mainstream retailers, practical and value-conscious',
  mid: 'quality mid-range furniture, good materials and solid construction',
  premium: 'elevated premium materials statement furniture investment-worthy pieces',
  luxury: 'designer brands investment pieces bespoke craftsmanship, top-tier materials',
}

export function buildFluxPrompt(
  fingerprint: number[],
  roomType: string,
  budgetTier: 'budget' | 'mid' | 'premium' | 'luxury',
  inclusions: string[],
  constraints: string[]
): { positive: string; negative: string } {
  const [luminosity, density, temperature, form, era, texture, scale, nature, saturation, materialOrigin] = fingerprint

  const styleDescriptors = [
    dimDesc(
      luminosity ?? 0.5,
      'bright airy flooded with natural light',
      'comfortable balanced lighting',
      'moody dramatic intimate lighting'
    ),
    dimDesc(
      density ?? 0.5,
      'richly layered maximalist curated objects',
      'well-furnished comfortable',
      'minimal breathing space intentional emptiness'
    ),
    dimDesc(
      temperature ?? 0.5,
      'warm amber tones honey wood terracotta',
      'neutral balanced temperature',
      'cool slate concrete steel cool whites'
    ),
    dimDesc(
      form ?? 0.5,
      'organic curves natural materials rattan linen',
      'balanced forms',
      'geometric precision clean lines structured'
    ),
    dimDesc(
      era ?? 0.5,
      'classic heritage antique traditional craft',
      'transitional timeless',
      'contemporary cutting edge ultra-modern'
    ),
    dimDesc(
      texture ?? 0.5,
      'tactile richness chunky knits rough linen stone',
      'balanced texture',
      'smooth surfaces polished lacquered sleek'
    ),
    dimDesc(
      scale ?? 0.5,
      'grand expansive high ceilings statement pieces',
      'comfortable proportions',
      'intimate cozy human scale nook-like'
    ),
    dimDesc(
      nature ?? 0.5,
      'abundant plants biophilic natural wood stone',
      'few natural elements',
      'urban manufactured no plants industrial'
    ),
    dimDesc(
      saturation ?? 0.5,
      'bold rich color jewel tones confident palette',
      'moderate color presence',
      'monochromatic muted tonal restrained'
    ),
    dimDesc(
      materialOrigin ?? 0.5,
      'artisan handmade pottery woven craft visible',
      'mix of handmade and manufactured',
      'precision manufactured factory perfect'
    ),
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
