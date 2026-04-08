'use client'

/**
 * Step 9 — Shoppable Shelf
 * Full-screen render with tappable hotspots. Each hotspot opens a bottom sheet
 * with matched products from /api/match. Users can Buy Now (affiliate) or
 * Try in Room (FLUX Fill Pro swap).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingBag,
  ChevronLeft,
  Share2,
  ExternalLink,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRoomStore, type KeepMaskItem } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { CovaButton } from '@/components/cova/CovaButton'

interface MatchedProduct {
  id: string
  name: string
  retailer: string
  price: number
  affiliate_url: string
  image_url: string
  match_score: number
  match_label: 'Perfect Match' | 'Very Similar' | 'Inspired By'
  rating?: number | null
  rating_count?: number | null
}

interface SwapState {
  predictionId: string | null
  swapUrl: string | null
  isSwapping: boolean
}

const INITIAL_SWAP: SwapState = {
  predictionId: null,
  swapUrl: null,
  isSwapping: false,
}

export default function Step9Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const fingerprintStore = useFingerprintStore()

  const [activeHotspot, setActiveHotspot] = useState<KeepMaskItem | null>(null)
  const [products, setProducts] = useState<MatchedProduct[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [swapState, setSwapState] = useState<SwapState>(INITIAL_SWAP)
  const [hydrated, setHydrated] = useState(false)
  const swapPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Wait for Zustand persist to finish hydrating before running guards
  useEffect(() => {
    // Mark hydrated on next tick so the store has a chance to rehydrate from sessionStorage
    const t = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(t)
  }, [])

  // Guard — only after hydration
  useEffect(() => {
    if (hydrated && !roomStore.renderUrl) {
      router.push('/design/step-7')
    }
  }, [hydrated, roomStore.renderUrl, router])

  useEffect(
    () => () => {
      if (swapPollRef.current) clearInterval(swapPollRef.current)
    },
    []
  )

  const hotspots = (roomStore.keepMask ?? []).filter(
    (h) => h.confidence >= 0.35 && h.keep !== true
  )

  // Fallback: if no keepMask (user skipped step 5), fall back to detections
  const fallbackHotspots = roomStore.detections
    ? roomStore.detections
        .filter((d) => d.confidence >= 0.4 && d.keep !== true)
        .slice(0, 6)
        .map<KeepMaskItem>((d) => ({
          type: d.type,
          label: d.label,
          bbox: d.bbox,
          confidence: d.confidence,
          keep: false,
        }))
    : []

  const effectiveHotspots = hotspots.length > 0 ? hotspots : fallbackHotspots

  const handleHotspotTap = useCallback(
    async (detection: KeepMaskItem) => {
      setActiveHotspot(detection)
      setSheetOpen(true)
      setProducts([])
      setIsLoadingProducts(true)
      setSwapState(INITIAL_SWAP)

      try {
        if (!roomStore.renderUrl || !roomStore.roomId) {
          setIsLoadingProducts(false)
          return
        }

        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            render_url: roomStore.renderUrl,
            item_id: detection.label + '-' + Date.now(),
            item_label: detection.label,
            item_bbox: detection.bbox,
            item_keep: false,
            fingerprint_vector: fingerprintStore.fingerprint,
            budget_range: fingerprintStore.budgetRange ?? [500, 2000],
            room_type: fingerprintStore.roomType ?? 'living_room',
            room_id: roomStore.roomId,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          console.error('[step-9] match failed:', err)
          setProducts([])
          setIsLoadingProducts(false)
          return
        }

        const data = (await res.json()) as { products?: MatchedProduct[] }
        setProducts(data.products ?? [])
      } catch (e) {
        console.error('[step-9] match error:', e)
        toast.error('Could not load products')
      } finally {
        setIsLoadingProducts(false)
      }
    },
    [roomStore.renderUrl, roomStore.roomId, fingerprintStore.fingerprint, fingerprintStore.budgetRange, fingerprintStore.roomType]
  )

  const handleBuyNow = useCallback(
    (product: MatchedProduct) => {
      // Fire-and-forget analytics
      fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomStore.roomId,
          action: 'affiliate_click',
        }),
      }).catch(() => {})

      window.open(product.affiliate_url, '_blank', 'noopener,noreferrer')
    },
    [roomStore.roomId]
  )

  const handleTryInRoom = useCallback(
    async (product: MatchedProduct) => {
      if (!activeHotspot || !roomStore.renderUrl || !roomStore.roomId) return
      if (!fingerprintStore.fingerprint) {
        toast.error('Style fingerprint missing — refresh and try again')
        return
      }

      setSwapState({ predictionId: null, swapUrl: null, isSwapping: true })

      try {
        const res = await fetch('/api/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomStore.roomId,
            render_url: roomStore.renderUrl,
            item_bbox: activeHotspot.bbox,
            item_label: activeHotspot.label,
            replacement_description: product.name,
            fingerprint: fingerprintStore.fingerprint,
            budget_tier: fingerprintStore.budgetTier ?? 'mid',
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Swap submission failed')
        }
        const data = (await res.json()) as { prediction_id?: string; mask_url?: string }
        if (!data.prediction_id) throw new Error('No prediction id')

        setSwapState({ predictionId: data.prediction_id, swapUrl: null, isSwapping: true })

        // Poll
        const started = Date.now()
        if (swapPollRef.current) clearInterval(swapPollRef.current)
        swapPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(
              `/api/swap/status?prediction_id=${data.prediction_id}&room_id=${roomStore.roomId}`
            )
            const status = (await statusRes.json()) as {
              status: string
              swap_render_url?: string
              error?: string
            }

            if (status.status === 'complete' && status.swap_render_url) {
              if (swapPollRef.current) clearInterval(swapPollRef.current)
              setSwapState({
                predictionId: data.prediction_id!,
                swapUrl: status.swap_render_url,
                isSwapping: false,
              })
            } else if (status.status === 'failed') {
              if (swapPollRef.current) clearInterval(swapPollRef.current)
              toast.error(status.error || 'Swap failed')
              setSwapState(INITIAL_SWAP)
            } else if (Date.now() - started > 120000) {
              if (swapPollRef.current) clearInterval(swapPollRef.current)
              toast.error('Swap timed out')
              setSwapState(INITIAL_SWAP)
            }
          } catch (e) {
            console.error('[step-9] poll error:', e)
          }
        }, 3000)
      } catch (e) {
        toast.error((e as Error).message || 'Swap failed')
        setSwapState(INITIAL_SWAP)
      }
    },
    [activeHotspot, roomStore.renderUrl, roomStore.roomId, fingerprintStore.fingerprint, fingerprintStore.budgetTier]
  )

  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My AI-designed room by Cova',
          url: window.location.origin,
        })
      } else {
        await navigator.clipboard.writeText(window.location.origin)
        toast.success('Link copied')
      }
    } catch {
      /* cancel */
    }
  }, [])

  const handleKeepSwap = useCallback(() => {
    if (!swapState.swapUrl) return
    roomStore.setRenderUrl(swapState.swapUrl)
    roomStore.setSwapRenderUrl(null)
    setSwapState(INITIAL_SWAP)
    setSheetOpen(false)
    toast.success('Updated your room')
  }, [swapState.swapUrl, roomStore])

  const handleRevertSwap = useCallback(() => {
    setSwapState(INITIAL_SWAP)
  }, [])

  if (!hydrated || !roomStore.renderUrl) return null

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Base render — fills the entire viewport */}
      <div className="absolute inset-0">
        <Image
          src={roomStore.renderUrl}
          alt="Your redesigned room"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <span
          className="text-sm font-medium text-white/80"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Shop This Look
        </span>
        <button
          onClick={handleShare}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          aria-label="Share"
        >
          <Share2 size={18} />
        </button>
      </div>

      {/* Hotspot layer */}
      <div className="absolute inset-0 z-10">
        {effectiveHotspots.map((h) => {
          const centerX = (h.bbox[0] + h.bbox[2] / 2) * 100
          const centerY = (h.bbox[1] + h.bbox[3] / 2) * 100
          return (
            <button
              key={h.label + h.bbox.join(',')}
              onClick={() => handleHotspotTap(h)}
              className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${centerX}%`, top: `${centerY}%` }}
              aria-label={`Shop ${h.label}`}
            >
              <span
                className="absolute inset-0 rounded-full border-2 border-cova-gold/60"
                style={{ animation: 'sonarPing 2s ease-out infinite' }}
              />
              <span
                className="relative flex h-5 w-5 items-center justify-center rounded-full bg-cova-gold"
                style={{ boxShadow: '0 0 12px rgba(201,168,76,0.8)' }}
              >
                <ShoppingBag size={10} className="text-cova-bg" />
              </span>
            </button>
          )
        })}
      </div>

      {/* Empty-state prompt when no hotspots */}
      {effectiveHotspots.length === 0 && (
        <div
          className="absolute inset-x-4 bottom-32 z-20 mx-auto max-w-sm rounded-2xl bg-black/60 p-4 text-center text-sm text-white/80 backdrop-blur-sm"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Detection still running — check back shortly to see shoppable items.
        </div>
      )}

      {/* Bottom sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              key="sheet"
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-cova-surface"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              style={{ maxHeight: '85vh' }}
            >
              <div className="mx-auto mt-3 mb-2 h-1 w-12 rounded-full bg-white/20" />
              <div
                className="px-4 pb-2"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {activeHotspot && (
                  <p className="mb-3 text-xs uppercase tracking-[0.15em] text-cova-muted">
                    Matching: {activeHotspot.label}
                  </p>
                )}
              </div>

              <div
                className="overflow-y-auto px-4 pb-8"
                style={{ maxHeight: 'calc(85vh - 60px)' }}
              >
                {isLoadingProducts && (
                  <>
                    <div className="h-24 w-full animate-pulse rounded-xl bg-cova-surface-2" />
                    <div className="mt-4 flex gap-3 overflow-hidden">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-28 w-28 flex-shrink-0 animate-pulse rounded-xl bg-cova-surface-2"
                        />
                      ))}
                    </div>
                  </>
                )}

                {!isLoadingProducts && products.length === 0 && (
                  <div className="py-10 text-center">
                    <p
                      className="text-sm text-cova-muted"
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      No matches found — try another item.
                    </p>
                  </div>
                )}

                {!isLoadingProducts && products.length > 0 && !swapState.isSwapping && !swapState.swapUrl && (
                  <ProductSheetContent
                    products={products}
                    onBuyNow={handleBuyNow}
                    onTryInRoom={handleTryInRoom}
                    onSelectAlternative={(p) =>
                      setProducts((current) => [
                        p,
                        ...current.filter((x) => x.id !== p.id),
                      ])
                    }
                  />
                )}

                {/* Swap in progress */}
                {swapState.isSwapping && (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-cova-gold border-t-transparent" />
                    <p
                      className="text-sm text-cova-ivory"
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      Swapping item into your room…
                    </p>
                    <p
                      className="text-xs text-cova-muted"
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      This takes about 30 seconds.
                    </p>
                  </div>
                )}

                {/* Swap result */}
                {swapState.swapUrl && (
                  <SwapComparePanel
                    beforeUrl={roomStore.renderUrl}
                    afterUrl={swapState.swapUrl}
                    onKeep={handleKeepSwap}
                    onRevert={handleRevertSwap}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProductSheetContent({
  products,
  onBuyNow,
  onTryInRoom,
  onSelectAlternative,
}: {
  products: MatchedProduct[]
  onBuyNow: (p: MatchedProduct) => void
  onTryInRoom: (p: MatchedProduct) => void
  onSelectAlternative: (p: MatchedProduct) => void
}) {
  const primary = products[0]
  const alternatives = products.slice(1, 8)
  if (!primary) return null

  return (
    <>
      {/* Primary */}
      <div className="rounded-2xl bg-cova-surface-2 p-4">
        <div className="flex gap-3">
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-cova-surface-3">
            {primary.image_url ? (
              <Image
                src={primary.image_url}
                alt={primary.name}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ShoppingBag size={24} className="text-cova-muted" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span
              className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                primary.match_label === 'Perfect Match'
                  ? 'bg-cova-gold/20 text-cova-gold'
                  : primary.match_label === 'Very Similar'
                    ? 'bg-cova-success/20 text-cova-success'
                    : 'bg-cova-surface-3 text-cova-muted'
              }`}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {primary.match_label}
            </span>
            <p
              className="line-clamp-2 text-sm font-medium text-cova-ivory"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {primary.name}
            </p>
            <p style={{ fontFamily: 'var(--font-sans)' }}>
              <span className="text-lg font-semibold text-cova-ivory">
                ${Math.round(primary.price)}
              </span>
              <span className="ml-2 text-xs text-cova-muted">{primary.retailer}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onBuyNow(primary)}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-cova-gold text-base font-semibold text-cova-bg"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <ExternalLink size={14} />
            Buy Now
          </button>
          <button
            onClick={() => onTryInRoom(primary)}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-cova-border bg-cova-surface text-base font-medium text-cova-ivory"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Zap size={14} />
            Try in Room
          </button>
        </div>
      </div>

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <>
          <p
            className="mt-4 mb-2 text-xs uppercase tracking-[0.15em] text-cova-muted"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            More options
          </p>
          <div
            className="flex gap-3 overflow-x-auto pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {alternatives.map((alt) => (
              <button
                key={alt.id}
                onClick={() => onSelectAlternative(alt)}
                className="flex w-32 flex-shrink-0 flex-col text-left"
              >
                <div className="relative h-32 w-32 overflow-hidden rounded-xl bg-cova-surface-2">
                  {alt.image_url && (
                    <Image
                      src={alt.image_url}
                      alt={alt.name}
                      fill
                      sizes="128px"
                      className="object-cover"
                      unoptimized
                    />
                  )}
                </div>
                <p
                  className="mt-1 line-clamp-2 text-xs text-cova-ivory"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {alt.name}
                </p>
                <p
                  className="text-sm font-semibold text-cova-ivory"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  ${Math.round(alt.price)}
                </p>
                <p
                  className="text-[10px] text-cova-muted"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {alt.retailer}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function SwapComparePanel({
  beforeUrl,
  afterUrl,
  onKeep,
  onRevert,
}: {
  beforeUrl: string
  afterUrl: string
  onKeep: () => void
  onRevert: () => void
}) {
  return (
    <div className="py-4">
      <p
        className="mb-3 text-center text-xs uppercase tracking-[0.15em] text-cova-muted"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        Try on result
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative aspect-square overflow-hidden rounded-xl">
          <Image src={beforeUrl} alt="Before" fill sizes="50vw" className="object-cover" unoptimized />
          <span
            className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/80"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Before
          </span>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-xl">
          <Image src={afterUrl} alt="After" fill sizes="50vw" className="object-cover" unoptimized />
          <span
            className="absolute top-2 left-2 rounded-full bg-cova-gold/90 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cova-bg"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            After
          </span>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <CovaButton variant="primary" size="md" className="flex-1" onClick={onKeep}>
          Keep
        </CovaButton>
        <CovaButton variant="ghost" size="md" className="flex-1" onClick={onRevert}>
          Revert
        </CovaButton>
      </div>
    </div>
  )
}
