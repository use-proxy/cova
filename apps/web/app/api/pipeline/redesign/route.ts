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
    .select(
      'id, marble_pano_url, redesign_status, user_id, fixed_furniture, inpainting_mask_url, style_blend, budget'
    )
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  if (!room.marble_pano_url) {
    return NextResponse.json(
      { error: 'Room panorama not ready. Complete capture first.' },
      { status: 400 }
    )
  }

  const webhookUrl = process.env.REDESIGN_PIPELINE_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Redesign pipeline not configured' }, { status: 500 })
  }

  await supabase.from('rooms').update({ redesign_status: 'kontext_processing' }).eq('id', roomId)

  // Pass fixed furniture and mask info to the Modal pipeline via webhook payload
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      user_id: user.id,
      fixed_furniture: room.fixed_furniture ?? [],
      inpainting_mask_url: room.inpainting_mask_url ?? null,
    }),
  }).catch((err) => console.error('[redesign] Webhook trigger failed:', err))

  return NextResponse.json({
    success: true,
    roomId,
    status: 'kontext_processing',
    message: 'Redesign started',
  })
}
