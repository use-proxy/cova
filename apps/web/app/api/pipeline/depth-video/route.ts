import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in route handlers
          }
        },
      },
    }
  )

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
    .select('id, redesign_pano_url, style_blend, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  if (!room.redesign_pano_url) {
    return NextResponse.json({ error: 'Redesigned panorama not ready' }, { status: 400 })
  }

  // Get hotspot azimuths from room_products
  const { data: products } = await supabase
    .from('room_products')
    .select('id, furniture_label, azimuth_degrees')
    .eq('room_id', roomId)

  const hotspotAzimuths = (products ?? []).map((p) => ({
    room_product_id: p.id,
    label: p.furniture_label,
    azimuth: p.azimuth_degrees,
  }))

  const webhookUrl = process.env.DEPTH_VIDEO_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Depth video pipeline not configured' }, { status: 500 })
  }

  await supabase
    .from('rooms')
    .update({ redesign_status: 'depth_processing' })
    .eq('id', roomId)

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      pano_url: room.redesign_pano_url,
      style_blend: room.style_blend ?? {},
      hotspot_azimuths: hotspotAzimuths,
    }),
  }).catch((err) => console.error('[depth-video] Webhook failed:', err))

  return NextResponse.json({
    success: true,
    roomId,
    status: 'depth_processing',
  })
}
