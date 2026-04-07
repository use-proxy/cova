import { createClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'

const MAX_CHUNK_SIZE = 3180

function encodeSession(value: string): Array<{ name: string; value: string }> {
  const cookieKey = sessionCookieName()
  const encoded = encodeURIComponent(value)

  if (encoded.length <= MAX_CHUNK_SIZE) {
    return [{ name: cookieKey, value }]
  }

  // Chunk the session into multiple cookies named key.0, key.1, ...
  const chunks: string[] = []
  let remaining = encoded
  while (remaining.length > 0) {
    let head = remaining.slice(0, MAX_CHUNK_SIZE)
    const lastEscape = head.lastIndexOf('%')
    if (lastEscape > MAX_CHUNK_SIZE - 3) {
      head = head.slice(0, lastEscape)
    }
    let decoded = ''
    while (head.length > 0) {
      try {
        decoded = decodeURIComponent(head)
        break
      } catch {
        head = head.slice(0, head.length - 3)
      }
    }
    chunks.push(decoded)
    remaining = remaining.slice(encodeURIComponent(decoded).length)
  }

  return chunks.map((v, i) => ({ name: `${cookieKey}.${i}`, value: v }))
}

function sessionCookieName(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]!
  return `sb-${projectRef}-auth-token`
}

export async function injectTestAuth(context: BrowserContext): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const email = process.env.E2E_TEST_EMAIL ?? 'daksh_parikh@berkeley.edu'
  const password = process.env.E2E_TEST_PASSWORD

  if (!password) {
    throw new Error('E2E_TEST_PASSWORD is not set in .env.local')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    throw new Error(`Test auth failed: ${error?.message ?? 'No session returned'}`)
  }

  const sessionJson = JSON.stringify(data.session)
  const cookies = encodeSession(sessionJson)

  await context.addCookies(
    cookies.map(({ name, value }) => ({
      name,
      value,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax' as const,
      httpOnly: false,
    }))
  )
}
