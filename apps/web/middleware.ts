import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Public routes: no auth required (page redirects)
// /                      landing page
// /design/step-1         room type + budget selection
// /design/step-2         style quiz
// /design/step-3         fingerprint reveal (shows result of quiz, no user data needed)
// /api/auth/callback     OAuth code exchange
// /api/quiz/fingerprint  quiz fingerprint computation (public API)

const PROTECTED_PAGE_ROUTES = [
  '/design/step-4',
  '/design/step-5',
  '/design/step-6',
  '/design/step-7',
  '/design/step-8',
  '/design/step-9',
  '/design/step-10',
  '/dashboard',
]

// API routes that are public (no auth check)
const PUBLIC_API_ROUTES = [
  '/api/auth/callback',
  '/api/quiz/fingerprint',
  '/api/quiz/next-pair',
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

  const pathname = request.nextUrl.pathname

  // Protected page routes → redirect unauthenticated users to /
  const isProtectedPage = PROTECTED_PAGE_ROUTES.some(route =>
    pathname.startsWith(route)
  )
  if (isProtectedPage && !user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Protected API routes → return 401 JSON for unauthenticated requests
  const isPublicApi = PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))
  const isApiRoute = pathname.startsWith('/api/')
  if (isApiRoute && !isPublicApi && !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
