'use client'

import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  const supabase = createBrowserClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <button
      onClick={handleSignOut}
      className="cursor-pointer rounded-lg border border-cova-border bg-cova-bg px-6 py-3 text-sm text-cova-ivory"
    >
      Sign Out
    </button>
  )
}
