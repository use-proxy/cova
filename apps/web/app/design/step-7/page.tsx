'use client'

/**
 * Step 7 — Instant Confidence Reveal
 * Before/after drag comparison with CSS parallax depth. No video ceremony.
 * The redesigned room is there the moment the user arrives.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRoomStore } from '@/lib/store/room'
import { useSessionStore } from '@/lib/store/session'
import { CovaButton } from '@/components/cova/CovaButton'
import { createBrowserClient } from '@supabase/ssr'

export default function Step7Page() {
  const router = useRouter()
  const roomStore = useRoomStore()
  const { setStep } = useSessionStore()

  const [dragPosition, setDragPosition] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  // Wait for Zustand persist to hydrate before running guards
  useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(t)
  }, [])

  // Guards + side effects — only after hydration
  useEffect(() => {
    if (!hydrated) return
    if (!roomStore.renderUrl) {
      router.push('/design/step-6')
      return
    }
    if (!roomStore.originalPhotoUrl) {
      router.push('/design/step-2')
      return
    }

    // Auth check — async, non-blocking
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
    })

    // Fire parallax generation if we have depth + render but no video yet.
    // Fire and forget — never blocks the reveal.
    if (
      !roomStore.parallaxVideoUrl &&
      roomStore.depthMapUrl &&
      roomStore.renderUrl &&
      roomStore.roomId
    ) {
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
          if (d?.video_url) roomStore.setParallaxVideoUrl(d.video_url)
        })
        .catch(() => {
          /* silent — CSS parallax is the primary experience */
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // Touch drag with passive:false so we can preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const x = (e.touches[0]!.clientX - rect.left) / rect.width
      setDragPosition(Math.max(0.02, Math.min(0.98, x)))
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  // CSS depth parallax — subtle mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return
      const x = (e.clientX / window.innerWidth - 0.5) * 8
      const y = (e.clientY / window.innerHeight - 0.5) * 8
      document.documentElement.style.setProperty('--parallax-x', `${x}px`)
      document.documentElement.style.setProperty('--parallax-y', `${y}px`)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.style.removeProperty('--parallax-x')
      document.documentElement.style.removeProperty('--parallax-y')
    }
  }, [])

  const updateDragFromClientX = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    setDragPosition(Math.max(0.02, Math.min(0.98, x)))
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return
      updateDragFromClientX(e.clientX)
    },
    [isDragging, updateDragFromClientX]
  )

  const handleBgClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDragging) return
      // Ignore taps on bottom bar area
      const rect = e.currentTarget.getBoundingClientRect()
      if (e.clientY - rect.top > rect.height - 180) return
      updateDragFromClientX(e.clientX)
    },
    [isDragging, updateDragFromClientX]
  )

  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My AI-designed room by Cova',
          text: 'I redesigned my room with AI — check out Cova!',
          url: window.location.origin,
        })
      } else {
        await navigator.clipboard.writeText(window.location.origin)
        toast.success('Link copied')
      }
    } catch {
      /* user cancelled */
    }
  }, [])

  if (!hydrated || !roomStore.renderUrl || !roomStore.originalPhotoUrl) return null

  return (
    <div
      className="relative w-screen overflow-hidden bg-black"
      style={{ height: '100svh' }}
    >
      {/* Comparison layer */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: isDragging ? 'ew-resize' : 'col-resize' }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onClick={handleBgClick}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => setIsDragging(false)}
      >
        {/* AFTER image — base layer with CSS depth parallax */}
        <div
          className="absolute inset-0"
          style={{
            transform:
              'translate(var(--parallax-x, 0px), var(--parallax-y, 0px)) scale(1.05)',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <Image
            src={roomStore.renderUrl}
            alt="Your redesigned room"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>

        {/* BEFORE image — clipped to the left of the drag handle */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${dragPosition * 100}%` }}
        >
          <div
            className="relative h-full"
            style={{ width: '100vw' }}
          >
            <Image
              src={roomStore.originalPhotoUrl}
              alt="Your original room"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
        </div>

        {/* Labels — quiet, not competing with the image */}
        {dragPosition > 0.15 && (
          <div
            className="absolute top-6 left-4 z-20 rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/70 backdrop-blur-sm"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Before
          </div>
        )}
        {dragPosition < 0.85 && (
          <div
            className="absolute top-6 right-4 z-20 rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-white/70 backdrop-blur-sm"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            After
          </div>
        )}

        {/* Drag handle */}
        <div
          className="absolute top-0 bottom-0 z-30"
          style={{ left: `${dragPosition * 100}%`, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => {
            e.stopPropagation()
            setIsDragging(true)
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
            setIsDragging(true)
          }}
        >
          {/* Vertical beam */}
          <div
            className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-white/90"
            style={{ boxShadow: '0 0 8px rgba(255,255,255,0.6)' }}
          />
          {/* Handle puck */}
          <div
            className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center gap-0.5 rounded-full bg-white active:cursor-grabbing"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
          >
            <ChevronLeft size={14} className="-mx-0.5 text-neutral-700" />
            <ChevronRight size={14} className="-mx-0.5 text-neutral-700" />
          </div>
        </div>
      </div>

      {/* Bottom bar — always floating over the image */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 px-4 pt-16"
        style={{
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 55%, transparent)',
        }}
      >
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          {/* Primary CTA row */}
          <div className="flex gap-3">
            <CovaButton
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setStep(9)
                router.push('/design/step-9')
              }}
            >
              Shop This Look
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

          {/* Secondary row */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Share2 size={16} />
              Share
            </button>
            {isAuthenticated && (
              <button
                onClick={() => router.push('/dashboard')}
                className="text-xs text-white/40 transition-colors hover:text-white/70"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                View in Dashboard →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
