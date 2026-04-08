'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useRoomStore, useSessionStore } from '@/lib/store'
import type { Detection } from '@/lib/store'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { StepIndicator } from '@/components/cova/StepIndicator'
import { GoldDivider } from '@/components/cova/GoldDivider'
import { CovaButton } from '@/components/cova/CovaButton'

// ─── Constants ───────────────────────────────────────────────────────────────

const CONSTRAINTS = [
  'I rent',
  'I have pets',
  "Can't drill walls",
  'Child-safe furniture',
  'Limited natural light',
]

const INCLUSIONS = [
  { emoji: '📺', label: 'TV' },
  { emoji: '🔊', label: 'Soundbar' },
  { emoji: '💡', label: 'Smart Lighting' },
  { emoji: '🎮', label: 'Gaming' },
  { emoji: '🛋️', label: 'Sofa' },
  { emoji: '🛏️', label: 'Bed' },
  { emoji: '💻', label: 'Desk' },
  { emoji: '🍽️', label: 'Dining Table' },
  { emoji: '🪴', label: 'Plants' },
  { emoji: '🖼️', label: 'Art' },
  { emoji: '🎯', label: 'Rug' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

type DetectionState = 'loading' | 'complete' | 'failed' | 'empty'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanLabel(raw: string): string {
  // Capitalize first letter
  const s = raw.charAt(0).toUpperCase() + raw.slice(1)
  // Remove duplicate consecutive words (case-insensitive)
  return s
    .split(' ')
    .filter((w, i, arr) => i === 0 || w.toLowerCase() !== arr[i - 1].toLowerCase())
    .join(' ')
    .slice(0, 30)
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Step5Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const { setStep } = useSessionStore()
  const fingerprintStore = useFingerprintStore()

  // Detection
  const [detectionState, setDetectionState] = useState<DetectionState>('loading')
  const [localDetections, setLocalDetections] = useState<Detection[]>([])
  const [selectedItem, setSelectedItem] = useState<Detection | null>(null)

  // Keep/remove per-item state (null = neutral, true = keep, false = remove)
  const [itemStates, setItemStates] = useState<Record<string, boolean | null>>({})

  // Space details
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null)
  const [selectedConstraints, setSelectedConstraints] = useState<string[]>([])
  const [selectedInclusions, setSelectedInclusions] = useState<string[]>([])

  // CTA
  const [isSaving, setIsSaving] = useState(false)

  // Canvas / photo refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoContainerRef = useRef<HTMLDivElement>(null)

  // ── Guards ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomStore.roomId || !roomStore.originalPhotoUrl) {
      router.push('/design/step-2')
    }
  }, [roomStore.roomId, roomStore.originalPhotoUrl, router])

  // ── Pre-fill room size from analysis ─────────────────────────────────────

  useEffect(() => {
    const dims = roomStore.roomAnalysis?.dimensions_estimate
    if (!dims) return
    const sqft = dims.width_ft * dims.length_ft
    if (sqft < 150) setSelectedDimension('Small')
    else if (sqft <= 300) setSelectedDimension('Medium')
    else setSelectedDimension('Large')
  }, [roomStore.roomAnalysis])

  // ── Detection polling ─────────────────────────────────────────────────────

  useEffect(() => {
    // Use in-memory cache if available
    if (roomStore.detections !== null && roomStore.detections.length > 0) {
      const visible = roomStore.detections.filter((d) => d.showToUser)
      setLocalDetections(visible)
      setDetectionState(visible.length === 0 ? 'empty' : 'complete')
      return
    }

    const roomId = roomStore.roomId
    if (!roomId) return

    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 30

    const poll = async () => {
      if (cancelled) return
      if (attempts >= MAX_ATTEMPTS) {
        setDetectionState('failed')
        return
      }

      try {
        const res = await fetch(`/api/detect/status?room_id=${roomId}`)
        if (cancelled) return

        if (res.status === 401) {
          setDetectionState('failed')
          return
        }

        const data = await res.json()

        if (data.ready) {
          // Map snake_case mask_url → camelCase maskUrl
          const mapped: Detection[] = (data.detections ?? []).map(
            (d: Record<string, unknown>) => ({
              ...d,
              maskUrl:
                typeof d.mask_url === 'string'
                  ? d.mask_url
                  : typeof d.maskUrl === 'string'
                  ? d.maskUrl
                  : undefined,
            })
          ) as Detection[]

          roomStore.setDetections(mapped)
          if (data.depth_map_url) {
            roomStore.setDepthMap(data.depth_map_url, 1)
          }
          if (data.room_analysis) {
            roomStore.setRoomAnalysis(data.room_analysis)
          }

          const visible = mapped.filter((d) => d.showToUser)
          setLocalDetections(visible)
          setDetectionState(visible.length === 0 ? 'empty' : 'complete')
          return
        }

        // Not ready yet — keep polling
        attempts++
        setTimeout(poll, 3000)
      } catch {
        attempts++
        if (attempts >= MAX_ATTEMPTS) {
          setDetectionState('failed')
        } else {
          setTimeout(poll, 3000)
        }
      }
    }

    poll()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Mount only — room values are stable after mount

  // ── Canvas resize ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    const container = photoContainerRef.current
    if (!canvas || !container) return

    const updateSize = () => {
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
    }

    updateSize()
    const obs = new ResizeObserver(updateSize)
    obs.observe(container)
    return () => obs.disconnect()
  }, [detectionState])

  // ── Canvas drawing ────────────────────────────────────────────────────────

  const drawBbox = useCallback(
    (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, d: Detection) => {
      const [x, y, w, h] = d.bbox
      ctx.strokeStyle = 'rgba(201,168,76,0.8)'
      ctx.lineWidth = 2
      ctx.strokeRect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height)
      ctx.fillStyle = 'rgba(201,168,76,0.15)'
      ctx.fillRect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height)
    },
    []
  )

  const drawMask = useCallback(
    (detection: Detection | null) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!detection) return

      if (detection.maskUrl) {
        const maskImg = new window.Image()
        maskImg.crossOrigin = 'anonymous'
        maskImg.onload = () => {
          ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height)
          ctx.globalCompositeOperation = 'source-in'
          ctx.fillStyle = 'rgba(201,168,76,0.45)'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.globalCompositeOperation = 'source-over'
        }
        maskImg.onerror = () => {
          drawBbox(ctx, canvas, detection)
        }
        maskImg.src = detection.maskUrl
      } else {
        drawBbox(ctx, canvas, detection)
      }
    },
    [drawBbox]
  )

  // ── Item state helpers ────────────────────────────────────────────────────

  const setItemKeep = useCallback(
    (label: string, keep: boolean | null) => {
      setItemStates((prev) => ({ ...prev, [label]: keep }))
      roomStore.toggleKeepItem(label, keep)
    },
    [roomStore]
  )

  const cycleItemState = useCallback(
    (label: string) => {
      setItemStates((prev) => {
        const cur = prev[label] ?? null
        const next = cur === null ? true : cur === true ? false : null
        roomStore.toggleKeepItem(label, next)
        return { ...prev, [label]: next }
      })
    },
    [roomStore]
  )

  // ── Card selection ────────────────────────────────────────────────────────

  const handleSelectItem = useCallback(
    (detection: Detection) => {
      if (selectedItem?.label === detection.label) {
        setSelectedItem(null)
        drawMask(null)
      } else {
        setSelectedItem(detection)
        drawMask(detection)
      }
    },
    [selectedItem, drawMask]
  )

  // ── CTA ───────────────────────────────────────────────────────────────────

  const handleDesignMyRoom = async () => {
    if (!roomStore.roomId) return
    setIsSaving(true)

    try {
      const keepMask = localDetections
        .filter((d) => itemStates[d.label] !== null && itemStates[d.label] !== undefined)
        .map((d) => ({
          type: d.type,
          label: d.label,
          bbox: d.bbox,
          confidence: d.confidence,
          keep: itemStates[d.label] as boolean,
          maskUrl: d.maskUrl,
        }))

      const res = await fetch(`/api/rooms/${roomStore.roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keep_mask: keepMask,
          dimensions: selectedDimension,
          constraints: selectedConstraints,
          inclusions: selectedInclusions,
          fingerprint_id: null, // StyleFingerprint has no id — DB row id not surfaced in store
        }),
      })

      if (!res.ok) throw new Error('save failed')

      // Persist space details to fingerprint store so step-6 render route receives them
      fingerprintStore.setInclusions(selectedInclusions)
      fingerprintStore.setConstraints(selectedConstraints)
      if (selectedDimension) {
        fingerprintStore.setRoomDimension(selectedDimension.toLowerCase() as 'small' | 'medium' | 'large')
      }

      setStep(6)
      router.push('/design/step-6')
    } catch {
      // Minimal inline error — no toast dependency
      setIsSaving(false)
      window.alert('Failed to save — tap to retry')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────────────────────────────────

  if (detectionState === 'loading') {
    return (
      <div className="min-h-screen bg-cova-bg flex flex-col">
        <div
          className="relative flex-1"
          style={{ minHeight: '60vh' }}
        >
          {roomStore.originalPhotoUrl && (
            <Image
              src={roomStore.originalPhotoUrl}
              alt="Room"
              fill
              className="object-cover"
              unoptimized
              style={{ filter: 'blur(2px) brightness(0.7)' }}
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-cova-gold border-t-transparent rounded-full animate-spin" />
            <p className="font-serif text-lg text-cova-ivory mt-4">Analyzing your room...</p>
            <p className="text-sm text-cova-muted mt-1">Identifying furniture and objects</p>
          </div>
        </div>
        <div className="bg-cova-surface border-t border-cova-border-dim px-4 pt-4 pb-8">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-[120px] h-[140px] flex-shrink-0 rounded-xl bg-cova-surface-2 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main UI
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-cova-bg flex flex-col pb-28">
      {/* Step indicator */}
      <StepIndicator currentStep={5} totalSteps={9} />

      {/* Back button */}
      <div className="relative h-10">
        <button
          onClick={() => router.push('/design/step-4')}
          className="absolute top-2 left-4 text-sm text-cova-muted hover:text-cova-ivory transition-colors duration-150"
        >
          ← Back
        </button>
      </div>

      {/* Photo + canvas */}
      <div
        ref={photoContainerRef}
        className="relative flex-shrink-0 overflow-hidden"
        style={{ height: '55vh' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedItem(null)
            drawMask(null)
          }
        }}
      >
        {roomStore.originalPhotoUrl && (
          <Image
            src={roomStore.originalPhotoUrl}
            alt="Your room"
            fill
            className="object-cover object-center"
            unoptimized
          />
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Failed / empty notice on photo */}
        {(detectionState === 'failed' || detectionState === 'empty') && (
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-sm text-cova-muted bg-cova-bg/90 rounded-xl px-4 py-3 text-center">
              {detectionState === 'failed'
                ? "We couldn't analyze your room — you can still continue"
                : 'No items detected — you can still continue'}
            </p>
          </div>
        )}
      </div>

      {/* Shelf */}
      <div className="bg-cova-surface border-t border-cova-border-dim flex-shrink-0">
        <div className="flex items-center px-4 pt-4 pb-2">
          <span className="font-serif text-xl text-cova-ivory">What stays?</span>
          {localDetections.length > 0 && (
            <span className="text-xs text-cova-muted ml-auto">
              {localDetections.length} item{localDetections.length !== 1 ? 's' : ''} detected
            </span>
          )}
        </div>

        {localDetections.length === 0 ? (
          <div className="px-4 pb-5">
            <p className="text-sm text-cova-muted py-2">
              No items to review — tap &quot;Design My Room&quot; to continue.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-4 pb-5 snap-x snap-mandatory scrollbar-hide">
            {localDetections.map((detection) => {
              const keepState = itemStates[detection.label] ?? null
              const isSelected = selectedItem?.label === detection.label
              const [bx, by, bw, bh] = detection.bbox

              // Safe background-position percentages
              const safeW = Math.max(bw, 0.01)
              const safeH = Math.max(bh, 0.01)
              const bgSizeX = (100 / safeW).toFixed(1)
              const bgSizeY = (100 / safeH).toFixed(1)
              const denomX = Math.max(1 - bw, 0.001)
              const denomY = Math.max(1 - bh, 0.001)
              const bgPosX = Math.min((bx / denomX) * 100, 100).toFixed(1)
              const bgPosY = Math.min((by / denomY) * 100, 100).toFixed(1)

              return (
                <div
                  key={detection.label}
                  className={[
                    'w-[120px] flex-shrink-0 rounded-xl overflow-hidden bg-cova-bg cursor-pointer snap-start transition-all duration-150',
                    isSelected
                      ? 'border border-cova-border-gold'
                      : 'border border-cova-border',
                  ].join(' ')}
                  onClick={() => handleSelectItem(detection)}
                >
                  {/* Crop thumbnail */}
                  <div className="relative aspect-square overflow-hidden">
                    {roomStore.originalPhotoUrl && (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${roomStore.originalPhotoUrl})`,
                          backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
                          backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                          backgroundRepeat: 'no-repeat',
                        }}
                      />
                    )}
                    {/* Confidence dot */}
                    <div
                      className={[
                        'absolute top-2 right-2 w-2 h-2 rounded-full',
                        detection.confidence >= 0.85
                          ? 'bg-green-400'
                          : detection.confidence >= 0.75
                          ? 'bg-yellow-400'
                          : 'bg-orange-400',
                      ].join(' ')}
                    />
                  </div>

                  {/* Label + toggle */}
                  <div className="p-2">
                    <p className="text-xs text-cova-ivory leading-tight line-clamp-2">
                      {cleanLabel(detection.label)}
                    </p>
                    <button
                      className={[
                        'mt-2 w-full text-xs rounded-lg py-1 border transition-all duration-150',
                        keepState === null
                          ? 'border-cova-border text-cova-muted'
                          : keepState === true
                          ? 'border-cova-success bg-cova-success/20 text-cova-success font-medium'
                          : 'border-cova-error bg-cova-error/20 text-cova-error font-medium',
                      ].join(' ')}
                      onClick={(e) => {
                        e.stopPropagation()
                        cycleItemState(detection.label)
                      }}
                    >
                      {keepState === null ? 'Decide' : keepState === true ? '✓ Keep' : '✕ Skip'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary list */}
      {localDetections.length > 0 && (
        <div className="px-4 mt-3 mb-2">
          {localDetections.map((detection) => {
            const keepState = itemStates[detection.label] ?? null
            return (
              <div
                key={detection.label}
                className="flex items-center justify-between py-2.5 border-b border-cova-border-dim last:border-0"
              >
                <span className="text-sm text-cova-ivory">
                  {cleanLabel(detection.label)}
                </span>
                <div className="flex gap-2">
                  <button
                    className={[
                      'text-xs px-3 py-1 rounded-full border transition-all duration-150',
                      keepState === true
                        ? 'bg-cova-success/20 border-cova-success text-cova-success'
                        : 'border-cova-border text-cova-muted',
                    ].join(' ')}
                    onClick={() => setItemKeep(detection.label, keepState === true ? null : true)}
                  >
                    Keep
                  </button>
                  <button
                    className={[
                      'text-xs px-3 py-1 rounded-full border transition-all duration-150',
                      keepState === false
                        ? 'bg-cova-error/20 border-cova-error text-cova-error'
                        : 'border-cova-border text-cova-muted',
                    ].join(' ')}
                    onClick={() => setItemKeep(detection.label, keepState === false ? null : false)}
                  >
                    Skip
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Space Details */}
      <div className="px-4 mt-6">
        <GoldDivider label="Your Space" className="mb-6" />

        {/* Room size */}
        <p className="text-xs uppercase tracking-widest text-cova-muted mb-3">Room size</p>
        <div className="flex gap-2 mb-6">
          {[
            { label: 'Small', sub: '<150 sqft' },
            { label: 'Medium', sub: '150–300 sqft' },
            { label: 'Large', sub: '300+ sqft' },
          ].map(({ label, sub }) => (
            <button
              key={label}
              onClick={() => setSelectedDimension(label)}
              className={[
                'flex-1 rounded-xl py-3 px-2 text-center border transition-all duration-150',
                selectedDimension === label
                  ? 'bg-cova-gold text-cova-bg font-medium border-cova-gold'
                  : 'bg-cova-surface border-cova-border text-cova-ivory',
              ].join(' ')}
            >
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs opacity-60 mt-0.5">{sub}</div>
            </button>
          ))}
        </div>

        {/* Constraints */}
        <p className="text-xs uppercase tracking-widest text-cova-muted mb-3">
          Anything we should know?
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {CONSTRAINTS.map((c) => {
            const sel = selectedConstraints.includes(c)
            return (
              <button
                key={c}
                onClick={() =>
                  setSelectedConstraints((prev) =>
                    sel ? prev.filter((x) => x !== c) : [...prev, c]
                  )
                }
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border transition-all duration-150',
                  sel
                    ? 'border-cova-border-gold bg-cova-surface-2 text-cova-ivory'
                    : 'border-cova-border bg-cova-surface text-cova-muted',
                ].join(' ')}
              >
                {sel && <span className="text-cova-gold text-xs">✓</span>}
                {c}
              </button>
            )
          })}
        </div>

        {/* Must-haves */}
        <p className="text-xs uppercase tracking-widest text-cova-muted mb-3">Must-haves</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {INCLUSIONS.map(({ emoji, label }) => {
            const sel = selectedInclusions.includes(label)
            return (
              <button
                key={label}
                onClick={() =>
                  setSelectedInclusions((prev) =>
                    sel ? prev.filter((x) => x !== label) : [...prev, label]
                  )
                }
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border transition-all duration-150',
                  sel
                    ? 'border-cova-border-gold bg-cova-surface-2 text-cova-ivory'
                    : 'border-cova-border bg-cova-surface text-cova-muted',
                ].join(' ')}
              >
                <span>{emoji}</span>
                {label}
                {sel && <span className="text-cova-gold text-xs ml-0.5">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-cova-bg border-t border-cova-border-dim px-4 py-4"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <CovaButton
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isSaving}
          onClick={handleDesignMyRoom}
        >
          Design My Room →
        </CovaButton>
        <p className="text-xs text-cova-muted text-center mt-2">
          Unsure? Leave everything — we&apos;ll redesign it all.
        </p>
      </div>
    </div>
  )
}
