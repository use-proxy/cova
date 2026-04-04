import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const DIMENSION_LABELS = [
  ['Bright & Airy', 'Moody & Dramatic'],     // luminosity
  ['Layered & Rich', 'Clean & Minimal'],      // density
  ['Warm & Cozy', 'Cool & Crisp'],            // temperature
  ['Organic & Curved', 'Geometric & Angular'], // form
  ['Classic & Timeless', 'Bold & Modern'],    // era
  ['Textured & Tactile', 'Smooth & Sleek'],   // texture
] as const

const DIMENSION_NAMES = [
  'Luminosity',
  'Density',
  'Temperature',
  'Form',
  'Era',
  'Texture',
] as const

interface DnaAxis {
  name: string
  value: number
  label: string
  description: string
}

interface DesignDnaCard {
  style_name: string
  fingerprint: number[]
  axes: DnaAxis[]
  palette_descriptors: string[]
  summary: string
}

function buildDnaCard(fingerprint: number[], styleName: string): DesignDnaCard {
  const axes: DnaAxis[] = fingerprint.map((value, i) => {
    const isHigh = value >= 0.5
    const labels = DIMENSION_LABELS[i] ?? ['High', 'Low']
    const label = isHigh ? labels[0] : labels[1]
    const strength = Math.abs(value - 0.5) * 2 // 0–1, where 1 = strongest signal

    let description: string
    if (strength < 0.2) {
      description = `Balanced ${DIMENSION_NAMES[i] ?? ''}`
    } else if (strength < 0.5) {
      description = `Leans ${label}`
    } else {
      description = `Strongly ${label}`
    }

    return {
      name: DIMENSION_NAMES[i] ?? '',
      value,
      label,
      description,
    }
  })

  // Derive palette descriptors from temperature + luminosity
  const temp = fingerprint[2] ?? 0.5
  const lum = fingerprint[0] ?? 0.5
  const paletteDescriptors: string[] = []

  if (temp >= 0.6 && lum >= 0.6) paletteDescriptors.push('warm ivory', 'golden amber', 'soft cream')
  else if (temp >= 0.6 && lum < 0.4) paletteDescriptors.push('burnt sienna', 'deep terracotta', 'rich ochre')
  else if (temp < 0.4 && lum >= 0.6) paletteDescriptors.push('icy white', 'cool slate', 'soft grey-blue')
  else if (temp < 0.4 && lum < 0.4) paletteDescriptors.push('charcoal', 'deep navy', 'graphite')
  else paletteDescriptors.push('warm neutral', 'balanced tone', 'versatile grey')

  // One-sentence summary
  const topAxes = axes
    .filter((a) => Math.abs(a.value - 0.5) > 0.2)
    .sort((a, b) => Math.abs(b.value - 0.5) - Math.abs(a.value - 0.5))
    .slice(0, 2)
    .map((a) => a.label.toLowerCase())

  const summary =
    topAxes.length >= 2
      ? `Your space leans ${topAxes[0]} with a ${topAxes[1]} sensibility.`
      : topAxes.length === 1
        ? `Your space has a ${topAxes[0]} character.`
        : 'Your space has a balanced, versatile character.'

  return { style_name: styleName, fingerprint, axes, palette_descriptors: paletteDescriptors, summary }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { fingerprint: number[]; style_name: string }
    const { fingerprint, style_name } = body

    if (!fingerprint || !Array.isArray(fingerprint) || fingerprint.length !== 6) {
      return NextResponse.json({ error: 'fingerprint must be a 6-element array' }, { status: 400 })
    }

    const card = buildDnaCard(fingerprint, style_name ?? 'Curated Modern')

    return NextResponse.json(card)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
