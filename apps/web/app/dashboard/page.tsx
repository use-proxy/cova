import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import SignOutButton from './SignOutButton'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          background: '#0F1F3D',
          borderRadius: 12,
          border: '1px solid #1E3A5F',
          padding: 40,
          width: 420,
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            color: '#F8F6F1',
            fontSize: 28,
            fontFamily: 'Playfair Display, serif',
            marginBottom: 16,
          }}
        >
          Welcome to Cova
        </h1>
        <p style={{ color: '#8BA3C0', fontSize: 14, marginBottom: 32 }}>
          {user.email}
        </p>
        <SignOutButton />
      </div>
    </div>
  )
}
