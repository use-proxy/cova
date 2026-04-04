/**
 * Style prompt generator for FLUX Kontext redesign.
 * Produces maximally specific prompts from style blend, budget, and room context.
 */

export interface StyleBlend {
  coastal?: number
  japandi?: number
  bohemian?: number
  minimalist?: number
  mid_century?: number
  industrial?: number
  maximalist?: number
  transitional?: number
}

export interface BudgetDNA {
  total_budget: number
  per_item_budget?: number
}

export interface RoomContext {
  room_type: string
  fixed_furniture: string[]
  has_inpainting_mask: boolean
}

export interface StylePromptResult {
  prompt: string
  negative_prompt: string
  dominant_styles: string[]
  style_description: string
}

interface StyleTier {
  high: string
  mid: string
  low: string
}

interface StyleDescriptor {
  furniture: StyleTier
  textiles: string
  lighting: string
  accents: string
  palette: string
  negative: string
  feel: string
}

const STYLE_DESCRIPTORS: Record<string, StyleDescriptor> = {
  japandi: {
    furniture: {
      high: 'solid walnut with visible grain, hand-finished oak, low-profile platform forms, clean joinery details',
      mid: 'light oak veneer, ash wood tones, simple clean lines, minimal hardware',
      low: 'light wood laminate, clean Scandinavian silhouettes, unadorned surfaces',
    },
    textiles: 'natural linen in warm white and greige, undyed cotton, organic wool throw, woven rattan accents',
    lighting: 'warm 2700K ambient, paper pendant shades, indirect wall washing, no harsh shadows',
    accents: 'wabi-sabi ceramic vessels, ikebana-inspired botanicals in terracotta pots, hand-thrown pottery',
    palette: 'warm white walls, warm greige, muted sage, natural wood tones, charcoal accents',
    negative: 'no clutter, no pattern mixing, no cold blues, no shiny surfaces, no ornate details',
    feel: 'warm minimalist japandi',
  },
  coastal: {
    furniture: {
      high: 'natural rattan with tight weave, solid whitewashed teak, hand-knotted rope detailing, weathered reclaimed oak',
      mid: 'rattan armchairs, whitewashed pine furniture, linen slipcovered seating, woven seagrass accents',
      low: 'white-painted wood furniture, cotton canvas slipcovers, natural fiber baskets, simple coastal forms',
    },
    textiles: 'crisp white linen, soft blue cotton throws, natural jute rugs, striped cotton cushions in navy and cream',
    lighting: 'bright natural light, woven pendant shades, white ceramic table lamps, soft ambient glow',
    accents: 'sea glass in clear vases, driftwood sculptures, coral-inspired objects, woven wall hangings',
    palette: 'off-white, soft blue, sandy beige, warm white, pale aqua, natural cream',
    negative: 'no dark colors, no heavy textures, no industrial metals, no ornate patterns',
    feel: 'airy relaxed coastal',
  },
  bohemian: {
    furniture: {
      high: 'hand-carved Indian wooden daybed, vintage Moroccan leather pouf, artisan-woven rattan peacock chair, hammered brass side tables',
      mid: 'colorful kilim-upholstered armchair, woven rattan hanging chair, carved wood coffee table, embroidered floor cushions',
      low: 'eclectic mix of vintage-style furniture, macrame wall hangings, colorful throw pillows, layered textiles',
    },
    textiles: 'layered kilim and Moroccan rugs, velvet cushions in jewel tones, macrame wall hangings, embroidered throws',
    lighting: 'warm string lights, Moroccan lanterns in hammered brass, colored glass pendants, candle clusters',
    accents: 'trailing plants in macrame hangers, vintage brass trays, stacked books, global textiles and patterns',
    palette: 'terracotta, deep teal, warm mustard, burnt orange, rich burgundy, forest green',
    negative: 'no matching sets, no sterile spaces, no cold metallics, no plain white walls',
    feel: 'eclectic bohemian',
  },
  minimalist: {
    furniture: {
      high: 'Italian leather sectional in dove grey, polished Carrara marble coffee table, precision-milled steel shelving, hand-stitched leather bench',
      mid: 'clean-lined upholstered sofa in neutral tone, glass and brushed steel coffee table, floating shelves, matte lacquer storage',
      low: 'simple white modular sofa, basic steel-frame furniture, clean plastic chairs, unadorned surfaces',
    },
    textiles: 'single-tone cashmere throw, flat-weave wool rug in light grey, sheer white curtains, minimal cushioning',
    lighting: 'recessed ceiling lights, slim profile floor lamps, architectural task lighting, diffused ambient glow',
    accents: 'single sculptural object, one large-format art piece, a single plant in concrete planter, negative space',
    palette: 'pure white, light grey, matte black, warm white, charcoal, soft grey',
    negative: 'no clutter, no patterns, no bright colors, no ornamental details, no visible storage',
    feel: 'clean contemporary minimalist',
  },
  mid_century: {
    furniture: {
      high: 'authentic teak credenza with brass pulls, molded plywood lounge chair, solid walnut dining table with splayed legs, hand-finished rosewood desk',
      mid: 'walnut-veneer sideboard, tufted velvet sofa in mustard, hairpin leg coffee table, bent plywood accent chair',
      low: 'retro-inspired laminate furniture, basic tapered-leg pieces, simple molded chairs, printed geometric textiles',
    },
    textiles: 'textured wool upholstery in earth tones, geometric patterned rug, velvet cushions in mustard and teal, woven cotton throws',
    lighting: 'arc floor lamp with marble base, Sputnik chandelier, mushroom table lamp, warm directional spotlights',
    accents: 'abstract art prints, ceramic vases in organic shapes, brass desk accessories, potted fiddle leaf fig',
    palette: 'mustard yellow, burnt orange, teal, walnut brown, olive green, warm white',
    negative: 'no ultra-modern materials, no rustic textures, no overly ornate details, no cold greys',
    feel: 'retro mid-century modern',
  },
  industrial: {
    furniture: {
      high: 'hand-forged iron frame dining table with reclaimed oak top, aged leather Chesterfield sofa, riveted steel shelving, cast iron pendant fixtures',
      mid: 'metal and wood open shelving, leather club chair, steel-pipe coffee table, concrete side tables',
      low: 'basic metal frame furniture, pipe shelving, distressed wood surfaces, exposed bulb lighting',
    },
    textiles: 'distressed leather, heavy canvas, raw denim cushions, dark wool throws, minimal soft furnishings',
    lighting: 'exposed Edison bulbs, cage pendants, articulated desk lamps, overhead track lighting',
    accents: 'exposed brick wall, vintage factory signage, mechanical gears, metal baskets and bins',
    palette: 'charcoal, rust, raw steel grey, aged brown leather, exposed brick red, matte black',
    negative: 'no pastels, no delicate fabrics, no polished surfaces, no floral patterns',
    feel: 'raw urban industrial',
  },
  maximalist: {
    furniture: {
      high: 'custom velvet tufted sofa in emerald, gilded console table, hand-painted chinoiserie cabinet, crystal chandelier',
      mid: 'bold patterned upholstered armchair, lacquered colored side tables, mixed-era furniture, ornate mirror frames',
      low: 'brightly colored furniture, mixed patterns and textures, layered decorative objects, bold wallpaper',
    },
    textiles: 'rich velvet in jewel tones, bold patterned rugs layered on rugs, silk cushions, fringed throws in contrasting colors',
    lighting: 'dramatic statement chandelier, colored glass lamps, multiple light sources at varying heights, ambient warmth',
    accents: 'gallery wall with mixed frames, stacked art books, ornate vases, sculptural objects in bold colors, plants everywhere',
    palette: 'emerald green, sapphire blue, deep purple, gold, coral, rich burgundy',
    negative: 'no empty walls, no plain surfaces, no monochrome schemes, no sparse arrangements',
    feel: 'bold eclectic maximalist',
  },
  transitional: {
    furniture: {
      high: 'solid hardwood dining table with subtle turned legs, deep-seat linen sofa with track arms, upholstered wingback in neutral linen, brushed nickel hardware',
      mid: 'classic-profile sofa in taupe, simple wood coffee table, upholstered dining chairs, tasteful storage credenza',
      low: 'clean traditional-inspired furniture, neutral upholstery, simple wood finishes, understated hardware',
    },
    textiles: 'neutral linen and cotton blends, subtle geometric patterns, soft wool area rug, tailored cushions in tonal palette',
    lighting: 'classic drum shade pendants, brushed nickel table lamps, recessed lighting, warm but bright',
    accents: 'ceramic table lamp, framed botanical prints, simple fresh flowers, woven basket storage',
    palette: 'warm taupe, soft grey, cream, navy accent, muted gold, warm white',
    negative: 'no trendy extremes, no stark contrasts, no overly ornate details, no cold industrial materials',
    feel: 'timeless transitional',
  },
}

const BUDGET_TIERS = {
  low: { max: 1000, material_qualifier: 'budget-conscious but design-forward' },
  mid: { max: 5000, material_qualifier: 'quality materials, considered design' },
  high: { max: 15000, material_qualifier: 'solid wood, natural materials, investment pieces' },
  luxury: { max: Infinity, material_qualifier: 'heirloom quality, artisan crafted, signature pieces' },
}

function getBudgetTier(budget: number): keyof typeof BUDGET_TIERS {
  if (budget <= BUDGET_TIERS.low.max) return 'low'
  if (budget <= BUDGET_TIERS.mid.max) return 'mid'
  if (budget <= BUDGET_TIERS.high.max) return 'high'
  return 'luxury'
}

function getFurnitureTier(budget: number): 'high' | 'mid' | 'low' {
  const tier = getBudgetTier(budget)
  if (tier === 'luxury' || tier === 'high') return 'high'
  if (tier === 'mid') return 'mid'
  return 'low'
}

export function getDominantStyles(blend: StyleBlend): string[] {
  return Object.entries(blend)
    .filter(([, weight]) => weight !== undefined && weight > 0.1)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([style]) => style)
}

export function generateStylePromptSync(
  blend: StyleBlend,
  roomType: string,
  budgetDna?: BudgetDNA | null,
  roomContext?: RoomContext | null
): StylePromptResult {
  const dominantStyles = getDominantStyles(blend)
  if (dominantStyles.length === 0) dominantStyles.push('transitional')

  const budget = budgetDna?.total_budget ?? 3000
  const furnitureTier = getFurnitureTier(budget)
  const budgetTier = getBudgetTier(budget)
  const materialQualifier = BUDGET_TIERS[budgetTier].material_qualifier

  // Build blended descriptors weighted by style weights
  const parts: string[] = []
  const negatives: string[] = []

  for (const style of dominantStyles) {
    const desc = STYLE_DESCRIPTORS[style]
    if (!desc) continue
    const weight = (blend as Record<string, number | undefined>)[style] ?? 0
    const pct = Math.round(weight * 100)

    parts.push(
      `${desc.feel} style (${pct}%): furniture — ${desc.furniture[furnitureTier]}. ` +
        `Textiles — ${desc.textiles}. Lighting — ${desc.lighting}. ` +
        `Accents — ${desc.accents}. Palette — ${desc.palette}.`
    )
    negatives.push(desc.negative)
  }

  const styleBlock = parts.join(' Blended with: ')

  // Room context
  let contextBlock = ''
  if (roomContext?.has_inpainting_mask) {
    contextBlock +=
      'Preserve all masked architectural elements and furniture exactly as-is. Only redesign unmasked areas. '
  }
  if (roomContext?.fixed_furniture && roomContext.fixed_furniture.length > 0) {
    contextBlock += `The following elements are part of the existing room and must not be altered: ${roomContext.fixed_furniture.join(', ')}. `
  }

  const prompt = [
    `Redesign this ${roomType} as an equirectangular 360° panorama.`,
    styleBlock,
    `Material quality: ${materialQualifier}.`,
    contextBlock,
    'Keep all walls, floors, windows, ceiling, doors, and architectural features exactly as they are.',
    'Preserve room dimensions, proportions, and existing natural light sources.',
    'Photorealistic interior photography. Natural lighting. High resolution. No CGI artifacts.',
  ]
    .filter(Boolean)
    .join(' ')

  const negative_prompt = negatives.join('. ') + '. No CGI look. No floating objects. No warped geometry.'

  return {
    prompt,
    negative_prompt,
    dominant_styles: dominantStyles,
    style_description: dominantStyles
      .map((s) => STYLE_DESCRIPTORS[s]?.feel ?? s)
      .join(' + '),
  }
}

export async function generateStylePrompt(
  blend: StyleBlend,
  roomType: string,
  anthropicApiKey: string,
  budgetDna?: BudgetDNA | null,
  roomContext?: RoomContext | null
): Promise<StylePromptResult> {
  const dominantStyles = getDominantStyles(blend)
  if (dominantStyles.length === 0) dominantStyles.push('transitional')

  const budget = budgetDna?.total_budget ?? 3000
  const furnitureTier = getFurnitureTier(budget)
  const materialQualifier = BUDGET_TIERS[getBudgetTier(budget)].material_qualifier

  // Build rich context for Claude
  const styleContext = dominantStyles
    .map((style) => {
      const desc = STYLE_DESCRIPTORS[style]
      if (!desc) return ''
      const weight = (blend as Record<string, number | undefined>)[style] ?? 0
      return [
        `${style} (${Math.round(weight * 100)}%): ${desc.feel}`,
        `  Furniture: ${desc.furniture[furnitureTier]}`,
        `  Textiles: ${desc.textiles}`,
        `  Palette: ${desc.palette}`,
        `  Lighting: ${desc.lighting}`,
      ].join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  let extraInstructions = ''
  if (roomContext?.has_inpainting_mask) {
    extraInstructions +=
      '\n- CRITICAL: Preserve all masked areas exactly as-is. Only redesign unmasked regions.'
  }
  if (roomContext?.fixed_furniture && roomContext.fixed_furniture.length > 0) {
    extraInstructions += `\n- Do NOT alter these existing elements: ${roomContext.fixed_furniture.join(', ')}`
  }

  const systemPrompt = `You are an expert interior designer creating precise image editing prompts for FLUX Kontext Pro.

Your prompts must:
1. Be extremely specific about furniture pieces — name materials, colors, finishes, silhouettes
2. Explicitly preserve architectural elements (walls, floors, windows, ceiling)
3. Specify photorealistic result with natural lighting
4. Be written as direct editing instructions for an equirectangular panorama
5. Stay between 150-250 words
6. Never mention "AI", "render", or "generate"
7. Blend multiple styles naturally when weights are provided
8. Material quality level: ${materialQualifier}`

  const userMessage = `Create a FLUX Kontext prompt to redesign a ${roomType} with this style blend:

${styleContext}

Requirements:
- Replace all existing furniture and soft furnishings
- Keep walls, floors, windows, ceiling, doors, and architectural features exactly as they are
- Preserve room dimensions, proportions, and existing lighting
- The result must look like a photorealistic interior design photograph
- Equirectangular panorama, 360 degree view${extraInstructions}

Output ONLY the prompt text. No explanation.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude API failed: ${response.status}`)
  }

  const data = await response.json()
  const prompt = data.content[0].text.trim()

  // Generate negative prompt from style descriptors
  const negatives = dominantStyles
    .map((s) => STYLE_DESCRIPTORS[s]?.negative)
    .filter(Boolean)
  const negative_prompt =
    negatives.join('. ') + '. No CGI look. No floating objects. No warped geometry.'

  return {
    prompt,
    negative_prompt,
    dominant_styles: dominantStyles,
    style_description: dominantStyles
      .map((s) => STYLE_DESCRIPTORS[s]?.feel ?? s)
      .join(' + '),
  }
}

export function generateStylePromptFallback(
  blend: StyleBlend,
  roomType: string,
  budgetDna?: BudgetDNA | null,
  roomContext?: RoomContext | null
): StylePromptResult {
  return generateStylePromptSync(blend, roomType, budgetDna, roomContext)
}
