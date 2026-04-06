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

  // Helper: only apply descriptor if signal is strong
  const hi = (v: number) => (v ?? 0.5) > 0.65
  const lo = (v: number) => (v ?? 0.5) < 0.35

  // ── ATMOSPHERE (luminosity) ────────────────────────────────────────────
  const atmosphereDesc = hi(luminosity)
    ? 'Flooded with natural light from large windows. Bright airy atmosphere with soft diffused shadows and sun-warmed surfaces.'
    : lo(luminosity)
    ? 'Intimate moody atmosphere. Warm pools of light from accent fixtures. Deep rich shadows. Dramatic chiaroscuro lighting.'
    : 'Comfortable balanced lighting. Warm ambient glow from a mix of natural and soft artificial sources.'

  // ── MATERIALS & COLOR (temperature + materialOrigin) ──────────────────
  const materialsDesc = hi(temperature)
    ? hi(materialOrigin)
      ? 'Materials: solid walnut wood with visible grain, handthrown terracotta ceramics, woven rattan, aged brass hardware, warm honey-toned oak. Warm amber and terracotta color palette throughout.'
      : 'Materials: warm oak flooring, brushed brass fixtures, linen upholstery, warm cream and amber tones. Honey-warm color palette.'
    : lo(temperature)
    ? hi(materialOrigin)
      ? 'Materials: raw concrete surfaces, hand-formed grey ceramics, blackened steel, cool slate stone, white oak with pale finish. Cool grey and slate blue color palette.'
      : 'Materials: polished concrete, brushed chrome fixtures, cool grey stone, crisp white walls, silver-toned metals. Minimal cool palette.'
    : 'Materials: neutral warm-white walls, natural wood tones in medium warmth, mix of warm and cool-toned materials. Balanced neutral palette.'

  // ── FURNITURE STYLE (form + era + scale) ──────────────────────────────
  const furnitureDesc = (() => {
    const formDesc = hi(form)
      ? 'Organic curved furniture silhouettes. Rounded edges. Sculptural biomorphic shapes. Flowing natural forms.'
      : lo(form)
      ? 'Strict geometric furniture. Sharp clean architectural lines. Angular precise silhouettes. Structured grid-like arrangement.'
      : 'Transitional furniture forms. Mix of curved and angular elements.'

    const eraDesc = hi(era)
      ? 'Traditional craft details. Antique and vintage furniture with time-worn patina. Heritage materials. Collected-over-decades aesthetic.'
      : lo(era)
      ? 'Ultra-contemporary 2025 furniture design. Cutting-edge silhouettes. Designer statement pieces. Current interior design trends.'
      : 'Transitional style. Mix of timeless and contemporary pieces.'

    const scaleDesc = hi(scale)
      ? 'Grand statement furniture pieces. Bold visual weight and oversized proportions. Large-scale art on walls.'
      : lo(scale)
      ? 'Delicate furniture with fine legs and intimate proportions. Human-scale cozy feel. Careful small-scale details.'
      : 'Well-proportioned furniture appropriate to the space.'

    return `${formDesc} ${eraDesc} ${scaleDesc}`
  })()

  // ── TEXTURE ───────────────────────────────────────────────────────────
  const textureDesc = hi(texture)
    ? 'Rich tactile surfaces throughout: chunky bouclé upholstery, rough natural linen textiles, handwoven jute rug, rattan accent pieces, raw wood grain visible, handthrown ceramic vessels with irregular surfaces.'
    : lo(texture)
    ? 'Smooth polished surfaces throughout: lacquered furniture, smooth full-grain leather, glossy ceramics, polished stone countertops, pristine glass and chrome.'
    : 'Mix of smooth and textured surfaces in balance.'

  // ── DENSITY & NATURE ──────────────────────────────────────────────────
  const densityNatureDesc = (() => {
    const densityText = hi(density)
      ? 'Richly layered interior with many carefully curated objects, stacked books, layered textiles, art on every wall, collected objects on shelves.'
      : lo(density)
      ? 'Spare minimal interior. Very few objects. Intentional emptiness. Only absolutely essential pieces. Maximum negative space.'
      : 'Well-furnished with thoughtful negative space between pieces.'

    const natureText = hi(nature)
      ? 'Abundant biophilic elements: large fiddle leaf fig, trailing pothos, clustered plants in terracotta pots, natural wood with visible grain, stone surfaces, woven natural fiber textiles.'
      : lo(nature)
      ? 'Urban interior. No plants. Manufactured materials. Industrial city apartment aesthetic.'
      : 'Few natural elements. One or two simple plants.'

    return `${densityText} ${natureText}`
  })()

  // ── COLOR SATURATION ──────────────────────────────────────────────────
  const saturationDesc = hi(saturation)
    ? 'Bold confident color choices. Rich jewel-tone accents: deep emerald, ochre, or burnt sienna used as statement color moments.'
    : lo(saturation)
    ? 'Restrained monochromatic palette. Quiet tonal variations of a single hue. Muted desaturated tones throughout. Sophisticated color restraint.'
    : ''

  // ── ROOM PHYSICAL CONTEXT ─────────────────────────────────────────────
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
        'Hardwood': 'existing hardwood floors must be preserved',
        'Light laminate': 'existing light laminate flooring',
        'Carpet': 'existing carpet flooring',
        'Tile': 'existing tile floor',
        'Concrete': 'existing concrete floor',
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
        'Exposed brick': 'exposed brick walls must be preserved as feature wall',
        'Wallpaper': 'wallpapered walls',
        'Wood paneling': 'wood-paneled walls must be preserved',
        'Concrete': 'raw concrete walls must be preserved',
      }
      const wallDesc = wallMap[roomContext.wallFinish]
      if (wallDesc) roomContextParts.push(wallDesc)
    }
    if (roomContext.fixedElements && roomContext.fixedElements.length > 0) {
      const elementMap: Record<string, string> = {
        'Fireplace': 'fireplace as focal point on one wall — must be preserved',
        'Built-in shelves': 'built-in shelving — must be preserved',
        'Exposed brick': 'exposed brick feature wall — must be preserved',
        'Open to kitchen': 'open plan connected to kitchen',
        'Structural column': 'structural column in room — cannot be moved',
        'Radiator': 'radiator on wall — must be designed around',
        'Bay window': 'bay window — must be preserved as focal point',
        'Sloped ceiling': 'sloped ceiling — furniture must accommodate',
      }
      const elements = roomContext.fixedElements
        .map((e) => elementMap[e])
        .filter(Boolean) as string[]
      if (elements.length > 0) {
        roomContextParts.push(`Fixed architectural elements: ${elements.join(', ')}`)
      }
    }
  }
  const roomContextText = roomContextParts.length > 0
    ? roomContextParts.join('. ')
    : ''

  // ── KEPT ITEMS ────────────────────────────────────────────────────────
  const keptItemsText = keptItems && keptItems.length > 0
    ? `Existing furniture to preserve exactly as-is: ${keptItems.join(', ')}. These items must appear unchanged in their current positions.`
    : ''

  // ── BUDGET QUALITY ────────────────────────────────────────────────────
  const budgetDesc = {
    budget: 'Accessible affordable furniture from IKEA, Target, Wayfair. Budget-conscious but well-styled.',
    mid: 'Quality mid-range furniture from Article, CB2, West Elm. Well-made pieces with good design.',
    premium: 'Premium furniture from Restoration Hardware, Design Within Reach. Investment pieces with exceptional quality.',
    luxury: 'Luxury designer furniture. Bespoke pieces, rare materials, collector items. No budget constraints.',
  }[budgetTier]

  // ── INCLUSIONS & CONSTRAINTS ──────────────────────────────────────────
  const inclusionText = inclusions.length > 0
    ? `Must include these specific items in the design: ${inclusions.map(i => `a ${i}`).join(', ')}.`
    : ''

  const constraintText = constraints.length > 0
    ? `Design must respect these constraints: ${constraints.join(', ')}.`
    : ''

  // ── ASSEMBLE POSITIVE PROMPT ──────────────────────────────────────────
  const positive = [
    `Photorealistic interior design photograph of a beautifully redesigned ${roomType.replace(/_/g, ' ')}.`,
    atmosphereDesc,
    materialsDesc,
    furnitureDesc,
    textureDesc,
    densityNatureDesc,
    saturationDesc,
    roomContextText,
    keptItemsText,
    budgetDesc,
    inclusionText,
    constraintText,
    'Shot on Hasselblad medium format camera.',
    'Interior design magazine quality.',
    'Ultra-high resolution, sharp focus throughout, perfect composition.',
    'No people, no animals, no text overlays.',
  ].filter(Boolean).join(' ')

  // ── NEGATIVE PROMPT ───────────────────────────────────────────────────
  const negative = [
    'distorted perspective, wrong proportions, bent walls,',
    'AI artifacts, blurry, low resolution, watermark,',
    'cartoon, illustration, 3D render look, CGI,',
    'fisheye lens, extreme distortion, multiple rooms visible,',
    'people, faces, humans, animals, pets,',
    'text overlays, logos, borders, frames,',
    'dark vignette, overexposed, underexposed,',
    'cluttered mess, dirty, unkempt, chaotic,',
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
