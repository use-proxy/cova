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

const STYLE_NAMES: Record<string, string> = {
  '111111': 'Warm Maximalist',
  '111110': 'Bohemian Eclectic',
  '111100': 'Rustic Traditional',
  '110000': 'Scandinavian Minimal',
  '000000': 'Cool Minimalist',
  '000001': 'Industrial Modern',
  '001100': 'Japandi',
  '011100': 'Warm Japandi',
  '101010': 'Transitional',
  '110100': 'Organic Modern',
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

  return STYLE_NAMES[key] ?? STYLE_NAMES[key.slice(0, 4) + '00'] ?? 'Curated Modern'
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
