'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import QRCode from 'react-qr-code'

const GUIDANCE_MESSAGES = [
  'Slowly pan around the room',
  'Point at the ceiling',
  'Get that corner',
  'Almost there',
]

export default function CapturePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const roomId = params.roomId as string
  const token = searchParams.get('token')

  const [showCamera, setShowCamera] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const mobile =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768
    setShowCamera(mobile || !!token)
    setLoaded(true)
  }, [token])

  if (!loaded) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#8BA3C0' }}>Loading...</p>
      </div>
    )
  }

  return showCamera ? (
    <MobileCapture roomId={roomId} token={token} />
  ) : (
    <DesktopQR roomId={roomId} />
  )
}

// ---------------------------------------------------------------------------
// PATH A — Mobile Camera Capture
// ---------------------------------------------------------------------------

function MobileCapture({
  roomId,
  token,
}: {
  roomId: string
  token: string | null
}) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [guidanceIndex, setGuidanceIndex] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // Validate token if present (QR flow)
  useEffect(() => {
    if (token) {
      fetch(`/api/capture/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).then(async (res) => {
        if (!res.ok) {
          router.push('/auth?error=invalid-token')
        }
      })
    }
  }, [token, router])

  // Start camera
  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
        setStream(mediaStream)
      } catch {
        console.error('Camera access denied')
      }
    }
    startCamera()
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle guidance messages while recording
  useEffect(() => {
    if (!recording) return
    const interval = setInterval(() => {
      setGuidanceIndex((i) => (i + 1) % GUIDANCE_MESSAGES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [recording])

  const startRecording = useCallback(() => {
    if (!stream) return
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(100)
    mediaRecorderRef.current = recorder
    setRecording(true)
  }, [stream])

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    setRecording(false)
    setUploading(true)

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id || 'anonymous'

    const storagePath = `${userId}/${roomId}/video.webm`
    const { error: uploadError } = await supabase.storage
      .from('room-videos')
      .upload(storagePath, blob, {
        contentType: 'video/webm',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload failed:', uploadError)
      setUploading(false)
      return
    }

    // Update room status
    await supabase.from('rooms').update({ status: 'video_uploaded' }).eq('id', roomId)

    // Start pipeline
    await fetch('/api/pipeline/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, userId, videoPath: storagePath }),
    })

    // Stop camera
    stream?.getTracks().forEach((t) => t.stop())

    router.push(`/processing/${roomId}`)
  }, [stream, roomId, supabase, router])

  return (
    <div style={{ ...styles.container, padding: 0 }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Guidance overlay */}
      <div style={styles.guidanceOverlay}>
        <p style={{ color: '#F8F6F1', fontSize: 16, textAlign: 'center' }}>
          {recording ? GUIDANCE_MESSAGES[guidanceIndex] : 'Tap to start recording'}
        </p>
      </div>

      {/* Upload overlay */}
      {uploading && (
        <div style={styles.uploadOverlay}>
          <p style={{ color: '#F8F6F1', fontSize: 18 }}>Uploading video...</p>
        </div>
      )}

      {/* Record button */}
      {!uploading && (
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          style={{
            ...styles.recordButton,
            background: recording ? '#C0504A' : '#F8F6F1',
          }}
        >
          <div
            style={{
              width: recording ? 24 : 60,
              height: recording ? 24 : 60,
              borderRadius: recording ? 4 : 30,
              background: recording ? '#F8F6F1' : '#C0504A',
              transition: 'all 200ms ease-out',
            }}
          />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PATH B — Desktop QR Code
// ---------------------------------------------------------------------------

function DesktopQR({ roomId }: { roomId: string }) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  // Generate signed QR URL
  useEffect(() => {
    async function generateQR() {
      const res = await fetch('/api/capture/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      })
      const { url } = await res.json()
      setQrUrl(url)
    }
    generateQR()
  }, [roomId])

  // Poll for video upload
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('rooms')
        .select('status')
        .eq('id', roomId)
        .single()

      if (data?.status === 'video_uploaded' || data?.status === 'processing') {
        clearInterval(interval)
        router.push(`/processing/${roomId}`)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [roomId, supabase, router])

  return (
    <div style={styles.container}>
      <div style={styles.qrCard}>
        <h2
          style={{
            color: '#F8F6F1',
            fontSize: 22,
            fontFamily: 'Playfair Display, serif',
            marginBottom: 8,
          }}
        >
          Scan to Capture
        </h2>
        <p style={{ color: '#8BA3C0', fontSize: 14, marginBottom: 24 }}>
          Open this on your phone to record your room
        </p>

        {qrUrl ? (
          <div style={{ background: '#fff', padding: 16, borderRadius: 8 }}>
            <QRCode value={qrUrl} size={200} />
          </div>
        ) : (
          <p style={{ color: '#8BA3C0' }}>Generating QR code...</p>
        )}

        <div style={styles.pulseContainer}>
          <div style={styles.pulseDot} />
          <span style={{ color: '#8BA3C0', fontSize: 13 }}>
            Waiting for your phone...
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#0A1628',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  guidanceOverlay: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    justifyContent: 'center',
  },
  uploadOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10,22,40,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  recordButton: {
    position: 'absolute',
    bottom: 48,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 80,
    height: 80,
    borderRadius: 40,
    border: '4px solid #F8F6F1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 10,
    padding: 0,
  },
  qrCard: {
    background: '#0F1F3D',
    borderRadius: 12,
    border: '1px solid #1E3A5F',
    padding: 40,
    textAlign: 'center' as const,
  },
  pulseContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    background: '#C9A84C',
    animation: 'pulse 2s ease-in-out infinite',
  },
}
