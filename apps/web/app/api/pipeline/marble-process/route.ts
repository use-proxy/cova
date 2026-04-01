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

  const body = await request.json()
  const { roomId } = body

  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id, status, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const webhookUrl = process.env.MARBLE_PIPELINE_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Marble pipeline not configured' }, { status: 500 })
  }

  await supabase
    .from('rooms')
    .update({ status: 'processing', redesign_status: 'queued' })
    .eq('id', roomId)

  // Trigger Modal asynchronously (don't block response)
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, user_id: user.id }),
  }).catch((err) => console.error('[marble] Webhook trigger failed:', err))

  return NextResponse.json({
    success: true,
    roomId,
    status: 'processing',
    message: 'Marble processing started',
  })
}
