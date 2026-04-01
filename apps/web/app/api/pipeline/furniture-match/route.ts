import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Ignore in route handlers
        }
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabase()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomId } = await request.json()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id, redesign_pano_url, marble_spz_url, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const webhookUrl = process.env.FURNITURE_MATCHING_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Furniture matching not configured' }, { status: 500 })
  }

  await supabase.from('rooms').update({ redesign_status: 'matching_queued' }).eq('id', roomId)

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, user_id: user.id }),
  }).catch((err) => console.error('[furniture] Webhook failed:', err))

  return NextResponse.json({ success: true, roomId, status: 'matching_queued' })
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabase()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId')
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const { data: matches } = await supabase
    .from('room_products')
    .select(
      `id, furniture_label, furniture_description, similarity_score, rank, azimuth_degrees, is_unlocked,
       products (id, name, price, category, retailer, affiliate_url, image_url, style_tags)`
    )
    .eq('room_id', roomId)
    .order('furniture_label')
    .order('rank')

  return NextResponse.json({ matches: matches ?? [] })
}
