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

  const roomLabel = roomType.replace(/_/g, ' ')

  // ── Layer 1: Action directive ────────────────────────────────────────────────
  const layer1 = `Restyle this ${roomLabel}.`

  // ── Layer 2: Spatial constraints + natural light ─────────────────────────────
  const spatialParts: string[] = []

  if (roomContext?.roomLength && roomContext?.roomWidth) {
    const sqft = Math.round(roomContext.roomLength * roomContext.roomWidth)
    if (sqft < 150) spatialParts.push('intimate small room — keep furniture low-profile and space-saving')
    else if (sqft < 300) spatialParts.push('medium-sized room — standard furniture proportions')
    else spatialParts.push('large spacious room — can accommodate statement pieces')
  }

  if (roomContext?.ceilingHeight) {
    if (roomContext.ceilingHeight >= 10)
      spatialParts.push('dramatic high ceilings — use tall furniture and vertical art')
    else if (roomContext.ceilingHeight <= 7)
      spatialParts.push('low ceilings — keep all furniture low-profile')
  }

  const naturalLight = roomContext?.naturalLight ?? null
  if (naturalLight) {
    if (naturalLight.toLowerCase().includes('lots') || naturalLight.toLowerCase().includes('lot'))
      spatialParts.push('sun-drenched, maximize natural light, position furniture to not block windows')
    else if (naturalLight.toLowerCase().includes('some'))
      spatialParts.push('balanced natural and artificial lighting')
    else if (naturalLight.toLowerCase().includes('little') || naturalLight.toLowerCase().includes('none') || naturalLight.toLowerCase().includes('no '))
      spatialParts.push('warm artificial lighting strategy, layered lamps, avoid dark corners')
  }

  const layer2 = spatialParts.length > 0 ? spatialParts.join('. ') + '.' : ''

  // ── Layer 3: Style descriptors from all 10 fingerprint dimensions ────────────
  const styleTerms: string[] = []

  if (hi(luminosity)) styleTerms.push('bright airy natural light throughout')
  else if (lo(luminosity)) styleTerms.push('moody intimate warm pools of accent lighting')

  if (hi(density)) styleTerms.push('richly layered, many curated objects, stacked books, collected items')
  else if (lo(density)) styleTerms.push('spare minimal, very few objects, intentional emptiness')

  if (hi(temperature) && hi(materialOrigin))
    styleTerms.push('warm walnut wood, bouclé upholstery, aged brass, terracotta ceramics')
  else if (hi(temperature))
    styleTerms.push('warm oak, linen upholstery, brushed brass')
  else if (lo(temperature) && lo(materialOrigin))
    styleTerms.push('cool concrete, polished chrome, grey stone, glass')
  else if (lo(temperature))
    styleTerms.push('cool slate, hand-formed grey ceramics, blackened steel')
  else
    styleTerms.push('natural wood tones, neutral textiles')

  if (hi(form)) styleTerms.push('curved organic furniture silhouettes, rounded edges')
  else if (lo(form)) styleTerms.push('geometric angular furniture, sharp clean lines')

  if (hi(era)) styleTerms.push('vintage heritage furniture, time-worn patina, collected aesthetic')
  else if (lo(era)) styleTerms.push('ultra-contemporary 2025 designer furniture')

  if (hi(texture)) styleTerms.push('chunky bouclé upholstery, raw linen, handwoven jute, rattan')
  else if (lo(texture)) styleTerms.push('smooth polished surfaces, lacquered furniture, glossy ceramics')

  if (hi(scale)) styleTerms.push('large statement pieces, dramatic proportions')
  else if (lo(scale)) styleTerms.push('intimate human-scale, cozy proportions')

  if (hi(nature)) styleTerms.push('abundant indoor plants, fiddle leaf fig, trailing pothos')
  else if (lo(nature)) styleTerms.push('urban no-plant industrial apartment aesthetic')

  if (hi(saturation)) styleTerms.push('bold jewel-tone accent colors, rich confident palette')
  else if (lo(saturation)) styleTerms.push('muted monochromatic, restrained tonal palette')

  if (!hi(temperature) && !lo(temperature)) {
    if (hi(materialOrigin)) styleTerms.push('handcrafted artisanal, visible craftsmanship')
    else if (lo(materialOrigin)) styleTerms.push('precision-manufactured, machine-perfect surfaces')
  }

  const layer3 = styleTerms.join(', ') + '.'

  // ── Layer 4: Surface preservation ───────────────────────────────────────────
  const surfaceParts: string[] = []
  if (roomContext?.floorType && !['Unsure', 'Mixed / unsure'].includes(roomContext.floorType)) {
    surfaceParts.push(`Keep existing ${roomContext.floorType.toLowerCase()} floor unchanged`)
  }
  if (roomContext?.wallFinish && !['Painted (standard)', 'Unsure'].includes(roomContext.wallFinish)) {
    surfaceParts.push(`keep ${roomContext.wallFinish.toLowerCase()} walls unchanged`)
  }
  const layer4 = surfaceParts.length > 0 ? surfaceParts.join(', ') + '.' : ''

  // ── Layer 5: Fixed elements ──────────────────────────────────────────────────
  const fixedElementPrompts: Record<string, string> = {
    'Fireplace': 'fireplace as room focal point — must remain visible and unchanged',
    'Built-in shelves': 'existing built-in shelving — style but do not remove',
    'Exposed brick': 'exposed brick feature wall — incorporate as textural element',
    'Open to kitchen': 'open-plan space connected to kitchen — maintain visual flow',
    'Structural column': 'structural column — incorporate into design',
    'Radiator': 'radiator on wall — design around it',
    'Bay window': 'bay window — create reading nook in the bay',
    'Sloped ceiling': 'sloped ceiling — size furniture to work with angles',
    'En-suite bathroom': 'attached bathroom — consider sight lines from bed',
    'Large mirror wall': 'large mirror wall — use to reflect light and depth',
  }
  let layer5 = ''
  if (roomContext?.fixedElements && roomContext.fixedElements.length > 0) {
    const descs = roomContext.fixedElements.map((e) => fixedElementPrompts[e]).filter(Boolean)
    if (descs.length > 0) layer5 = 'Preserve: ' + descs.join('. ') + '.'
  }

  // ── Layer 6: Wall layout → actionable furniture placement ───────────────────
  const placementParts: string[] = []
  if (roomContext?.wallLayout) {
    const layout = roomContext.wallLayout as Record<string, Array<{ type: string }>>
    const backItems = layout['top'] ?? []
    const frontItems = layout['bottom'] ?? []
    const leftItems = layout['left'] ?? []
    const rightItems = layout['right'] ?? []

    const backWindows = backItems.filter((i) => i.type === 'window').length
    const backDoors = backItems.filter((i) => i.type === 'door').length
    const frontDoors = frontItems.filter((i) => i.type === 'door').length
    const leftWindows = leftItems.filter((i) => i.type === 'window').length
    const rightWindows = rightItems.filter((i) => i.type === 'window').length

    if (backWindows > 0) placementParts.push('Place main seating to face back wall windows')
    if (leftWindows > 0 && backWindows === 0) placementParts.push('Primary natural light from left — angle seating toward left wall')
    if (rightWindows > 0 && backWindows === 0 && leftWindows === 0) placementParts.push('Primary natural light from right — angle seating toward right wall')
    if (backDoors > 0) placementParts.push('Keep floor path clear to back wall door')
    if (frontDoors > 0) placementParts.push('Define entryway zone at front')
  }
  const layer6 = placementParts.length > 0 ? placementParts.join('. ') + '.' : ''

  // ── Layer 7: Budget qualifier ────────────────────────────────────────────────
  const budgetQualifiers: Record<string, string> = {
    budget: 'affordable pieces under $200 (IKEA, Target)',
    mid: 'quality pieces $200–800 (West Elm, CB2)',
    premium: 'premium pieces $800–2000 (RH, Design Within Reach)',
    luxury: 'investment pieces over $2000 (Knoll, Herman Miller)',
  }
  const layer7 = `Use ${budgetQualifiers[budgetTier]}.`

  // ── Layer 8: Room-type furniture defaults ────────────────────────────────────
  const keptLabels = new Set((keptItems ?? []).map((s) => s.toLowerCase()))
  const roomDefaults: Record<string, { check: string; phrase: string }> = {
    bedroom: { check: 'bed', phrase: 'Include a bed as the primary piece' },
    living_room: { check: 'sofa', phrase: 'Include seating as the primary piece' },
    home_office: { check: 'desk', phrase: 'Include a functional desk setup' },
    dining_room: { check: 'dining table', phrase: 'Include a dining table and chairs' },
  }
  const defaultEntry = roomDefaults[roomType]
  const layer8 = defaultEntry && !keptLabels.has(defaultEntry.check) ? defaultEntry.phrase + '.' : ''

  // ── Layer 9: Kept items ──────────────────────────────────────────────────────
  const layer9 =
    keptItems && keptItems.length > 0
      ? `The existing ${keptItems.join(', ')} must remain exactly in their current position — do not move, replace, or obscure them.`
      : ''

  // ── Layer 10: Inclusions ─────────────────────────────────────────────────────
  const layer10 = inclusions.length > 0 ? `Must include: ${inclusions.slice(0, 4).join(', ')}.` : ''

  // ── Layer 11: Constraints ────────────────────────────────────────────────────
  const constraintPrompts: Record<string, string> = {
    'I rent': 'Only freestanding removable furniture. No wall modifications.',
    "Can't drill walls": 'No wall-mounted items. Leaning and freestanding only.',
    'I have pets': 'Durable performance velvet and indoor-outdoor weaves.',
    'Child-safe furniture': 'Rounded corners, stable anchored pieces.',
    'Very low light': 'Supplement with multiple layered artificial light sources.',
    'Tight budget': 'Cost-conscious selections — maximize impact per dollar.',
    'Sharing the space': 'Dual-use furniture and defined personal zones.',
    'Working from home': 'Incorporate a dedicated workspace with good ergonomics.',
    'Frequent guests': 'Include flexible seating and guest accommodation.',
  }
  const constraintTexts = (constraints ?? []).map((c) => constraintPrompts[c]).filter(Boolean)
  const layer11 = constraintTexts.length > 0 ? constraintTexts.join(' ') : ''

  // ── Layer 12: Quality directive ──────────────────────────────────────────────
  const layer12 = 'Photorealistic, professional interior photography.'

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const positive = [
    layer1, layer2, layer3, layer4, layer5,
    layer6, layer7, layer8, layer9, layer10, layer11, layer12,
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
