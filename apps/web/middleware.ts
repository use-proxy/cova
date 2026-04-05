import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Steps 1-5 are open (no auth required). Steps 6+ require auth.
const PROTECTED_ROUTES = [
  '/design/step-6',
  '/design/step-7',
  '/design/step-8',
  '/design/step-9',
  '/design/step-10',
]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = PROTECTED_ROUTES.some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.set('next',
      request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
