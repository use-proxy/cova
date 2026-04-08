import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { card_ids: string[] }
    const { card_ids = [] } = body

    if (card_ids.length === 0) {
      return NextResponse.json({ images: [] })
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('swipe_cards')
      .select('id, image_url, style')
      .in('id', card_ids)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const images = (data ?? []).map(row => ({
      id: row.id,
      imageUrl: row.image_url,
      alt: `Interior design inspiration`,
    }))

    return NextResponse.json({ images })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
