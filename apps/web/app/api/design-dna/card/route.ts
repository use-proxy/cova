import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { StyleFingerprint } from '@/types/fingerprint'

type DimKey = keyof StyleFingerprint['dimensions']

const DIMENSION_META: Array<{ key: DimKey; name: string; hiLabel: string; loLabel: string }> = [
  { key: 'luminosity',     name: 'Luminosity',    hiLabel: 'Bright & Airy',       loLabel: 'Moody & Dramatic' },
  { key: 'density',        name: 'Density',       hiLabel: 'Layered & Rich',       loLabel: 'Clean & Minimal' },
  { key: 'temperature',    name: 'Temperature',   hiLabel: 'Warm & Cozy',          loLabel: 'Cool & Crisp' },
  { key: 'form',           name: 'Form',          hiLabel: 'Organic & Curved',     loLabel: 'Geometric & Angular' },
  { key: 'era',            name: 'Era',           hiLabel: 'Classic & Timeless',   loLabel: 'Bold & Modern' },
  { key: 'texture',        name: 'Texture',       hiLabel: 'Textured & Tactile',   loLabel: 'Smooth & Sleek' },
]

interface DnaAxis {
  name: string
  value: number  // [-1, 1]
  label: string
  description: string
}

interface DesignDnaCard {
  style_name: string
  fingerprint: StyleFingerprint
  axes: DnaAxis[]
  palette_descriptors: string[]
  summary: string
}

function buildDnaCard(fingerprint: StyleFingerprint, styleName: string): DesignDnaCard {
  const d = fingerprint.dimensions

  const axes: DnaAxis[] = DIMENSION_META.map(({ key, name, hiLabel, loLabel }) => {
    const value = d[key]
    const isHigh = value >= 0
    const label = isHigh ? hiLabel : loLabel
    const strength = Math.abs(value) // already in [-1,1], abs = distance from neutral

    let description: string
    if (strength < 0.2) {
      description = `Balanced ${name}`
    } else if (strength < 0.5) {
      description = `Leans ${label}`
    } else {
      description = `Strongly ${label}`
    }

    return { name, value, label, description }
  })

  // Derive palette descriptors from temperature + luminosity (both in [-1,1])
  const temp = d.temperature
  const lum = d.luminosity
  const paletteDescriptors: string[] = []

  if (temp >= 0.2 && lum >= 0.2) paletteDescriptors.push('warm ivory', 'golden amber', 'soft cream')
  else if (temp >= 0.2 && lum < -0.2) paletteDescriptors.push('burnt sienna', 'deep terracotta', 'rich ochre')
  else if (temp < -0.2 && lum >= 0.2) paletteDescriptors.push('icy white', 'cool slate', 'soft grey-blue')
  else if (temp < -0.2 && lum < -0.2) paletteDescriptors.push('charcoal', 'deep navy', 'graphite')
  else paletteDescriptors.push('warm neutral', 'balanced tone', 'versatile grey')

  // One-sentence summary
  const topAxes = axes
    .filter((a) => Math.abs(a.value) > 0.3)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
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

    const body = (await request.json()) as { fingerprint: StyleFingerprint; style_name: string }
    const { fingerprint, style_name } = body

    if (!fingerprint || !fingerprint.dimensions) {
      return NextResponse.json({ error: 'fingerprint must be a StyleFingerprint object' }, { status: 400 })
    }

    const card = buildDnaCard(fingerprint, style_name ?? 'Curated Modern')

    return NextResponse.json(card)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
