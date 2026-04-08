import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

function closestStyleName(styleName: string): string {
  const lower = styleName.toLowerCase()
  if (lower.includes('japandi') || lower.includes('nordic') || lower.includes('scandi')) return 'japandi'
  if (lower.includes('minimal')) return 'minimalist'
  if (lower.includes('boho') || lower.includes('bohemian') || lower.includes('maximalist')) return 'bohemian'
  if (lower.includes('coastal') || lower.includes('organic')) return 'coastal'
  if (lower.includes('mid') || lower.includes('century') || lower.includes('retro')) return 'mid_century'
  if (lower.includes('heritage') || lower.includes('traditional') || lower.includes('classic')) return 'mid_century'
  if (lower.includes('warm') || lower.includes('amber') || lower.includes('terracotta')) return 'bohemian'
  if (lower.includes('cool') || lower.includes('slate') || lower.includes('blue')) return 'coastal'
  return 'minimalist'
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { style_name: string; room_type?: string; count?: number }
    const { style_name, count = 9 } = body

    const targetStyle = closestStyleName(style_name)
    const admin = createAdminSupabaseClient()

    const { data, error } = await admin
      .from('swipe_cards')
      .select('id, image_url, style')
      .eq('style', targetStyle)
      .eq('phase', 'baseline')
      .eq('active', true)
      .limit(count * 3)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data ?? []

    // Shuffle and take count
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rows[i], rows[j]] = [rows[j]!, rows[i]!]
    }

    const images = rows.slice(0, count).map(row => ({
      id: row.id,
      imageUrl: row.image_url,
      alt: `Interior design inspiration`,
      styleName: row.style,
    }))

    return NextResponse.json({ images })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
