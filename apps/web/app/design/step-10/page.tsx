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
    .filter((item) => item.confidence >= 0.75)
    .map((item) => ({
      id: item.label.toLowerCase().replace(/\s+/g, '-'),
      label: item.label,
      left: (item.bbox[0] + item.bbox[2] / 2) * 100,  // center X as %
      top: (item.bbox[1] + item.bbox[3] / 2) * 100,   // center Y as %
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

  // Pre-fire all match requests in parallel on mount
  useEffect(() => {
    if (hasFiredRef.current || !renderUrl) return
    if (!fingerprint || !budgetRange || !roomType) {
      setIsLoadingProducts(false)
      return
    }
    hasFiredRef.current = true

    async function fireAllMatches() {
      setIsLoadingProducts(true)

      if (detections.length === 0) {
        // Zero-detection fallback — single general match with no item_label
        try {
          const r = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              render_crop_url: renderUrl,
              fingerprint_vector: fingerprint,
              budget_range: budgetRange,
              room_type: roomType,
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
              render_crop_url: renderUrl,
              fingerprint_vector: fingerprint,
              budget_range: budgetRange,
              room_type: roomType,
              item_label: detection.label,
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
  }, [detections, renderUrl, fingerprint, budgetRange, roomType]) // eslint-disable-line react-hooks/exhaustive-deps

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

      // Inject affiliate tag and open in new tab
      try {
        const url = new URL(product.affiliate_url)
        url.searchParams.set('tag', 'cova03-20')
        window.open(url.toString(), '_blank', 'noopener,noreferrer')
      } catch {
        // Fallback if URL parsing fails
        window.open(product.affiliate_url, '_blank', 'noopener,noreferrer')
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
      />
    </>
  )
}
