'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const supabase = createBrowserClient()

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signInWithApple = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signInWithEmail = async () => {
    if (!email) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for a login link.')
    }
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
          width: 380,
        }}
      >
        <h1
          style={{
            color: '#F8F6F1',
            fontSize: 28,
            fontFamily: 'Playfair Display, serif',
            marginBottom: 32,
            textAlign: 'center',
          }}
        >
          Sign In
        </h1>

        <button
          type="button"
          onClick={signInWithGoogle}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid #1E3A5F',
            background: '#0F1F3D',
            color: '#F8F6F1',
            fontSize: 15,
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={signInWithApple}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid #1E3A5F',
            background: '#0F1F3D',
            color: '#F8F6F1',
            fontSize: 15,
            cursor: 'pointer',
            marginBottom: 24,
          }}
        >
          Continue with Apple
        </button>

        <div
          style={{
            borderTop: '1px solid #1E3A5F',
            paddingTop: 24,
          }}
        >
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signInWithEmail()}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #1E3A5F',
              background: '#0A1628',
              color: '#F8F6F1',
              fontSize: 15,
              outline: 'none',
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={signInWithEmail}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#C9A84C',
              color: '#0A1628',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Send Magic Link
          </button>
        </div>

        {message && (
          <p
            style={{
              color: '#8BA3C0',
              fontSize: 13,
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
