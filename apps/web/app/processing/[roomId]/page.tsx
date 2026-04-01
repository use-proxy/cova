'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

const STAGE_MESSAGES = [
  { maxSeconds: 30, text: 'Uploading your room...' },
  { maxSeconds: 90, text: 'Analyzing room geometry...' },
  { maxSeconds: 180, text: 'Building 3D model...' },
  { maxSeconds: Infinity, text: 'Almost there...' },
]
const ERROR_TIMEOUT_S = 300 // 5 minutes before showing error

export default function ProcessingPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string
  const supabase = createBrowserClient()

  const [status, setStatus] = useState('processing')
  const [elapsed, setElapsed] = useState(0)
  const startTime = useRef(Date.now())

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Poll room status
  useEffect(() => {
    let active = true

    const poll = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('status, splat_url, splat_path')
        .eq('id', roomId)
        .single()

      if (!active || !data) return

      setStatus(data.status || 'processing')

      if (data.status === 'complete' && data.splat_url) {
        // Brief delay to ensure file is accessible
        setTimeout(() => {
          if (active) router.push(`/room/${roomId}`)
        }, 3000)
        return
      }

      if (data.status === 'error') return
    }

    const interval = setInterval(poll, 5000)
    poll() // Initial poll

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [roomId, supabase, router])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const stageText =
    status === 'error'
      ? 'Something went wrong'
      : (STAGE_MESSAGES.find((s) => elapsed < s.maxSeconds)?.text ??
         'Almost there...')

  const showError = status === 'error' || elapsed > ERROR_TIMEOUT_S

  const retry = async () => {
    startTime.current = Date.now()
    setElapsed(0)
    setStatus('processing')
    await supabase.from('rooms').update({ status: 'active' }).eq('id', roomId)
    router.push(`/capture/${roomId}`)
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
      <div
        style={{
          background: '#0F1F3D',
          borderRadius: 12,
          border: '1px solid #1E3A5F',
          padding: 48,
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        {!showError && (
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

        <h2
          style={{
            color: '#F8F6F1',
            fontSize: 20,
            fontFamily: 'Playfair Display, serif',
            marginBottom: 8,
          }}
        >
          {stageText}
        </h2>

        <p
          style={{
            color: '#8BA3C0',
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {showError
            ? 'There was a problem processing your room.'
            : formatTime(elapsed)}
        </p>

        {showError && (
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: 24,
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
            Try Again
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
