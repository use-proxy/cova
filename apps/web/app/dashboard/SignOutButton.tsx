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
      style={{
        padding: '12px 24px',
        borderRadius: 8,
        border: '1px solid #1E3A5F',
        background: '#0A1628',
        color: '#F8F6F1',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      Sign Out
    </button>
  )
}
