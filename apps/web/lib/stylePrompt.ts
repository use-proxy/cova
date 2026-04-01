/**
 * Style prompt generator for FLUX Kontext redesign.
 * Converts a user's style_blend into a detailed room redesign prompt.
 */

export interface StyleBlend {
  coastal: number
  japandi: number
  bohemian: number
  minimalist: number
  mid_century: number
}

export interface StylePromptResult {
  prompt: string
  dominant_styles: string[]
  style_description: string
}

const STYLE_VOCABULARY = {
  coastal: {
    furniture: [
      'natural rattan armchair',
      'whitewashed oak coffee table',
      'linen upholstered sofa in off-white',
      'woven seagrass rug',
      'driftwood side table',
      'wicker storage basket',
      'slipcovered armchair in cream linen',
    ],
    materials: ['rattan', 'seagrass', 'whitewashed oak', 'linen', 'natural fiber', 'weathered wood'],
    colors: ['off-white', 'soft blue', 'sandy beige', 'warm white', 'pale aqua', 'natural cream'],
    feel: 'airy, relaxed coastal',
  },
  japandi: {
    furniture: [
      'low solid oak platform bed',
      'minimalist walnut coffee table with tapered legs',
      'clean-lined linen sofa in warm grey',
      'natural jute rug',
      'simple oak bookshelf',
      'ceramic accent stool',
      'low profile walnut dresser',
    ],
    materials: ['solid oak', 'walnut', 'natural linen', 'ceramic', 'bamboo', 'washi paper'],
    colors: ['warm white', 'natural wood tones', 'soft grey', 'muted sage', 'warm beige', 'charcoal'],
    feel: 'warm minimalist japandi',
  },
  bohemian: {
    furniture: [
      'macrame hanging chair',
      'colorful Moroccan rug',
      'eclectic velvet sofa in jewel tone',
      'woven pouf ottoman',
      'rattan peacock chair',
      'layered kilim rug',
      'embroidered throw pillow collection',
    ],
    materials: ['macrame', 'kilim', 'velvet', 'rattan', 'embroidered textile', 'hammered brass'],
    colors: ['terracotta', 'deep teal', 'warm mustard', 'burnt orange', 'rich burgundy', 'forest green'],
    feel: 'eclectic bohemian',
  },
  minimalist: {
    furniture: [
      'white platform bed with no headboard',
      'glass and steel coffee table',
      'all-white modular sofa',
      'concrete side table',
      'floating white shelves',
      'matte black accent chair',
      'simple white linen curtains',
    ],
    materials: ['glass', 'steel', 'concrete', 'matte lacquer', 'white linen', 'polished chrome'],
    colors: ['pure white', 'light grey', 'matte black', 'warm white', 'charcoal', 'soft grey'],
    feel: 'clean contemporary minimalist',
  },
  mid_century: {
    furniture: [
      'walnut credenza with tapered legs',
      'Eames-style lounge chair',
      'teak dining table',
      'low profile tufted sofa in mustard velvet',
      'hairpin leg coffee table',
      'arc floor lamp',
      'geometric patterned rug in earth tones',
    ],
    materials: ['teak', 'walnut', 'molded plywood', 'wool upholstery', 'brass', 'fiberglass'],
    colors: ['mustard yellow', 'burnt orange', 'teal', 'walnut brown', 'olive green', 'warm white'],
    feel: 'retro mid-century modern',
  },
} as const

export function getDominantStyles(blend: StyleBlend): string[] {
  return Object.entries(blend)
    .filter(([, weight]) => weight > 0.1)
    .sort(([, a], [, b]) => b - a)
    .map(([style]) => style)
}

export async function generateStylePrompt(
  blend: StyleBlend,
  roomType: string,
  anthropicApiKey: string
): Promise<StylePromptResult> {
  const dominantStyles = getDominantStyles(blend)

  const styleContext = dominantStyles
    .map((style) => {
      const vocab = STYLE_VOCABULARY[style as keyof typeof STYLE_VOCABULARY]
      const weight = blend[style as keyof StyleBlend]
      return `${style} (${Math.round(weight * 100)}%): ${vocab.feel}`
    })
    .join('\n')

  const furnitureItems: string[] = []
  for (const style of dominantStyles) {
    const vocab = STYLE_VOCABULARY[style as keyof typeof STYLE_VOCABULARY]
    const weight = blend[style as keyof StyleBlend]
    const numItems = Math.max(1, Math.round(weight * 5))
    const shuffled = [...vocab.furniture].sort(() => Math.random() - 0.5)
    furnitureItems.push(...shuffled.slice(0, numItems))
  }

  const systemPrompt = `You are an expert interior designer creating precise image editing prompts for FLUX Kontext Pro, an AI image editor.

FLUX Kontext edits existing images based on text instructions. It excels at:
- Replacing furniture while preserving room architecture
- Maintaining lighting and spatial proportions
- Photorealistic results that look like real interior photos

Your prompts must:
1. Be extremely specific about furniture pieces (name materials, colors, styles)
2. Explicitly preserve architectural elements (walls, floors, windows, ceiling)
3. Specify that the result should look photorealistic
4. Be written as direct editing instructions
5. Include "equirectangular panorama" to signal the image format
6. Stay under 280 words
7. Never mention "AI", "render", or "generate" — write as if directing a photographer staging a real room`

  const userMessage = `Create a FLUX Kontext prompt to redesign a ${roomType} with this style blend:
${styleContext}

The prompt will be applied to an equirectangular 360° panorama of the room.

Furniture to include (select the most appropriate):
${furnitureItems.slice(0, 6).join(', ')}

Requirements:
- Replace ALL existing furniture and soft furnishings
- Keep walls, floors, windows, ceiling, doors, and architectural features exactly as they are
- Keep existing room dimensions and proportions
- Keep existing lighting fixtures and natural light
- The result must look like a real interior design photo, photorealistic
- Blend the styles naturally — not a jarring mix

Output ONLY the prompt text. No explanation, no preamble.`

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

  return {
    prompt,
    dominant_styles: dominantStyles,
    style_description: dominantStyles
      .map((s) => STYLE_VOCABULARY[s as keyof typeof STYLE_VOCABULARY].feel)
      .join(' + '),
  }
}

export function generateStylePromptFallback(blend: StyleBlend, roomType: string): StylePromptResult {
  const dominant = getDominantStyles(blend)
  const topStyle = (dominant[0] || 'minimalist') as keyof typeof STYLE_VOCABULARY
  const vocab = STYLE_VOCABULARY[topStyle]

  const furniture = vocab.furniture.slice(0, 4).join(', ')
  const materials = vocab.materials.slice(0, 3).join(', ')
  const colors = vocab.colors.slice(0, 3).join(', ')

  const prompt = `Redesign this ${roomType} in ${vocab.feel} style. Replace all furniture with: ${furniture}. Use materials: ${materials}. Color palette: ${colors}. Keep all walls, floors, windows, ceiling, doors, and architectural features exactly as they are. Preserve all room dimensions, proportions, and existing lighting. The result must look like a photorealistic interior design photograph. Equirectangular panorama, 360 degree view.`

  return {
    prompt,
    dominant_styles: dominant,
    style_description: vocab.feel,
  }
}
