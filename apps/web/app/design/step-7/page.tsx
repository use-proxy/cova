'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useRoomStore } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { useSessionStore } from '@/lib/store/session'
import { useRefineStore } from '@/lib/store/refine'
import { StepIndicator } from '@/components/cova/StepIndicator'

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

  const { roomId, originalPhotoUrl, depthMapUrl, keepMask, setRenderUrl, currentRenderIteration } = useRoomStore()
  const {
    fingerprint,
    roomType,
    budgetRange,
    budgetTier,
    styleName,
  } = useFingerprintStore()
  const { setStep } = useSessionStore()
  const { refinementText, styleStrength, clearRefinement } = useRefineStore()

  const [renderState, setRenderState] = useState<RenderState>('idle')
  const [renderError, setRenderError] = useState<RenderErrorInfo | null>(null)

  const firedRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear intervals on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Validate session data
  const isValid =
    originalPhotoUrl !== null &&
    fingerprint !== null &&
    roomType !== null &&
    budgetRange !== null &&
    roomId !== null

  // Fire render — POSTs to start prediction, then polls status every 3s
  const fireRender = useCallback(async () => {
    if (!isValid) {
      setRenderState('invalid')
      return
    }

    setRenderState('pending')
    setRenderError(null)

    // 90s hard timeout
    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current)
      setRenderState('timeout')
      setRenderError({
        variant: 'timeout',
        message: "This is taking longer than usual. Your room is saved — tap to try again.",
      })
    }, 90_000)

    try {
      // Step 1: kick off prediction
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: originalPhotoUrl,
          depth_map_url: depthMapUrl ?? undefined,
          keep_mask: keepMask ?? null,
          fingerprint_vector: fingerprint,
          room_type: roomType,
          budget: budgetTier,
          budget_tier: budgetTier,
          style_name: styleName ?? undefined,
          room_id: roomId,
          style_strength: styleStrength,
          render_iteration: currentRenderIteration,
          ...(refinementText ? { refinement_text: refinementText } : {}),
        }),
      })

      if (res.status === 401) {
        clearTimeout(timeoutRef.current!)
        setRenderState('failed')
        setRenderError({
          variant: 'failed',
          message: 'Please sign in to generate renders.',
        })
        return
      }

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }

      const startData = (await res.json()) as { prediction_id: string } | { error: string }
      if ('error' in startData) throw new Error(startData.error)

      const { prediction_id: predictionId } = startData

      // Step 2: poll status every 3s
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/render/status?prediction_id=${predictionId}&room_id=${roomId}&render_iteration=${currentRenderIteration}`
          )
          if (!statusRes.ok) return // transient error — keep polling

          const statusData = (await statusRes.json()) as
            | { status: 'processing' }
            | { status: 'complete'; render_url: string }
            | { status: 'failed'; error?: string }

          if (statusData.status === 'complete') {
            clearInterval(pollRef.current!)
            clearTimeout(timeoutRef.current!)
            clearRefinement()
            setRenderUrl(statusData.render_url)
            setRenderState('complete')
            setStep(8)
            router.push('/design/step-8')
          } else if (statusData.status === 'failed') {
            clearInterval(pollRef.current!)
            clearTimeout(timeoutRef.current!)
            setRenderState('failed')
            setRenderError({
              variant: 'failed',
              message: "The render didn't complete. Your room is saved — tap to try again.",
            })
          }
          // status === 'processing': do nothing, keep polling
        } catch {
          // transient poll error — keep polling
        }
      }, 3000)
    } catch (err) {
      clearTimeout(timeoutRef.current!)
      setRenderState('failed')
      setRenderError({
        variant: 'failed',
        message:
          err instanceof Error
            ? err.message
            : "The render didn't complete. Your room is saved — tap to try again.",
      })
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
    roomId,
    refinementText,
    styleStrength,
    currentRenderIteration,
    clearRefinement,
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
      <StepIndicator currentStep={7} totalSteps={10} />
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
