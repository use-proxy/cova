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

  const { roomId, photoUrl } = await request.json()
  if (!roomId || !photoUrl) {
    return NextResponse.json({ error: 'roomId and photoUrl required' }, { status: 400 })
  }

  // Verify user owns room
  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  // Update status if not already set
  await supabase
    .from('rooms')
    .update({ redesign_status: 'uploading_photos' })
    .eq('id', roomId)
    .in('redesign_status', ['pending', null as unknown as string])

  // Fire and forget — pre-detection is an enhancement, not a requirement
  const webhookUrl = process.env.PRE_DETECTION_WEBHOOK_URL
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, photo_url: photoUrl }),
    }).catch((err) => console.error('[pre-detect] Webhook failed:', err))
  }

  return NextResponse.json({ success: true, roomId })
}
