'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useArea2Store } from '@/lib/stores/area2Store'

interface PreviewState {
  prediction_id: string
  label: string
  prompt_variant: { dimKey: string; nudge: number }
  status: 'loading' | 'complete' | 'failed'
  url: string | null
}

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--cova-surface) 25%, rgba(201,168,76,0.08) 50%, var(--cova-surface) 75%)',
  backgroundSize: '200% 100%',
  animation: 'cova-shimmer 1.5s infinite',
  borderRadius: 12,
}

export default function Step7EPage() {
  const router = useRouter()
  const roomId = useArea2Store((s) => s.roomId)
  const setStyleVariantChosen = useArea2Store((s) => s.setStyleVariantChosen)

  const [cards, setCards] = useState<PreviewState[]>([])
  const [postError, setPostError] = useState<string | null>(null)
  const intervals = useRef<ReturnType<typeof setInterval>[]>([])

  function clearAllIntervals() {
    intervals.current.forEach(clearInterval)
    intervals.current = []
  }

  useEffect(() => {
    if (!roomId) {
      router.replace('/design/step-7d')
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/render/previews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ room_id: roomId }),
        })

        if (cancelled) return

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setPostError(data.error ?? 'Failed to load previews')
          return
        }

        const data = (await res.json()) as {
          previews: Array<{
            prediction_id: string
            label: string
            prompt_variant: { dimKey: string; nudge: number }
          }>
        }

        if (cancelled) return

        const initial: PreviewState[] = data.previews.map((p) => ({
          ...p,
          status: 'loading',
          url: null,
        }))
        setCards(initial)

        // Start a poller for each prediction
        initial.forEach((card, idx) => {
          const iv = setInterval(async () => {
            try {
              const statusRes = await fetch(
                `/api/render/previews/status?prediction_id=${card.prediction_id}`,
                { credentials: 'include' }
              )
              const statusData = (await statusRes.json()) as {
                status: string
                url?: string | null
              }

              if (statusData.status === 'succeeded' && statusData.url) {
                clearInterval(intervals.current[idx])
                setCards((prev) =>
                  prev.map((c, i) =>
                    i === idx ? { ...c, status: 'complete', url: statusData.url! } : c
                  )
                )
              } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
                clearInterval(intervals.current[idx])
                setCards((prev) =>
                  prev.map((c, i) => (i === idx ? { ...c, status: 'failed' } : c))
                )
              }
            } catch {
              // transient — keep polling
            }
          }, 2000)
          intervals.current[idx] = iv
        })
      } catch (e) {
        if (!cancelled) {
          setPostError(e instanceof Error ? e.message : 'Failed to load previews')
        }
      }
    })()

    return () => {
      cancelled = true
      clearAllIntervals()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  if (!roomId) return null

  return (
    <>
      <style>{`
        @keyframes cova-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div
        style={{
          minHeight: '100svh',
          background: 'var(--cova-bg)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 8px',
          }}
        >
          <button
            onClick={() => {
              clearAllIntervals()
              router.back()
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--cova-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              cursor: 'pointer',
              padding: '4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ← Back
          </button>
          <span
            style={{
              fontSize: 12,
              color: 'var(--cova-muted)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Step 4 of 4
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 2,
            background: 'var(--cova-border)',
            margin: '0 20px 24px',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--cova-gold)',
            }}
          />
        </div>

        {/* Heading */}
        <div style={{ padding: '0 20px', marginBottom: 8 }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              color: 'var(--cova-ivory)',
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Pick a direction
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--cova-muted)',
              margin: '8px 0 0',
            }}
          >
            Quick previews of your redesign. Tap one to go further.
          </p>
        </div>

        {/* Cards area */}
        <div style={{ flex: 1, padding: '24px 20px' }}>
          {postError ? (
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid var(--cova-border)',
                background: 'var(--cova-surface)',
                color: 'var(--cova-muted)',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              {postError}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 24,
                overflowX: 'auto',
                paddingBottom: 8,
              }}
            >
              {cards.length === 0
                ? [0, 1, 2].map((i) => <ShimmerCard key={i} />)
                : cards.map((card) => (
                    <CardItem
                      key={card.prediction_id}
                      card={card}
                      onRefine={() => {
                        clearAllIntervals()
                        setStyleVariantChosen(card.prompt_variant)
                        router.push('/design/step-8')
                      }}
                    />
                  ))}
            </div>
          )}
        </div>

        {/* Skip link */}
        <div
          style={{
            textAlign: 'center',
            padding: '0 20px 32px',
          }}
        >
          <button
            onClick={() => {
              clearAllIntervals()
              setStyleVariantChosen(null)
              router.push('/design/step-8')
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--cova-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px 0',
            }}
          >
            Skip — use my style as-is →
          </button>
        </div>
      </div>
    </>
  )
}

function ShimmerCard() {
  return (
    <div
      style={{
        width: 180,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ ...shimmerStyle, width: 160, height: 160 }} />
      <div style={{ ...shimmerStyle, width: 100, height: 14 }} />
      <div
        style={{
          ...shimmerStyle,
          width: 120,
          height: 32,
          borderRadius: 8,
          opacity: 0.5,
        }}
      />
    </div>
  )
}

function CardItem({
  card,
  onRefine,
}: {
  card: PreviewState
  onRefine: () => void
}) {
  return (
    <div
      style={{
        width: 180,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {card.status === 'loading' && <ShimmerCard />}

      {card.status === 'complete' && card.url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.url}
            alt={card.label}
            style={{
              width: 160,
              height: 160,
              objectFit: 'cover',
              borderRadius: 12,
              display: 'block',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--cova-ivory)',
              textAlign: 'center',
            }}
          >
            {card.label}
          </span>
          <button
            onClick={onRefine}
            style={{
              background: 'var(--cova-gold)',
              border: 'none',
              borderRadius: 8,
              color: '#0A1628',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              cursor: 'pointer',
              width: '100%',
              maxWidth: 160,
            }}
          >
            Refine This →
          </button>
        </>
      )}

      {card.status === 'failed' && (
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 12,
            background: 'var(--cova-surface)',
            border: '1px solid var(--cova-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--cova-muted)',
              textAlign: 'center',
              padding: '0 12px',
            }}
          >
            Preview unavailable
          </span>
        </div>
      )}
    </div>
  )
}
