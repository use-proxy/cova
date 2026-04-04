import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
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

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && sessionData.user) {
      // Check if the user has any rooms
      const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('id')
        .eq('user_id', sessionData.user.id)
        .limit(1)

      if (roomsError) {
        console.error('Rooms check error:', roomsError)
        return NextResponse.redirect(`${origin}/capture/new`)
      }

      if (rooms && rooms.length > 0) {
        return NextResponse.redirect(`${origin}/dashboard`)
      }

      return NextResponse.redirect(`${origin}/capture/new`)
    }

    console.error('Auth callback error:', error)
  }

  return NextResponse.redirect(`${origin}/auth?error=auth-code-error`)
}
