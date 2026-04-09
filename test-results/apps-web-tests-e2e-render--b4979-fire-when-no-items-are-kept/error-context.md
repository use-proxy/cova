# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/web/tests/e2e/render-pipeline.spec.ts >> Render Pipeline >> inpainting does NOT fire when no items are kept
- Location: apps/web/tests/e2e/render-pipeline.spec.ts:227:7

# Error details

```
Error: E2E_TEST_PASSWORD is not set in .env.local
```

# Test source

```ts
  1  | import { createClient } from '@supabase/supabase-js'
  2  | import type { Session } from '@supabase/supabase-js'
  3  | import type { BrowserContext } from '@playwright/test'
  4  | 
  5  | const MAX_CHUNK_SIZE = 3180
  6  | 
  7  | // Session cache — reuse for up to 50 minutes to avoid expiry during long suites
  8  | let cachedSession: { session: Session; fetchedAt: number } | null = null
  9  | 
  10 | function encodeSession(value: string): Array<{ name: string; value: string }> {
  11 |   const cookieKey = sessionCookieName()
  12 |   const encoded = encodeURIComponent(value)
  13 | 
  14 |   if (encoded.length <= MAX_CHUNK_SIZE) {
  15 |     return [{ name: cookieKey, value }]
  16 |   }
  17 | 
  18 |   // Chunk the session into multiple cookies named key.0, key.1, ...
  19 |   const chunks: string[] = []
  20 |   let remaining = encoded
  21 |   while (remaining.length > 0) {
  22 |     let head = remaining.slice(0, MAX_CHUNK_SIZE)
  23 |     const lastEscape = head.lastIndexOf('%')
  24 |     if (lastEscape > MAX_CHUNK_SIZE - 3) {
  25 |       head = head.slice(0, lastEscape)
  26 |     }
  27 |     let decoded = ''
  28 |     while (head.length > 0) {
  29 |       try {
  30 |         decoded = decodeURIComponent(head)
  31 |         break
  32 |       } catch {
  33 |         head = head.slice(0, head.length - 3)
  34 |       }
  35 |     }
  36 |     chunks.push(decoded)
  37 |     remaining = remaining.slice(encodeURIComponent(decoded).length)
  38 |   }
  39 | 
  40 |   return chunks.map((v, i) => ({ name: `${cookieKey}.${i}`, value: v }))
  41 | }
  42 | 
  43 | function sessionCookieName(): string {
  44 |   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  45 |   const projectRef = new URL(supabaseUrl).hostname.split('.')[0]!
  46 |   return `sb-${projectRef}-auth-token`
  47 | }
  48 | 
  49 | export async function injectTestAuth(context: BrowserContext): Promise<void> {
  50 |   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  51 |   const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  52 |   const email = process.env.E2E_TEST_EMAIL ?? 'daksh_parikh@berkeley.edu'
  53 |   const password = process.env.E2E_TEST_PASSWORD
  54 | 
  55 |   if (!password) {
> 56 |     throw new Error('E2E_TEST_PASSWORD is not set in .env.local')
     |           ^ Error: E2E_TEST_PASSWORD is not set in .env.local
  57 |   }
  58 | 
  59 |   const now = Date.now()
  60 |   if (!cachedSession || now - cachedSession.fetchedAt > 50 * 60 * 1000) {
  61 |     const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  62 |       auth: { autoRefreshToken: false, persistSession: false },
  63 |     })
  64 | 
  65 |     const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  66 | 
  67 |     if (error || !data.session) {
  68 |       throw new Error(`Test auth failed: ${error?.message ?? 'No session returned'}`)
  69 |     }
  70 | 
  71 |     cachedSession = { session: data.session, fetchedAt: now }
  72 |   }
  73 | 
  74 |   const sessionJson = JSON.stringify(cachedSession.session)
  75 |   const cookies = encodeSession(sessionJson)
  76 | 
  77 |   await context.addCookies(
  78 |     cookies.map(({ name, value }) => ({
  79 |       name,
  80 |       value,
  81 |       domain: 'localhost',
  82 |       path: '/',
  83 |       sameSite: 'Lax' as const,
  84 |       httpOnly: false,
  85 |     }))
  86 |   )
  87 | }
  88 | 
```