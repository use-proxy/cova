"use client";

import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { SwipeCard } from "./SwipeCard";

interface Card {
  id: string;
  image_url: string;
  style_tags: string[];
}

interface Swipe {
  card_id: string;
  direction: "left" | "right";
  style_tags: string[];
  timestamp: number;
}

interface CardStackProps {
  sessionId: string;
  onComplete: () => void;
  onConfidenceUpdate: (score: number) => void;
  onSwipe?: (direction: "left" | "right", styleTags: string[]) => void;
}

export interface CardStackHandle {
  swipe: (direction: "left" | "right") => void;
}

const FALLBACK_CARDS: Card[] = Array.from({ length: 10 }, (_, i) => ({
  id: `fallback-${i}`,
  image_url: `https://picsum.photos/520/347?random=${i + 10}`,
  style_tags: [
    [
      "modern",
      "minimalist",
      "scandinavian",
      "industrial",
      "bohemian",
      "coastal",
      "mid-century",
      "traditional",
    ][i % 8],
  ],
}));

export const CardStack = forwardRef<CardStackHandle, CardStackProps>(
  function CardStack(
    { sessionId, onComplete, onConfidenceUpdate, onSwipe },
    ref,
  ) {
    const [cards, setCards] = useState<Card[]>([]);
    const [swipes, setSwipes] = useState<Swipe[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch initial cards with fallback
    useEffect(() => {
      const fetchCards = async () => {
        try {
          const res = await fetch("/api/quiz/next-card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              swipes: [],
              count: 4,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.cards?.length) {
              setCards(data.cards);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.error("Failed to fetch cards:", e);
        }
        setCards(FALLBACK_CARDS);
        setLoading(false);
      };
      fetchCards();
    }, [sessionId]);

    // Preload next card image
    useEffect(() => {
      if (cards.length > 1) {
        const img = new Image();
        img.src = cards[1].image_url;
      }
    }, [cards]);

    const handleSwipe = useCallback(
      async (direction: "left" | "right") => {
        const topCard = cards[0];
        if (!topCard) return;

        const newSwipe: Swipe = {
          card_id: topCard.id,
          direction,
          style_tags: topCard.style_tags,
          timestamp: Date.now(),
        };
        const updatedSwipes = [...swipes, newSwipe];
        setSwipes(updatedSwipes);
        setCards((prev) => prev.slice(1));
        onSwipe?.(direction, topCard.style_tags);

        // Check confidence
        try {
          const confRes = await fetch("/api/quiz/confidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              swipes: updatedSwipes,
            }),
          });
          if (confRes.ok) {
            const confData = await confRes.json();
            onConfidenceUpdate(confData.confidence);
            if (confData.complete) {
              onComplete();
              return;
            }
          }
        } catch (e) {
          console.error("Confidence check failed:", e);
        }

        // Fetch next card in background
        try {
          const nextRes = await fetch("/api/quiz/next-card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              swipes: updatedSwipes,
              count: 1,
            }),
          });
          if (nextRes.ok) {
            const nextData = await nextRes.json();
            if (nextData.cards?.length) {
              setCards((prev) => [...prev, ...nextData.cards]);
            }
          }
        } catch (e) {
          console.error("Failed to fetch next card:", e);
        }
      },
      [cards, swipes, sessionId, onComplete, onConfidenceUpdate, onSwipe],
    );

    // Expose swipe method via ref
    useImperativeHandle(
      ref,
      () => ({
        swipe: (direction: "left" | "right") => {
          handleSwipe(direction);
        },
      }),
      [handleSwipe],
    );

    if (loading) {
      return (
        <div
          className="relative"
          style={{ width: "min(92vw, 560px)", aspectRatio: "3/2" }}
        >
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background:
                "linear-gradient(90deg, #0d1f3c 0%, rgba(201,168,76,0.08) 50%, #0d1f3c 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }}
          />
        </div>
      );
    }

    if (cards.length === 0) {
      return (
        <div
          className="flex items-center justify-center"
          style={{ width: "min(92vw, 560px)", aspectRatio: "3/2" }}
        >
          <p className="text-white/50 text-sm font-sans uppercase tracking-wider">
            No more cards
          </p>
        </div>
      );
    }

    const visibleCards = cards.slice(0, 3);

    return (
      <div
        className="relative"
        style={{ width: "min(92vw, 560px)", aspectRatio: "3/2" }}
      >
        {visibleCards.map((card, i) => (
          <div
            key={card.id}
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${1 - i * 0.04}) translateY(${i * 12}px)`,
              opacity: 1 - i * 0.3,
              zIndex: visibleCards.length - i,
              transformOrigin: "bottom center",
              transition:
                i === 0 ? "none" : "transform 300ms ease, opacity 300ms ease",
              pointerEvents: i === 0 ? "auto" : "none",
            }}
          >
            <SwipeCard
              imageUrl={card.image_url}
              isTop={i === 0}
              onSwipe={i === 0 ? handleSwipe : () => {}}
            />
          </div>
        ))}
      </div>
    );
  },
);
