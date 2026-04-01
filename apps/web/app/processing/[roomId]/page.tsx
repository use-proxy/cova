'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

interface PipelineStatus {
  status: string
  message: string
  progress: number
  isComplete: boolean
  isError: boolean
  thumbnailUrl: string | null
  furnitureCount: number
}

export default function ProcessingPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string
  const startTime = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    status: 'pending',
    message: 'Starting pipeline...',
    progress: 0,
    isComplete: false,
    isError: false,
    thumbnailUrl: null,
    furnitureCount: 0,
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
      // Try new status API first
      const resp = await fetch(`/api/rooms/status?roomId=${roomId}`)
      if (resp.ok) {
        const data = await resp.json()
        setPipelineStatus(data)
        if (data.isComplete) {
          setTimeout(() => router.push(`/room/${roomId}`), 1500)
        }
        return
      }
    } catch {
      // Ignore
    }

    // Fallback: poll Supabase directly
    const supabase = createBrowserClient()
    const { data } = await supabase
      .from('rooms')
      .select('status, redesign_status, marble_spz_url')
      .eq('id', roomId)
      .single()

    if (!data) return

    const status = data.redesign_status || data.status || 'processing'
    const isComplete = status === 'complete' || !!data.marble_spz_url
    const isError = status === 'error'

    setPipelineStatus((prev) => ({
      ...prev,
      status,
      isComplete,
      isError,
      message: isComplete
        ? 'Your redesign is ready!'
        : isError
          ? 'Something went wrong'
          : 'Processing...',
      progress: isComplete ? 100 : isError ? 0 : prev.progress,
    }))

    if (isComplete) {
      setTimeout(() => router.push(`/room/${roomId}`), 1500)
    }
  }, [roomId, router])

  useEffect(() => {
    const interval = setInterval(pollStatus, 5000)
    pollStatus()
    return () => clearInterval(interval)
  }, [pollStatus])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const { isComplete, isError, message, progress, thumbnailUrl, furnitureCount } = pipelineStatus

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
            fontFamily: 'Playfair Display, serif',
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
              : `${formatTime(elapsed)} — This usually takes about 8 minutes`}
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
