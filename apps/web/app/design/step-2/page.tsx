'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
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
import { captureError as reportError } from '@/lib/errors'

type CaptureStage = 'initial' | 'previewing' | 'uploading' | 'complete' | 'error'
type AuthStage = 'idle' | 'checking' | 'showing' | 'loading' | 'done'

const COLORS = {
  background: '#0A1628',
  surface: '#0F1F3D',
  gold: '#C9A84C',
  ivory: '#F8F6F1',
  muted: '#8BA3C0',
  border: '#1E3A5F',
  error: '#C0504A',
}

export default function Step2Page() {
  const router = useRouter()
  const { setRoom, setPhotoUrl, roomId } = useRoomStore()
  const { setStep, setPendingCapture, clearPendingCapture } = useSessionStore()
  const { roomType } = useFingerprintStore()

  const [captureStage, setCaptureStage] = useState<CaptureStage>('initial')
  const [authStage, setAuthStage] = useState<AuthStage>('checking')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(roomId)
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null)
  const [device, setDevice] = useState({ isMobile: false, hasLiDAR: false, isDesktop: true })

  // Auth state
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isNewUser, setIsNewUser] = useState(false)

  // Create room record on mount if none exists
  // Note: /api/rooms/create requires auth — defer this call until after auth
  const createRoomRecord = useCallback(async () => {
    if (currentRoomId) return currentRoomId
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
          return id
        }
      }
    } catch {
      // Room will be created during upload if needed
    }
    return null
  }, [currentRoomId, roomType, setRoom])

  // Check if user is already authenticated on mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Already authenticated — skip auth UI, go straight to capture
        setAuthStage('done')
        // Pre-create room so QR code is ready for authenticated users
        void createRoomRecord()
      } else {
        // Not authenticated — show auth UI before capture
        setAuthStage('showing')
      }
    }
    void checkExistingAuth()
  }, [createRoomRecord])

  // Detect device on mount
  useEffect(() => {
    const caps = getDeviceCapabilities()
    setDevice({
      isMobile: caps.isMobile || caps.isTablet,
      hasLiDAR: caps.hasLiDAR,
      isDesktop: caps.isDesktop,
    })
  }, [])


  const handleFileSelected = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setSelectedFile(file)
    setCaptureStage('previewing')
    setCaptureError(null)
  }, [])

  const handlePhotoReceivedFromQR = useCallback(
    (photoUrl: string) => {
      // QR path: photo already uploaded by mobile, URL is the Supabase storage URL
      setPhotoUrl(photoUrl)
      setPreviewUrl(photoUrl)
      setUploadedPhotoUrl(photoUrl)
      setCaptureStage('complete')
      void proceedAfterAuth(photoUrl, currentRoomId)
    },
    [currentRoomId, setPhotoUrl]
  )

  const handleCaptureError = useCallback((message: string) => {
    setCaptureError(message)
    setCaptureStage('error')
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!selectedFile) return
    setCaptureStage('uploading')

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
      setUploadedPhotoUrl(data.photo_url)

      void analytics.photoUploaded(roomType ?? 'unknown')

      setCaptureStage('complete')

      void proceedAfterAuth(data.photo_url, data.room_id)
    } catch (err) {
      void reportError(err, {
        type: 'upload_failed',
        roomId: currentRoomId ?? undefined,
      })
      setCaptureError('Upload failed. Check your connection and try again.')
      setCaptureStage('error')
    }
  }, [selectedFile, currentRoomId, roomType, setRoom, setPhotoUrl])

  const handleRetake = useCallback(() => {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setSelectedFile(null)
    setCaptureStage('initial')
    setCaptureError(null)
    setAuthStage('done')
    setUploadedPhotoUrl(null)
  }, [previewUrl])

  // Called after successful auth — fires detection async and navigates to step-3
  const proceedAfterAuth = useCallback(async (photoUrl: string, roomId: string | null) => {
    setAuthStage('done')
    clearPendingCapture()

    // Ensure we have a room record (may not exist yet if QR path skipped create)
    let finalRoomId = roomId
    if (!finalRoomId) {
      finalRoomId = await createRoomRecord()
    }

    // Fire detection and depth estimation — fire-and-forget, do NOT await
    // Detection takes ~71s; quiz takes ~2-3min; user won't wait at step-6
    if (finalRoomId && photoUrl) {
      void triggerDetection(photoUrl, finalRoomId)
    }

    setStep(3)
    router.push('/design/step-3')
  }, [createRoomRecord, setStep, router])

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null)
    setAuthStage('loading')
    // Persist photo state across OAuth redirect
    if (uploadedPhotoUrl && currentRoomId) {
      setPendingCapture(uploadedPhotoUrl, currentRoomId)
    }
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/design/step-3`,
      },
    })
    if (error) {
      setAuthError(error.message)
      setAuthStage('showing')
    }
    // On success, OAuth redirects the page — no further action needed here
  }, [uploadedPhotoUrl, currentRoomId, setPendingCapture])

  const handleAppleSignIn = useCallback(async () => {
    setAuthError(null)
    setAuthStage('loading')
    // Persist photo state across OAuth redirect
    if (uploadedPhotoUrl && currentRoomId) {
      setPendingCapture(uploadedPhotoUrl, currentRoomId)
    }
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/design/step-3`,
      },
    })
    if (error) {
      setAuthError(error.message)
      setAuthStage('showing')
    }
  }, [uploadedPhotoUrl, currentRoomId, setPendingCapture])

  const handleEmailAuth = useCallback(async () => {
    setAuthError(null)
    setAuthStage('loading')
    const supabase = createBrowserClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      // Try sign up
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setAuthError(signUpError.message)
        setAuthStage('showing')
        return
      }
      setIsNewUser(true)
    }

    // Auth succeeded — proceed
    await proceedAfterAuth(uploadedPhotoUrl ?? '', currentRoomId)
  }, [email, password, uploadedPhotoUrl, currentRoomId, proceedAfterAuth])

  const showAuthSection = authStage === 'showing' || authStage === 'loading'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <StepIndicator currentStep={2} totalSteps={10} />

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
              color: COLORS.ivory,
              marginBottom: '8px',
              fontWeight: 400,
            }}
          >
            Show us your space
          </h1>
          <p style={{ color: COLORS.muted, fontSize: '14px' }}>
            {device.isDesktop
              ? 'Scan the QR code with your phone for the best photo quality'
              : 'Take a photo from the corner of your room — stand opposite the main wall'}
          </p>
        </div>

        {/* Auth checking skeleton — shown briefly while session resolves */}
        {authStage === 'checking' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              paddingTop: '48px',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: `2px solid #C9A84C`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ color: '#8BA3C0', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
              Loading...
            </p>
          </div>
        )}

        {/* Capture UI — only shown after auth is confirmed */}
        {authStage === 'done' && (captureStage === 'initial' || captureStage === 'error') && (
          <>
            {device.isDesktop && currentRoomId ? (
              <QRCapture
                roomId={currentRoomId}
                onPhotoReceived={handlePhotoReceivedFromQR}
                onError={handleCaptureError}
              />
            ) : device.isDesktop && !currentRoomId ? (
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
                <p style={{ color: COLORS.muted, fontSize: '14px' }}>Preparing capture...</p>
              </div>
            ) : (
              <MobileCapture
                hasLiDAR={device.hasLiDAR}
                onFileSelected={handleFileSelected}
                onError={handleCaptureError}
              />
            )}

            {captureError && (
              <div
                style={{
                  background: 'rgba(192,80,74,0.1)',
                  border: `1px solid ${COLORS.error}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  width: '100%',
                  maxWidth: 340,
                }}
              >
                <p style={{ color: COLORS.error, fontSize: '14px', margin: 0 }}>{captureError}</p>
                <button
                  onClick={() => { setCaptureError(null); setCaptureStage('initial') }}
                  style={{
                    marginTop: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: COLORS.muted,
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

            <UploadFallback onFileSelected={handleFileSelected} onError={handleCaptureError} />
          </>
        )}

        {authStage === 'done' && (captureStage === 'previewing' || captureStage === 'uploading') && previewUrl && (
          <CaptureResult
            photoUrl={previewUrl}
            onConfirm={handleConfirm}
            onRetake={handleRetake}
            isUploading={captureStage === 'uploading'}
          />
        )}

        {captureStage === 'complete' && !showAuthSection && authStage === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                background: COLORS.gold,
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
            <p style={{ color: COLORS.gold, fontSize: '18px' }}>
              Photo received — starting style quiz...
            </p>
          </div>
        )}

        {/* Auth section — appears after photo is uploaded and user is not yet authed */}
        {showAuthSection && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              animation: 'authRise 400ms ease forwards',
            }}
          >
            {/* Gold divider */}
            <div
              style={{
                width: '100%',
                height: 1,
                background: 'rgba(201,168,76,0.2)',
                margin: '8px 0',
              }}
            />

            <h2
              style={{
                fontFamily: 'EB Garamond, Georgia, serif',
                fontSize: '22px',
                color: '#F8F6F1',
                fontWeight: 400,
                margin: 0,
                textAlign: 'center',
              }}
            >
              First, let&apos;s save your work
            </h2>

            <p
              style={{
                fontSize: '14px',
                color: '#8BA3C0',
                textAlign: 'center',
                maxWidth: 320,
                fontFamily: 'Inter, sans-serif',
                margin: 0,
              }}
            >
              Sign in so we can save your design as you go.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: 320 }}>
              {/* Google */}
              <button
                onClick={handleGoogleSignIn}
                disabled={authStage === 'loading'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  height: 48,
                  background: 'white',
                  borderRadius: 8,
                  border: 'none',
                  cursor: authStage === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: authStage === 'loading' ? 0.7 : 1,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>Sign in with Google</span>
              </button>

              {/* Apple */}
              <button
                onClick={handleAppleSignIn}
                disabled={authStage === 'loading'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  height: 48,
                  background: 'black',
                  borderRadius: 8,
                  border: 'none',
                  cursor: authStage === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: authStage === 'loading' ? 0.7 : 1,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <svg width="16" height="20" viewBox="0 0 16 20" fill="white">
                  <path d="M12.152 0c.09.916-.273 1.823-.774 2.49-.51.676-1.362 1.2-2.175 1.13-.102-.867.319-1.776.793-2.333C10.52.691 11.432.187 12.152 0zM14.957 16.473c-.357.81-.528 1.172-.987 1.884-.64.993-1.543 2.23-2.662 2.242-1-.011-1.259-.639-2.617-.631-1.359.008-1.64.644-2.64.656-1.119.012-1.973-1.126-2.614-2.119C1.7 15.77.794 11.613 2.626 8.803c.656-.995 1.823-1.623 3.066-1.64 1.118-.017 2.174.743 2.86.743.685 0 1.968-.918 3.316-.784.564.023 2.15.224 3.166 1.688-.082.05-1.89 1.087-1.87 3.241.024 2.573 2.296 3.43 2.32 3.442-.018.046-.363 1.23-1.527 2.98z" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'white' }}>Sign in with Apple</span>
              </button>

              {/* Email */}
              {!showEmailForm ? (
                <button
                  onClick={() => setShowEmailForm(true)}
                  disabled={authStage === 'loading'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#4A5E7A',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'center',
                  }}
                >
                  Continue with email →
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(201,168,76,0.3)',
                      background: COLORS.surface,
                      color: COLORS.ivory,
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif',
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(201,168,76,0.3)',
                      background: COLORS.surface,
                      color: COLORS.ivory,
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif',
                      boxSizing: 'border-box',
                    }}
                  />
                  {authError && (
                    <p style={{ color: COLORS.error, fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
                      {authError}
                    </p>
                  )}
                  {isNewUser && (
                    <p style={{ color: '#4A9B7F', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
                      Account created — check your email to verify.
                    </p>
                  )}
                  <button
                    onClick={handleEmailAuth}
                    disabled={authStage === 'loading' || !email || !password}
                    style={{
                      background: authStage === 'loading' ? 'rgba(201,168,76,0.5)' : COLORS.gold,
                      color: '#0A1628',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: authStage === 'loading' ? 'not-allowed' : 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      width: '100%',
                    }}
                  >
                    {authStage === 'loading' ? 'Signing in...' : 'Continue →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Back navigation */}
        <button
          onClick={() => {
            setStep(1)
            router.push('/design/step-1')
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: COLORS.muted,
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
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
        @keyframes authRise {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
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