'use client'

/**
 * Step 8 — Style Refinement
 * Tiered tweak system: color/lighting → Kontext Pro, furniture swap → Fill Pro,
 * accessory → Kontext Pro, regenerate → existing refine route.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Palette, Sofa, Leaf, RotateCcw, ChevronLeft, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRoomStore } from '@/lib/store/room'
import { useRefineStore } from '@/lib/store/refine'
import { useSessionStore } from '@/lib/store/session'
import { CovaButton } from '@/components/cova/CovaButton'

type InitialStage = 'checking' | 'firing' | 'ready' | 'error'
const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 200
const MAX_KONTEXT_TWEAKS = 5
const MAX_UNDO = 3

type TweakType = 'color' | 'furniture' | 'accessory' | 'lighting'
type ActionKey = 'color' | 'furniture' | 'accessory' | 'regenerate' | 'reset' | null

export default function Step8Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const refineStore = useRefineStore()
  const { setStep } = useSessionStore()

  const [activeAction, setActiveAction] = useState<ActionKey>(null)
  const [tweakText, setTweakText] = useState('')
  const [isTweaking, setIsTweaking] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [initialStage, setInitialStage] = useState<InitialStage>('checking')
  const [initialError, setInitialError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Undo stack — last 3 render URLs before the most recent tweak
  const [undoStack, setUndoStack] = useState<string[]>([])
  // Kontext-based tweak counter (color, lighting, accessory)
  const [kontextCount, setKontextCount] = useState(0)
  // Furniture tap mode state
  const [tapMode, setTapMode] = useState(false)
  const [tapBbox, setTapBbox] = useState<[number, number, number, number] | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const initialPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tweakPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(t)
  }, [])

  // Initial render fire (same logic as before)
  useEffect(() => {
    if (!hydrated) return

    if (roomStore.renderUrl) {
      setInitialStage('ready')
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
              setStep(7)
              router.push('/design/step-7')
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

  // Clean up tweak poll on unmount
  useEffect(() => {
    return () => {
      if (tweakPollRef.current) clearInterval(tweakPollRef.current)
    }
  }, [])

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
      pushUndo(roomStore.renderUrl)

      // Count Kontext tweaks (not Fill Pro)
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

        // Poll tweak status
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
              setTweakText('')
              setTapBbox(null)
              setTapMode(false)
              setActiveAction(null)
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

  const handleRegenerate = useCallback(() => {
    if (!roomStore.renderUrl || !roomStore.roomId) return
    pushUndo(roomStore.renderUrl)
    const text = 'Keep the same style and color palette, but try a fresh arrangement and different furniture picks.'
    void (async () => {
      setIsTweaking(true)
      try {
        const res = await fetch('/api/render/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_render_url: roomStore.renderUrl,
            refinement_text: text,
            room_id: roomStore.roomId,
            current_prompt: '',
            style_strength: 0.7,
          }),
        })
        if (!res.ok) throw new Error('Regeneration failed')
        const data = (await res.json()) as { render_url: string; render_session_id?: string }
        if (!data.render_url) throw new Error('No render_url returned')
        roomStore.addRenderSession({
          id: data.render_session_id || crypto.randomUUID(),
          renderUrl: data.render_url,
          previewUrl: null,
          parallaxVideoUrl: null,
          iteration: roomStore.currentRenderIteration + 1,
          createdAt: new Date().toISOString(),
        })
        roomStore.setRenderUrl(data.render_url)
        roomStore.setParallaxVideoUrl('')
        toast.success('New arrangement generated')
        setStep(7)
        router.push('/design/step-7')
      } catch (e) {
        toast.error((e as Error).message || 'Regeneration failed')
        setIsTweaking(false)
      }
    })()
  }, [roomStore, pushUndo, router, setStep])

  const handleReset = useCallback(() => {
    roomStore.setRenderUrl('')
    refineStore.clearRefinement()
    router.push('/design/step-6')
  }, [roomStore, refineStore, router])

  // Handle tap on render image to get bbox for furniture swap
  const handleImageTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!tapMode || !imageRef.current) return
      const rect = imageRef.current.getBoundingClientRect()
      const relX = (e.clientX - rect.left) / rect.width
      const relY = (e.clientY - rect.top) / rect.height
      // Create a 20%×20% bbox centered on the tap point
      const bw = 0.2, bh = 0.2
      const bx = Math.max(0, relX - bw / 2)
      const by = Math.max(0, relY - bh / 2)
      setTapBbox([bx, by, Math.min(bw, 1 - bx), Math.min(bh, 1 - by)])
      setTapMode(false)
    },
    [tapMode]
  )

  if (!hydrated) return null

  if (initialStage === 'checking' || initialStage === 'firing') {
    return (
      <div className="relative flex min-h-[100svh] flex-col items-center justify-center bg-cova-bg px-6 text-center overflow-hidden">
        <AnimatePresence>
          {previewUrl && (
            <motion.div
              key="preview-bg"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            >
              <Image src={previewUrl} alt="" fill className="object-cover" />
              <div className="absolute inset-0 bg-cova-bg/70 backdrop-blur-sm" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10 flex flex-col items-center">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-cova-gold border-t-transparent" />
          <h1
            className="mt-6 text-cova-ivory"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}
          >
            {initialStage === 'checking' ? 'Loading your design…' : 'Designing your room…'}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-cova-muted" style={{ fontFamily: 'var(--font-sans)' }}>
            {initialStage === 'checking' ? 'Pulling your personalization…' : 'Designing your room with AI…'}
          </p>
          {previewUrl && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 text-xs text-cova-gold"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Preview ready — finishing high-res render…
            </motion.p>
          )}
        </div>
      </div>
    )
  }

  if (initialStage === 'error') {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-cova-bg px-6 text-center">
        <h1 className="text-cova-ivory" style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>
          Render failed
        </h1>
        <p className="mt-2 max-w-sm text-sm text-cova-muted" style={{ fontFamily: 'var(--font-sans)' }}>
          {initialError ?? 'Something went wrong.'}
        </p>
        <CovaButton
          variant="primary"
          size="md"
          className="mt-6"
          onClick={() => {
            setInitialError(null)
            setInitialStage('checking')
            setHydrated(false)
            setTimeout(() => setHydrated(true), 0)
          }}
        >
          Try again
        </CovaButton>
      </div>
    )
  }

  if (!roomStore.renderUrl) return null

  const isKontextSaturated = kontextCount >= MAX_KONTEXT_TWEAKS

  return (
    <div className="flex min-h-[100svh] flex-col bg-cova-bg">
      {/* Render preview */}
      <div
        ref={imageRef}
        className={`relative overflow-hidden rounded-b-3xl ${tapMode ? 'cursor-crosshair' : ''}`}
        style={{ height: '45vh' }}
        onClick={handleImageTap}
      >
        {roomStore.renderUrl && (
          <Image
            src={roomStore.renderUrl}
            alt="Current design"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/30" />

        {tapMode && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl bg-black/60 px-4 py-2 text-sm text-white backdrop-blur-sm">
              Tap the furniture piece to swap
            </div>
          </div>
        )}

        {tapBbox && (
          <div
            className="absolute border-2 border-cova-gold bg-cova-gold/10"
            style={{
              left: `${tapBbox[0] * 100}%`,
              top: `${tapBbox[1] * 100}%`,
              width: `${tapBbox[2] * 100}%`,
              height: `${tapBbox[3] * 100}%`,
            }}
          />
        )}

        <button
          onClick={(e) => { e.stopPropagation(); router.back() }}
          className="absolute top-4 left-4 flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 text-xs text-white/80 backdrop-blur-sm"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <ChevronLeft size={14} />
          Back
        </button>

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {undoStack.length > 0 && !isTweaking && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUndo() }}
              className="flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 text-xs text-white/80 backdrop-blur-sm"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Undo2 size={14} />
              Undo
            </button>
          )}
          <div
            className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/70 backdrop-blur-sm"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Current Design
          </div>
        </div>

        {isTweaking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-cova-gold border-t-transparent" />
              <span className="text-sm text-white" style={{ fontFamily: 'var(--font-sans)' }}>
                Applying changes…
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 px-4 pb-28 pt-6">
        <div className="mb-1 flex items-center justify-between">
          <h1
            className="text-cova-ivory"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1.1 }}
          >
            Refine your design
          </h1>
          {kontextCount > 0 && (
            <span
              className={`text-xs ${isKontextSaturated ? 'text-amber-400' : 'text-cova-muted'}`}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Edit {Math.min(kontextCount, MAX_KONTEXT_TWEAKS)} of {MAX_KONTEXT_TWEAKS}
            </span>
          )}
        </div>
        <p className="mb-6 text-sm text-cova-muted" style={{ fontFamily: 'var(--font-sans)' }}>
          What would you like to change?
        </p>

        {isKontextSaturated && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
          >
            <p className="text-xs text-amber-300" style={{ fontFamily: 'var(--font-sans)' }}>
              You&apos;ve made {MAX_KONTEXT_TWEAKS} edits. Consider regenerating a fresh base render to clear accumulated changes.
            </p>
            <button
              onClick={handleRegenerate}
              disabled={isTweaking}
              className="mt-2 text-xs font-medium text-amber-400 underline"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Refresh Base Render
            </button>
          </motion.div>
        )}

        {/* Quick-action tiles */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <TweakAction
            icon={<Palette size={20} className="text-cova-gold" />}
            title="Colors / Lighting"
            description="Adjust hues or light mood"
            active={activeAction === 'color'}
            onClick={() => { setActiveAction('color'); setTweakText(''); setTapBbox(null); setTapMode(false) }}
          />
          <TweakAction
            icon={<Sofa size={20} className="text-cova-gold" />}
            title="Swap a Piece"
            description="Replace specific furniture"
            active={activeAction === 'furniture'}
            onClick={() => { setActiveAction('furniture'); setTweakText(''); setTapBbox(null); setTapMode(false) }}
          />
          <TweakAction
            icon={<Leaf size={20} className="text-cova-gold" />}
            title="Add Something"
            description="Plants, art, accessories"
            active={activeAction === 'accessory'}
            onClick={() => { setActiveAction('accessory'); setTweakText(''); setTapBbox(null); setTapMode(false) }}
          />
          <TweakAction
            icon={<RefreshCw size={20} className="text-cova-muted" />}
            title="New Arrangement"
            description="Same style, fresh layout"
            active={activeAction === 'regenerate'}
            onClick={() => { setActiveAction('regenerate'); setTapBbox(null); setTapMode(false) }}
          />
        </div>

        <AnimatePresence mode="wait">
          {activeAction === 'color' && (
            <motion.div
              key="color"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3"
            >
              <textarea
                value={tweakText}
                onChange={(e) => setTweakText(e.target.value)}
                placeholder="e.g. make the sofa sage green, warmer lighting"
                rows={3}
                className="w-full rounded-lg border border-cova-border bg-cova-surface px-4 py-3 text-base text-cova-ivory placeholder:text-cova-muted focus:border-cova-border-gold focus:outline-none"
                style={{ fontFamily: 'var(--font-sans)', resize: 'none' }}
              />
              <CovaButton
                variant="primary"
                size="md"
                className="mt-3 w-full"
                isLoading={isTweaking}
                disabled={!tweakText.trim() || isTweaking}
                onClick={() => void submitTweak('color', tweakText)}
              >
                Apply Changes
              </CovaButton>
            </motion.div>
          )}

          {activeAction === 'furniture' && (
            <motion.div
              key="furniture"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3 space-y-3"
            >
              {!tapBbox ? (
                <div className="rounded-xl border border-cova-border bg-cova-surface p-4">
                  <p className="mb-3 text-sm text-cova-muted" style={{ fontFamily: 'var(--font-sans)' }}>
                    Tap a furniture piece on the render above to select it, or describe it below.
                  </p>
                  <CovaButton
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={isTweaking}
                    onClick={() => setTapMode(true)}
                  >
                    Tap to Select Object
                  </CovaButton>
                </div>
              ) : (
                <div className="rounded-xl border border-cova-border-gold bg-cova-surface p-3 text-xs text-cova-gold" style={{ fontFamily: 'var(--font-sans)' }}>
                  Object selected — describe the replacement below.
                  <button
                    className="ml-2 underline text-cova-muted"
                    onClick={() => { setTapBbox(null); setTapMode(false) }}
                  >
                    Clear
                  </button>
                </div>
              )}
              <textarea
                value={tweakText}
                onChange={(e) => setTweakText(e.target.value)}
                placeholder="e.g. replace with a navy velvet armchair"
                rows={3}
                className="w-full rounded-lg border border-cova-border bg-cova-surface px-4 py-3 text-base text-cova-ivory placeholder:text-cova-muted focus:border-cova-border-gold focus:outline-none"
                style={{ fontFamily: 'var(--font-sans)', resize: 'none' }}
              />
              <CovaButton
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isTweaking}
                disabled={!tweakText.trim() || isTweaking}
                onClick={() => void submitTweak('furniture', tweakText, tapBbox ?? undefined)}
              >
                Swap Piece
              </CovaButton>
            </motion.div>
          )}

          {activeAction === 'accessory' && (
            <motion.div
              key="accessory"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3"
            >
              <textarea
                value={tweakText}
                onChange={(e) => setTweakText(e.target.value)}
                placeholder="e.g. a large monstera in the corner, throw pillows on the sofa"
                rows={3}
                className="w-full rounded-lg border border-cova-border bg-cova-surface px-4 py-3 text-base text-cova-ivory placeholder:text-cova-muted focus:border-cova-border-gold focus:outline-none"
                style={{ fontFamily: 'var(--font-sans)', resize: 'none' }}
              />
              <CovaButton
                variant="primary"
                size="md"
                className="mt-3 w-full"
                isLoading={isTweaking}
                disabled={!tweakText.trim() || isTweaking}
                onClick={() => void submitTweak('accessory', tweakText)}
              >
                Add to Design
              </CovaButton>
            </motion.div>
          )}

          {activeAction === 'regenerate' && (
            <motion.div
              key="regen"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3"
            >
              <p className="mb-3 text-sm text-cova-muted" style={{ fontFamily: 'var(--font-sans)' }}>
                Generate a new arrangement using the same style DNA.
              </p>
              <CovaButton
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isTweaking}
                disabled={isTweaking}
                onClick={handleRegenerate}
              >
                Generate New Arrangement
              </CovaButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reset option */}
        <button
          onClick={handleReset}
          className="mt-8 flex items-center gap-1.5 text-sm text-cova-muted hover:text-cova-ivory transition-colors"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <RotateCcw size={14} />
          Start fresh
        </button>
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-cova-border-dim bg-cova-bg px-4 py-4"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <CovaButton
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => {
            setStep(9)
            router.push('/design/step-9')
          }}
        >
          Shop Current Look
        </CovaButton>
      </div>
    </div>
  )
}

function TweakAction({
  icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-all duration-150 ${
        active
          ? 'border-cova-border-gold bg-cova-surface-2'
          : 'border-cova-border bg-cova-surface hover:border-cova-border-gold'
      }`}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {icon}
      <span className="text-sm font-medium text-cova-ivory">{title}</span>
      <span className="text-xs leading-snug text-cova-muted">{description}</span>
    </button>
  )
}
