import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

interface NextCardRequest {
  round: 1 | 2 | 3
  room_type: string
  shown_ids: string[]
}

interface CardRow {
  id: string
  image_url: string
  style: string
  dimension_labels: Record<string, number>
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NextCardRequest
    const { room_type, shown_ids = [] } = body

    const admin = createAdminSupabaseClient()
    const normalizedRoom = room_type.replace(/-/g, '_')

    // Query Phase A cards for this room_type
    const { data: initialCards, error: cardsError } = await admin
      .from('swipe_cards')
      .select('id, image_url, style, dimension_labels')
      .eq('phase', 'baseline')
      .eq('room_type', normalizedRoom)
      .eq('active', true)
      .not('dimension_labels', 'is', null)
      .not('id', 'in', shown_ids.length > 0 ? `(${shown_ids.join(',')})` : '(00000000-0000-0000-0000-000000000000)')

    if (cardsError) {
      return NextResponse.json({ error: cardsError.message }, { status: 500 })
    }
    let cards = initialCards

    // Fall back to any room_type if not enough cards
    if (!cards || cards.length < 9) {
      const { data: fallback, error: fallbackError } = await admin
        .from('swipe_cards')
        .select('id, image_url, style, dimension_labels')
        .eq('phase', 'baseline')
        .eq('active', true)
        .not('dimension_labels', 'is', null)
        .not('id', 'in', shown_ids.length > 0 ? `(${shown_ids.join(',')})` : '(00000000-0000-0000-0000-000000000000)')

      if (!fallbackError && fallback) {
        cards = fallback
      }
    }

    if (!cards || cards.length === 0) {
      return NextResponse.json({ cards: [] })
    }

    // Group by style and pick up to 2 per style, maximize diversity
    const byStyle: Record<string, CardRow[]> = {}
    for (const card of cards as CardRow[]) {
      if (!byStyle[card.style]) byStyle[card.style] = []
      byStyle[card.style]!.push(card)
    }

    // Shuffle each style group
    for (const group of Object.values(byStyle)) {
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[group[i], group[j]] = [group[j]!, group[i]!]
      }
    }

    // Round-robin 2 cards per style until we have 9
    const selected: CardRow[] = []
    const styleKeys = Object.keys(byStyle)
    for (let pass = 0; pass < 2 && selected.length < 9; pass++) {
      for (const key of styleKeys) {
        if (selected.length >= 9) break
        const group = byStyle[key]!
        if (group[pass]) selected.push(group[pass]!)
      }
    }

    // Shuffle final selection
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[selected[i], selected[j]] = [selected[j]!, selected[i]!]
    }

    const result = selected.slice(0, 9).map(card => ({
      id: card.id,
      imageUrl: card.image_url,
      alt: `Interior design style option`,
      styleName: card.style,
      dimensionLabels: card.dimension_labels,
    }))

    return NextResponse.json({ cards: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
