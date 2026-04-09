'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createBrowserClient } from '@/lib/supabase/client'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import type { StyleFingerprint } from '@/types/fingerprint'

// ─── Radar chart constants ─────────────────────────────────────────────────────

const RADAR_LABELS = [
  'Color Temperature',
  'Saturation',
  'Density',
  'Formality',
  'Era',
  'Material',
  'Texture',
  'Pattern',
  'Line Quality',
  'Light Preference',
  'Nature',
  'Cultural Influence',
]

const RADAR_DIM_KEYS: Array<keyof StyleFingerprint['dimensions']> = [
  'colorTemperature',
  'colorSaturation',
  'density',
  'formality',
  'era',
  'material',
  'texture',
  'pattern',
  'lineQuality',
  'lightPreference',
  'nature',
  'culturalInfluence',
]

const FALLBACK_VALUES = [0.7, 0.5, 0.8, 0.6, 0.4, 0.9, 0.7, 0.5, 0.6, 0.8, 0.7, 0.5]

const RADAR_CENTER = 210
const RADAR_RADIUS = 160
const RADAR_RINGS = [0.25, 0.5, 0.75, 1.0]

function polarToXY(angle: number, r: number, cx: number, cy: number) {
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  }
}

function buildPolygonPoints(values: number[], cx: number, cy: number, maxR: number): string {
  return values
    .map((v, i) => {
      const angle = (i / values.length) * 2 * Math.PI - Math.PI / 2
      const r = maxR * Math.max(0, Math.min(1, v))
      const { x, y } = polarToXY(angle, r, cx, cy)
      return `${x},${y}`
    })
    .join(' ')
}

function buildRingPoints(fraction: number, count: number, cx: number, cy: number, maxR: number): string {
  return Array.from({ length: count })
    .map((_, i) => {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2
      const r = maxR * fraction
      const { x, y } = polarToXY(angle, r, cx, cy)
      return `${x},${y}`
    })
    .join(' ')
}

// ─── Radar SVG Component ───────────────────────────────────────────────────────

interface RadarChartProps {
  values: number[]
}

function RadarChart({ values }: RadarChartProps) {
  const [animated, setAnimated] = useState(false)
  const displayValues = animated ? values : Array(12).fill(0)
  const polygonPoints = buildPolygonPoints(displayValues, RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS)
  const n = RADAR_LABELS.length

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200)
    return () => clearTimeout(t)
  }, [])

  return (
    <svg
      width={420}
      height={420}
      viewBox="0 0 420 420"
      className="block mx-auto"
    >
      {/* Background grid rings */}
      {RADAR_RINGS.map((fraction) => (
        <polygon
          key={fraction}
          points={buildRingPoints(fraction, n, RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS)}
          fill="none"
          stroke="rgba(201,168,76,0.1)"
          strokeWidth={0.5}
        />
      ))}

      {/* Axis lines */}
      {Array.from({ length: n }).map((_, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2
        const outer = polarToXY(angle, RADAR_RADIUS, RADAR_CENTER, RADAR_CENTER)
        return (
          <line
            key={i}
            x1={RADAR_CENTER}
            y1={RADAR_CENTER}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(201,168,76,0.1)"
            strokeWidth={0.5}
          />
        )
      })}

      {/* Data polygon */}
      <motion.polygon
        points={polygonPoints}
        fill="rgba(201,168,76,0.2)"
        stroke="#C9A84C"
        strokeWidth={2}
        animate={{ points: polygonPoints }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      {/* Axis labels */}
      {RADAR_LABELS.map((label, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2
        const labelR = RADAR_RADIUS + 22
        const { x, y } = polarToXY(angle, labelR, RADAR_CENTER, RADAR_CENTER)
        let anchor: 'start' | 'middle' | 'end' = 'middle'
        if (x < RADAR_CENTER - 10) anchor = 'end'
        else if (x > RADAR_CENTER + 10) anchor = 'start'
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fill="rgba(245,240,232,0.45)"
            fontSize={11}
            fontFamily="var(--font-dm-sans)"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Step4Page() {
  const router = useRouter()
  const { fingerprint, styleName, styleTags } = useFingerprintStore()

  const [showAuth, setShowAuth] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Guard: redirect if no fingerprint
  useEffect(() => {
    if (!fingerprint || !styleName) {
      router.push('/design/step-3')
    }
  }, [fingerprint, styleName, router])

  // Check auth state on mount
  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true)
      }
    })
  }, [])

  // Show auth panel after 2.5s (only if not already authenticated)
  useEffect(() => {
    if (isAuthenticated) return
    const timer = setTimeout(() => setShowAuth(true), 2500)
    return () => clearTimeout(timer)
  }, [isAuthenticated])

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
  }

  // Build radar values from fingerprint or fallback
  const radarValues: number[] = fingerprint
    ? RADAR_DIM_KEYS.map((k, i) => fingerprint.dimensions[k] ?? FALLBACK_VALUES[i] ?? 0.5)
    : FALLBACK_VALUES

  // Style descriptor tags with fallback
  const displayTags = styleTags && styleTags.length > 0
    ? styleTags.slice(0, 3)
    : ['Warm & Restrained', 'Biophilic', 'Contemporary']

  if (!fingerprint || !styleName) return null

  return (
    <div className="min-h-screen bg-[#091829] font-dm-sans">
      {/* Gold progress bar — full width (quiz complete) */}
      <div
        className="fixed top-0 left-0 right-0 z-[60]"
        style={{ height: 3, background: 'rgba(201,168,76,0.15)' }}
      >
        <div className="h-full w-full bg-cova-gold" />
      </div>

      {/* Frosted glass top bar */}
      <div
        className="sticky top-0 z-[50] h-14 flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory absolute left-1/2 -translate-x-1/2">
          Your Style Profile
        </span>
        <span className="font-dm-sans text-[13px] text-cova-muted">
          Step 4 of 7
        </span>
      </div>

      {/* Main content */}
      <div className="max-w-[700px] mx-auto pt-20 pb-[120px] px-6 text-center">
        {/* Section label */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-dm-sans font-medium text-[11px] text-cova-muted tracking-[0.12em] uppercase mb-8"
        >
          YOUR STYLE FINGERPRINT
        </motion.p>

        {/* Radar chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <RadarChart values={radarValues} />
        </motion.div>

        {/* Style descriptor tags */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          className="flex gap-2 justify-center flex-wrap mb-10"
        >
          {displayTags.map((tag, i) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9 + i * 0.08, type: 'spring', stiffness: 280, damping: 30 }}
              className="bg-[rgba(201,168,76,0.12)] text-cova-gold rounded-full px-4 font-dm-sans font-medium text-[13px]"
              style={{ padding: '6px 16px' }}
            >
              {tag}
            </motion.span>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
        >
          <button
            onClick={() => router.push('/design/step-5')}
            className="bg-cova-gold text-[#091829] font-dm-sans font-semibold text-base rounded-lg border-none cursor-pointer"
            style={{ padding: '14px 40px' }}
          >
            Design My Room →
          </button>
        </motion.div>
      </div>

      {/* Auth panel — slides up from bottom */}
      <AnimatePresence>
        {showAuth && !isAuthenticated && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[100] rounded-[24px_24px_0_0] border-t border-[rgba(201,168,76,0.1)]"
            style={{
              background: 'rgba(9,24,41,0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              padding: '24px 24px',
              paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
            }}
          >
            {/* Drag handle */}
            <div
              className="rounded-[2px] mx-auto"
              style={{
                width: 48,
                height: 4,
                background: 'rgba(245,240,232,0.2)',
                marginBottom: 20,
              }}
            />

            <p className="font-dm-sans text-sm text-cova-muted text-center mb-5">
              Save your Design Profile
            </p>

            {/* Apple Sign In */}
            <button
              onClick={handleAppleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-black text-white rounded-lg border-none font-dm-sans font-medium text-[15px] cursor-pointer mb-3"
              style={{ height: 52 }}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Continue with Apple
            </button>

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white text-[#1f2937] rounded-lg font-dm-sans font-medium text-[15px] cursor-pointer mb-4"
              style={{ height: 52, border: '1px solid #e5e7eb' }}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
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
              className="font-dm-sans text-sm text-cova-muted text-center cursor-pointer"
            >
              Continue without saving
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
