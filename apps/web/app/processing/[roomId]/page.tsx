'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'

const STATUS_PROGRESS: Record<string, number> = {
  'pending': 5,
  'uploading_photos': 10,
  'generating_mini_world': 20,
  'mini_world_ready': 35,
  'awaiting_furniture_selection': 35,
  'kontext_processing': 50,
  'kontext_complete': 65,
  'matching_products': 80,
  'render_ready': 100,
}

const STATUS_MESSAGES: Record<string, string> = {
  'pending': 'Analyzing your room geometry...',
  'uploading_photos': 'Uploading your photos...',
  'generating_mini_world': 'Building your 3D space...',
  'mini_world_ready': 'Analyzing furniture...',
  'kontext_processing': 'Generating your design...',
  'kontext_complete': 'Matching furniture...',
  'matching_products': 'Finding perfect products...',
  'render_ready': 'Your room is ready!',
}

interface PipelineStatus {
  status: string
  message: string
  progress: number
  isComplete: boolean
  isError: boolean
  thumbnailUrl: string | null
  furnitureCount: number
  pipelineMode: string | null
  perspectiveRenderUrl: string | null
}

export default function ProcessingPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string
  const startTime = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const consecutiveErrors = useRef(0)
  const [showError, setShowError] = useState(false)

  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    status: 'pending',
    message: STATUS_MESSAGES['pending'],
    progress: STATUS_PROGRESS['pending'],
    isComplete: false,
    isError: false,
    thumbnailUrl: null,
    furnitureCount: 0,
    pipelineMode: null,
    perspectiveRenderUrl: null,
  })

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const pollStatus = useCallback(async () => {
    try {
      const resp = await fetch(`/api/rooms/status?roomId=${roomId}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const data = await resp.json()
      consecutiveErrors.current = 0

      const statusKey: string = data.redesign_status ?? 'pending'
      const progress = STATUS_PROGRESS[statusKey] ?? data.progress_percent ?? 50
      const message = STATUS_MESSAGES[statusKey] ?? data.progress_message ?? 'Processing...'
      const perspectiveRenderUrl: string | null =
        data.perspective_render_url ?? data.marble_spz_url ?? data.marble_mini_spz_url ?? null

      setPipelineStatus({
        status: statusKey,
        message,
        progress,
        isComplete: data.isComplete ?? false,
        isError: data.isError ?? false,
        thumbnailUrl: data.thumbnailUrl ?? null,
        furnitureCount: data.furnitureCount ?? 0,
        pipelineMode: data.pipeline_mode ?? null,
        perspectiveRenderUrl,
      })

      if (statusKey === 'render_ready' && perspectiveRenderUrl) {
        setTimeout(() => router.push(`/room/${roomId}`), 1500)
      } else if (data.isComplete) {
        setTimeout(() => router.push(`/room/${roomId}`), 1500)
      }
    } catch {
      consecutiveErrors.current += 1
      if (consecutiveErrors.current >= 3) {
        setShowError(true)
      }
    }
  }, [roomId, router])

  useEffect(() => {
    pollStatus()
    const interval = setInterval(pollStatus, 5000)
    return () => clearInterval(interval)
  }, [pollStatus])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const { isComplete, isError, message, progress, thumbnailUrl, furnitureCount } = pipelineStatus

  if (showError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A1628',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, width: '100%', padding: '0 24px', textAlign: 'center' }}>
          <h2
            style={{
              color: '#F8F6F1',
              fontSize: 20,
              fontFamily: 'var(--font-serif)',
              marginBottom: 8,
            }}
          >
            Something went wrong
          </h2>
          <p style={{ color: '#8BA3C0', fontSize: 14, marginBottom: 24 }}>
            There was a problem checking your room status.
          </p>
          <button
            type="button"
            onClick={() => {
              consecutiveErrors.current = 0
              setShowError(false)
              pollStatus()
            }}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#C9A84C',
              color: '#0A1628',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', padding: '0 24px', textAlign: 'center' }}>
        {/* Thumbnail preview */}
        {thumbnailUrl && (
          <div
            style={{
              marginBottom: 32,
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid #1E3A5F',
            }}
          >
            <img
              src={thumbnailUrl}
              alt="Room preview"
              style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Spinner */}
        {!isComplete && !isError && (
          <div
            style={{
              width: 48,
              height: 48,
              border: '3px solid #1E3A5F',
              borderTopColor: '#C9A84C',
              borderRadius: '50%',
              margin: '0 auto 24px',
              animation: 'spin 1s linear infinite',
            }}
          />
        )}

        {/* Status */}
        <h2
          style={{
            color: '#F8F6F1',
            fontSize: 20,
            fontFamily: 'var(--font-serif)',
            marginBottom: 8,
          }}
        >
          {message}
        </h2>

        <p style={{ color: '#8BA3C0', fontSize: 14, marginBottom: 24 }}>
          {isComplete
            ? `Found ${furnitureCount} matching products`
            : isError
              ? 'There was a problem processing your room.'
              : `${formatTime(elapsed)} — This usually takes about ${pipelineStatus.pipelineMode === 'mini_both' ? '2-3 minutes' : '8 minutes'}`}
        </p>

        {/* Progress bar */}
        {!isError && (
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                height: 4,
                background: '#1E3A5F',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: isComplete
                    ? '#4A9B7F'
                    : 'linear-gradient(90deg, #C9A84C, #F0D080)',
                  borderRadius: 2,
                  transition: 'width 1s ease-out',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 12,
                color: '#8BA3C0',
              }}
            >
              <span>{pipelineStatus.status?.replace(/_/g, ' ')}</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {/* Actions */}
        {isError && (
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#C9A84C',
              color: '#0A1628',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Dashboard
          </button>
        )}

        {isComplete && (
          <button
            type="button"
            onClick={() => router.push(`/room/${roomId}`)}
            style={{
              padding: '14px 32px',
              borderRadius: 12,
              border: 'none',
              background: '#C9A84C',
              color: '#0A1628',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}
          >
            View Your Redesign
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(201, 168, 76, 0.4); }
          50% { box-shadow: 0 0 20px 4px rgba(201, 168, 76, 0.2); }
        }
      `}</style>
    </div>
  )
}
