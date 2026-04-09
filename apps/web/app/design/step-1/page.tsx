'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Sparkles, Image as ImageIcon, Wand2, ShoppingBag } from 'lucide-react'
import { useSessionStore } from '@/lib/store'

// ─── Particle seed (stable across renders) ────────────────────────────────────

interface Particle {
  id: number
  top: string
  left: string
  size: number
  opacity: number
  delay: number
  duration: number
}

function makeParticles(): Particle[] {
  // Deterministic seed so SSR and client produce the same values
  const particles: Particle[] = []
  const seed = [
    [12, 34], [87, 23], [45, 67], [23, 89], [67, 12],
    [34, 56], [78, 45], [56, 78], [90, 11], [11, 90],
    [43, 32], [65, 54], [21, 76], [98, 43], [37, 65],
    [73, 87], [54, 21], [29, 49], [81, 72], [16, 58],
  ]
  seed.forEach(([topVal, leftVal], i) => {
    particles.push({
      id: i,
      top: `${topVal}%`,
      left: `${leftVal}%`,
      size: i % 2 === 0 ? 3 : 4,
      opacity: 0.15 + (i % 4) * 0.04,
      delay: (i % 6) * 0.5,
      duration: 3 + (i % 4) * 0.75,
    })
  })
  return particles
}

const PARTICLES = makeParticles()

// ─── Steps row data ────────────────────────────────────────────────────────────

const STEPS = [
  { icon: Sparkles, label: 'Style Profile', number: '01' },
  { icon: ImageIcon, label: 'Upload Room', number: '02' },
  { icon: Wand2, label: 'AI Redesign', number: '03' },
  { icon: ShoppingBag, label: 'Shop the Look', number: '04' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Step1Page() {
  const router = useRouter()
  const { setStep } = useSessionStore()

  function handleBegin() {
    setStep(2)
    router.push('/design/step-2')
  }

  return (
    <div className="min-h-screen bg-[#091829] relative overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1616137466211-f939a420be84?w=1920&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-[rgba(9,24,41,0.6)] z-[1]" />

      {/* Particle system */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: '#C9A84C',
            opacity: p.opacity,
            zIndex: 2,
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}

      {/* Frosted glass top bar */}
      <div
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {/* Wordmark */}
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        {/* User avatar placeholder */}
        <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.1)]" />
      </div>

      {/* Center content */}
      <div
        className="absolute text-center w-full max-w-[800px] px-6 z-10"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Hero headline */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-playfair text-[68px] font-normal text-cova-ivory m-0"
          style={{ lineHeight: 1.1 }}
        >
          Your room. Reimagined.
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="font-dm-sans text-lg text-cova-muted max-w-[520px] mx-auto mt-4 leading-relaxed"
        >
          Answer a few questions, upload a photo, and get a fully designed AI render with shoppable furniture — in minutes.
        </motion.p>

        {/* Steps row */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.4 } } }}
          className="flex items-center justify-center mt-10"
        >
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.number}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="flex items-center"
              >
                <div className="flex flex-col items-center gap-[6px] px-4">
                  <span className="font-dm-sans text-[11px] text-cova-gold tracking-[0.05em]">
                    {step.number}
                  </span>
                  <Icon size={18} color="rgba(245,240,232,0.6)" />
                  <span className="font-dm-sans text-[13px] text-cova-muted">
                    {step.label}
                  </span>
                </div>
                {/* Divider between steps */}
                {i < STEPS.length - 1 && (
                  <div className="w-px h-6 bg-[rgba(201,168,76,0.3)] flex-shrink-0" />
                )}
              </motion.div>
            )
          })}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-10"
        >
          <button
            onClick={handleBegin}
            className="bg-cova-gold text-[#091829] font-dm-sans font-semibold text-base rounded-lg px-8 py-[14px] border-none cursor-pointer"
          >
            Begin Your Style Profile
          </button>
        </motion.div>
      </div>
    </div>
  )
}
