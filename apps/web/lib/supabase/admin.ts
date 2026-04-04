import { createClient } from '@supabase/supabase-js'

// Admin client uses the service role key — bypasses RLS.
// Server-side only. Never use in client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
