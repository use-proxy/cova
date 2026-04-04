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

  // Get room with photo URLs
  const { data: room } = await supabase
    .from('rooms')
    .select('id, capture_photo_urls, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const photoUrls = room.capture_photo_urls as string[] | null
  if (!photoUrls || photoUrls.length < 4) {
    return NextResponse.json(
      { error: `Need at least 4 photos, have ${photoUrls?.length ?? 0}` },
      { status: 400 }
    )
  }

  const webhookUrl = process.env.MARBLE_MULTI_IMAGE_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Multi-image pipeline not configured' }, { status: 500 })
  }

  await supabase
    .from('rooms')
    .update({ redesign_status: 'generating_mini_world' })
    .eq('id', roomId)

  const selectedPhotos = photoUrls.slice(0, 8)
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      photo_urls: selectedPhotos,
    }),
  }).catch((err) => console.error('[marble-multi-image] Webhook failed:', err))

  return NextResponse.json({
    success: true,
    roomId,
    status: 'generating_mini_world',
    photoCount: selectedPhotos.length,
  })
}
