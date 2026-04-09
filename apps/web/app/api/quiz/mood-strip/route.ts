import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ── /api/quiz/mood-strip ─────────────────────────────────────────────────────
// Decorative mood strip on the step-4 fingerprint reveal screen — shows the
// first three Phase A picks back to the user. The supplied card_ids are
// quiz_anchor_images.id values (post-Session-C wiring).
//
// Migrated from swipe_cards in Session C cleanup.
//
// Body:     { card_ids: string[] }
// Response: { images: Array<{ id, imageUrl, alt }> }

interface MoodStripRequest {
  card_ids: string[]
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MoodStripRequest
    const card_ids = body.card_ids ?? []

    if (card_ids.length === 0) {
      return NextResponse.json({ images: [] })
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('quiz_anchor_images')
      .select('id, image_url')
      .in('id', card_ids)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Preserve the order the client supplied (the order of Phase A picks).
    const byId = new Map<string, string>()
    for (const row of data ?? []) {
      byId.set(row.id as string, row.image_url as string)
    }

    const images = card_ids
      .map((id) => {
        const url = byId.get(id)
        if (!url) return null
        return { id, imageUrl: url, alt: 'Interior design inspiration' }
      })
      .filter((x): x is { id: string; imageUrl: string; alt: string } => x !== null)

    return NextResponse.json({ images })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
