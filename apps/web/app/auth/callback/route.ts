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
      // Check if the user has a profile row
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', sessionData.user.id)
        .single()

      if (profile) {
        return NextResponse.redirect(`${origin}/dashboard`)
      }

      // New user via OAuth — create profile row from auth metadata
      const meta = sessionData.user.user_metadata
      await supabase.from('profiles').insert({
        id: sessionData.user.id,
        full_name: meta?.full_name ?? meta?.name ?? null,
      })

      return NextResponse.redirect(`${origin}/capture`)
    }

    console.error('Auth callback error:', error)
  }

  return NextResponse.redirect(`${origin}/auth?error=auth-code-error`)
}
