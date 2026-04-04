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

  const { roomId, fixedFurniture, inpaintingMaskUrl } = await request.json()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  // Verify user owns room
  const { data: room } = await supabase
    .from('rooms')
    .select('id, marble_pano_url')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  // Store furniture selection and mask
  await supabase
    .from('rooms')
    .update({
      fixed_furniture: fixedFurniture ?? [],
      inpainting_mask_url: inpaintingMaskUrl ?? null,
      redesign_status: 'kontext_processing',
    })
    .eq('id', roomId)

  // Trigger FLUX redesign
  const redesignUrl = process.env.REDESIGN_PIPELINE_WEBHOOK_URL
  if (redesignUrl) {
    fetch(redesignUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, user_id: user.id }),
    }).catch((err) => console.error('[resume] Redesign webhook failed:', err))
  }

  return NextResponse.json({
    success: true,
    roomId,
    status: 'kontext_processing',
    message: 'Redesign started',
  })
}
