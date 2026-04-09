'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { createBrowserClient } from '@/lib/supabase/client'

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
}

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  const signInWithGoogle = async () => {
    const supabase = createBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signInWithEmail = async () => {
    if (!email) return
    setLoading(true)
    setMessage('')
    setIsError(false)
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (error) {
      setMessage(error.message)
      setIsError(true)
    } else {
      setMessage('Check your email for a magic link to sign in.')
      setIsError(false)
    }
  }

  // Computed border color depends on focused state — kept as inline
  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '12px 16px',
    borderRadius: 8,
    border: `1px solid ${focused ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.15)'}`,
    background: 'rgba(255,255,255,0.04)',
    color: '#F5F0E8',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 150ms ease',
  })

  return (
    <div className="min-h-screen bg-[#091829] flex font-dm-sans">
      {/* LEFT PANEL — full-bleed atmospheric image */}
      <div
        className="w-1/2 min-h-screen flex-shrink-0"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* RIGHT PANEL — sign-in form */}
      <div className="w-1/2 min-h-screen bg-[#091829] flex flex-col items-center justify-center p-12 relative">
        {/* Wordmark */}
        <div className="absolute top-8 left-0 right-0 text-center font-playfair italic text-xl text-cova-gold tracking-[0.05em] font-normal">
          Cova
        </div>

        {/* Form content with entrance animation */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full max-w-[400px]"
        >
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col"
          >
            {/* Heading */}
            <motion.h1
              variants={itemVariants}
              className="font-playfair text-[32px] font-normal text-cova-ivory mb-8 text-center leading-tight"
            >
              Sign in to Cova
            </motion.h1>

            {/* Email input */}
            <motion.div variants={itemVariants} className="mb-3">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onKeyDown={(e) => e.key === 'Enter' && signInWithEmail()}
                style={inputStyle(emailFocused)}
              />
            </motion.div>

            {/* Password input (visual only — submit calls signInWithOtp) */}
            <motion.div variants={itemVariants} className="mb-5">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                onKeyDown={(e) => e.key === 'Enter' && signInWithEmail()}
                style={inputStyle(passwordFocused)}
              />
            </motion.div>

            {/* Sign In button */}
            <motion.div variants={itemVariants} className="mb-5">
              <motion.button
                type="button"
                onClick={signInWithEmail}
                disabled={loading}
                whileHover={loading ? undefined : { scale: 1.02, backgroundColor: '#D4B460' }}
                whileTap={loading ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="w-full font-dm-sans font-semibold text-[15px] rounded-lg"
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  background: '#C9A84C',
                  color: '#091829',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'opacity 150ms ease',
                }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </motion.button>
            </motion.div>

            {/* Error / success message */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-xl p-3 font-dm-sans text-sm mb-4"
                style={{
                  background: isError ? 'rgba(232,112,112,0.1)' : 'rgba(111,207,151,0.1)',
                  border: `1px solid ${isError ? 'rgba(232,112,112,0.3)' : 'rgba(111,207,151,0.3)'}`,
                  color: isError ? '#E87070' : '#6FCF97',
                }}
              >
                {message}
              </motion.div>
            )}

            {/* OR divider */}
            <motion.div
              variants={itemVariants}
              className="flex items-center gap-3 mb-4"
            >
              <div className="flex-1 h-px bg-[rgba(201,168,76,0.15)]" />
              <span className="text-cova-muted font-dm-sans text-[13px]">
                or
              </span>
              <div className="flex-1 h-px bg-[rgba(201,168,76,0.15)]" />
            </motion.div>

            {/* Google OAuth button */}
            <motion.div variants={itemVariants} className="mb-5">
              <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full rounded-lg border border-[rgba(201,168,76,0.15)] bg-[rgba(255,255,255,0.04)] text-cova-ivory font-dm-sans text-[15px] cursor-pointer flex items-center justify-center gap-[10px] transition-all duration-200 ease-out"
                style={{ padding: '12px 16px' }}
              >
                {/* Google "G" icon */}
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </motion.div>

            {/* Forgot password */}
            <motion.div variants={itemVariants} className="text-center mb-2">
              <button
                type="button"
                className="bg-transparent border-none text-cova-muted font-dm-sans text-[13px] cursor-pointer p-0"
              >
                Forgot password?
              </button>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* New to Cova link — bottom of right panel */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <a
            href="/design/step-1"
            className="text-cova-muted font-dm-sans text-[13px] no-underline"
          >
            New to Cova? Start your design →
          </a>
        </div>
      </div>
    </div>
  )
}
