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
import { StepIndicator } from '@/components/cova/StepIndicator'
import { analytics } from '@/lib/analytics'
import { captureError } from '@/lib/errors'

type CaptureStage = 'initial' | 'previewing' | 'uploading' | 'complete' | 'error'

export default function Step5Page() {
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

  // Detect device on mount
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
        setStep(6)
        router.push('/design/step-6')
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
      setTimeout(() => {
        setStep(6)
        router.push('/design/step-6')
      }, 1500)
    } catch (err) {
      void captureError(err, {
        type: 'upload_failed',
        roomId: currentRoomId ?? undefined,
      })
      setError('Upload failed. Check your connection and try again.')
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
      <StepIndicator currentStep={5} totalSteps={10} />

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
              ? 'Scan the QR code with your phone for the best photo quality'
              : 'Take a photo from the corner of your room — stand opposite the main wall'}
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
            ) : device.isDesktop && !currentRoomId ? (
              /* Desktop waiting for room creation */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: '2px solid #C9A84C',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <p style={{ color: '#8BA3C0', fontSize: '14px' }}>Creating your room...</p>
              </div>
            ) : (
              /* Mobile / tablet — direct camera */
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
                <button
                  onClick={() => {
                    setError(null)
                    setStage('initial')
                  }}
                  style={{
                    marginTop: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#8BA3C0',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Try again
                </button>
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
            <div
              style={{
                width: 64,
                height: 64,
                background: '#C9A84C',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <polyline
                  points="6,16 13,23 26,9"
                  stroke="#0A1628"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p style={{ color: '#C9A84C', fontSize: '18px' }}>
              Photo received — analyzing your room...
            </p>
          </div>
        )}

        {/* Back navigation */}
        <button
          onClick={() => {
            setStep(4)
            router.push('/design/step-4')
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  )
}

async function triggerDetection(photoUrl: string, roomId: string): Promise<void> {
  try {
    await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ photo_url: photoUrl, room_id: roomId }),
    })
  } catch {
    // Detection failure is non-blocking
  }
}
