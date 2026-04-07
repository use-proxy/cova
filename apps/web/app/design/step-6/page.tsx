'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

import { useRoomStore, type KeepMaskItem } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { useSessionStore } from '@/lib/store/session'
import { StepIndicator } from '@/components/cova/StepIndicator'

// ─── Types ─────────────────────────────────────────────────────────────────

type ItemState = 'keep' | 'remove' | 'undecided'

function keepToState(keep: boolean | null): ItemState {
  if (keep === true) return 'keep'
  if (keep === false) return 'remove'
  return 'undecided'
}


// ─── Label → emoji ─────────────────────────────────────────────────────────

const EMOJI_MAP: Record<string, string> = {
  // Furniture
  sofa: '🛋️', couch: '🛋️', chair: '🪑', armchair: '🪑', bed: '🛏️',
  desk: '🪑', table: '🪵', 'coffee table': '🪵', 'dining table': '🍽️',
  bookshelf: '📚', wardrobe: '🚪', dresser: '🪞', nightstand: '🪑',
  lamp: '💡', 'floor lamp': '💡', 'table lamp': '💡', 'ceiling light': '💡', 'pendant light': '💡',
  rug: '🪵', curtains: '🏠', blinds: '🏠', tv: '📺', television: '📺',
  plant: '🌿', artwork: '🖼️', painting: '🖼️', 'picture frame': '🖼️',
  'wall art': '🖼️', 'wall decoration': '🖼️', mirror: '🪞', cabinet: '🗄️',
  shelf: '📚', ottoman: '🛋️', bench: '🪑', 'side table': '🪵',
  'accent chair': '🪑', 'throw pillow': '🛋️', blanket: '🛋️', vase: '🏺',
  // Architecture
  floor: '🏠', wall: '🧱', ceiling: '🏠', window: '🪟', door: '🚪',
  fireplace: '🔥', stairs: '🏠', column: '🏛️', arch: '🏛️',
  'exposed brick': '🧱', 'built-in': '📚', baseboard: '🏠',
  'wall color': '🎨', 'window treatment': '🏠', curtain: '🏠', blind: '🏠',
  'ceiling type': '🏠', 'crown molding': '🏛️', wainscoting: '🏛️',
}

function getEmoji(label: string): string {
  return EMOJI_MAP[label.toLowerCase()] ?? '📦'
}

// ─── Stable dot ID ─────────────────────────────────────────────────────────

function dotId(item: KeepMaskItem): string {
  return `${item.label}-${item.bbox[0].toFixed(0)}-${item.bbox[1].toFixed(0)}`
}

// ─── Loading Screen ─────────────────────────────────────────────────────────

const LOADING_PHRASES = [
  'Mapping depth structure',
  'Detecting furniture',
  'Identifying fixed elements',
  'Almost ready...',
]

function LoadingScreen({ photoUrl }: { photoUrl: string | null }) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [phraseVisible, setPhraseVisible] = useState(true)
  const [activeDot, setActiveDot] = useState(0)

  useEffect(() => {
    const phraseInterval = setInterval(() => {
      setPhraseVisible(false)
      setTimeout(() => {
        setPhraseIndex((p) => (p + 1) % LOADING_PHRASES.length)
        setPhraseVisible(true)
      }, 300)
    }, 3000)
    const dotInterval = setInterval(() => {
      setActiveDot((d) => (d + 1) % 3)
    }, 1000)
    return () => {
      clearInterval(phraseInterval)
      clearInterval(dotInterval)
    }
  }, [])

  return (
    <div className="fixed inset-0" style={{ background: 'var(--cova-bg)' }}>
      {/* Blurred room photo as background if available */}
      {photoUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            aria-hidden
          />
          <div className="absolute inset-0" style={{ backdropFilter: 'blur(12px)' }} />
          <div className="absolute inset-0" style={{ background: 'rgba(9,24,41,0.75)' }} />
        </>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
        {/* Framer Motion spinner */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '3px solid rgba(201,168,76,0.15)',
            borderTopColor: 'var(--cova-gold)',
          }}
        />

        <h2
          className="font-serif mt-7"
          style={{
            color: 'var(--cova-ivory)',
            fontSize: 'var(--text-2xl)',
            letterSpacing: '0.02em',
          }}
        >
          Analyzing your room...
        </h2>

        <p
          className="font-sans mt-2.5 transition-opacity duration-300"
          style={{
            color: 'var(--cova-muted)',
            fontSize: 'var(--text-sm)',
            minHeight: 24,
            opacity: phraseVisible ? 1 : 0,
          }}
        >
          {LOADING_PHRASES[phraseIndex]}
        </p>

        {/* Progress dots */}
        <div className="flex gap-1.5 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: 6,
                height: 6,
                backgroundColor: activeDot === i ? 'var(--cova-gold)' : 'var(--cova-dim)',
                transform: activeDot === i ? 'scale(1.4)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Step6Page() {
  const router = useRouter()
  const { roomId, originalPhotoUrl, keepMask, setKeepMask, setDepthMapUrl, toggleKeepItem } = useRoomStore()
  const { roomType: _roomType } = useFingerprintStore()
  const { setStep } = useSessionStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detectionFailed, setDetectionFailed] = useState(false)
  const [isDotsReady, setIsDotsReady] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  const photoContainerRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef<number>(0)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const listScrollRef = useRef<HTMLDivElement>(null)

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Trigger dots entrance animation once keepMask is loaded
  useEffect(() => {
    if (keepMask !== null) {
      const t = setTimeout(() => setIsDotsReady(true), 100)
      return () => clearTimeout(t)
    }
  }, [keepMask])

  // Poll /api/detect/status — skip if keepMask already populated (back navigation)
  useEffect(() => {
    if (keepMask !== null) {
      // Re-apply current showToUser threshold in case stored data is stale
      const remapped = keepMask.map((d) => ({ ...d, showToUser: d.confidence >= 0.35 }))
      if (JSON.stringify(remapped) !== JSON.stringify(keepMask)) {
        setKeepMask(remapped)
      }
      return
    }
    if (!roomId) return

    pollStartRef.current = Date.now()

    pollRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartRef.current
      if (elapsed > 30_000) {
        clearInterval(pollRef.current!)
        setDetectionFailed(true)
        return
      }

      try {
        const res = await fetch(`/api/detect/status?room_id=${roomId}`, { credentials: 'include' })
        if (res.status === 401) {
          clearInterval(pollRef.current!)
          router.push('/design/step-2')
          return
        }
        if (!res.ok) return

        const data = (await res.json()) as
          | { ready: false }
          | { ready: true; detections: KeepMaskItem[]; depth_map_url: string }

        if (data.ready) {
          clearInterval(pollRef.current!)
          setKeepMask(data.detections)
          setDepthMapUrl(data.depth_map_url)
        }
      } catch {
        // transient error — keep polling
      }
    }, 2500)
  }, [keepMask, roomId, setKeepMask])

  // Computed
  const visibleDetections = keepMask?.filter((d) => d.showToUser === true) ?? []
  const showFallback = detectionFailed || (keepMask !== null && visibleDetections.length === 0)
  const isPolling = keepMask === null && !detectionFailed

  const selectedItem = selectedId ? visibleDetections.find((d) => dotId(d) === selectedId) ?? null : null

  // Dot click — select and scroll list to row
  const handleDotClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
    setTimeout(() => {
      itemRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }, [])

  const handleOutsideClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  // Keep / remove actions
  const handleKeep = useCallback(
    (item: KeepMaskItem) => {
      toggleKeepItem({ ...item, keep: true })
    },
    [toggleKeepItem]
  )

  const handleRemove = useCallback(
    (item: KeepMaskItem) => {
      toggleKeepItem({ ...item, keep: false })
    },
    [toggleKeepItem]
  )

  // CTA — PATCH keep_mask then navigate
  const handleDesignRoom = useCallback(async () => {
    if (isNavigating) return
    setIsNavigating(true)
    setToastMessage(null)

    try {
      if (roomId) {
        const res = await fetch(`/api/rooms/${roomId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keep_mask: keepMask ?? [] }),
        })
        if (!res.ok) throw new Error('PATCH failed')
      }
      setStep(7)
      router.push('/design/step-7')
    } catch {
      setToastMessage("Couldn't save your selections — tap to retry")
      setIsNavigating(false)
    }
  }, [isNavigating, roomId, keepMask, setStep, router])

  // ── Loading state ────────────────────────────────────────────────────────
  if (isPolling) {
    return (
      <>
        <StepIndicator currentStep={6} totalSteps={10} />
        <LoadingScreen photoUrl={originalPhotoUrl} />
      </>
    )
  }

  // ── Fallback state ───────────────────────────────────────────────────────
  if (showFallback) {
    return (
      <div
        className="fixed inset-0 flex flex-col"
        style={{ background: 'var(--cova-bg)' }}
      >
        <StepIndicator currentStep={6} totalSteps={10} />

        {/* Photo panel (no dots) */}
        {originalPhotoUrl && (
          <div style={{ height: '58vh', position: 'relative', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalPhotoUrl}
              alt="Your room"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.2)' }} />
          </div>
        )}

        {/* Bottom panel — fallback */}
        <div
          className="flex-1 flex flex-col justify-between px-5 pt-5 pb-8"
          style={{
            background: 'var(--cova-surface)',
            borderTop: '2px solid rgba(201,168,76,0.4)',
            borderRadius: '16px 16px 0 0',
          }}
        >
          <div>
            <h1 className="font-serif mb-2" style={{ color: 'var(--cova-ivory)', fontSize: 'var(--text-xl)' }}>
              What stays?
            </h1>
            <p className="font-sans" style={{ color: 'var(--cova-muted)', fontSize: 'var(--text-sm)' }}>
              {detectionFailed
                ? "We couldn't detect individual items — we'll redesign everything."
                : "No individual items detected — we'll redesign everything."}
            </p>
          </div>

          <button
            onClick={() => void handleDesignRoom()}
            disabled={isNavigating}
            className="w-full font-sans transition-all duration-200"
            style={{
              maxWidth: 640,
              background: 'var(--cova-gold)',
              color: 'var(--cova-bg)',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              border: 'none',
              borderRadius: 14,
              padding: '17px 24px',
              cursor: isNavigating ? 'not-allowed' : 'pointer',
              opacity: isNavigating ? 0.7 : 1,
            }}
          >
            {isNavigating ? 'Working...' : 'Design My Room →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Ready state ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: 'var(--cova-bg)' }}
    >
      <StepIndicator currentStep={6} totalSteps={10} />

      {/* ── Photo panel (55vh) ── */}
      <div
        ref={photoContainerRef}
        style={{ height: '55vh', position: 'relative', overflow: 'hidden', flexShrink: 0 }}
        onClick={handleOutsideClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={originalPhotoUrl ?? ''}
          alt="Your room"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />

        {/* Subtle dark overlay */}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.2)' }} />

        {/* Instruction banner */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(to bottom, rgba(9,24,41,0.85) 0%, rgba(9,24,41,0) 100%)',
            height: 60,
            padding: '14px 20px',
          }}
        >
          <span
            className="font-sans"
            style={{ color: 'var(--cova-gold)', fontSize: 13, letterSpacing: '0.03em' }}
          >
            Tap any item to decide what to keep
          </span>
        </div>

        {/* Item count badge */}
        <div
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 20,
            background: 'rgba(10,22,40,0.75)', backdropFilter: 'blur(4px)',
            borderRadius: 20, padding: '3px 10px',
            color: '#F8F6F1', fontSize: 12, fontFamily: 'Inter, sans-serif',
          }}
        >
          {visibleDetections.length} items
        </div>

        {/* Bounding box overlay for selected item */}
        {selectedItem && (
          <div
            style={{
              position: 'absolute',
              left: `${selectedItem.bbox[0] * 100}%`,
              top: `${selectedItem.bbox[1] * 100}%`,
              width: `${selectedItem.bbox[2] * 100}%`,
              height: `${selectedItem.bbox[3] * 100}%`,
              border: '2px solid #C9A84C',
              background: 'rgba(201,168,76,0.15)',
              zIndex: 9,
              pointerEvents: 'none',
              borderRadius: 4,
            }}
          />
        )}

        {/* Hotspot dots — percentage-based positioning */}
        {visibleDetections.map((item, idx) => {
          const id = dotId(item)
          const isSelected = selectedId === id
          const state = keepToState(item.keep)

          const dotTransitionDelay = `${idx * 80}ms`
          const dotVisible = isDotsReady

          const dotStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${(item.bbox[0] + item.bbox[2] / 2) * 100}%`,
            top: `${(item.bbox[1] + item.bbox[3] / 2) * 100}%`,
            transform: dotVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0)',
            zIndex: 10,
            width: 28,
            height: 28,
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `all 250ms cubic-bezier(0.34,1.56,0.64,1) ${dotTransitionDelay}`,
            opacity: dotVisible ? 1 : 0,
            ...(state === 'keep' && {
              background: '#C9A84C',
              border: '2px solid #C9A84C',
              boxShadow: isSelected ? '0 0 0 4px rgba(201,168,76,0.5)' : '0 0 0 1px white',
            }),
            ...(state === 'remove' && {
              background: 'rgba(192,80,74,0.6)',
              border: '2px solid #C0504A',
              boxShadow: isSelected ? '0 0 0 4px rgba(192,80,74,0.4)' : '0 0 0 1px white',
            }),
            ...(state === 'undecided' && {
              background: 'rgba(201,168,76,0.3)',
              border: '2px solid #C9A84C',
              boxShadow: isSelected
                ? '0 0 0 4px rgba(201,168,76,0.5)'
                : '0 0 0 1px white',
              animation: isSelected ? 'dotPulse 1.4s ease-out infinite' : undefined,
            }),
          }

          return (
            <button
              key={id}
              aria-label={`${item.label} — ${state}`}
              onClick={(e) => {
                e.stopPropagation()
                handleDotClick(id)
              }}
              style={dotStyle}
            >
              {state === 'keep' && (
                <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>
              )}
              {state === 'remove' && (
                <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✕</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Bottom panel (45vh) ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--cova-surface)',
          borderTop: '2px solid rgba(201,168,76,0.4)',
          borderRadius: '16px 16px 0 0',
          overflow: 'hidden',
        }}
      >
        {/* Panel header */}
        <div
          className="px-5 pt-[18px] pb-3"
          style={{
            background: 'var(--cova-surface)',
            flexShrink: 0,
          }}
        >
          <h1
            className="font-serif"
            style={{ color: 'var(--cova-ivory)', fontSize: 26, letterSpacing: '0.01em' }}
          >
            What&apos;s in your room?
          </h1>
          <p className="font-sans mt-1" style={{ color: 'var(--cova-muted)', fontSize: 13 }}>
            Tap items in your room · the rest gets redesigned
          </p>
        </div>

        {/* Scrollable flat list */}
        <div
          ref={listScrollRef}
          className="overflow-y-auto px-5"
          style={{ flex: 1, paddingBottom: 80 }}
        >
          {visibleDetections.map((item) => {
            const id = dotId(item)
            const isHighlighted = selectedId === id
            const state = keepToState(item.keep)

            let rowBg = 'transparent'
            let rowBorderLeft = '3px solid transparent'
            if (state === 'keep') {
              rowBg = 'rgba(74,155,127,0.12)'
              rowBorderLeft = '3px solid #4A9B7F'
            } else if (state === 'remove') {
              rowBg = 'rgba(192,80,74,0.12)'
              rowBorderLeft = '3px solid #C0504A'
            }

            return (
              <div
                key={id}
                ref={(el) => { itemRefs.current[id] = el }}
                onClick={() => setSelectedId((prev) => (prev === id ? null : id))}
                className="flex items-center justify-between rounded-lg transition-colors duration-150"
                style={{
                  minHeight: 52,
                  borderBottom: '1px solid rgba(201,168,76,0.07)',
                  padding: '10px 4px 10px 10px',
                  background: isHighlighted ? (rowBg !== 'transparent' ? rowBg : 'rgba(201,168,76,0.06)') : rowBg,
                  borderLeft: isHighlighted && state === 'undecided'
                    ? '3px solid rgba(201,168,76,0.5)'
                    : rowBorderLeft,
                  cursor: 'pointer',
                  outline: isHighlighted ? '1px solid #C9A84C' : '1px solid transparent',
                  borderRadius: 8,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span style={{ fontSize: 20 }}>{getEmoji(item.label)}</span>
                  <span className="font-sans" style={{ color: 'var(--cova-ivory)', fontSize: 14 }}>
                    {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
                  </span>
                </div>

                {/* Keep / Remove buttons */}
                <div className="flex gap-1.5 ml-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleKeep(item)}
                    className="font-sans"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 150ms ease',
                      background: state === 'keep' ? '#4A9B7F' : 'transparent',
                      color: state === 'keep' ? 'white' : 'var(--cova-dim)',
                      border: state === 'keep' ? '1.5px solid #4A9B7F' : '1px solid rgba(74,94,122,0.3)',
                    }}
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => handleRemove(item)}
                    className="font-sans"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 150ms ease',
                      background: state === 'remove' ? '#C0504A' : 'transparent',
                      color: state === 'remove' ? 'white' : 'var(--cova-dim)',
                      border: state === 'remove' ? '1.5px solid #C0504A' : '1px solid rgba(74,94,122,0.3)',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}

          {/* Hint text */}
          <p
            className="font-sans text-center mt-4 px-5"
            style={{ color: 'var(--cova-dim)', fontSize: 12 }}
          >
            Leave items neutral — we&apos;ll redesign them all
          </p>
        </div>

        {/* Sticky CTA inside panel */}
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#0A1628',
            padding: '12px 16px',
            borderTop: '1px solid #1E3A5F',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => void handleDesignRoom()}
            disabled={isNavigating}
            className="w-full font-sans block mx-auto transition-all duration-200 hover:-translate-y-0.5"
            style={{
              maxWidth: 640,
              background: 'var(--cova-gold)',
              color: 'var(--cova-bg)',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              letterSpacing: '0.01em',
              border: 'none',
              borderRadius: 14,
              padding: '15px 24px',
              cursor: isNavigating ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 40px rgba(201,168,76,0.25)',
              opacity: isNavigating ? 0.7 : 1,
            }}
          >
            {isNavigating ? 'Working...' : 'Design My Room →'}
          </button>
        </div>
      </div>

      {/* ── Toast ── */}
      {toastMessage && (
        <div
          className="fixed bottom-28 left-4 right-4 z-50 text-center"
          style={{
            background: 'var(--cova-error-bg)',
            border: '1px solid var(--cova-error)',
            borderRadius: 10,
            padding: '12px 16px',
          }}
        >
          <button
            onClick={() => void handleDesignRoom()}
            className="font-sans w-full"
            style={{ color: 'var(--cova-error)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {toastMessage}
          </button>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes dotPulse {
          0%   { box-shadow: 0 0 0 0 rgba(201,168,76,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(201,168,76,0); }
          100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); }
        }
        @keyframes popupEnter {
          from { transform: translateX(-50%) scale(0.85); opacity: 0; }
          to   { transform: translateX(-50%) scale(1);    opacity: 1; }
        }
        .overflow-y-auto::-webkit-scrollbar { width: 4px; }
        .overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
        .overflow-y-auto::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.2); border-radius: 2px; }
      `}</style>
    </div>
  )
}
