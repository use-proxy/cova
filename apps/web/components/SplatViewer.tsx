'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { SplatMesh, SparkControls } from '@sparkjsdev/spark'
import { createBrowserClient } from '@/lib/supabase/client'
import { useUserStore } from '@/lib/stores/userStore'
import { useRoomStore } from '@/lib/stores/roomStore'

interface SplatViewerProps {
  url: string
  roomId?: string
  hasRedesign?: boolean
}

export default function SplatViewer({
  url,
  roomId,
  hasRedesign = false,
}: SplatViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [activeView, setActiveView] = useState<'real' | 'redesigned'>('real')

  // --- Telemetry refs (no re-renders) ---
  const entryTimestamp = useRef<number>(Date.now())
  const hotspotClickCount = useRef<number>(0)
  const hasFlushed = useRef<boolean>(false)

  /** Increment when a hotspot is clicked. Wire to hotspot handler in M7. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired in M7 when hotspots exist
  const onHotspotClick = useCallback(() => {
    hotspotClickCount.current += 1
  }, [])

  // Flush engagement data to redesign_feedback
  useEffect(() => {
    // Reset on mount
    entryTimestamp.current = Date.now()
    hotspotClickCount.current = 0
    hasFlushed.current = false

    const flush = () => {
      if (hasFlushed.current) return
      hasFlushed.current = true

      const userId = useUserStore.getState().user?.id
      const resolvedRoomId = roomId ?? useRoomStore.getState().currentRoomId
      if (!userId || !resolvedRoomId) return

      const timeSpent = Date.now() - entryTimestamp.current
      const styleVector = useUserStore.getState().styleVector

      const supabase = createBrowserClient()
      supabase
        .from('redesign_feedback')
        .upsert(
          {
            user_id: userId,
            room_id: resolvedRoomId,
            time_spent_in_viewer_ms: timeSpent,
            hotspots_clicked: hotspotClickCount.current,
            feedback_score: null,
            redesign_style: null,
            style_vector_at_time: styleVector,
          },
          { onConflict: 'user_id,room_id' }
        )
        .then(({ error }) => {
          if (error) console.error('[SplatViewer] telemetry flush failed:', error.message)
        })
    }

    const handleBeforeUnload = () => flush()
    const handleVisibilityChange = () => {
      if (document.hidden) flush()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      flush()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [roomId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a1628)

    const camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 1, 3)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)

    const splatMesh = new SplatMesh({ url })
    scene.add(splatMesh)

    // Mark loaded after a reasonable delay (SplatMesh loads async internally)
    const loadTimeout = setTimeout(() => setIsLoaded(true), 3000)

    const controls = new SparkControls({ canvas })

    const handleResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    let animId: number

    const animate = () => {
      controls.update(camera)
      renderer.render(scene, camera)
      animId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      clearTimeout(loadTimeout)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [url])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* Loading spinner */}
      {!isLoaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0A1628',
            zIndex: 20,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid #1E3A5F',
              borderTopColor: '#C9A84C',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: 16,
            }}
          />
          <p style={{ color: '#8BA3C0', fontSize: 14 }}>Loading 3D room...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* View toggle */}
      {isLoaded && roomId && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 4,
            background: '#0F1F3D',
            borderRadius: 24,
            border: '1px solid #1E3A5F',
            padding: 4,
            zIndex: 10,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveView('real')}
            style={{
              padding: '8px 20px',
              borderRadius: 20,
              border: 'none',
              background: activeView === 'real' ? '#C9A84C' : 'transparent',
              color: activeView === 'real' ? '#0A1628' : '#8BA3C0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 200ms ease-out',
            }}
          >
            Real Room
          </button>
          <button
            type="button"
            onClick={() => hasRedesign && setActiveView('redesigned')}
            title={hasRedesign ? undefined : 'Coming soon'}
            style={{
              padding: '8px 20px',
              borderRadius: 20,
              border: 'none',
              background:
                activeView === 'redesigned' ? '#C9A84C' : 'transparent',
              color: hasRedesign
                ? activeView === 'redesigned'
                  ? '#0A1628'
                  : '#F8F6F1'
                : '#4A5568',
              fontSize: 13,
              fontWeight: 600,
              cursor: hasRedesign ? 'pointer' : 'not-allowed',
              opacity: hasRedesign ? 1 : 0.5,
              transition: 'all 200ms ease-out',
            }}
          >
            Redesigned
          </button>
        </div>
      )}
    </div>
  )
}
