'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Camera, CheckCircle, ArrowRight } from 'lucide-react'
import { StepIndicator } from '@/components/cova/StepIndicator'
import { CovaButton } from '@/components/cova/CovaButton'
import { toast } from 'sonner'
import { useFingerprintStore, useRoomStore, useSessionStore } from '@/lib/store'

type UploadState = 'idle' | 'uploading' | 'complete' | 'error'

export default function Step2Page() {
  const router = useRouter()
  const fingerprintStore = useFingerprintStore()
  const roomStore = useRoomStore()
  const { setStep } = useSessionStore()

  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  // Guard: must have room type selected
  useEffect(() => {
    if (!fingerprintStore.roomType) {
      router.push('/design/step-1')
    }
  }, [fingerprintStore.roomType, router])

  // Pre-populate if user navigated back with existing photo
  useEffect(() => {
    if (roomStore.originalPhotoUrl && uploadState === 'idle') {
      setPreviewUrl(roomStore.originalPhotoUrl)
      setUploadState('complete')
    }
  }, [roomStore.originalPhotoUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setUploadState('idle')
    if (captureRef.current) captureRef.current.value = ''
    if (uploadRef.current) uploadRef.current.value = ''
  }, [previewUrl])

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Size validation
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Please use a photo under 15MB')
      event.target.value = ''
      return
    }

    // Type validation
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!allowed.includes(file.type)) {
      toast.error('Please use a JPEG, PNG, WebP, or HEIC photo')
      event.target.value = ''
      return
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setUploadState('uploading')

    try {
      // Ensure room exists
      let currentRoomId = roomStore.roomId
      if (!currentRoomId) {
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_type: fingerprintStore.roomType }),
        })
        if (!res.ok) throw new Error('Failed to create room')
        const { id } = await res.json() as { id: string }
        roomStore.setRoom(id)
        currentRoomId = id
      }

      // Upload photo
      const formData = new FormData()
      formData.append('photo', file)
      formData.append('room_id', currentRoomId)
      const uploadRes = await fetch('/api/rooms/capture', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')

      const { photo_url } = await uploadRes.json() as { photo_url: string }
      roomStore.setPhotoUrl(photo_url)
      setUploadState('complete')
      setStep(3)

      // Fire detection silently — do NOT await
      fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url, room_id: currentRoomId }),
      }).catch((err: unknown) => console.error('[Step 2] Detection fire-and-forget failed:', err))
      console.log('[Step 2] Detection started for room:', currentRoomId)

      // Navigate after short delay for UX
      setTimeout(() => router.push('/design/step-3'), 800)
    } catch (err) {
      console.error('[Step 2] Upload error:', err)
      setUploadState('error')
      toast.error('Upload failed — tap to retry')
    }
  }, [fingerprintStore, roomStore, router, setStep])

  return (
    <div className="bg-cova-bg min-h-screen flex flex-col font-sans overflow-hidden">
      <style>{`@keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`}</style>

      {/* Top bar */}
      <div className="relative">
        <StepIndicator currentStep={2} totalSteps={9} />
        <button
          onClick={() => router.push('/design/step-1')}
          className="absolute top-4 left-4 text-sm text-cova-muted hover:text-cova-ivory transition-colors duration-200"
        >
          ← Back
        </button>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 gap-8">
        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="font-serif text-4xl md:text-5xl text-cova-ivory tracking-wide text-center leading-tight"
        >
          Show us your space
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="text-base text-cova-muted text-center max-w-xs leading-relaxed"
        >
          One photo is all we need
        </motion.p>

        {/* Viewfinder */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden relative bg-cova-surface"
          style={{ aspectRatio: '4/3', border: '2px dashed var(--cova-border-gold)' }}
        >
          {/* Empty state */}
          {uploadState === 'idle' && !previewUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              {/* Rule-of-thirds SVG overlay */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <line x1="33.3" y1="0" x2="33.3" y2="100" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
                <line x1="66.6" y1="0" x2="66.6" y2="100" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
                <line x1="0" y1="33.3" x2="100" y2="33.3" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
                <line x1="0" y1="66.6" x2="100" y2="66.6" stroke="rgba(201,168,76,0.12)" strokeWidth="0.5" />
              </svg>
              {/* Center crosshair */}
              <svg
                className="absolute pointer-events-none"
                style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
                width="40"
                height="40"
                viewBox="0 0 40 40"
              >
                <line x1="0" y1="20" x2="40" y2="20" stroke="var(--cova-gold)" strokeWidth="1" opacity="0.4" />
                <line x1="20" y1="0" x2="20" y2="40" stroke="var(--cova-gold)" strokeWidth="1" opacity="0.4" />
              </svg>
              {/* Pulsing camera icon */}
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Camera size={48} color="var(--cova-gold)" />
              </motion.div>
              <p className="text-sm text-cova-muted text-center">Tap to capture your room</p>
            </div>
          )}

          {/* Photo preview state */}
          {previewUrl && (
            <>
              <motion.img
                key={previewUrl}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                src={previewUrl}
                alt="Room preview"
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Checkmark badge */}
              {uploadState === 'complete' && (
                <div className="absolute top-3 right-3 bg-cova-gold text-cova-bg rounded-full w-7 h-7 flex items-center justify-center">
                  <CheckCircle size={16} />
                </div>
              )}
              {/* Upload overlay with shimmer */}
              {uploadState === 'uploading' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-cova-surface overflow-hidden">
                    <div
                      className="h-full w-3/5 bg-cova-gold"
                      style={{ animation: 'shimmer 1.2s ease-in-out infinite' }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Buttons section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-6 flex flex-col gap-3 w-full max-w-sm mx-auto"
        >
          {uploadState === 'idle' && (
            <>
              <CovaButton
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => captureRef.current?.click()}
              >
                <Camera size={18} /> Take Photo
              </CovaButton>
              <CovaButton
                variant="ghost"
                size="md"
                className="w-full"
                onClick={() => uploadRef.current?.click()}
              >
                Upload from Camera Roll
              </CovaButton>
            </>
          )}

          {uploadState === 'uploading' && (
            <CovaButton variant="primary" size="lg" className="w-full" isLoading disabled>
              Uploading...
            </CovaButton>
          )}

          {uploadState === 'complete' && (
            <>
              <CovaButton
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => router.push('/design/step-3')}
              >
                Continue to Quiz <ArrowRight size={18} />
              </CovaButton>
              <CovaButton
                variant="ghost"
                size="md"
                className="w-full"
                onClick={handleRetake}
              >
                Retake Photo
              </CovaButton>
            </>
          )}

          {uploadState === 'error' && (
            <>
              <CovaButton
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => uploadRef.current?.click()}
              >
                Retry Upload
              </CovaButton>
              <CovaButton
                variant="ghost"
                size="md"
                className="w-full"
                onClick={handleRetake}
              >
                Choose Different Photo
              </CovaButton>
            </>
          )}
        </motion.div>

        {/* Hidden inputs */}
        <input
          ref={captureRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </div>
  )
}
