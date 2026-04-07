import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

async function createSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const supabase = await createSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { error: updateError } = await supabase
    .from('rooms')
    .update(body)
    .eq('id', params.roomId)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  const supabase = await createSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error: deleteError } = await supabase
    .from('rooms')
    .delete()
    .eq('id', params.roomId)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
