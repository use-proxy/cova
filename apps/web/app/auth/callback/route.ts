import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const ANON_FINGERPRINT_COOKIE = 'cova_anon_fingerprint'

interface PersistedFingerprintState {
  state?: {
    fingerprint?: {
      dimensions?: Record<string, number>
      covariance?: number[][]
      confidence?: number
    }
    styleName?: string
    styleTags?: string[]
    roomType?: string
    budgetTier?: string
    phaseBResponses?: unknown[]
  }
}

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
      // After establishing session, check for a pre-auth fingerprint cookie.
      // If present, persist it to style_fingerprints under the new user ID,
      // then clear the cookie so it doesn't accumulate stale entries.
      try {
        const anonCookie = cookieStore.get(ANON_FINGERPRINT_COOKIE)
        if (anonCookie?.value) {
          let parsedState: PersistedFingerprintState | null = null
          try {
            // Cookie value is base64url(encodeURIComponent(jsonString))
            const jsonStr = decodeURIComponent(atob(anonCookie.value))
            parsedState = JSON.parse(jsonStr) as PersistedFingerprintState
          } catch {
            // Malformed cookie — proceed without saving fingerprint
          }

          const fp = parsedState?.state?.fingerprint
          if (
            fp?.dimensions &&
            Object.keys(fp.dimensions).length === 12 &&
            parsedState?.state?.roomType
          ) {
            const admin = createAdminSupabaseClient()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: insertErr } = await (admin.from('style_fingerprints') as any).insert({
              user_id: sessionData.user.id,
              dimensions: fp.dimensions,
              covariance: fp.covariance ?? null,
              confidence: fp.confidence ?? null,
              style_name: parsedState.state.styleName ?? null,
              room_type: parsedState.state.roomType,
              budget_tier: parsedState.state.budgetTier ?? null,
              quiz_responses: parsedState.state.phaseBResponses ?? [],
              entry_path: 'pairs',
            })
            if (insertErr) {
              console.warn('[auth-callback] anon fingerprint save failed:', insertErr.message)
            } else {
              console.log('[auth-callback] anon fingerprint saved for user:', sessionData.user.id)
            }
          }

          // Clear the cookie regardless of save success to avoid stale state
          cookieStore.set(ANON_FINGERPRINT_COOKIE, '', { maxAge: 0, path: '/' })
        }
      } catch (e) {
        // Non-fatal — fingerprint save is best-effort, auth redirect proceeds
        console.warn('[auth-callback] fingerprint cookie handling error:', e instanceof Error ? e.message : String(e))
      }

      return NextResponse.redirect(`${origin}/design/step-4`)
    }

    console.error('Auth callback error:', error)
  }

  return NextResponse.redirect(`${origin}/auth?error=auth-code-error`)
}
