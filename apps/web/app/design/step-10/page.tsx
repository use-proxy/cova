'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRoomStore } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { useSessionStore } from '@/lib/store/session'
import { createBrowserClient } from '@/lib/supabase/client'
import ShopRoom, { type DetectedItem, type MatchedProduct } from '@/components/cova/ShopRoom'
import { StepIndicator } from '@/components/cova/StepIndicator'
import { optimizeRoomSelection } from '@/lib/ai/budget'
import type { KeepMaskItem } from '@/lib/store/room'

// ─── Types ────────────────────────────────────────────────────────────────────

type Accessory = {
  id: string
  name: string
  retailer: string
  price: number
  affiliate_url: string
  image_url: string
  match_score: number
  match_label: 'Perfect Match' | 'Very Similar' | 'Inspired By'
  category: string
  is_sale?: boolean
  rating?: number | null
  rating_count?: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDetectedItems(mask: KeepMaskItem[] | null): DetectedItem[] {
  if (!mask) return []
  return mask
    .filter((item) => item.confidence >= 0.75 && item.keep !== true)
    .map((item) => ({
      id: item.label.toLowerCase().replace(/\s+/g, '-'),
      label: item.label,
      left: (item.bbox[0] + item.bbox[2] / 2) * 100,  // center X as %
      top: (item.bbox[1] + item.bbox[3] / 2) * 100,   // center Y as %
      bbox: item.bbox,
      keep: item.keep,
    }))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Step10Page() {
  const router = useRouter()

  const { renderUrl, keepMask, roomId } = useRoomStore()
  const { fingerprint, budgetRange, roomType, styleName, roomLength, roomWidth } = useFingerprintStore()

  // Longest wall in inches — used for fit scoring
  const primaryWallUsableInches =
    roomLength && roomWidth ? Math.max(roomLength, roomWidth) * 12 : undefined
  const { setStep } = useSessionStore()

  void setStep // available for future navigation buttons; suppress lint

  const [productsByItem, setProductsByItem] = useState<Record<string, MatchedProduct[]>>({})
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [roomTotal, setRoomTotal] = useState(0)
  const [savings, setSavings] = useState<number | null>(null)
  const [accessories, setAccessories] = useState<Accessory[]>([])
  const hasFiredRef = useRef(false)

  // Guard — redirect if no renderUrl
  useEffect(() => {
    if (!renderUrl) router.replace('/design/step-8')
  }, [renderUrl, router])

  // Compute detections from keepMask (stable across renders via useMemo pattern)
  const detections = toDetectedItems(keepMask)

  // Synthetic fallback when no items pass the 0.75 threshold
  const displayDetections: DetectedItem[] =
    detections.length > 0
      ? detections
      : [{ id: 'your-room', label: 'Your Room', left: 50, top: 50 }]

  // Compute room total and savings when productsByItem changes
  useEffect(() => {
    const total = Object.values(productsByItem)
      .map((products) => products[0]?.price ?? 0)  // top recommendation per item
      .reduce((sum, price) => sum + price, 0)

    setRoomTotal(total)

    const budgetMax = budgetRange?.[1] ?? 0
    setSavings(budgetMax > 0 && total > 0 ? budgetMax - total : null)
  }, [productsByItem, budgetRange])

  // Pre-fire all match requests in parallel on mount
  useEffect(() => {
    if (hasFiredRef.current || !renderUrl) return
    if (!fingerprint || !budgetRange || !roomType || !roomId) {
      setIsLoadingProducts(false)
      return
    }
    hasFiredRef.current = true

    async function fireAllMatches() {
      setIsLoadingProducts(true)

      // Kept items labels for coherence + accessories context
      const keptItemLabels = (keepMask ?? [])
        .filter((item) => item.keep === true)
        .map((item) => item.label)

      if (detections.length === 0) {
        // Zero-detection fallback — general match over full render
        try {
          const r = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              render_url: renderUrl,
              item_id: 'your-room',
              item_label: 'General Room',
              item_bbox: [0, 0, 1, 1],  // full image
              item_keep: null,
              fingerprint_vector: fingerprint,
              budget_range: budgetRange,
              room_type: roomType,
              room_id: roomId,
              primary_wall_usable_inches: primaryWallUsableInches,
            }),
          })
          const data = (await r.json()) as { products: MatchedProduct[] }
          setProductsByItem({ 'your-room': data.products ?? [] })
        } catch {
          // swallow — productsByItem stays empty
        } finally {
          setIsLoadingProducts(false)
        }

        // Accessories pass for zero-detection fallback
        try {
          const accessoriesRes = await fetch('/api/match/accessories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              styleName: styleName,
              fingerprint: fingerprint,
              roomType: roomType,
              budgetRange: budgetRange,
              primaryItemLabels: displayDetections.map((d) => d.label),
              keptItemLabels,
            }),
          })
          if (accessoriesRes.ok) {
            const accessoriesData = await accessoriesRes.json() as { accessories: Accessory[] }
            setAccessories(accessoriesData.accessories)
          }
        } catch {
          // Accessories are non-critical — continue without them
        }
        return
      }

      // Per-item parallel matches
      const results = await Promise.allSettled(
        detections.map(async (detection) => {
          const res = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              render_url: renderUrl,
              item_id: detection.id,
              item_label: detection.label,
              item_bbox: detection.bbox ?? [0, 0, 1, 1],
              item_keep: detection.keep ?? null,
              fingerprint_vector: fingerprint,
              budget_range: budgetRange,
              room_type: roomType,
              room_id: roomId,
              primary_wall_usable_inches: primaryWallUsableInches,
            }),
          })
          if (!res.ok) throw new Error(`Match failed for ${detection.label}`)
          const data = (await res.json()) as { products: MatchedProduct[] }
          return { id: detection.id, products: data.products ?? [] }
        })
      )

      let byItem: Record<string, MatchedProduct[]> = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          byItem[result.value.id] = result.value.products
        }
      })

      // Coherence check — may swap outlier item to its next-best alternative
      try {
        const coherenceRes = await fetch('/api/match/coherence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productsByItem: byItem,
            styleName: styleName,
            fingerprint: fingerprint,
            roomType: roomType,
            keptItemLabels,
          }),
        })
        if (coherenceRes.ok) {
          const coherenceData = await coherenceRes.json() as {
            productsByItem: typeof byItem
            coherenceScore: number
            wasAdjusted: boolean
            adjustmentReason: string | null
          }
          byItem = coherenceData.productsByItem
        }
      } catch {
        // Coherence check is non-critical — continue without it
      }

      // Run room-level budget optimizer
      if (budgetRange) {
        const optimizerInput: Record<string, Array<{ id: string; price: number }>> = {}
        Object.entries(byItem).forEach(([itemId, products]) => {
          optimizerInput[itemId] = products.map(p => ({ id: p.id, price: p.price }))
        })

        const { selectedIndices, totalCost, wasOptimized } =
          optimizeRoomSelection(optimizerInput, budgetRange)

        void wasOptimized // suppress lint

        // Reorder products so the optimizer's selection is at index 0
        const optimizedByItem: typeof byItem = {}
        Object.entries(byItem).forEach(([itemId, products]) => {
          const selectedIdx = selectedIndices[itemId] ?? 0
          if (selectedIdx === 0) {
            optimizedByItem[itemId] = products
          } else {
            optimizedByItem[itemId] = [
              products[selectedIdx],
              ...products.slice(0, selectedIdx),
              ...products.slice(selectedIdx + 1),
            ].filter(Boolean) as MatchedProduct[]
          }
        })

        setProductsByItem(optimizedByItem)
        setRoomTotal(totalCost)

        const budgetMax = budgetRange[1]
        setSavings(budgetMax > totalCost ? budgetMax - totalCost : null)
      } else {
        // No budget range — compute total from top products only
        const total = Object.values(byItem)
          .reduce((sum, products) => sum + (products[0]?.price ?? 0), 0)
        setRoomTotal(Math.round(total))
        setProductsByItem(byItem)
      }

      setIsLoadingProducts(false)

      // Accessories pass — runs after products are shown
      try {
        const accessoriesRes = await fetch('/api/match/accessories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            styleName: styleName,
            fingerprint: fingerprint,
            roomType: roomType,
            budgetRange: budgetRange,
            primaryItemLabels: displayDetections.map((d) => d.label),
            keptItemLabels,
          }),
        })
        if (accessoriesRes.ok) {
          const accessoriesData = await accessoriesRes.json() as { accessories: Accessory[] }
          setAccessories(accessoriesData.accessories)
        }
      } catch {
        // Accessories are non-critical — continue without them
      }
    }

    void fireAllMatches()
  }, [detections, renderUrl, fingerprint, budgetRange, roomType, roomId, primaryWallUsableInches]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefreshItem = useCallback(
    async (itemId: string, currentProductName: string) => {
      const detection = displayDetections.find(d => d.id === itemId)
      if (!detection || !renderUrl || !roomId) return

      // Mark this item as loading (empty array triggers skeleton cards)
      setProductsByItem(prev => ({ ...prev, [itemId]: [] }))

      try {
        const exclusionHint = currentProductName
          ? `NOT "${currentProductName}" style — show different aesthetic`
          : 'different style alternative'

        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            render_url: renderUrl,
            item_id: detection.id,
            item_label: `${detection.label} ${exclusionHint}`,
            item_bbox: detection.bbox ?? [0, 0, 1, 1],
            item_keep: detection.keep ?? null,
            fingerprint_vector: fingerprint,
            budget_range: budgetRange,
            room_type: roomType,
            room_id: roomId,
            primary_wall_usable_inches:
              roomLength && roomWidth
                ? Math.max(roomLength, roomWidth) * 12
                : undefined,
          }),
        })

        if (res.ok) {
          const data = await res.json() as { products: MatchedProduct[] }
          setProductsByItem(prev => ({ ...prev, [itemId]: data.products }))
        }
      } catch {
        // On error, restore empty state — user can tap again
      }
    },
    [displayDetections, renderUrl, roomId, fingerprint, budgetRange, roomType, roomLength, roomWidth]
  )

  const handleBuyClick = useCallback(
    async (product: MatchedProduct) => {
      const supabase = createBrowserClient()

      // Fire-and-forget interaction log
      supabase
        .from('interactions')
        .insert({
          room_id: roomId,
          product_id: product.id,
          action: 'affiliate_click',
          fingerprint_id: null,
        })
        .then(() => {}, () => {})

      // Open product URL in new tab (Serper results carry full affiliate URLs)
      try {
        window.open(product.affiliate_url, '_blank', 'noopener,noreferrer')
      } catch {
        // swallow
      }
    },
    [roomId]
  )

  if (!renderUrl) return null

  return (
    <>
      <StepIndicator currentStep={10} totalSteps={10} />
      <ShopRoom
        renderUrl={renderUrl}
        detections={displayDetections}
        productsByItem={productsByItem}
        isLoadingProducts={isLoadingProducts}
        onBuyClick={handleBuyClick}
        onRefreshItem={handleRefreshItem}
        roomTotal={roomTotal}
        savings={savings}
        accessories={accessories}
      />
    </>
  )
}
