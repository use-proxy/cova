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
  roomContext?: RoomPhysicalContext
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

  // Build room physical context
  const roomContextParts: string[] = []
  if (roomContext) {
    if (roomContext.roomLength && roomContext.roomWidth) {
      const sqft = Math.round(roomContext.roomLength * roomContext.roomWidth)
      roomContextParts.push(`${sqft} square foot room`)
    }
    if (roomContext.ceilingHeight) {
      roomContextParts.push(`${roomContext.ceilingHeight}ft ceiling height`)
    }
    if (roomContext.naturalLight) {
      const lightMap: Record<string, string> = {
        'No windows': 'no natural light, artificial lighting only',
        'One small window': 'limited natural light from one small window',
        'One large window': 'good natural light from one large window',
        'Multiple windows': 'well-lit with multiple windows',
        'Floor-to-ceiling windows': 'abundant natural light, floor-to-ceiling windows',
      }
      const lightDesc = lightMap[roomContext.naturalLight]
      if (lightDesc) roomContextParts.push(lightDesc)
    }
    if (roomContext.floorType) {
      const floorMap: Record<string, string> = {
        'Hardwood': 'hardwood floors',
        'Light laminate': 'light laminate flooring',
        'Carpet': 'carpeted floor',
        'Tile': 'tile floor',
        'Concrete': 'concrete floor',
      }
      const floorDesc = floorMap[roomContext.floorType]
      if (floorDesc) roomContextParts.push(floorDesc)
    }
    if (
      roomContext.wallFinish &&
      roomContext.wallFinish !== 'Painted (standard)' &&
      roomContext.wallFinish !== 'Unsure'
    ) {
      const wallMap: Record<string, string> = {
        'Exposed brick': 'exposed brick walls',
        'Wallpaper': 'wallpapered walls',
        'Wood paneling': 'wood-paneled walls',
        'Concrete': 'raw concrete walls',
      }
      const wallDesc = wallMap[roomContext.wallFinish]
      if (wallDesc) roomContextParts.push(wallDesc)
    }
    if (roomContext.fixedElements && roomContext.fixedElements.length > 0) {
      const elementMap: Record<string, string> = {
        'Fireplace': 'fireplace as focal point on one wall',
        'Built-in shelves': 'built-in shelving on walls',
        'Exposed brick': 'exposed brick feature wall',
        'Open to kitchen': 'open plan connected to kitchen',
        'Structural column': 'structural column in room',
        'Radiator': 'radiator on wall',
        'Bay window': 'bay window',
        'Sloped ceiling': 'sloped ceiling',
      }
      const elements = roomContext.fixedElements
        .map((e) => elementMap[e])
        .filter(Boolean) as string[]
      if (elements.length > 0) {
        roomContextParts.push(`existing fixed elements: ${elements.join(', ')}`)
      }
    }
    if (roomContext.wallLayout) {
      const layout = roomContext.wallLayout
      const wallNames: Record<string, string> = {
        top: 'back wall', bottom: 'front wall',
        left: 'left wall', right: 'right wall',
      }
      const wallDesc: string[] = []
      Object.entries(layout).forEach(([wall, items]) => {
        if (!items || items.length === 0) return
        const windows = items.filter((i) => i.type === 'window').length
        const doors = items.filter((i) => i.type === 'door').length
        const parts: string[] = []
        if (windows > 0) parts.push(`${windows} window${windows > 1 ? 's' : ''}`)
        if (doors > 0) parts.push(`${doors} door${doors > 1 ? 's' : ''}`)
        if (parts.length > 0)
          wallDesc.push(`${wallNames[wall]} has ${parts.join(' and ')}`)
      })
      if (wallDesc.length > 0) {
        roomContextParts.push(wallDesc.join(', '))
      }
    }
  }

  const roomContextText = roomContextParts.length > 0
    ? roomContextParts.join(', ')
    : ''

  const positive = [
    `Photorealistic interior design render of a ${roomType}.`,
    styleDescriptors,
    budgetDescriptor,
    roomContextText,
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
