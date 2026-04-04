'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRoomStore } from '@/lib/store/room'
import { useSessionStore } from '@/lib/store/session'
import { useFingerprintStore } from '@/lib/store/fingerprint'
import { getDeviceCapabilities } from '@/lib/deviceDetection'
import { MobileCapture } from '@/components/capture/MobileCapture'
import { QRCapture } from '@/components/capture/QRCapture'
import { UploadFallback } from '@/components/capture/UploadFallback'
import { CaptureResult } from '@/components/capture/CaptureResult'
import { analytics } from '@/lib/analytics'
import { captureError } from '@/lib/errors'

type CaptureStage = 'initial' | 'previewing' | 'uploading' | 'complete' | 'error'

export default function Step6Page() {
  const router = useRouter()
  const { setRoom, setPhotoUrl, roomId } = useRoomStore()
  const { setStep } = useSessionStore()
  const { roomType } = useFingerprintStore()

  const [stage, setStage] = useState<CaptureStage>('initial')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(roomId)
  const [device, setDevice] = useState({
    isMobile: false,
    hasLiDAR: false,
    isDesktop: true,
  })

  useEffect(() => {
    const caps = getDeviceCapabilities()
    setDevice({
      isMobile: caps.isMobile || caps.isTablet,
      hasLiDAR: caps.hasLiDAR,
      isDesktop: caps.isDesktop,
    })
  }, [])

  // Create room record on mount if none exists
  useEffect(() => {
    if (currentRoomId) return

    const createRoom = async () => {
      try {
        const response = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_type: roomType ?? 'living_room' }),
        })
        if (response.ok) {
          const data = (await response.json()) as { id?: string; room_id?: string }
          const id = data.id ?? data.room_id
          if (id) {
            setRoom(id)
            setCurrentRoomId(id)
          }
        }
      } catch {
        // Room will be created during upload if needed
      }
    }

    createRoom()
  }, [currentRoomId, roomType, setRoom])

  const handleFileSelected = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setSelectedFile(file)
    setStage('previewing')
    setError(null)
  }, [])

  const handlePhotoReceivedFromQR = useCallback(
    (photoUrl: string) => {
      setPhotoUrl(photoUrl)
      setPreviewUrl(photoUrl)
      setStage('complete')
      if (currentRoomId) {
        void triggerDetection(photoUrl, currentRoomId)
      }
      setTimeout(() => {
        setStep(7)
        router.push('/design/step-7')
      }, 1500)
    },
    [currentRoomId, setPhotoUrl, setStep, router]
  )

  const handleError = useCallback((message: string) => {
    setError(message)
    setStage('error')
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!selectedFile) return
    setStage('uploading')

    try {
      const formData = new FormData()
      formData.append('photo', selectedFile)
      if (currentRoomId) {
        formData.append('room_id', currentRoomId)
      }

      const response = await fetch('/api/rooms/capture', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const data = (await response.json()) as { room_id: string; photo_url: string }

      setRoom(data.room_id)
      setPhotoUrl(data.photo_url)
      setCurrentRoomId(data.room_id)

      void analytics.photoUploaded(roomType ?? 'unknown')

      void triggerDetection(data.photo_url, data.room_id)

      setStage('complete')
      setStep(7)
      router.push('/design/step-7')
    } catch (err) {
      void captureError(err, {
        type: 'upload_failed',
        roomId: currentRoomId ?? undefined,
      })
      setError('Upload failed. Please check your connection and try again.')
      setStage('error')
    }
  }, [selectedFile, currentRoomId, roomType, setRoom, setPhotoUrl, setStep, router])

  const handleRetake = useCallback(() => {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setSelectedFile(null)
    setStage('initial')
    setError(null)
  }, [previewUrl])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* Progress bar */}
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: '#0F1F3D' }}
      >
        <div
          style={{
            height: '100%',
            width: `${(6 / 11) * 100}%`,
            background: '#C9A84C',
            transition: 'width 300ms ease-out',
          }}
        />
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: 'EB Garamond, Georgia, serif',
              fontSize: '28px',
              color: '#F8F6F1',
              marginBottom: '8px',
              fontWeight: 400,
            }}
          >
            Show us your space
          </h1>
          <p style={{ color: '#8BA3C0', fontSize: '14px' }}>
            {device.isDesktop
              ? 'Scan the QR code with your phone for best results'
              : 'Take a photo from the corner of your room'}
          </p>
        </div>

        {/* Main capture area */}
        {(stage === 'initial' || stage === 'error') && (
          <>
            {device.isDesktop && currentRoomId ? (
              <QRCapture
                roomId={currentRoomId}
                onPhotoReceived={handlePhotoReceivedFromQR}
                onError={handleError}
              />
            ) : (
              <MobileCapture
                hasLiDAR={device.hasLiDAR}
                onFileSelected={handleFileSelected}
                onError={handleError}
              />
            )}

            {/* Error display */}
            {error && (
              <div
                style={{
                  background: 'rgba(192,80,74,0.1)',
                  border: '1px solid #C0504A',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  width: '100%',
                  maxWidth: 340,
                }}
              >
                <p style={{ color: '#C0504A', fontSize: '14px', margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Upload fallback — always shown */}
            <UploadFallback onFileSelected={handleFileSelected} onError={handleError} />
          </>
        )}

        {(stage === 'previewing' || stage === 'uploading') && previewUrl && (
          <CaptureResult
            photoUrl={previewUrl}
            onConfirm={handleConfirm}
            onRetake={handleRetake}
            isUploading={stage === 'uploading'}
          />
        )}

        {stage === 'complete' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#C9A84C', fontSize: '18px' }}>
              ✓ Photo received — analyzing your room...
            </p>
          </div>
        )}

        {/* Back link */}
        <button
          onClick={() => {
            setStep(5)
            router.push('/design/step-5')
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8BA3C0',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

async function triggerDetection(photoUrl: string, roomId: string): Promise<void> {
  try {
    await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_url: photoUrl, room_id: roomId }),
    })
  } catch {
    // Detection failure is non-blocking — step 7 will poll for results
  }
}
