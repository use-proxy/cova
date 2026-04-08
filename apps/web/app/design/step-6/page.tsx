'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import Image from 'next/image'

import { useRoomStore } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { CovaButton } from '@/components/cova/CovaButton'

// ─── Types ─────────────────────────────────────────────────────────────────

type RenderStage = 'firing' | 'preview' | 'complete' | 'error'

// ─── Constants ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 30 // 90 seconds total

// ─── Stage indicator text ───────────────────────────────────────────────────

const STAGE_TEXT: Record<RenderStage, string> = {
  firing: 'Applying your style...',
  preview: 'Refining details...',
  complete: 'Your room is ready',
  error: '',
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Step6Page() {
  const router = useRouter()

  const roomStore = useRoomStore()
  const fingerprintStore = useFingerprintStore()

  const [stage, setStage] = useState<RenderStage>('firing')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [, setPollCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fireCount, setFireCount] = useState(0) // incremented to re-trigger render fire

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // ─── Fire render on mount ─────────────────────────────────────────────────

  useEffect(() => {
    const { roomId, originalPhotoUrl, depthMapUrl, keepMask, referenceImageUrls, renderUrl, predictionId } = roomStore
    const { fingerprint, roomType, budgetTier } = fingerprintStore

    // Guard: missing room
    if (!roomId || !originalPhotoUrl) {
      router.push('/design/step-2')
      return
    }

    // Guard: missing fingerprint
    if (!fingerprint) {
      router.push('/design/step-3')
      return
    }

    // Guard: render already complete (back navigation)
    if (renderUrl) {
      router.push('/design/step-7')
      return
    }

    // Guard: prediction already in flight (e.g. React strict mode double-invoke)
    if (predictionId) {
      return
    }

    const payload = {
      room_id: roomId,
      photo_url: originalPhotoUrl,
      depth_map_url: depthMapUrl ?? null,
      keep_mask: keepMask ?? [],
      fingerprint_vector: fingerprint,
      reference_image_urls: referenceImageUrls ?? [],
      room_type: roomType ?? 'bedroom',
      budget: budgetTier ?? 'mid',
      inclusions: [] as string[],
      constraints: [] as string[],
      room_analysis: null,
    }

    fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `Render failed (${res.status})`)
        }
        return res.json() as Promise<{ prediction_id: string; schnell_prediction_id?: string }>
      })
      .then((data) => {
        roomStore.setPredictionIds(data.prediction_id, data.schnell_prediction_id)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Render failed — please try again'
        setStage('error')
        setErrorMessage(msg)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireCount])

  // ─── Polling ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const { predictionId, roomId } = roomStore
    if (!predictionId || !roomId) return
    if (stage === 'complete' || stage === 'error') return

    let localPollCount = 0

    intervalRef.current = setInterval(async () => {
      if (localPollCount >= MAX_POLLS) {
        clearInterval(intervalRef.current!)
        setStage('error')
        setErrorMessage('Render timed out — please try again')
        return
      }

      try {
        const res = await fetch(
          `/api/render/status?prediction_id=${predictionId}&room_id=${roomId}`,
          { credentials: 'include' },
        )
        if (res.status === 401) {
          clearInterval(intervalRef.current!)
          router.push('/design/step-2')
          return
        }

        const data = (await res.json()) as {
          status?: string
          render_url?: string
          preview_url?: string
          render_session_id?: string | null
          error?: string
        }

        localPollCount += 1
        setPollCount(localPollCount)

        // Preview URL (optional — API may not return this)
        if (data.preview_url && !previewUrl) {
          setPreviewUrl(data.preview_url)
          roomStore.setPreviewUrl(data.preview_url)
          setStage('preview')
        }

        // Full render complete
        if (data.render_url) {
          clearInterval(intervalRef.current!)
          roomStore.setRenderUrl(data.render_url)
          roomStore.addRenderSession({
            id: data.render_session_id ?? crypto.randomUUID(),
            renderUrl: data.render_url,
            previewUrl: data.preview_url ?? null,
            parallaxVideoUrl: null,
            iteration: roomStore.currentRenderIteration,
            createdAt: new Date().toISOString(),
          })
          setStage('complete')
          timeoutRef.current = setTimeout(() => router.push('/design/step-7'), 800)
          return
        }

        // Error from API
        if (data.status === 'failed' || data.error) {
          clearInterval(intervalRef.current!)
          setStage('error')
          setErrorMessage(data.error ?? 'Render failed — please try again')
        }
      } catch {
        // transient network error — keep polling
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomStore.predictionId])

  // ─── Retry handler ────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    // Clear existing prediction so fire guard doesn't skip
    roomStore.setPredictionIds('', undefined)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setStage('firing')
    setPreviewUrl(null)
    setPollCount(0)
    setErrorMessage(null)
    setFireCount((c) => c + 1)
  }, [roomStore])

  // ─── Derived values ───────────────────────────────────────────────────────

  const { originalPhotoUrl } = roomStore
  const isShimmering = stage === 'firing' || stage === 'preview'
  const progressWidth = stage === 'complete' ? '100%' : '40%'

  // ─── Error state ──────────────────────────────────────────────────────────

  if (stage === 'error') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden font-sans"
        style={{ background: 'var(--cova-bg)' }}
      >
        {/* Blurred background */}
        {originalPhotoUrl && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalPhotoUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(24px) brightness(0.3)', transform: 'scale(1.1)' }}
            />
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center gap-2 px-8 max-w-sm text-center">
          <AlertCircle size={48} style={{ color: 'var(--cova-error)' }} />
          <h2
            className="font-serif mt-4"
            style={{ color: 'var(--cova-ivory)', fontSize: 'var(--text-2xl)' }}
          >
            Render failed
          </h2>
          <p
            className="font-sans mt-2 max-w-xs"
            style={{ color: 'var(--cova-muted)', fontSize: 'var(--text-sm)' }}
          >
            {errorMessage}
          </p>
          <div className="mt-8 flex gap-3">
            <CovaButton variant="primary" onClick={handleRetry}>
              Try Again
            </CovaButton>
            <CovaButton variant="ghost" onClick={() => router.push('/design/step-5')}>
              Go Back
            </CovaButton>
          </div>
        </div>
      </div>
    )
  }

  // ─── Normal state (firing / preview / complete) ───────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden font-sans"
      style={{ background: 'var(--cova-bg)' }}
    >
      {/* ── Background Layer ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* Base: blurred original photo */}
        {originalPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={originalPhotoUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter: 'blur(24px) brightness(0.4)',
              transform: 'scale(1.1)',
            }}
          />
        )}

        {/* Top layer: Schnell preview crossfade (if present) */}
        <AnimatePresence>
          {previewUrl && (
            <motion.div
              key="preview-bg"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: stage === 'complete' ? 1 : 0.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            >
              <Image
                src={previewUrl}
                alt=""
                fill
                className="object-cover"
                style={{
                  filter: stage === 'complete' ? 'none' : 'brightness(0.7)',
                }}
                priority
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Foreground content ── */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-8 max-w-sm text-center">
        {/* Heading */}
        <h2
          className="font-serif"
          style={{
            color: 'var(--cova-ivory)',
            fontSize: 'var(--text-3xl)',
            textShadow: '0 2px 20px rgba(0,0,0,0.8)',
          }}
        >
          Designing your room...
        </h2>

        {/* Progress bar */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div
            className="overflow-hidden rounded-full"
            style={{
              width: 256,
              height: 2,
              background: 'rgba(255,255,255,0.2)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: progressWidth,
                background: 'var(--cova-gold)',
                borderRadius: 9999,
                transition: stage === 'complete' ? 'width 500ms ease' : undefined,
                animation: isShimmering ? 'shimmer 1.8s ease-in-out infinite' : undefined,
              }}
            />
          </div>

          {/* Stage text */}
          <AnimatePresence mode="wait">
            <motion.p
              key={stage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="font-sans"
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'var(--text-xs)' }}
            >
              {STAGE_TEXT[stage]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Preview thumbnail (only when preview URL available) */}
        <AnimatePresence>
          {previewUrl && (
            <motion.div
              key="preview-thumb"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="relative overflow-hidden"
                style={{
                  width: 128,
                  height: 96,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <Image
                  src={previewUrl}
                  alt="Preview"
                  fill
                  className="object-cover"
                />
              </div>
              <p
                className="font-sans"
                style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--text-xs)' }}
              >
                Preview
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}
