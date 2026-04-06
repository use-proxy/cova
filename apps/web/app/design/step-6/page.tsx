'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
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

function stateToKeep(state: ItemState): boolean | null {
  if (state === 'keep') return true
  if (state === 'remove') return false
  return null
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

// ─── Hotspot Dot ────────────────────────────────────────────────────────────

function HotspotDot({
  item,
  dotLeft,
  dotTop,
  containerH,
  isOpen,
  onDotClick,
  onKeep,
  onRemove,
  entranceIndex,
  isReady,
}: {
  item: KeepMaskItem
  dotLeft: number
  dotTop: number
  containerH: number
  isOpen: boolean
  onDotClick: () => void
  onKeep: () => void
  onRemove: () => void
  entranceIndex: number
  isReady: boolean
}) {
  const [isVisible, setIsVisible] = useState(false)
  const state = keepToState(item.keep)

  useEffect(() => {
    if (!isReady) return
    const t = setTimeout(() => setIsVisible(true), entranceIndex * 120)
    return () => clearTimeout(t)
  }, [isReady, entranceIndex])

  const dotStyles: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 250ms cubic-bezier(0.34,1.56,0.64,1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: isVisible ? 'scale(1)' : 'scale(0)',
    opacity: isVisible ? (state === 'remove' ? 0.6 : 1) : 0,
    ...(state === 'keep' && {
      backgroundColor: 'var(--cova-keep)',
      boxShadow: '0 0 0 4px rgba(26,122,74,0.3), 0 0 16px rgba(26,122,74,0.4)',
    }),
    ...(state === 'remove' && {
      backgroundColor: 'rgba(74,94,122,0.5)',
      border: '1.5px solid var(--cova-dim)',
    }),
    ...(state === 'undecided' && {
      backgroundColor: 'var(--cova-gold)',
      boxShadow: '0 0 0 4px rgba(201,168,76,0.25)',
      animation: isVisible ? 'dotPulse 2.2s ease-out infinite' : 'none',
    }),
  }

  // Popup position: above by default, below if dot is in top 20% of container
  const showBelow = containerH > 0 && dotTop / containerH < 0.20

  return (
    <div
      className="absolute z-10"
      style={{
        left: dotLeft,
        top: dotTop,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDotClick()
        }}
        style={dotStyles}
        aria-label={`${item.label} — ${state}`}
      >
        {state === 'keep' && (
          <svg width="12" height="12" viewBox="-5 -5 10 10" fill="none">
            <path d="M-4 0 L-1 3 L4 -3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === 'remove' && <Check size={10} color="white" strokeWidth={2.5} />}
        {state === 'undecided' && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'white' }} />
        )}
      </button>

      {/* Popup */}
      {isOpen && (
        <div
          className="absolute z-30"
          style={{
            ...(showBelow
              ? { top: 'calc(100% + 14px)' }
              : { bottom: 'calc(100% + 14px)' }),
            left: '50%',
            transform: 'translateX(-50%)',
            animation: 'popupEnter 250ms cubic-bezier(0.34,1.56,0.64,1)',
            transformOrigin: showBelow ? 'top center' : 'bottom center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: 'rgba(9,24,41,0.97)',
              border: '1px solid rgba(201,168,76,0.5)',
              borderRadius: 14,
              padding: '14px 16px',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(201,168,76,0.1)',
              minWidth: 170,
              whiteSpace: 'nowrap',
              position: 'relative',
            }}
          >
            <span
              className="font-serif block mb-3"
              style={{ color: 'var(--cova-ivory)', fontSize: 16 }}
            >
              {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
            </span>

            <div className="flex gap-2">
              <button
                onClick={onKeep}
                className="flex-1 flex items-center justify-center gap-1.5 font-sans transition-all duration-150"
                style={{
                  backgroundColor: 'var(--cova-keep-bg)',
                  border: '1.5px solid var(--cova-keep)',
                  color: 'var(--cova-keep-bright)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Check size={16} strokeWidth={2.5} />
                Keep
              </button>
              <button
                onClick={onRemove}
                className="flex-1 flex items-center justify-center gap-1.5 font-sans transition-all duration-150"
                style={{
                  backgroundColor: 'var(--cova-remove-bg)',
                  border: '1.5px solid rgba(192,57,43,0.5)',
                  color: 'var(--cova-remove)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Remove
              </button>
            </div>

            {/* Arrow */}
            {!showBelow && (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: -7,
                  width: 14,
                  height: 7,
                  backgroundColor: 'rgba(9,24,41,0.97)',
                  clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                }}
              />
            )}
            {showBelow && (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: -7,
                  width: 14,
                  height: 7,
                  backgroundColor: 'rgba(9,24,41,0.97)',
                  clipPath: 'polygon(50% 0, 0 100%, 100% 100%)',
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Three-state toggle ─────────────────────────────────────────────────────

function StateToggle({
  state,
  onChange,
}: {
  state: ItemState
  onChange: (next: ItemState) => void
}) {
  const pills: { key: ItemState; label: string }[] = [
    { key: 'keep', label: 'Keep' },
    { key: 'undecided', label: '—' },
    { key: 'remove', label: 'Remove' },
  ]

  return (
    <div className="flex gap-1">
      {pills.map(({ key, label }) => {
        const isActive = state === key
        let activeStyle: React.CSSProperties = {}
        const inactiveStyle: React.CSSProperties = {
          backgroundColor: 'transparent',
          border: '1px solid rgba(74,94,122,0.3)',
          color: 'var(--cova-dim)',
        }

        if (isActive) {
          if (key === 'keep') {
            activeStyle = {
              backgroundColor: 'var(--cova-keep-bg)',
              border: '1.5px solid var(--cova-keep)',
              color: 'var(--cova-keep-bright)',
            }
          } else if (key === 'remove') {
            activeStyle = {
              backgroundColor: 'var(--cova-remove-bg)',
              border: '1.5px solid rgba(192,57,43,0.6)',
              color: 'var(--cova-remove)',
            }
          } else {
            activeStyle = {
              backgroundColor: 'rgba(201,168,76,0.1)',
              border: '1.5px solid rgba(201,168,76,0.4)',
              color: 'var(--cova-gold)',
            }
          }
        }

        const handleClick = () => {
          // Toggle off if already active (revert to undecided), else set
          if (key === 'undecided') {
            onChange('undecided')
          } else {
            onChange(isActive ? 'undecided' : key)
          }
        }

        return (
          <button
            key={key}
            onClick={handleClick}
            className="font-sans"
            style={{
              padding: '5px 11px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 500,
              transition: 'all 150ms ease',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              ...(isActive ? activeStyle : inactiveStyle),
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Step6Page() {
  const router = useRouter()
  const { roomId, originalPhotoUrl, keepMask, setKeepMask, setDepthMapUrl, toggleKeepItem } = useRoomStore()
  const { roomType: _roomType } = useFingerprintStore()
  const { setStep } = useSessionStore()

  const [expandedDotId, setExpandedDotId] = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{
    natural: { w: number; h: number }
    container: { w: number; h: number }
  } | null>(null)
  const [detectionFailed, setDetectionFailed] = useState(false)
  const [isDotsReady, setIsDotsReady] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  const photoContainerRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef<number>(0)

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

  // ResizeObserver for container dimensions
  useEffect(() => {
    const container = photoContainerRef.current
    if (!container) return

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setImageDimensions((prev) =>
        prev
          ? { ...prev, container: { w: width, h: height } }
          : { natural: { w: 0, h: 0 }, container: { w: width, h: height } }
      )
    })
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  // Poll /api/detect/status — skip if keepMask already populated (back navigation)
  useEffect(() => {
    if (keepMask !== null) return // already have data
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
          router.push('/design/step-3?auth_required=true')
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
  const visibleDetections = keepMask?.filter((d) => d.confidence >= 0.60) ?? []
  const furnitureItems = visibleDetections.filter((d) => d.type === 'furniture')
  const architectureItems = visibleDetections.filter((d) => d.type === 'architecture')
  const showFallback = detectionFailed || (keepMask !== null && visibleDetections.length === 0)
  const isPolling = keepMask === null && !detectionFailed

  // Handle image natural dimensions
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageDimensions((prev) => ({
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      container: prev?.container ?? { w: 0, h: 0 },
    }))
  }, [])

  // Dot click / close
  const handleDotClick = useCallback((id: string) => {
    setExpandedDotId((prev) => (prev === id ? null : id))
  }, [])

  const handleOutsideClick = useCallback(() => {
    setExpandedDotId(null)
  }, [])

  // Keep / remove actions
  const handleKeep = useCallback(
    (item: KeepMaskItem) => {
      toggleKeepItem({ ...item, keep: true })
      setExpandedDotId(null)
    },
    [toggleKeepItem]
  )

  const handleRemove = useCallback(
    (item: KeepMaskItem) => {
      toggleKeepItem({ ...item, keep: false })
      setExpandedDotId(null)
    },
    [toggleKeepItem]
  )

  const handleToggleState = useCallback(
    (item: KeepMaskItem, next: ItemState) => {
      toggleKeepItem({ ...item, keep: stateToKeep(next) })
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

      {/* ── Photo panel (58vh) ── */}
      <div
        ref={photoContainerRef}
        style={{ height: '58vh', position: 'relative', overflow: 'hidden' }}
        onClick={handleOutsideClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={originalPhotoUrl ?? ''}
          alt="Your room"
          onLoad={handleImageLoad}
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

        {/* Hotspot dots */}
        {imageDimensions &&
          imageDimensions.container.w > 0 &&
          visibleDetections.map((item, idx) => {
            const { container } = imageDimensions
            // bbox is [x, y, w, h] normalized 0-1 — convert center to container pixels
            const dotLeft = (item.bbox[0] + item.bbox[2] / 2) * container.w
            const dotTop = (item.bbox[1] + item.bbox[3] / 2) * container.h
            const id = dotId(item)

            return (
              <HotspotDot
                key={id}
                item={item}
                dotLeft={dotLeft}
                dotTop={dotTop}
                containerH={container.h}
                isOpen={expandedDotId === id}
                onDotClick={() => handleDotClick(id)}
                onKeep={() => handleKeep(item)}
                onRemove={() => handleRemove(item)}
                entranceIndex={idx}
                isReady={isDotsReady}
              />
            )
          })}
      </div>

      {/* ── Bottom panel (42vh) ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--cova-surface)',
          borderTop: '2px solid rgba(201,168,76,0.4)',
          borderRadius: '16px 16px 0 0',
          height: '42vh',
          overflow: 'hidden',
        }}
      >
        {/* Sticky header */}
        <div
          className="px-5 pt-[18px] pb-3"
          style={{
            background: 'var(--cova-surface)',
            flexShrink: 0,
          }}
        >
          <div className="flex items-baseline justify-between">
            <h1
              className="font-serif"
              style={{ color: 'var(--cova-ivory)', fontSize: 26, letterSpacing: '0.01em' }}
            >
              What stays?
            </h1>
            <span
              className="font-sans"
              style={{ color: 'var(--cova-muted)', fontSize: 12 }}
            >
              {visibleDetections.length} items detected
            </span>
          </div>
          <p className="font-sans mt-1" style={{ color: 'var(--cova-muted)', fontSize: 13 }}>
            Tap items in your room · the rest gets redesigned
          </p>
        </div>

        {/* Scrollable list */}
        <div
          className="overflow-y-auto px-5"
          style={{ flex: 1, paddingBottom: 110 }}
        >
          {/* Section: Furniture */}
          {furnitureItems.length > 0 && (
            <>
              <p
                className="font-sans"
                style={{
                  color: 'var(--cova-gold)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '10px 0 4px',
                  opacity: 0.7,
                }}
              >
                Furniture
              </p>
              {furnitureItems.map((item) => {
                const id = dotId(item)
                const isHighlighted = expandedDotId === id
                const state = keepToState(item.keep)
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-lg transition-colors duration-150"
                    style={{
                      borderBottom: '1px solid rgba(201,168,76,0.07)',
                      padding: '13px 4px',
                      paddingLeft: isHighlighted ? 10 : 4,
                      background: isHighlighted ? 'rgba(201,168,76,0.06)' : 'transparent',
                      borderLeft: isHighlighted
                        ? '2px solid rgba(201,168,76,0.4)'
                        : '2px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span style={{ fontSize: 20 }}>{getEmoji(item.label)}</span>
                      <span className="font-sans" style={{ color: 'var(--cova-ivory)', fontSize: 14 }}>
                        {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
                      </span>
                    </div>
                    <StateToggle state={state} onChange={(next) => handleToggleState(item, next)} />
                  </div>
                )
              })}
            </>
          )}

          {/* Section: Walls & Decor */}
          {architectureItems.length > 0 && (
            <>
              <p
                className="font-sans"
                style={{
                  color: 'var(--cova-gold)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '14px 0 4px',
                  opacity: 0.7,
                }}
              >
                Walls & Decor
              </p>
              {architectureItems.map((item) => {
                const id = dotId(item)
                const isHighlighted = expandedDotId === id
                const state = keepToState(item.keep)
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-lg transition-colors duration-150"
                    style={{
                      borderBottom: '1px solid rgba(201,168,76,0.07)',
                      padding: '13px 4px',
                      paddingLeft: isHighlighted ? 10 : 4,
                      background: isHighlighted ? 'rgba(201,168,76,0.06)' : 'transparent',
                      borderLeft: isHighlighted
                        ? '2px solid rgba(201,168,76,0.4)'
                        : '2px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span style={{ fontSize: 20 }}>{getEmoji(item.label)}</span>
                      <span className="font-sans" style={{ color: 'var(--cova-ivory)', fontSize: 14 }}>
                        {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
                      </span>
                    </div>
                    <StateToggle state={state} onChange={(next) => handleToggleState(item, next)} />
                  </div>
                )
              })}
            </>
          )}

          {/* Hint text */}
          <p
            className="font-sans text-center mt-4 px-5"
            style={{ color: 'var(--cova-dim)', fontSize: 12 }}
          >
            Leave items neutral — we&apos;ll redesign them all
          </p>
        </div>
      </div>

      {/* ── Fixed CTA ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{
          background: `linear-gradient(to top, var(--cova-surface) 0%, var(--cova-surface) 70%, rgba(15,31,61,0) 100%)`,
          padding: '24px 20px 32px 20px',
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
            padding: '17px 24px',
            cursor: isNavigating ? 'not-allowed' : 'pointer',
            boxShadow: '0 0 40px rgba(201,168,76,0.25)',
            opacity: isNavigating ? 0.7 : 1,
          }}
        >
          {isNavigating ? 'Working...' : 'Design My Room →'}
        </button>
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
