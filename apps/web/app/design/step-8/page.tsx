'use client'

/**
 * Step 8 — Render Loading + Result + Tweak Panel
 * Three states: loading (gold arc), result (before/after slider), tweak (bottom sheet).
 * Preserves all render polling logic, tweak API calls, and undo stack from prior implementation.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRoomStore } from '@/lib/store/room'

import { useSessionStore } from '@/lib/store/session'

// ─── Constants ─────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 200
const MAX_KONTEXT_TWEAKS = 5
const MAX_UNDO = 3

// ─── Color palette chips for tweak panel ────────────────────────────────────
const COLOR_CHIPS = ['#8B5E3C', '#D4B483', '#4A6741', '#7B8FA0', '#C4A882', '#2C3E50']

// ─── Design token values kept for dynamic inline usage ───────────────────────
const BG = '#091829'
const GOLD = '#C9A84C'

// ─── Types ──────────────────────────────────────────────────────────────────
type PageState = 'loading' | 'result' | 'tweak'
type InitialStage = 'checking' | 'firing' | 'ready' | 'error'
type TweakType = 'color' | 'furniture' | 'accessory' | 'lighting'

export default function Step8Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const { setStep } = useSessionStore()

  // Page-level state machine
  const [pageState, setPageState] = useState<PageState>('loading')

  // Existing render polling state (preserved)
  const [hydrated, setHydrated] = useState(false)
  const [initialStage, setInitialStage] = useState<InitialStage>('checking')
  const [initialError, setInitialError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Before/after slider
  const [splitPosition, setSplitPosition] = useState<number>(50)
  const isDragging = useRef(false)
  const sliderContainerRef = useRef<HTMLDivElement>(null)

  // Undo stack (preserved)
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [kontextCount, setKontextCount] = useState(0)
  const [isTweaking, setIsTweaking] = useState(false)

  // Tweak panel inputs
  const [furnitureTweakText, setFurnitureTweakText] = useState('')
  const [accessoryTweakText, setAccessoryTweakText] = useState('')
  const [selectedColorChip, setSelectedColorChip] = useState<string | null>(null)

  const initialPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tweakPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(t)
  }, [])

  // ── Initial render fire (preserved) ────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return

    if (roomStore.renderUrl) {
      setInitialStage('ready')
      setPageState('result')
      return
    }

    if (!roomStore.roomId) {
      router.push('/design/step-2')
      return
    }

    let cancelled = false
    const supabase = createBrowserClient()

    ;(async () => {
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('render_context')
        .eq('id', roomStore.roomId!)
        .single()

      const ctx = (roomRow as { render_context?: { fluxPrompt?: string } } | null)
        ?.render_context
      if (!ctx || !ctx.fluxPrompt) {
        router.push('/design/step-7a')
        return
      }
      if (cancelled) return

      setInitialStage('firing')

      try {
        const fireRes = await fetch('/api/render/from-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ room_id: roomStore.roomId }),
        })
        if (!fireRes.ok) {
          const err = await fireRes.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error || 'Initial render failed')
        }
        const fireData = (await fireRes.json()) as {
          prediction_id: string
          schnell_prediction_id?: string
        }
        const { prediction_id, schnell_prediction_id } = fireData

        let polls = 0
        initialPollRef.current = setInterval(async () => {
          if (cancelled) {
            if (initialPollRef.current) clearInterval(initialPollRef.current)
            return
          }
          polls += 1
          if (polls > MAX_POLLS) {
            if (initialPollRef.current) clearInterval(initialPollRef.current)
            setInitialError('Render timed out — please try again')
            setInitialStage('error')
            return
          }

          try {
            const schnellParam = schnell_prediction_id
              ? `&schnell_prediction_id=${schnell_prediction_id}`
              : ''
            const statusRes = await fetch(
              `/api/render/status?prediction_id=${prediction_id}&room_id=${roomStore.roomId}${schnellParam}`,
              { credentials: 'include' }
            )
            const data = (await statusRes.json()) as {
              status?: string
              render_url?: string
              preview_url?: string
              render_session_id?: string | null
              error?: string
            }

            if (data.preview_url && !previewUrl) {
              setPreviewUrl(data.preview_url)
            }

            if (data.render_url) {
              if (initialPollRef.current) clearInterval(initialPollRef.current)
              roomStore.setRenderUrl(data.render_url)
              roomStore.addRenderSession({
                id: data.render_session_id ?? crypto.randomUUID(),
                renderUrl: data.render_url,
                previewUrl: data.preview_url ?? null,
                parallaxVideoUrl: null,
                iteration: roomStore.currentRenderIteration + 1,
                createdAt: new Date().toISOString(),
              })
              setInitialStage('ready')
              setPageState('result')
              return
            }

            if (data.status === 'failed' || data.error) {
              if (initialPollRef.current) clearInterval(initialPollRef.current)
              setInitialError(data.error ?? 'Render failed')
              setInitialStage('error')
            }
          } catch {
            // transient — keep polling
          }
        }, POLL_INTERVAL_MS)
      } catch (e) {
        setInitialError((e as Error).message || 'Initial render failed')
        setInitialStage('error')
      }
    })()

    return () => {
      cancelled = true
      if (initialPollRef.current) clearInterval(initialPollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // Demo auto-advance: if no real render polling fires, advance to result after 3s
  useEffect(() => {
    if (!hydrated) return
    if (pageState !== 'loading') return
    const t = setTimeout(() => {
      if (pageState === 'loading') setPageState('result')
    }, 3000)
    return () => clearTimeout(t)
  }, [hydrated, pageState])

  // Clean up tweak poll on unmount
  useEffect(() => {
    return () => {
      if (tweakPollRef.current) clearInterval(tweakPollRef.current)
    }
  }, [])

  // ── Undo (preserved) ─────────────────────────────────────────────────────
  const pushUndo = useCallback((url: string) => {
    setUndoStack((prev) => [url, ...prev].slice(0, MAX_UNDO))
  }, [])

  const handleUndo = useCallback(() => {
    const [prev, ...rest] = undoStack
    if (!prev) return
    roomStore.setRenderUrl(prev)
    setUndoStack(rest)
    setKontextCount((c) => Math.max(0, c - 1))
    toast.success('Reverted to previous design')
  }, [undoStack, roomStore])

  // ── Tweak submission (preserved) ─────────────────────────────────────────
  const submitTweak = useCallback(
    async (tweakType: TweakType, instruction: string, bbox?: [number, number, number, number]) => {
      if (!roomStore.renderUrl || !roomStore.roomId) {
        toast.error('No render to tweak')
        return
      }
      if (!instruction.trim()) {
        toast.error('Please enter an instruction')
        return
      }

      setIsTweaking(true)
      if (roomStore.renderUrl) pushUndo(roomStore.renderUrl)

      if (tweakType !== 'furniture') {
        setKontextCount((c) => c + 1)
      }

      try {
        const res = await fetch('/api/render/tweak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomStore.roomId,
            render_url: roomStore.renderUrl,
            tweak_type: tweakType,
            instruction: instruction.trim(),
            ...(bbox ? { target_bbox: bbox } : {}),
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error || 'Tweak failed')
        }
        const { prediction_id } = (await res.json()) as { prediction_id: string }

        let polls = 0
        tweakPollRef.current = setInterval(async () => {
          polls += 1
          if (polls > MAX_POLLS) {
            if (tweakPollRef.current) clearInterval(tweakPollRef.current)
            toast.error('Tweak timed out — please try again')
            setIsTweaking(false)
            return
          }
          try {
            const statusRes = await fetch(
              `/api/render/tweak/status?prediction_id=${prediction_id}&room_id=${roomStore.roomId}`,
              { credentials: 'include' }
            )
            const data = (await statusRes.json()) as {
              status: string
              render_url?: string
              error?: string
            }

            if (data.render_url) {
              if (tweakPollRef.current) clearInterval(tweakPollRef.current)
              roomStore.setRenderUrl(data.render_url)
              roomStore.addRenderSession({
                id: crypto.randomUUID(),
                renderUrl: data.render_url,
                previewUrl: null,
                parallaxVideoUrl: null,
                iteration: roomStore.currentRenderIteration + 1,
                createdAt: new Date().toISOString(),
              })
              setIsTweaking(false)
              setFurnitureTweakText('')
              setAccessoryTweakText('')
              toast.success('Design updated')
            } else if (data.status === 'failed' || data.error) {
              if (tweakPollRef.current) clearInterval(tweakPollRef.current)
              toast.error(data.error ?? 'Tweak failed')
              setIsTweaking(false)
            }
          } catch {
            // transient
          }
        }, POLL_INTERVAL_MS)
      } catch (e) {
        toast.error((e as Error).message || 'Tweak failed — try again')
        setIsTweaking(false)
      }
    },
    [roomStore, pushUndo]
  )

  // ── Drag to split ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(() => {
    isDragging.current = true
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !sliderContainerRef.current) return
    const rect = sliderContainerRef.current.getBoundingClientRect()
    const newPos = ((e.clientX - rect.left) / rect.width) * 100
    setSplitPosition(Math.max(5, Math.min(95, newPos)))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging.current || !sliderContainerRef.current) return
    const rect = sliderContainerRef.current.getBoundingClientRect()
    const touch = e.touches[0]
    const newPos = ((touch.clientX - rect.left) / rect.width) * 100
    setSplitPosition(Math.max(5, Math.min(95, newPos)))
  }, [])

  if (!hydrated) return null

  // ── Error state ───────────────────────────────────────────────────────────
  if (initialStage === 'error') {
    return (
      <div className="min-h-screen bg-cova-bg flex flex-col items-center justify-center p-6">
        <p className="font-playfair text-2xl text-cova-ivory mb-2 text-center">
          Render failed
        </p>
        <p className="font-dm-sans text-sm text-cova-muted mb-6 text-center max-w-[400px]">
          {initialError ?? 'Something went wrong. Please try again.'}
        </p>
        <button
          onClick={() => {
            setInitialError(null)
            setInitialStage('checking')
            setHydrated(false)
            setTimeout(() => setHydrated(true), 0)
          }}
          className="font-dm-sans text-[15px] font-semibold bg-cova-gold border-none rounded-lg py-3 px-8 cursor-pointer"
          style={{ color: BG }}
        >
          Try again
        </button>
      </div>
    )
  }

  // ── STATE A — LOADING ────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-cova-bg relative overflow-hidden flex flex-col items-center justify-center">
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @keyframes ellipsis-dot {
            0%, 80%, 100% { opacity: 0; }
            40% { opacity: 1; }
          }
        `}</style>

        {/* Preview background fade-in */}
        <AnimatePresence>
          {previewUrl && (
            <motion.div
              key="preview-bg"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.06 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            >
              <Image src={previewUrl} alt="" fill style={{ objectFit: 'cover', filter: 'blur(8px)' }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center content */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Gold arc */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-[120px] h-[120px]"
          >
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="3" />
              <circle cx="60" cy="60" r="50" fill="none" stroke={GOLD} strokeWidth="3"
                strokeDasharray="80 240" strokeLinecap="round" />
            </svg>
          </motion.div>

          {/* Status text */}
          <p className="font-dm-sans text-xl text-cova-ivory mt-6 text-center">
            Generating your redesign
          </p>

          {/* Animated ellipsis */}
          <div className="flex gap-1 mt-2 h-4 items-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[5px] h-[5px] rounded-full bg-cova-gold inline-block"
                style={{ animation: `ellipsis-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>

          <p className="font-dm-sans text-sm text-cova-muted mt-3">
            About 60 seconds
          </p>
        </div>

        {/* Bottom shimmer cards */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-[160px] h-[100px] rounded-xl"
              style={{
                background: `linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)`,
                backgroundSize: '200% 100%',
                animation: `shimmer 1.5s infinite ease-in-out ${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── STATE B — RESULT ────────────────────────────────────────────────────
  const originalUrl = roomStore.originalPhotoUrl ?? previewUrl ?? roomStore.renderUrl
  const redesignUrl = roomStore.renderUrl

  if (pageState === 'result') {
    return (
      <div
        ref={sliderContainerRef}
        className="relative w-screen overflow-hidden bg-cova-bg select-none"
        style={{ height: '100svh' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { isDragging.current = false }}
      >
        {/* Frosted glass top bar */}
        <div
          className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6"
          style={{
            background: 'rgba(9,24,41,0.8)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(201,168,76,0.1)',
          }}
        >
          <span className="font-playfair text-xl italic text-cova-gold tracking-[0.05em]">
            Cova
          </span>
          <span
            className="font-dm-sans text-[15px] font-semibold text-cova-ivory absolute left-1/2"
            style={{ transform: 'translateX(-50%)' }}
          >
            Your Redesign
          </span>
          <button aria-label="Share" className="bg-none border-none cursor-pointer text-cova-ivory p-2 flex items-center">
            <Share2 size={18} />
          </button>
        </div>

        {/* Before half — left */}
        <div className="absolute inset-0 overflow-hidden">
          {originalUrl && (
            <Image
              src={originalUrl}
              alt="Before"
              fill
              priority
              sizes="50vw"
              style={{ objectFit: 'cover' }}
            />
          )}
          {/* Before label */}
          <div
            className="absolute top-[72px] left-4 rounded-full py-1 px-3 font-dm-sans text-xs text-cova-muted"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,168,76,0.15)',
              backdropFilter: 'blur(8px)',
            }}
          >
            Before
          </div>
        </div>

        {/* After half — right, clipped by splitPosition (dynamic — keep inline) */}
        <div className="absolute inset-0 overflow-hidden" style={{ left: `${splitPosition}%` }}>
          {redesignUrl && (
            <div
              className="absolute top-0 bottom-0 right-0"
              style={{ width: `${(100 / (100 - splitPosition)) * 100}vw` }}
            >
              <Image
                src={redesignUrl}
                alt="After"
                fill
                priority
                sizes="50vw"
                style={{ objectFit: 'cover', objectPosition: `${splitPosition}% center` }}
              />
            </div>
          )}
          {/* After label */}
          <div
            className="absolute top-[72px] right-4 rounded-full py-1 px-3 font-dm-sans text-xs text-cova-gold"
            style={{
              background: 'rgba(201,168,76,0.12)',
              border: '1px solid #C9A84C',
              backdropFilter: 'blur(8px)',
            }}
          >
            After
          </div>
        </div>

        {/* Gold divider line (dynamic — keep inline) */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-cova-gold z-10"
          style={{ left: `${splitPosition}%` }}
        />

        {/* Circular drag handle (dynamic — keep inline) */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={() => { isDragging.current = true }}
          className="absolute w-8 h-8 rounded-full bg-cova-gold cursor-ew-resize z-[11] flex items-center justify-center"
          style={{
            top: '50%',
            left: `${splitPosition}%`,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 12px rgba(201,168,76,0.5)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2L1 6L4 10" stroke={BG} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 2L11 6L8 10" stroke={BG} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* Design explanation card — slides up after 1s delay */}
        <AnimatePresence>
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1, type: 'spring', stiffness: 280, damping: 30 }}
            className="absolute bottom-[100px] left-1/2 w-[480px] max-w-[calc(100vw-32px)] rounded-2xl py-5 px-6 z-20"
            style={{
              transform: 'translateX(-50%)',
              background: 'rgba(9,24,41,0.95)',
              border: '1px solid rgba(201,168,76,0.15)',
            }}
          >
            <p className="font-playfair text-[22px] text-cova-ivory mb-3">
              Warm, editorial, restrained.
            </p>
            <ul className="list-none p-0 m-0">
              {[
                'Warm oak tones replace cold grays',
                'Soft directional lighting emphasized',
                'Minimal furniture, maximum presence',
              ].map((pt) => (
                <li key={pt} className="font-dm-sans text-[15px] text-cova-ivory mb-[6px] pl-4 relative">
                  <span className="absolute left-0 text-cova-gold">·</span>
                  {pt}
                </li>
              ))}
            </ul>

            {/* Action buttons */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setStep(9)
                  router.push('/design/step-9')
                }}
                className="flex-1 font-dm-sans text-[15px] font-semibold bg-cova-gold border-none rounded-lg py-3 px-5 cursor-pointer"
                style={{ color: BG }}
              >
                Shop This Room →
              </button>
              <button
                onClick={() => setPageState('tweak')}
                className="flex-1 font-dm-sans text-[15px] font-medium bg-transparent text-cova-ivory rounded-lg py-3 px-5 cursor-pointer"
                style={{ border: '1px solid rgba(201,168,76,0.35)' }}
              >
                Refine →
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // ── STATE C — TWEAK PANEL ───────────────────────────────────────────────
  const isKontextSaturated = kontextCount >= MAX_KONTEXT_TWEAKS

  return (
    <div className="relative w-screen overflow-hidden bg-cova-bg" style={{ height: '100svh' }}>
      {/* Room render behind the sheet */}
      {redesignUrl && (
        <Image
          src={redesignUrl}
          alt="Current design"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: 'cover', opacity: isTweaking ? 0.4 : 1, transition: 'opacity 300ms ease' }}
        />
      )}
      <div className="absolute inset-0 bg-black/30" />

      {/* Top bar */}
      <div
        className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(201,168,76,0.1)',
        }}
      >
        <button
          onClick={() => setPageState('result')}
          className="bg-none border-none cursor-pointer text-cova-ivory flex items-center gap-1"
        >
          <ChevronLeft size={20} color="#F5F0E8" />
        </button>
        <span className="font-dm-sans text-[15px] font-semibold text-cova-ivory">
          Refine Design
        </span>
        <div className="w-7" />
      </div>

      {/* Tweak bottom sheet */}
      <AnimatePresence>
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-[100] rounded-[24px_24px_0_0] pb-8"
          style={{
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(201,168,76,0.3)',
            opacity: isTweaking ? 0.5 : 1,
            pointerEvents: isTweaking ? 'none' : 'auto',
          }}
        >
          {/* Drag handle */}
          <div className="w-12 h-1 bg-[rgba(245,240,232,0.2)] rounded mx-auto mt-2 mb-5" />

          {/* Tweak cards */}
          <div className="flex gap-3 px-4 overflow-x-auto">

            {/* Card 1: Color & Lighting */}
            <div
              className="flex-[0_0_260px] rounded-xl py-4 px-5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(201,168,76,0.15)',
              }}
            >
              <p className="font-dm-sans text-[13px] font-semibold text-cova-ivory mb-3">
                Color &amp; Lighting
              </p>
              {/* Color chips */}
              <div className="flex gap-2 mb-3">
                {COLOR_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setSelectedColorChip(chip === selectedColorChip ? null : chip)}
                    className="w-5 h-5 rounded-full cursor-pointer p-0"
                    style={{
                      background: chip,
                      border: selectedColorChip === chip ? `2px solid #F5F0E8` : '2px solid transparent',
                    }}
                    aria-label={`Select color ${chip}`}
                  />
                ))}
              </div>
              {/* Warmth slider */}
              <div className="mb-3">
                <p className="font-dm-sans text-[11px] text-cova-muted mb-[6px] uppercase tracking-[0.1em]">
                  Warmth
                </p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={50}
                  className="w-full"
                  style={{ accentColor: GOLD }}
                />
              </div>
              <button
                onClick={() => {
                  const instruction = selectedColorChip
                    ? `Adjust color palette toward ${selectedColorChip} tones`
                    : 'Adjust the lighting warmth and color palette'
                  void submitTweak('color', instruction)
                }}
                disabled={isTweaking}
                className="w-full font-dm-sans text-[13px] font-semibold bg-cova-gold border-none rounded-lg p-[10px] cursor-pointer"
                style={{ color: BG }}
              >
                Apply →
              </button>
            </div>

            {/* Card 2: Swap Furniture */}
            <div
              className="flex-[0_0_260px] rounded-xl py-4 px-5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(201,168,76,0.15)',
              }}
            >
              <p className="font-dm-sans text-[13px] font-semibold text-cova-ivory mb-3">
                Swap Furniture
              </p>
              <input
                type="text"
                value={furnitureTweakText}
                onChange={(e) => setFurnitureTweakText(e.target.value)}
                placeholder="Describe the piece to swap in..."
                disabled={isTweaking}
                className="w-full box-border font-dm-sans text-sm text-cova-ivory rounded-lg py-[10px] px-[14px] outline-none mb-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                }}
              />
              <button
                onClick={() => void submitTweak('furniture', furnitureTweakText)}
                disabled={isTweaking || !furnitureTweakText.trim()}
                className={[
                  'w-full font-dm-sans text-[13px] font-semibold border-none rounded-lg p-[10px]',
                  furnitureTweakText.trim() ? 'cursor-pointer' : 'cursor-not-allowed',
                ].join(' ')}
                style={{
                  background: furnitureTweakText.trim() ? GOLD : 'rgba(201,168,76,0.3)',
                  color: BG,
                }}
              >
                Apply →
              </button>
            </div>

            {/* Card 3: Add Accessories */}
            <div
              className="flex-[0_0_260px] rounded-xl py-4 px-5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(201,168,76,0.15)',
              }}
            >
              <p className="font-dm-sans text-[13px] font-semibold text-cova-ivory mb-3">
                Add Accessories
              </p>
              <input
                type="text"
                value={accessoryTweakText}
                onChange={(e) => setAccessoryTweakText(e.target.value)}
                placeholder="Describe an accessory to add..."
                disabled={isTweaking}
                className="w-full box-border font-dm-sans text-sm text-cova-ivory rounded-lg py-[10px] px-[14px] outline-none mb-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                }}
              />
              <button
                onClick={() => void submitTweak('accessory', accessoryTweakText)}
                disabled={isTweaking || !accessoryTweakText.trim()}
                className={[
                  'w-full font-dm-sans text-[13px] font-semibold border-none rounded-lg p-[10px]',
                  accessoryTweakText.trim() ? 'cursor-pointer' : 'cursor-not-allowed',
                ].join(' ')}
                style={{
                  background: accessoryTweakText.trim() ? GOLD : 'rgba(201,168,76,0.3)',
                  color: BG,
                }}
              >
                Apply →
              </button>
            </div>
          </div>

          {/* Undo + Done row */}
          <div className="flex justify-between px-6 pt-4">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0 || isTweaking}
              className={[
                'font-dm-sans text-[13px] bg-none border-none',
                undoStack.length > 0 ? 'cursor-pointer text-cova-muted' : 'cursor-not-allowed text-[rgba(245,240,232,0.2)]',
              ].join(' ')}
            >
              ← Undo
            </button>
            {isKontextSaturated && (
              <span className="font-dm-sans text-[11px] text-cova-gold self-center">
                {MAX_KONTEXT_TWEAKS} edits used
              </span>
            )}
            <button
              onClick={() => {
                setStep(9)
                router.push('/design/step-9')
              }}
              className="font-dm-sans text-[13px] font-semibold text-cova-gold bg-none border-none cursor-pointer"
            >
              Done →
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Tweak in-progress overlay */}
      <AnimatePresence>
        {isTweaking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-[rgba(9,24,41,0.5)]"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-20 h-20"
            >
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="3" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={GOLD} strokeWidth="3"
                  strokeDasharray="50 150" strokeLinecap="round" />
              </svg>
            </motion.div>
            <p className="font-dm-sans text-[15px] text-cova-ivory mt-4">
              Applying changes…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
