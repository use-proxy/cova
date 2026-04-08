'use client'

/**
 * Cova landing page — investor-ready hero with before/after demo.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Camera, Sparkles, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react'
import { CovaButton } from '@/components/cova/CovaButton'

const SB_BASE =
  'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets'
const HERO_BEFORE = `${SB_BASE}/hero/before-neutral.jpg`
const HERO_AFTER = `${SB_BASE}/hero/after-warm-japandi.jpg`

export default function LandingPage() {
  const router = useRouter()
  const [completedRooms, setCompletedRooms] = useState<number | null>(null)

  useEffect(() => {
    // Best-effort social-proof fetch
    fetch('/api/rooms/public-count')
      .then((r) => (r.ok ? r.json() : { count: null }))
      .then((d: { count?: number }) => {
        if (typeof d.count === 'number') setCompletedRooms(d.count)
      })
      .catch(() => {})
  }, [])

  const go = useCallback(() => router.push('/design/step-1'), [router])

  return (
    <div className="relative min-h-[100svh] bg-cova-bg text-cova-ivory">
      {/* Top nav */}
      <header className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5">
        <span
          className="text-2xl tracking-[0.12em] text-cova-gold"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Cova
        </span>
        <CovaButton variant="primary" size="sm" onClick={go}>
          Get Started →
        </CovaButton>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 pt-24 pb-16">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 text-[11px] uppercase tracking-[0.25em] text-cova-gold"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          AI Interior Design
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-center text-5xl leading-[1.05] text-cova-ivory md:text-7xl"
          style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em' }}
        >
          Your room,<br />
          redesigned.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-6 max-w-lg text-center text-base text-cova-muted md:text-lg"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Upload a photo. Tell us your style. Get a photorealistic render of your
          room — with every item shoppable.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="mt-10 flex flex-col items-center gap-3"
        >
          <CovaButton
            variant="primary"
            size="lg"
            className="shadow-[0_8px_32px_rgba(201,168,76,0.35)]"
            onClick={go}
          >
            Design My Room →
          </CovaButton>
          <p
            className="text-xs text-cova-muted"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            No account required to start
          </p>
        </motion.div>

        {/* Before/after preview */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative mt-16 w-full max-w-3xl"
        >
          <BeforeAfterDemo beforeUrl={HERO_BEFORE} afterUrl={HERO_AFTER} />
        </motion.div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2
            className="mb-14 text-center text-3xl text-cova-ivory md:text-4xl"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            How it works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <HowItWorksStep
              icon={<Camera size={24} className="text-cova-gold" />}
              title="Capture"
              description="Snap one photo of your room, or upload from your camera roll."
            />
            <HowItWorksStep
              icon={<Sparkles size={24} className="text-cova-gold" />}
              title="Style"
              description="A quick visual quiz builds your personal style fingerprint."
            />
            <HowItWorksStep
              icon={<ShoppingBag size={24} className="text-cova-gold" />}
              title="Shop"
              description="Your redesigned room. Every item shoppable with one tap."
            />
          </div>
        </div>
      </section>

      {/* Social proof */}
      {completedRooms !== null && completedRooms > 0 && (
        <section className="px-6 pb-24 text-center">
          <p
            className="text-sm text-cova-muted"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Join <span className="text-cova-gold font-medium">{completedRooms.toLocaleString()}</span>{' '}
            people who&apos;ve redesigned their space with Cova
          </p>
        </section>
      )}

      {/* Final CTA */}
      <section className="px-6 pb-24">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <h2
            className="text-3xl text-cova-ivory md:text-4xl"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Ready to see yours?
          </h2>
          <p
            className="mt-3 mb-8 text-base text-cova-muted"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            One photo. Two minutes. A room you&apos;ll love.
          </p>
          <CovaButton variant="primary" size="lg" onClick={go}>
            Design My Room →
          </CovaButton>
        </div>
      </section>

      <footer className="border-t border-cova-border-dim px-6 py-6 text-center">
        <span
          className="text-xs text-cova-muted"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          © Cova Interior · covainterior.com
        </span>
      </footer>
    </div>
  )
}

function HowItWorksStep({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-cova-border-gold bg-cova-surface">
        {icon}
      </div>
      <h3
        className="mb-2 text-xl text-cova-ivory"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </h3>
      <p
        className="max-w-xs text-sm text-cova-muted"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {description}
      </p>
    </div>
  )
}

function BeforeAfterDemo({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string
  afterUrl: string
}) {
  const [pos, setPos] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const update = useCallback((clientX: number) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    setPos(Math.max(0.02, Math.min(0.98, x)))
  }, [])

  return (
    <div
      ref={ref}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-cova-border bg-cova-surface shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      onMouseMove={(e) => isDragging && update(e.clientX)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onTouchMove={(e) => update(e.touches[0]!.clientX)}
    >
      <div className="absolute inset-0">
        <Image
          src={afterUrl}
          alt="Redesigned living room"
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
          priority
        />
      </div>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pos * 100}%` }}
      >
        <div className="relative h-full" style={{ width: '100%' }}>
          <Image
            src={beforeUrl}
            alt="Original living room"
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>
      </div>

      <div
        className="absolute top-4 left-4 rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-white/80 backdrop-blur-sm"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        Before
      </div>
      <div
        className="absolute top-4 right-4 rounded-full bg-cova-gold/90 px-3 py-1 text-[10px] uppercase tracking-widest text-cova-bg"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        After
      </div>

      <div
        className="absolute top-0 bottom-0"
        style={{ left: `${pos * 100}%`, transform: 'translateX(-50%)' }}
      >
        <div
          className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-white/90"
          style={{ boxShadow: '0 0 8px rgba(255,255,255,0.6)' }}
        />
        <div
          className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center gap-0.5 rounded-full bg-white active:cursor-grabbing"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
          onMouseDown={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onTouchStart={() => setIsDragging(true)}
        >
          <ChevronLeft size={14} className="-mx-0.5 text-neutral-700" />
          <ChevronRight size={14} className="-mx-0.5 text-neutral-700" />
        </div>
      </div>
    </div>
  )
}
