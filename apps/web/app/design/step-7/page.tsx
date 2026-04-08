'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { useRoomStore } from '@/lib/store/room'
import { useSessionStore } from '@/lib/store/session'
import { CovaButton } from '@/components/cova/CovaButton'
import { createBrowserClient } from '@supabase/ssr'

export default function Step7Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const { setStep } = useSessionStore()

  const [showVideo, setShowVideo] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [dragPosition, setDragPosition] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  // Keep ref in sync with state (used inside passive-false touch listener)
  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  // Guards + init on mount
  useEffect(() => {
    if (!roomStore.renderUrl) {
      router.push('/design/step-6')
      return
    }
    if (!roomStore.originalPhotoUrl) {
      router.push('/design/step-2')
      return
    }

    // Video phase
    if (roomStore.parallaxVideoUrl) {
      setShowVideo(true)
    } else {
      setVideoEnded(true)
    }

    // Fire parallax generation (fire-and-forget, non-fatal)
    if (!roomStore.parallaxVideoUrl && roomStore.depthMapUrl && roomStore.renderUrl) {
      fetch('/api/parallax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          render_url: roomStore.renderUrl,
          depth_map_url: roomStore.depthMapUrl,
          room_id: roomStore.roomId,
        }),
      })
        .then((r) => r.json())
        .then((d: { video_url?: string | null }) => {
          if (d.video_url) roomStore.setParallaxVideoUrl(d.video_url)
        })
        .catch((err) => console.error('Parallax generation failed (non-fatal):', err))
    }

    // Auth check (async, non-blocking)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Touch drag — passive: false to allow preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return
      e.preventDefault()
      const touch = e.touches[0]
      const rect = container.getBoundingClientRect()
      const x = (touch.clientX - rect.left) / rect.width
      setDragPosition(Math.max(0.05, Math.min(0.95, x)))
    }

    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => container.removeEventListener('touchmove', handleTouchMove)
  }, [])

  // Subtle mouse parallax (depth simulation)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2
      const y = (e.clientY / window.innerHeight - 0.5) * 2
      setMouseOffset({ x, y })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      setDragPosition(Math.max(0.05, Math.min(0.95, x)))
    },
    [isDragging]
  )

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks in bottom-bar area (~160px from bottom)
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientY - rect.top > rect.height - 160) return
    const x = (e.clientX - rect.left) / rect.width
    setDragPosition(Math.max(0.05, Math.min(0.95, x)))
  }, [])

  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My AI-designed room by Cova',
          url: window.location.origin,
        })
      } else {
        await navigator.clipboard.writeText(window.location.origin)
      }
    } catch {
      // user cancelled or API unavailable
    }
  }, [])

  // Don't render until guard check resolves
  if (!roomStore.renderUrl || !roomStore.originalPhotoUrl) return null

  const depthOffsetX = roomStore.depthMapUrl ? mouseOffset.x * 8 : 0
  const depthOffsetY = roomStore.depthMapUrl ? mouseOffset.y * 8 : 0

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100svh',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* ── Phase 1: Parallax video ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showVideo && !videoEnded && (
          <motion.div
            key="video"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <video
              src={roomStore.parallaxVideoUrl!}
              autoPlay
              muted
              playsInline
              onEnded={() => setVideoEnded(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <button
              onClick={() => setVideoEnded(true)}
              style={{
                position: 'absolute',
                bottom: 32,
                right: 24,
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Skip →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phase 2: Before/after comparison ───────────────────────────────── */}
      <AnimatePresence>
        {(videoEnded || !showVideo) && (
          <motion.div
            key="comparison"
            initial={{ opacity: showVideo ? 0 : 1 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            ref={containerRef}
            style={{
              position: 'absolute',
              inset: 0,
              cursor: isDragging ? 'ew-resize' : 'col-resize',
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onClick={handleContainerClick}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
          >
            {/* AFTER image — bottom layer, full screen, subtle parallax */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translate(${depthOffsetX}px, ${depthOffsetY}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              <Image
                src={roomStore.renderUrl!}
                alt="Redesigned room"
                fill
                style={{ objectFit: 'cover' }}
                priority
              />
            </div>

            {/* After label */}
            <div
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 10,
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(0,0,0,0.3)',
                padding: '4px 8px',
                borderRadius: 9999,
                fontFamily: 'var(--font-sans)',
                userSelect: 'none',
              }}
            >
              After
            </div>

            {/* BEFORE image — top layer, clipped to left of drag handle */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                clipPath: `inset(0 ${(1 - dragPosition) * 100}% 0 0)`,
              }}
            >
              <Image
                src={roomStore.originalPhotoUrl!}
                alt="Original room"
                fill
                style={{ objectFit: 'cover' }}
              />
            </div>

            {/* Before label */}
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                zIndex: 10,
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(0,0,0,0.3)',
                padding: '4px 8px',
                borderRadius: 9999,
                fontFamily: 'var(--font-sans)',
                userSelect: 'none',
              }}
            >
              Before
            </div>

            {/* ── Drag handle ──────────────────────────────────────────────── */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${dragPosition * 100}%`,
                transform: 'translateX(-50%)',
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                setIsDragging(true)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                setIsDragging(true)
              }}
            >
              {/* Vertical line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  width: 2,
                  background: 'rgba(255,255,255,0.8)',
                  transform: 'translateX(-50%)',
                }}
              />
              {/* Handle circle */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'ew-resize',
                  color: 'var(--cova-surface)',
                }}
              >
                <ChevronLeft size={14} />
                <ChevronRight size={14} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom bar — always visible ─────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
          paddingTop: 48,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          zIndex: 40,
        }}
      >
        {/* Share button */}
        <button
          onClick={handleShare}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Share2 size={14} />
          Share
        </button>

        {/* CTAs */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            maxWidth: 384,
            margin: '0 auto',
          }}
        >
          <CovaButton
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => {
              setStep(9)
              router.push('/design/step-9')
            }}
          >
            Shop This Look →
          </CovaButton>
          <CovaButton
            variant="ghost"
            size="lg"
            className="flex-1"
            onClick={() => {
              setStep(8)
              router.push('/design/step-8')
            }}
          >
            Refine →
          </CovaButton>
        </div>

        {/* Dashboard link — only when authenticated */}
        {isAuthenticated && (
          <p
            onClick={() => router.push('/dashboard')}
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: 'rgba(255,255,255,0.5)',
              marginTop: 12,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLParagraphElement).style.color =
                'rgba(255,255,255,0.8)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLParagraphElement).style.color =
                'rgba(255,255,255,0.5)'
            }}
          >
            View in Dashboard
          </p>
        )}
      </div>
    </div>
  )
}
