'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useRoomStore } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { useSessionStore } from '@/lib/store/session'

// ─── Types ──────────────────────────────────────────────────────────────────

type RenderState = 'idle' | 'pending' | 'complete' | 'failed' | 'timeout' | 'invalid'

interface RenderErrorInfo {
  variant: 'failed' | 'timeout'
  message: string
}

// ─── Button helpers ──────────────────────────────────────────────────────────

function PrimaryButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? 'var(--cova-subtle)' : 'var(--cova-gold)',
        color: 'var(--cova-bg)',
        border: 'none',
        borderRadius: 12,
        padding: '14px 28px',
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        width: '100%',
        maxWidth: 280,
        transition: 'opacity var(--transition-base)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

function GhostButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        color: 'var(--cova-muted)',
        border: '1px solid var(--cova-border)',
        borderRadius: 12,
        padding: '14px 28px',
        fontSize: 15,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        width: '100%',
        maxWidth: 280,
        transition: 'border-color var(--transition-base)',
      }}
    >
      {children}
    </button>
  )
}

// ─── Error screen ────────────────────────────────────────────────────────────

function ErrorScreen({
  info,
  onRetry,
  onBack,
}: {
  info: RenderErrorInfo
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <div
      style={{
        height: '100svh',
        background: 'var(--cova-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      <AlertTriangle size={32} color="var(--cova-warning)" />
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--cova-ivory)',
          marginTop: 16,
          textAlign: 'center',
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--cova-muted)',
          marginTop: 8,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        {info.message}
      </p>
      <div
        style={{
          marginTop: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: '100%',
          alignItems: 'center',
        }}
      >
        <PrimaryButton onClick={onRetry}>Try Again</PrimaryButton>
        <GhostButton onClick={onBack}>Go Back</GhostButton>
      </div>
    </div>
  )
}

// ─── Invalid session screen ──────────────────────────────────────────────────

function InvalidScreen({ onBack }: { onBack: () => void }) {
  return (
    <div
      style={{
        height: '100svh',
        background: 'var(--cova-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      <AlertTriangle size={32} color="var(--cova-warning)" />
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--cova-ivory)',
          marginTop: 16,
          textAlign: 'center',
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--cova-muted)',
          marginTop: 8,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        We lost some of your session data. Please go back and try again.
      </p>
      <div style={{ marginTop: 24 }}>
        <GhostButton onClick={onBack}>Go Back</GhostButton>
      </div>
    </div>
  )
}

// ─── Abstract grid SVG (depth map fallback) ──────────────────────────────────

function AbstractGrid() {
  const lines: React.ReactNode[] = []
  for (let x = 0; x <= 380; x += 20) {
    lines.push(
      <line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={285}
        stroke="var(--cova-subtle)"
        strokeWidth={0.5}
        opacity={0.4}
      />
    )
  }
  for (let y = 0; y <= 285; y += 20) {
    lines.push(
      <line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={380}
        y2={y}
        stroke="var(--cova-subtle)"
        strokeWidth={0.5}
        opacity={0.4}
      />
    )
  }
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      viewBox="0 0 380 285"
      preserveAspectRatio="xMidYMid slice"
    >
      {lines}
    </svg>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Step7Page() {
  const router = useRouter()

  const { roomId, originalPhotoUrl, depthMapUrl, keepMask, setRenderUrl } = useRoomStore()
  const {
    fingerprint,
    roomType,
    budgetRange,
    budgetTier,
    styleName,
    inclusions,
    constraints,
    dimensions,
  } = useFingerprintStore()
  const { setStep } = useSessionStore()

  const [renderState, setRenderState] = useState<RenderState>('idle')
  const [renderError, setRenderError] = useState<RenderErrorInfo | null>(null)
  const [_elapsed, setElapsed] = useState(0)

  const firedRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clear intervals on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Validate session data
  const isValid =
    originalPhotoUrl !== null &&
    fingerprint !== null &&
    roomType !== null &&
    budgetRange !== null &&
    roomId !== null

  // Fire render
  const fireRender = useCallback(async () => {
    if (!isValid) {
      setRenderState('invalid')
      return
    }

    setRenderState('pending')
    setRenderError(null)
    setElapsed(0)

    // 1s elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1
        if (next >= 90) {
          clearInterval(timerRef.current!)
          // timeout handled below in the fetch rejection path
        }
        return next
      })
    }, 1000)

    // 90s abort controller
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), 90_000)

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          photo_url: originalPhotoUrl,
          depth_map_url: depthMapUrl ?? undefined,
          keep_mask: keepMask ?? null,
          fingerprint_vector: fingerprint,
          room_type: roomType,
          budget: budgetTier,           // API expects the tier string
          budget_tier: budgetTier,
          style_name: styleName ?? undefined,
          inclusions: inclusions ?? [],
          constraints: constraints ?? [],
          dimensions: dimensions ?? undefined,
          room_id: roomId,
          modified_prompt: undefined,   // populated by step-9 refine flow (future)
        }),
      })

      clearTimeout(timeoutHandle)
      clearInterval(timerRef.current!)

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }

      const data = (await res.json()) as
        | { render_url: string; render_session_id: string }
        | { error: string }

      if ('error' in data) throw new Error(data.error)

      setRenderUrl(data.render_url)
      setRenderState('complete')
      setStep(8)
      router.push('/design/step-8')
    } catch (err) {
      clearTimeout(timeoutHandle)
      clearInterval(timerRef.current!)

      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))

      if (isAbort) {
        setRenderState('timeout')
        setRenderError({
          variant: 'timeout',
          message: "This is taking longer than usual. Your room is saved — tap to try again.",
        })
      } else {
        setRenderState('failed')
        setRenderError({
          variant: 'failed',
          message: "The render didn't complete. Your room is saved — tap to try again.",
        })
      }
    }
  }, [
    isValid,
    originalPhotoUrl,
    depthMapUrl,
    keepMask,
    fingerprint,
    roomType,
    budgetTier,
    styleName,
    inclusions,
    constraints,
    dimensions,
    roomId,
    setRenderUrl,
    setStep,
    router,
  ])

  // Fire once on mount — guard against StrictMode double-invocation
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    void fireRender()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    firedRef.current = false
    void fireRender()
  }, [fireRender])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  // ── Invalid session ──────────────────────────────────────────────────────
  if (renderState === 'invalid') {
    return <InvalidScreen onBack={handleBack} />
  }

  // ── Error / timeout ──────────────────────────────────────────────────────
  if ((renderState === 'failed' || renderState === 'timeout') && renderError) {
    return (
      <ErrorScreen info={renderError} onRetry={handleRetry} onBack={handleBack} />
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        height: '100svh',
        background: 'var(--cova-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      {/* Heading */}
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-3xl)',
          color: 'var(--cova-gold)',
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        Designing your room.
      </h1>

      {/* Subtext */}
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--cova-muted)',
          textAlign: 'center',
          marginBottom: 40,
        }}
      >
        This usually takes 30–45 seconds.
      </p>

      {/* Depth map visual */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          borderRadius: 12,
          overflow: 'hidden',
          aspectRatio: '4 / 3',
          background: 'var(--cova-surface-2)',
        }}
      >
        {depthMapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={depthMapUrl}
            alt="Room structure"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.75,
            }}
          />
        ) : (
          <AbstractGrid />
        )}

        {/* Scanline */}
        <motion.div
          animate={{ top: ['0%', '100%'] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--cova-gold)',
            opacity: 0.6,
          }}
        />
      </div>

      {/* Shimmer progress bar */}
      <div
        style={{
          marginTop: 40,
          width: '100%',
          maxWidth: 380,
          height: 3,
          background: 'var(--cova-subtle)',
          borderRadius: 9999,
          overflow: 'hidden',
        }}
      >
        <motion.div
          animate={{ x: ['-100%', '250%'] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          style={{
            width: '40%',
            height: '100%',
            borderRadius: 9999,
            background:
              'linear-gradient(90deg, transparent, var(--cova-gold), transparent)',
          }}
        />
      </div>
    </div>
  )
}
