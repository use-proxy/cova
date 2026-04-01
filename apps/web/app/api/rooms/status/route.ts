import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const STATUS_MESSAGES: Record<string, { message: string; progress: number }> = {
  pending: { message: 'Getting ready...', progress: 0 },
  queued: { message: 'Queued for processing...', progress: 5 },
  video_processing: { message: 'Processing your video...', progress: 10 },
  marble_generating: { message: 'Building your room...', progress: 25 },
  pano_ready: { message: 'Room captured! Redesigning...', progress: 35 },
  kontext_processing: { message: 'AI is redesigning your space...', progress: 50 },
  kontext_complete: { message: 'Redesign complete! Building 3D...', progress: 65 },
  marble_plus_queued: { message: 'Queued for 3D generation...', progress: 68 },
  marble_plus_processing: { message: 'Creating your 3D world...', progress: 80 },
  marble_plus_complete: { message: 'Finding matching furniture...', progress: 90 },
  matching_queued: { message: 'Queued for furniture matching...', progress: 92 },
  matching_products: { message: 'Matching furniture to products...', progress: 95 },
  complete: { message: 'Your redesign is ready!', progress: 100 },
  error: { message: 'Something went wrong. Please try again.', progress: 0 },
}

export async function GET(request: NextRequest) {
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
            // Ignore
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

  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId')
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  const { data: room } = await supabase
    .from('rooms')
    .select(
      'id, status, redesign_status, marble_spz_url, marble_spz_url_500k, marble_plus_thumbnail_url, furniture_matches_count, redesign_pano_url'
    )
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const statusInfo = STATUS_MESSAGES[room.redesign_status ?? 'pending'] ?? {
    message: 'Processing...',
    progress: 50,
  }

  return NextResponse.json({
    roomId,
    status: room.redesign_status,
    message: statusInfo.message,
    progress: statusInfo.progress,
    isComplete: room.redesign_status === 'complete',
    isError: room.redesign_status === 'error',
    spzUrl: room.marble_spz_url,
    spzUrl500k: room.marble_spz_url_500k,
    thumbnailUrl: room.marble_plus_thumbnail_url,
    furnitureCount: room.furniture_matches_count ?? 0,
    redesignPanoUrl: room.redesign_pano_url,
  })
}
