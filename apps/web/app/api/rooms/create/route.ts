import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
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

  let roomType = 'living_room'
  try {
    const body = await request.json() as { room_type?: string }
    if (body.room_type) roomType = body.room_type
  } catch {
    // Body is optional
  }

  const { data: room, error: insertError } = await supabase
    .from('rooms')
    .insert({
      user_id: user.id,
      room_type: roomType,
    })
    .select('id')
    .single()

  if (insertError || !room?.id) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }

  // Return both id (spec) and room_id (legacy) for backward compat
  return NextResponse.json({ id: room.id, room_id: room.id })
}

