'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, ArrowLeftRight } from 'lucide-react'
import { useRoomStore } from '@/lib/store/room'

export default function Step8Page() {
  const router = useRouter()
  const { renderUrl, originalPhotoUrl } = useRoomStore()

  const [showingBefore, setShowingBefore] = useState(false)
  const [showCopied, setShowCopied] = useState(false)

  // Redirect if render hasn't completed yet
  useEffect(() => {
    if (!renderUrl) {
      router.replace('/design/step-7')
    }
  }, [renderUrl, router])

  if (!renderUrl) return null

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My room redesigned by Cova',
          url: window.location.href,
        })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        setShowCopied(true)
        setTimeout(() => setShowCopied(false), 2000)
      }
    } catch {
      // user cancelled or API unavailable
    }
  }

  const canToggle = Boolean(originalPhotoUrl)

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100svh',
        overflow: 'hidden',
        background: 'var(--cova-bg)',
      }}
    >
      {/* ── After image (AI render) ──────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={renderUrl}
        alt="AI-redesigned room"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: showingBefore ? 0 : 1,
          transition: 'opacity 400ms ease',
        }}
      />

      {/* ── Before image (original, grayscale) ──────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={originalPhotoUrl ?? undefined}
        alt="Original room"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: showingBefore && canToggle ? 1 : 0,
          transition: 'opacity 400ms ease',
          filter: 'grayscale(1)',
          display: canToggle ? undefined : 'none',
        }}
      />

      {/* ── "Before" label — fades in with the before image ─────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 148,
          left: 20,
          zIndex: 20,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-xs)',
          color: 'rgba(245,240,232,0.6)',
          pointerEvents: 'none',
          opacity: showingBefore ? 1 : 0,
          transition: 'opacity 400ms ease',
        }}
      >
        Before
      </div>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          height: 72,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(to bottom, rgba(9,24,41,0.6), transparent)',
        }}
      >
        {/* Before / After pill */}
        <button
          onClick={() => canToggle && setShowingBefore((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 9999,
            border: '1px solid rgba(201,168,76,0.5)',
            background: 'transparent',
            color: 'var(--cova-ivory)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-sans)',
            cursor: canToggle ? 'pointer' : 'default',
            opacity: canToggle ? 1 : 0.4,
            transition: 'border-color 150ms ease, background 150ms ease',
          }}
        >
          <ArrowLeftRight size={12} />
          <span>{showingBefore ? 'See Redesign' : 'Before / After'}</span>
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--cova-ivory)',
            cursor: 'pointer',
          }}
        >
          <Share2 size={20} />
        </button>
      </div>

      {/* ── "Link copied" toast ──────────────────────────────────────────────── */}
      {showCopied && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            background: 'var(--cova-surface-2)',
            color: 'var(--cova-ivory)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xs)',
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--cova-border)',
            whiteSpace: 'nowrap',
          }}
        >
          Link copied
        </div>
      )}

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          padding: '20px 20px 40px',
          background:
            'linear-gradient(to top, rgba(9,24,41,0.97), rgba(9,24,41,0.7), transparent)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Primary CTA */}
        <button
          onClick={() => router.push('/design/step-10')}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--cova-gold)',
            color: 'var(--cova-bg)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          Shop This Look →
        </button>

        {/* Ghost CTA */}
        <button
          onClick={() => router.push('/design/step-9')}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: 12,
            border: '1px solid rgba(201,168,76,0.4)',
            background: 'transparent',
            color: 'var(--cova-ivory)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          Not quite right?
        </button>
      </div>
    </div>
  )
}
