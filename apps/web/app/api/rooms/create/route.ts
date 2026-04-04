import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
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

  const { data: room, error: insertError } = await supabase
    .from('rooms')
    .insert({
      user_id: user.id,
      pipeline_status: 'pending',
      original_image_url: '',
    })
    .select('id')
    .single()

  if (insertError || !room?.id) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }

  return NextResponse.json({ room_id: room.id })
}

