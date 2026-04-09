'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useArea2Store } from '@/lib/stores/area2Store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewState {
  prediction_id: string
  label: string
  prompt_variant: { dimKey: string; nudge: number }
  status: 'loading' | 'complete' | 'failed'
  url: string | null
}

// ─── 3D Tilt card ─────────────────────────────────────────────────────────────

function TiltCard({
  card,
  selected,
  onSelect,
  onRefine,
}: {
  card: PreviewState
  selected: boolean
  onSelect: () => void
  onRefine: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5 // -0.5 to 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5  // -0.5 to 0.5
    setRotateX(-y * 8)
    setRotateY(x * 8)
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
  }

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onSelect}
      animate={{
        rotateX,
        rotateY,
        scale: selected ? 1.02 : 1,
      }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="flex-1 max-w-[300px] rounded-xl p-5 cursor-pointer relative"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${selected ? '#C9A84C' : 'rgba(201,168,76,0.15)'}`,
        transformStyle: 'preserve-3d',
        perspective: 1200,
        boxShadow: selected ? '0 0 20px rgba(201,168,76,0.25)' : 'none',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
      }}
    >
      {/* Image */}
      {card.status === 'loading' ? (
        <div
          className="w-full h-[200px] rounded-lg mb-3"
          style={{
            background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite ease-in-out',
          }}
        />
      ) : card.status === 'complete' && card.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.url}
          alt={card.label}
          className="w-full h-[200px] object-cover rounded-lg mb-3 block"
        />
      ) : (
        <div
          className="w-full h-[200px] rounded-lg mb-3 flex items-center justify-center"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(201,168,76,0.15)',
          }}
        >
          <span className="text-cova-muted text-[13px] font-dm-sans text-center px-3">
            Preview unavailable
          </span>
        </div>
      )}

      {/* Label */}
      <div className="text-base font-semibold font-dm-sans text-cova-ivory mb-1">
        {card.label}
      </div>

      {/* Descriptor */}
      <div className="text-sm font-dm-sans text-cova-muted mb-3">
        A direction tailored to your profile
      </div>

      {/* Refine button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRefine()
        }}
        className="text-cova-ivory bg-transparent rounded-lg py-2 px-4 text-sm font-dm-sans cursor-pointer transition-all duration-200 ease-out w-full"
        style={{ border: '1px solid rgba(201,168,76,0.35)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#C9A84C'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#C9A84C'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,168,76,0.35)'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#F5F0E8'
        }}
      >
        Refine This →
      </button>
    </motion.div>
  )
}

// ─── Shimmer card placeholder ────────────────────────────────────────────────

function ShimmerCard() {
  return (
    <div
      className="flex-1 max-w-[300px] rounded-xl p-5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(201,168,76,0.15)',
      }}
    >
      <div
        className="w-full h-[200px] rounded-lg mb-3"
        style={{
          background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite ease-in-out',
        }}
      />
      <div
        className="w-[60%] h-4 rounded mb-2"
        style={{
          background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite ease-in-out',
        }}
      />
      <div
        className="w-[80%] h-3 rounded mb-4 opacity-60"
        style={{
          background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite ease-in-out',
        }}
      />
      <div
        className="w-full h-9 rounded-lg opacity-50"
        style={{
          background: 'linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite ease-in-out',
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Step7EPage() {
  const router = useRouter()
  const roomId = useArea2Store((s) => s.roomId)
  const setStyleVariantChosen = useArea2Store((s) => s.setStyleVariantChosen)

  const [cards, setCards] = useState<PreviewState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const intervals = useRef<ReturnType<typeof setInterval>[]>([])

  function clearAllIntervals() {
    intervals.current.forEach(clearInterval)
    intervals.current = []
  }

  useEffect(() => {
    if (!roomId) {
      router.replace('/design/step-7d')
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/render/previews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ room_id: roomId }),
        })

        if (cancelled) return

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setPostError(data.error ?? 'Failed to load previews')
          return
        }

        const data = (await res.json()) as {
          previews: Array<{
            prediction_id: string
            label: string
            prompt_variant: { dimKey: string; nudge: number }
          }>
        }

        if (cancelled) return

        const initial: PreviewState[] = data.previews.map((p) => ({
          ...p,
          status: 'loading',
          url: null,
        }))
        setCards(initial)

        initial.forEach((card, idx) => {
          const iv = setInterval(async () => {
            try {
              const statusRes = await fetch(
                `/api/render/previews/status?prediction_id=${card.prediction_id}`,
                { credentials: 'include' }
              )
              const statusData = (await statusRes.json()) as {
                status: string
                url?: string | null
              }

              if (statusData.status === 'succeeded' && statusData.url) {
                clearInterval(intervals.current[idx])
                setCards((prev) =>
                  prev.map((c, i) =>
                    i === idx ? { ...c, status: 'complete', url: statusData.url! } : c
                  )
                )
              } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
                clearInterval(intervals.current[idx])
                setCards((prev) =>
                  prev.map((c, i) => (i === idx ? { ...c, status: 'failed' } : c))
                )
              }
            } catch {
              // transient — keep polling
            }
          }, 2000)
          intervals.current[idx] = iv
        })
      } catch (e) {
        if (!cancelled) {
          setPostError(e instanceof Error ? e.message : 'Failed to load previews')
        }
      }
    })()

    return () => {
      cancelled = true
      clearAllIntervals()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  if (!roomId) return null

  const cardVariants = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0 },
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="min-h-screen bg-cova-bg font-dm-sans">
        {/* Gold progress bar — fixed top (100% = step complete) */}
        <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
          <div className="h-full w-full bg-cova-gold" />
        </div>

        {/* Frosted glass top bar */}
        <nav
          className="sticky top-0 z-50 h-14 flex items-center justify-between px-6"
          style={{
            background: 'rgba(9,24,41,0.8)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(201,168,76,0.1)',
          }}
        >
          <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">Cova</span>
          <span className="text-[13px] text-cova-muted">Step 4 of 4</span>
        </nav>

        {/* Main content */}
        <main className="max-w-[1000px] mx-auto px-6 pt-[88px] pb-20 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-playfair text-[36px] text-cova-ivory mb-10 font-normal"
          >
            Choose your direction.
          </motion.h1>

          {/* Error state */}
          {postError && (
            <div
              className="p-4 rounded-xl text-sm font-dm-sans text-center max-w-[480px] mx-auto"
              style={{
                border: '1px solid rgba(232,112,112,0.3)',
                background: 'rgba(232,112,112,0.1)',
                color: '#E87070',
              }}
            >
              {postError}
            </div>
          )}

          {/* Cards */}
          {!postError && (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
              className="flex gap-6 justify-center flex-wrap"
            >
              {cards.length === 0
                ? [0, 1, 2].map((i) => (
                    <motion.div key={i} variants={cardVariants} className="flex-1 max-w-[300px]">
                      <ShimmerCard />
                    </motion.div>
                  ))
                : cards.map((card) => (
                    <motion.div key={card.prediction_id} variants={cardVariants} className="flex-1 max-w-[300px]">
                      <TiltCard
                        card={card}
                        selected={selectedId === card.prediction_id}
                        onSelect={() => setSelectedId(card.prediction_id)}
                        onRefine={() => {
                          clearAllIntervals()
                          setStyleVariantChosen(card.prompt_variant)
                          router.push('/design/step-8')
                        }}
                      />
                    </motion.div>
                  ))}
            </motion.div>
          )}

          {/* Skip link */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                clearAllIntervals()
                setStyleVariantChosen(null)
                router.push('/design/step-8')
              }}
              className="bg-none border-none text-cova-muted font-dm-sans text-sm cursor-pointer transition-[color] duration-200 ease-out"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#F5F0E8'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,240,232,0.45)'
              }}
            >
              Skip — use my style as-is →
            </button>
          </div>
        </main>
      </div>
    </>
  )
}
