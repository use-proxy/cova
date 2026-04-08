'use client'

/**
 * Step 8 — Style Refinement
 * Lets the user adjust their render: quick actions, natural-language change,
 * additive items, transformation intensity slider.
 */

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Edit3, Plus, RotateCcw, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useRoomStore } from '@/lib/store/room'
import { useRefineStore } from '@/lib/store/refine'
import { useSessionStore } from '@/lib/store/session'
import { CovaButton } from '@/components/cova/CovaButton'

type ActionKey = 'regenerate' | 'refine' | 'add' | 'reset' | null

const ADD_CHIPS = [
  'a reading nook',
  'indoor plants',
  'gallery wall',
  'soft rug',
  'floor lamp',
  'throw pillows',
  'bookshelf',
  'statement mirror',
]

function intensityLabel(v: number): string {
  if (v < 0.4) return 'Subtle Refresh'
  if (v < 0.7) return 'Balanced'
  return 'Complete Transformation'
}

export default function Step8Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const refineStore = useRefineStore()
  const { setStep } = useSessionStore()

  const [activeAction, setActiveAction] = useState<ActionKey>(null)
  const [refinementText, setRefinementText] = useState('')
  const [additions, setAdditions] = useState<string[]>([])
  const [transformIntensity, setTransformIntensity] = useState(
    refineStore.styleStrength || 0.7
  )
  const [isRefining, setIsRefining] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(t)
  }, [])

  // Guard — redirect client-side if no render yet, after hydration
  useEffect(() => {
    if (hydrated && !roomStore.renderUrl) {
      router.push('/design/step-7')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const runRefine = useCallback(
    async (text: string) => {
      if (!roomStore.renderUrl || !roomStore.roomId) {
        toast.error('No render to refine')
        return
      }
      setIsRefining(true)
      refineStore.setRefinement(text, transformIntensity)
      try {
        const res = await fetch('/api/render/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_render_url: roomStore.renderUrl,
            refinement_text: text,
            room_id: roomStore.roomId,
            current_prompt: '',
            style_strength: transformIntensity,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Refinement failed')
        }
        const data = (await res.json()) as {
          render_url: string
          render_session_id?: string
        }
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

        toast.success('Refinement complete')
        setStep(7)
        router.push('/design/step-7')
      } catch (e) {
        toast.error((e as Error).message || 'Refinement failed — try again')
        setIsRefining(false)
      }
    },
    [roomStore, refineStore, transformIntensity, router, setStep]
  )

  const handleRefine = useCallback(() => {
    const text = refinementText.trim()
    if (!text) return
    void runRefine(text)
  }, [refinementText, runRefine])

  const handleAdd = useCallback(() => {
    if (additions.length === 0) {
      toast.error('Pick at least one thing to add')
      return
    }
    const text = 'Add to the room: ' + additions.join(', ')
    void runRefine(text)
  }, [additions, runRefine])

  const handleRegenerate = useCallback(() => {
    const text =
      'Keep the same style and color palette, but try a fresh arrangement and different furniture picks.'
    void runRefine(text)
  }, [runRefine])

  const handleReset = useCallback(() => {
    roomStore.setRenderUrl('')
    refineStore.clearRefinement()
    router.push('/design/step-6')
  }, [roomStore, refineStore, router])

  if (!hydrated || !roomStore.renderUrl) return null

  return (
    <div className="flex min-h-[100svh] flex-col bg-cova-bg">
      {/* Top: current render as context */}
      <div className="relative overflow-hidden rounded-b-3xl" style={{ height: '45vh' }}>
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

        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 text-xs text-white/80 backdrop-blur-sm"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <ChevronLeft size={14} />
          Back
        </button>

        <div
          className="absolute top-4 right-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/70 backdrop-blur-sm"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Current Design
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 px-4 pb-28 pt-6">
        <h1
          className="mb-1 text-cova-ivory"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1.1 }}
        >
          Refine your design
        </h1>
        <p
          className="mb-6 text-sm text-cova-muted"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          What would you like to change?
        </p>

        {/* Quick actions */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <QuickAction
            icon={<RefreshCw size={20} className="text-cova-gold" />}
            title="Try Different Look"
            description="Same style, new arrangement"
            active={activeAction === 'regenerate'}
            onClick={() => setActiveAction('regenerate')}
          />
          <QuickAction
            icon={<Edit3 size={20} className="text-cova-gold" />}
            title="Make a Change"
            description="Describe what to adjust"
            active={activeAction === 'refine'}
            onClick={() => setActiveAction('refine')}
          />
          <QuickAction
            icon={<Plus size={20} className="text-cova-gold" />}
            title="Add Something"
            description="Include a specific item"
            active={activeAction === 'add'}
            onClick={() => setActiveAction('add')}
          />
          <QuickAction
            icon={<RotateCcw size={20} className="text-cova-muted" />}
            title="Start Fresh"
            description="Clear and redesign"
            active={activeAction === 'reset'}
            onClick={() => setActiveAction('reset')}
          />
        </div>

        <AnimatePresence mode="wait">
          {activeAction === 'refine' && (
            <motion.div
              key="refine"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3"
            >
              <textarea
                value={refinementText}
                onChange={(e) => setRefinementText(e.target.value)}
                placeholder="e.g. Make the sofa darker, add more plants, brighter lighting"
                rows={3}
                className="w-full rounded-lg border border-cova-border bg-cova-surface px-4 py-3 text-base text-cova-ivory placeholder:text-cova-muted focus:border-cova-border-gold focus:outline-none"
                style={{ fontFamily: 'var(--font-sans)', resize: 'none' }}
              />
              <CovaButton
                variant="primary"
                size="md"
                className="mt-3 w-full"
                isLoading={isRefining}
                disabled={!refinementText.trim() || isRefining}
                onClick={handleRefine}
              >
                Apply Changes
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
              <p
                className="mb-3 text-sm text-cova-muted"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Generate a new arrangement using the same style DNA.
              </p>
              <CovaButton
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isRefining}
                disabled={isRefining}
                onClick={handleRegenerate}
              >
                Generate New Arrangement
              </CovaButton>
            </motion.div>
          )}

          {activeAction === 'add' && (
            <motion.div
              key="add"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3"
            >
              <div className="mb-3 flex flex-wrap gap-2">
                {ADD_CHIPS.map((chip) => {
                  const selected = additions.includes(chip)
                  return (
                    <button
                      key={chip}
                      onClick={() =>
                        setAdditions((prev) =>
                          selected ? prev.filter((x) => x !== chip) : [...prev, chip]
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'border-cova-border-gold bg-cova-surface-2 text-cova-ivory'
                          : 'border-cova-border bg-cova-surface text-cova-muted hover:text-cova-ivory'
                      }`}
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      {chip}
                    </button>
                  )
                })}
              </div>
              <CovaButton
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isRefining}
                disabled={additions.length === 0 || isRefining}
                onClick={handleAdd}
              >
                Add to Design
              </CovaButton>
            </motion.div>
          )}

          {activeAction === 'reset' && (
            <motion.div
              key="reset"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-3 rounded-lg border border-cova-border bg-cova-surface p-4"
            >
              <p
                className="mb-3 text-sm text-cova-muted"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                This will clear your current render and take you back to capture a new photo.
              </p>
              <CovaButton
                variant="destructive"
                size="md"
                className="w-full"
                onClick={handleReset}
              >
                Start Fresh
              </CovaButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Intensity slider */}
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-sm text-cova-muted"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Transformation intensity
            </span>
            <span
              className="text-sm font-medium text-cova-gold"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {intensityLabel(transformIntensity)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={transformIntensity}
            onChange={(e) => setTransformIntensity(parseFloat(e.target.value))}
            className="w-full accent-cova-gold"
            aria-label="Transformation intensity"
          />
        </div>
      </div>

      {/* Sticky bottom */}
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

function QuickAction({
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
