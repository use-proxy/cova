'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Constants ───────────────────────────────────────────────────────────────

const MESSAGES = [
  'Reading your room...',
  'Mapping the light...',
  'Identifying materials...',
  'Understanding your space...',
  'Building your profile...',
]

// Stable particle data — generated once at module level to avoid re-render flicker
const PARTICLES = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  top: `${(i * 47 + 11) % 90 + 5}%`,
  left: `${(i * 61 + 7) % 90 + 5}%`,
  size: ((i * 3 + 2) % 4) + 2,
  opacity: ((i * 17 + 5) % 30) / 100 + 0.05,
  duration: ((i * 7 + 4) % 8) + 6,
  delay: ((i * 11 + 3) % 5) * 0.8,
}))

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Step7Page() {
  const router = useRouter()

  const [messageIndex, setMessageIndex] = useState(0)
  const [mounted, setMounted] = useState(false)

  // Mark mounted to enable animations
  useEffect(() => {
    setMounted(true)
  }, [])

  // Cycle status messages every 2.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  // Auto-advance to step-7a after 12 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      router.push('/design/step-7a')
    }, 12000)
    return () => clearTimeout(timeout)
  }, [router])

  return (
    <div className="min-h-screen bg-[#091829] relative overflow-hidden flex items-center justify-center flex-col">

      {/* Ring pulse keyframe styles */}
      <style>{`
        @keyframes ring-pulse {
          0% { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes particle-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
      `}</style>

      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 600,
          height: 600,
          background: 'rgba(201,168,76,0.03)',
        }}
      />

      {/* Gold particle system */}
      {mounted && PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-cova-gold pointer-events-none"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `particle-float ${p.duration}s ease-in-out infinite ${p.delay}s`,
          }}
        />
      ))}

      {/* Concentric pulsing rings */}
      <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
        {/* Ring 1 */}
        <div
          className="absolute rounded-full border border-cova-gold"
          style={{
            width: 120,
            height: 120,
            animation: 'ring-pulse 2s ease-out infinite',
          }}
        />
        {/* Ring 2 — delayed 667ms */}
        <div
          className="absolute rounded-full border border-cova-gold"
          style={{
            width: 120,
            height: 120,
            animation: 'ring-pulse 2s ease-out infinite 0.667s',
          }}
        />
        {/* Ring 3 — delayed 1333ms */}
        <div
          className="absolute rounded-full border border-cova-gold"
          style={{
            width: 120,
            height: 120,
            animation: 'ring-pulse 2s ease-out infinite 1.333s',
          }}
        />
        {/* Center dot */}
        <div className="w-3 h-3 rounded-full bg-cova-gold" />
      </div>

      {/* Status message crossfade */}
      <div className="mt-12 h-8 relative w-full max-w-[480px]">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className="font-dm-sans text-lg text-cova-ivory text-center absolute w-full"
          >
            {MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

    </div>
  )
}
