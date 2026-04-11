import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ── /api/quiz/next-card ──────────────────────────────────────────────────────
// Returns the 9 anchor images from quiz_anchor_images. Used by Phase A of the
// quiz at /design/step-3 — a single round where the user picks exactly 2.
//
// Both GET and POST are accepted. Body params (POST) are ignored — there are
// only 9 anchors, the route always returns all of them.
//
// Response shape:
//   { cards: Array<{
//       id: string
//       style_name: string
//       style_index: number      // 1-9
//       image_url: string
//       style_vector: Record<DimKey, number>   // 12 dims [0,1]
//   }> }
//
// Migrated from swipe_cards (10-dim, wiped in Session A) to quiz_anchor_images
// in Session C (quiz wiring).

interface AnchorRow {
  id: string
  style_name: string
  style_index: number
  image_url: string
  style_vector: Record<string, number>
  flux_prompt: string | null
  room_images: Record<string, string> | null
}

async function loadAnchors() {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('quiz_anchor_images')
    .select('id, style_name, style_index, image_url, style_vector, flux_prompt, room_images')
    .order('style_index', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ cards: [] })
  }

  const cards = (data as AnchorRow[]).map((row) => ({
    id: row.id,
    style_name: row.style_name,
    style_index: row.style_index,
    image_url: row.image_url,
    style_vector: row.style_vector,
    flux_prompt: row.flux_prompt ?? null,
    room_images: row.room_images ?? null,
  }))
  return NextResponse.json({ cards })
}

export async function GET() {
  try {
    return await loadAnchors()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  try {
    return await loadAnchors()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
