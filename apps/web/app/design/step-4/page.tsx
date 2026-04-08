'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserClient } from '@/lib/supabase/client'
import { CovaButton } from '@/components/cova/CovaButton'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import type { StyleFingerprint } from '@/types/fingerprint'

// ─── Types ─────────────────────────────────────────────────────────────────

interface MoodImage {
  id: string
  imageUrl: string
  alt: string
}

// ─── HSL → Hex conversion ──────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// ─── Swatch generator ──────────────────────────────────────────────────────

function generateSwatches(dims: StyleFingerprint['dimensions']): string[] {
  try {
    const temp = dims.temperature
    let hue: number, sat: number

    if (temp <= 0) {
      // Interpolate: temp -1 → hsl(210, 20%), temp 0 → hsl(35, 15%)
      hue = 210 + (35 - 210) * (temp + 1)
      sat = 20 + (15 - 20) * (temp + 1)
    } else {
      // Interpolate: temp 0 → hsl(35, 15%), temp 1 → hsl(28, 65%)
      hue = 35 + (28 - 35) * temp
      sat = 15 + (65 - 15) * temp
    }

    const lum = dims.luminosity
    const baseLightness = lum <= 0
      ? 15 + (lum + 1) * 30   // lum -1 → 15%, lum 0 → 45%
      : 45 + lum * 40           // lum 0 → 45%, lum 1 → 85%

    const satAdj = dims.saturation > 0.3
      ? sat * 1.2
      : dims.saturation < -0.3
        ? sat * 0.8
        : sat
    const finalSat = Math.min(100, Math.max(0, satAdj))

    return [-20, -10, 0, 10, 20].map(offset => {
      const lightness = Math.max(10, Math.min(90, baseLightness + offset))
      return hslToHex(hue, finalSat, lightness)
    })
  } catch {
    return ['#C9A84C', '#8BA3C0', '#0F1F3D', '#F8F6F1', '#1E3A5F']
  }
}

// ─── Typewriter hook ───────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 60): [string, boolean] {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    if (!text) return
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(interval)
        setDone(true)
      }
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed])

  return [displayed, done]
}

// ─── Shared animation props ────────────────────────────────────────────────

const fadeUpProps = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const },
} as const

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Step4Page() {
  const router = useRouter()
  const { fingerprint, styleName, styleTags, phaseASelections } = useFingerprintStore()

  // Reveal stages: 0=nothing, 1=label, 2=name+typing, 3=swatches, 4=chips, 5=moodstrip+share
  const [stage, setStage] = useState(0)
  const [showAuth, setShowAuth] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showMoodBoard, setShowMoodBoard] = useState(false)
  const [moodStripImages, setMoodStripImages] = useState<MoodImage[]>([])
  const [moodBoardImages, setMoodBoardImages] = useState<MoodImage[]>([])
  const [isLoadingMoodBoard, setIsLoadingMoodBoard] = useState(false)

  const [typedName, typingDone] = useTypewriter(stage >= 2 ? (styleName ?? '') : '', 60)

  const swatches = fingerprint ? generateSwatches(fingerprint.dimensions) : []

  // Guard: redirect if no fingerprint
  useEffect(() => {
    if (!fingerprint || !styleName) {
      router.push('/design/step-3')
    }
  }, [fingerprint, styleName, router])

  // Start reveal sequence
  useEffect(() => {
    if (!fingerprint || !styleName) return
    const t = setTimeout(() => setStage(1), 100)
    return () => clearTimeout(t)
  }, [fingerprint, styleName])

  // Stage 1 → 2 (show name after label)
  useEffect(() => {
    if (stage !== 1) return
    const t = setTimeout(() => setStage(2), 400)
    return () => clearTimeout(t)
  }, [stage])

  // Stage 2 → 3 (show swatches when typing done)
  useEffect(() => {
    if (!typingDone || stage < 2) return
    const t = setTimeout(() => setStage(3), 300)
    return () => clearTimeout(t)
  }, [typingDone, stage])

  // Stage 3 → 4 (chips after swatches)
  useEffect(() => {
    if (stage !== 3) return
    const t = setTimeout(() => setStage(4), 300)
    return () => clearTimeout(t)
  }, [stage])

  // Stage 4 → 5 (mood strip after chips)
  useEffect(() => {
    if (stage !== 4) return
    const t = setTimeout(() => setStage(5), 400)
    return () => clearTimeout(t)
  }, [stage])

  // Check auth state on mount
  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true)
        setShowMoodBoard(true)
      }
    })
  }, [])

  // Show auth panel after 2.5s (only if not already authenticated)
  useEffect(() => {
    if (isAuthenticated) return
    const timer = setTimeout(() => setShowAuth(true), 2500)
    return () => clearTimeout(timer)
  }, [isAuthenticated])

  // Fetch mood strip images from selected phase A cards
  useEffect(() => {
    if (phaseASelections.length === 0) return
    fetch('/api/quiz/mood-strip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_ids: phaseASelections.slice(0, 3) }),
    })
      .then(r => r.json())
      .then(data => setMoodStripImages(data.images ?? []))
      .catch(() => {})
  }, [phaseASelections])

  // Fetch mood board images when section becomes visible
  useEffect(() => {
    if (!showMoodBoard || !styleName) return
    setIsLoadingMoodBoard(true)
    fetch('/api/quiz/mood-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_name: styleName, count: 9 }),
    })
      .then(r => r.json())
      .then(data => setMoodBoardImages(data.images ?? []))
      .catch(() => {})
      .finally(() => setIsLoadingMoodBoard(false))
  }, [showMoodBoard, styleName])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAppleSignIn = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin + '/api/auth/callback' },
    })
    if (error) toast.error('Sign in failed — try again')
  }

  const handleGoogleSignIn = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/api/auth/callback' },
    })
    if (error) toast.error('Sign in failed — try again')
  }

  const handleSkipAuth = () => {
    setShowAuth(false)
    setShowMoodBoard(true)
  }

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'My Design DNA',
        text: 'I just discovered my interior design style. Check out Cova!',
        url: window.location.origin,
      })
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        toast.success('Link copied!')
      }).catch(() => {})
    }
  }

  if (!fingerprint || !styleName) return null

  return (
    <div className="bg-cova-bg min-h-screen flex flex-col items-center px-6 font-sans">

      {/* Share button — fixed top-right, appears at stage 5 */}
      <AnimatePresence>
        {stage >= 5 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleShare}
            className="fixed top-4 right-4 flex items-center gap-1.5 text-sm text-cova-muted hover:text-cova-ivory transition-colors z-10"
          >
            <Share2 size={18} />
            Share
          </motion.button>
        )}
      </AnimatePresence>

      {/* Reveal sequence */}
      <div className="flex flex-col items-center w-full max-w-md">

        {/* Element 1 — Style label */}
        <AnimatePresence>
          {stage >= 1 && (
            <motion.p
              {...fadeUpProps}
              className="text-xs tracking-widest text-cova-muted uppercase mt-16 mb-3"
            >
              Your Design DNA
            </motion.p>
          )}
        </AnimatePresence>

        {/* Element 2 — Style name with typewriter */}
        <AnimatePresence>
          {stage >= 2 && (
            <motion.h1
              {...fadeUpProps}
              className="font-serif text-5xl md:text-6xl text-cova-gold text-center leading-tight min-h-[1.2em]"
            >
              {typedName}
              {!typingDone && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="text-cova-gold"
                >
                  |
                </motion.span>
              )}
            </motion.h1>
          )}
        </AnimatePresence>

        {/* Element 3 — Color swatches */}
        <AnimatePresence>
          {stage >= 3 && (
            <motion.div
              {...fadeUpProps}
              className="flex gap-3 justify-center mt-6"
            >
              {swatches.map((color, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', delay: i * 0.08 }}
                  className="w-10 h-10 rounded-xl border border-cova-border"
                  style={{ backgroundColor: color }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Element 4 — Descriptor chips */}
        <AnimatePresence>
          {stage >= 4 && styleTags.length > 0 && (
            <motion.div
              {...fadeUpProps}
              className="flex flex-wrap gap-2 justify-center mt-6 max-w-sm"
            >
              {styleTags.map((tag, i) => (
                <motion.span
                  key={tag}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="text-sm text-cova-ivory border border-cova-border-gold rounded-full px-4 py-1.5 bg-cova-surface"
                >
                  {tag}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Element 5 — Mood strip */}
        <AnimatePresence>
          {stage >= 5 && moodStripImages.length > 0 && (
            <motion.div
              {...fadeUpProps}
              className="flex gap-3 justify-center mt-6"
            >
              {moodStripImages.map((img, i) => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="w-24 h-24 rounded-xl overflow-hidden relative flex-shrink-0"
                >
                  <Image
                    src={img.imageUrl}
                    alt={img.alt}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Mood board — appears after auth or skip */}
      <AnimatePresence>
        {showMoodBoard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mt-12 w-full max-w-2xl mx-auto pb-24"
          >
            <h2 className="font-serif text-3xl text-cova-ivory text-center mb-2">
              Your style in action
            </h2>
            <p className="text-sm text-cova-muted text-center mb-8">
              These spaces match your Design DNA
            </p>

            <div className="grid grid-cols-3 gap-2">
              {isLoadingMoodBoard
                ? Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-xl bg-cova-surface animate-pulse"
                    />
                  ))
                : moodBoardImages.map((img, i) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.06 }}
                      className="aspect-square rounded-xl overflow-hidden relative cursor-pointer group hover:ring-2 hover:ring-cova-gold transition-all duration-150"
                    >
                      <Image
                        src={img.imageUrl}
                        alt={img.alt}
                        fill
                        className="object-cover"
                        sizes="(max-width: 672px) 33vw, 224px"
                      />
                    </motion.div>
                  ))
              }
            </div>

            <div className="flex gap-3 mt-10 max-w-sm mx-auto">
              <CovaButton
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => router.push('/design/step-5')}
              >
                Design My Room →
              </CovaButton>
              <CovaButton
                variant="ghost"
                size="lg"
                className="flex-1"
                onClick={() => router.push('/design/step-3')}
              >
                Refine My Style
              </CovaButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth panel — slides up from bottom */}
      <AnimatePresence>
        {showAuth && !isAuthenticated && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 bg-cova-surface border-t border-cova-border rounded-t-3xl px-6 pt-6"
            style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}
          >
            <p className="text-sm text-cova-muted text-center mb-6">
              Save your Design DNA
            </p>

            {/* Apple Sign In */}
            <button
              onClick={handleAppleSignIn}
              className="w-full flex items-center justify-center gap-3 font-medium rounded-xl transition-opacity hover:opacity-90"
              style={{ height: 52, backgroundColor: '#000', color: '#fff' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Continue with Apple
            </button>

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 font-medium rounded-xl border transition-opacity hover:opacity-90 mt-3"
              style={{ height: 52, backgroundColor: '#fff', color: '#1f2937', borderColor: '#e5e7eb' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            {/* Skip */}
            <p
              onClick={handleSkipAuth}
              className="text-sm text-cova-muted text-center mt-4 cursor-pointer hover:text-cova-ivory transition-colors"
            >
              Continue without saving
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
