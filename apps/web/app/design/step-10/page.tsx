'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRoomStore } from '@/lib/store/room'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { useSessionStore } from '@/lib/store/session'
import { createBrowserClient } from '@/lib/supabase/client'
import ShopRoom, { type DetectedItem, type MatchedProduct } from '@/components/cova/ShopRoom'
import { StepIndicator } from '@/components/cova/StepIndicator'
import type { KeepMaskItem } from '@/lib/store/room'

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
  const { fingerprint, budgetRange, roomType } = useFingerprintStore()
  const { setStep } = useSessionStore()

  void setStep // available for future navigation buttons; suppress lint

  const [productsByItem, setProductsByItem] = useState<Record<string, MatchedProduct[]>>({})
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [roomTotal, setRoomTotal] = useState(0)
  const [savings, setSavings] = useState<number | null>(null)
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
            }),
          })
          const data = (await r.json()) as { products: MatchedProduct[] }
          setProductsByItem({ 'your-room': data.products ?? [] })
        } catch {
          // swallow — productsByItem stays empty
        } finally {
          setIsLoadingProducts(false)
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
            }),
          })
          if (!res.ok) throw new Error(`Match failed for ${detection.label}`)
          const data = (await res.json()) as { products: MatchedProduct[] }
          return { id: detection.id, products: data.products ?? [] }
        })
      )

      const byItem: Record<string, MatchedProduct[]> = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          byItem[result.value.id] = result.value.products
        }
      })

      setProductsByItem(byItem)
      setIsLoadingProducts(false)
    }

    void fireAllMatches()
  }, [detections, renderUrl, fingerprint, budgetRange, roomType, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

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
        roomTotal={roomTotal}
        savings={savings}
      />
    </>
  )
}
