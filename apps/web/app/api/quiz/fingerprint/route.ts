import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

interface QuizResponse {
  pair_id: string
  chosen: string
  super_liked: boolean
}

interface FingerprintRequestBody {
  responses: QuizResponse[]
  entry_path: 'pairs' | 'natural_language' | 'inspo_photo'
  room_type: string
}

// All 64 binary combinations of 6 dimensions
// Dimensions: [luminosity, density, temperature, form, era, texture]
// 1 = high (bright, layered, warm, organic, traditional, textured)
// 0 = low  (moody, minimal, cool, geometric, modern, smooth)
const STYLE_NAMES: Record<string, string> = {
  '000000': 'Cool Minimalist',
  '000001': 'Industrial Modern',
  '000010': 'Geometric Contemporary',
  '000011': 'Urban Loft',
  '000100': 'Organic Minimal',
  '000101': 'Japandi',
  '000110': 'Nature Modern',
  '000111': 'Earthy Minimalist',
  '001000': 'Cool Layered',
  '001001': 'Dark Academic',
  '001010': 'Maximalist Industrial',
  '001011': 'Moody Eclectic',
  '001100': 'Warm Japandi',
  '001101': 'Boho Minimal',
  '001110': 'Jungle Modern',
  '001111': 'Organic Maximalist',
  '010000': 'Coastal Minimal',
  '010001': 'Scandinavian Modern',
  '010010': 'Cool Nordic',
  '010011': 'Nordic Industrial',
  '010100': 'Coastal Organic',
  '010101': 'Scandinavian Natural',
  '010110': 'Biophilic Minimal',
  '010111': 'Nordic Boho',
  '011000': 'Coastal Layered',
  '011001': 'French Country Light',
  '011010': 'Maximalist Coastal',
  '011011': 'Eclectic Light',
  '011100': 'Organic Coastal',
  '011101': 'Bohemian Coastal',
  '011110': 'Tropical Modern',
  '011111': 'Maximalist Organic',
  '100000': 'Moody Minimal',
  '100001': 'Dark Modern',
  '100010': 'Concrete Chic',
  '100011': 'Brutalist Warm',
  '100100': 'Organic Moody',
  '100101': 'Warm Industrial',
  '100110': 'Dark Nature',
  '100111': 'Moody Organic',
  '101000': 'Warm Layered',
  '101001': 'Amber Eclectic',
  '101010': 'Transitional',
  '101011': 'Rich Traditional',
  '101100': 'Organic Transitional',
  '101101': 'Warm Eclectic',
  '101110': 'Warm Nature',
  '101111': 'Bohemian Warm',
  '110000': 'Scandinavian Minimal',
  '110001': 'Mid-Century Light',
  '110010': 'Bright Contemporary',
  '110011': 'Airy Industrial',
  '110100': 'Organic Modern',
  '110101': 'Bright Japandi',
  '110110': 'Biophilic Modern',
  '110111': 'Airy Organic',
  '111000': 'Bright Maximalist',
  '111001': 'Hollywood Regency',
  '111010': 'Maximalist Modern',
  '111011': 'Glam Eclectic',
  '111100': 'Rustic Traditional',
  '111101': 'Bohemian Eclectic',
  '111110': 'Warm Maximalist',
  '111111': 'Grand Eclectic',
}

function computeFingerprint(responses: QuizResponse[]): number[] {
  // Initialize 6 dimensions at 0.5 (neutral)
  const dimensions = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

  // Score each response
  // Super likes weighted 3x per COVA_CONTEXT.md
  responses.forEach((response, index) => {
    if (index === 0) return // Skip warmup card
    const weight = response.super_liked ? 3 : 1
    // Distribute signal across dimensions based on pair index
    // This is a simplified distribution — real Bayesian
    // implementation in V1.1
    const dimIndex = index % 6
    const signal = response.chosen === 'A' ? 0.1 : -0.1
    dimensions[dimIndex] = (dimensions[dimIndex] ?? 0.5) + signal * weight
  })

  // Normalize to [0, 1]
  return dimensions.map((d) => Math.max(0, Math.min(1, d)))
}

function getStyleName(fingerprint: number[]): string {
  const key = fingerprint.map((d) => (d >= 0.5 ? '1' : '0')).join('')
  return STYLE_NAMES[key] ?? 'Curated Modern'
}

function fingerprintToStyleTagsSimple(fingerprint: number[]): string[] {
  const labels = [
    (fingerprint[0] ?? 0.5) >= 0.5 ? 'bright' : 'moody',
    (fingerprint[1] ?? 0.5) >= 0.5 ? 'layered' : 'minimal',
    (fingerprint[2] ?? 0.5) >= 0.5 ? 'warm' : 'cool',
    (fingerprint[3] ?? 0.5) >= 0.5 ? 'organic' : 'geometric',
    (fingerprint[4] ?? 0.5) >= 0.5 ? 'traditional' : 'modern',
    (fingerprint[5] ?? 0.5) >= 0.5 ? 'textured' : 'smooth',
  ]
  return labels
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const body = (await request.json()) as FingerprintRequestBody
    const { responses, entry_path, room_type } = body

    if (!responses || responses.length === 0) {
      return NextResponse.json({ error: 'responses are required' }, { status: 400 })
    }

    const fingerprint = computeFingerprint(responses)
    const styleName = getStyleName(fingerprint)

    // Save fingerprint if user is authenticated
    if (user) {
      const admin = createAdminSupabaseClient()
      await admin.from('style_fingerprints').insert({
        user_id: user.id,
        vector_data: fingerprint,
        style_name: styleName,
        room_type,
        entry_path,
        quiz_responses: responses,
      })
    }

    return NextResponse.json({
      fingerprint,
      style_name: styleName,
      style_tags: fingerprintToStyleTagsSimple(fingerprint),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
