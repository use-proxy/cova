"use client"

import { useState, useEffect, useCallback } from "react"
import { SwipeCard } from "./SwipeCard"

interface Card {
  id: string
  image_url: string
  style_tags: string[]
}

interface Swipe {
  card_id: string
  direction: "left" | "right"
  style_tags: string[]
  timestamp: number
}

interface CardStackProps {
  sessionId: string
  onComplete: () => void
  onConfidenceUpdate: (score: number) => void
}

export function CardStack({ sessionId, onComplete, onConfidenceUpdate }: CardStackProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [swipes, setSwipes] = useState<Swipe[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch initial cards
  useEffect(() => {
    const fetchCards = async () => {
      try {
        const res = await fetch("/api/quiz/next-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, swipes: [], count: 4 }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.cards) setCards(data.cards)
        }
      } catch (e) {
        console.error("Failed to fetch cards:", e)
      }
      setLoading(false)
    }
    fetchCards()
  }, [sessionId])

  // Preload next card image
  useEffect(() => {
    if (cards.length > 1) {
      const img = new Image()
      img.src = cards[1].image_url
    }
  }, [cards])

  const handleSwipe = useCallback(async (direction: "left" | "right") => {
    const topCard = cards[0]
    if (!topCard) return

    const newSwipe: Swipe = {
      card_id: topCard.id,
      direction,
      style_tags: topCard.style_tags,
      timestamp: Date.now(),
    }
    const updatedSwipes = [...swipes, newSwipe]
    setSwipes(updatedSwipes)
    setCards((prev) => prev.slice(1))

    // Check confidence
    try {
      const confRes = await fetch("/api/quiz/confidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, swipes: updatedSwipes }),
      })
      if (confRes.ok) {
        const confData = await confRes.json()
        onConfidenceUpdate(confData.confidence)
        if (confData.complete) {
          onComplete()
          return
        }
      }
    } catch (e) {
      console.error("Confidence check failed:", e)
    }

    // Fetch next card in background
    try {
      const nextRes = await fetch("/api/quiz/next-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, swipes: updatedSwipes, count: 1 }),
      })
      if (nextRes.ok) {
        const nextData = await nextRes.json()
        if (nextData.cards?.length) {
          setCards((prev) => [...prev, ...nextData.cards])
        }
      }
    } catch (e) {
      console.error("Failed to fetch next card:", e)
    }
  }, [cards, swipes, sessionId, onComplete, onConfidenceUpdate])

  if (loading) {
    return (
      <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: "4/5", maxWidth: "min(85vw, 380px)" }}>
        <div
          className="w-full h-full rounded-2xl"
          style={{
            background: "linear-gradient(90deg, #0d1f3c 0%, rgba(201,168,76,0.08) 50%, #0d1f3c 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ aspectRatio: "4/5", maxWidth: "min(85vw, 380px)" }}>
        <p className="text-white/50 text-sm font-sans uppercase tracking-wider">No more cards</p>
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: "min(85vw, 380px)", aspectRatio: "4/5" }}>
      {cards.slice(0, 3).map((card, i) => (
        <SwipeCard
          key={card.id}
          imageUrl={card.image_url}
          isTop={i === 0}
          onSwipe={handleSwipe}
          className="inset-0"
          style={{
            zIndex: 3 - i,
            transform: i === 0 ? undefined : `scale(${1 - i * 0.05}) translateY(${i * 8}px)`,
            opacity: i === 0 ? 1 : i === 1 ? 0.7 : 0.4,
            pointerEvents: i === 0 ? "auto" : "none",
          }}
        />
      ))}
    </div>
  )
}
