"use client"

import { useState, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"
import { ModeSwitcher, type CaptureMode } from "@/components/capture/ModeSwitcher"
import { QRMode } from "@/components/capture/QRMode"
import { UploadMode } from "@/components/capture/UploadMode"
import { CompletionScreen } from "@/components/capture/CompletionScreen"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      setIsMobile(mobile)
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
  return isMobile
}

export default function CapturePage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.roomId as string
  const isMobile = useIsMobile()

  const TOTAL_SLOTS = 8

  const [mode, setMode] = useState<CaptureMode>("phone")
  const [showCompletion, setShowCompletion] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [capturedPhotoUrls, setCapturedPhotoUrls] = useState<(string | null)[]>(
    Array(TOTAL_SLOTS).fill(null)
  )
  const [photoUploadErrors, setPhotoUploadErrors] = useState<(string | null)[]>(
    Array(TOTAL_SLOTS).fill(null)
  )

  // Mobile defaults to upload (direct camera via file input in upload mode)
  useEffect(() => {
    if (isMobile) setMode("upload")
  }, [isMobile])

  const uploadPhotos = useCallback(
    async (photos: (string | File)[]) => {
      setUploading(true)
      const supabase = createBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUploading(false)
        return
      }
      setShowCompletion(false)
      setCapturedPhotoUrls(Array(TOTAL_SLOTS).fill(null))
      setPhotoUploadErrors(Array(TOTAL_SLOTS).fill(null))

      const nextUrls: (string | null)[] = Array(TOTAL_SLOTS).fill(null)
      const nextErrors: (string | null)[] = Array(TOTAL_SLOTS).fill(null)
      let pipelineStarted = false

      // Upload sequentially so we can stop on first failure and let the user retake.
      for (let i = 0; i < Math.min(photos.length, TOTAL_SLOTS); i++) {
        try {
          const photo = photos[i]
          if (!photo) continue

          const path = `${user.id}/${roomId}/photo_${i}.jpg`

          let blob: Blob
          let contentType = "image/jpeg"

          if (typeof photo === "string") {
            // data URL from webcam
            const res = await fetch(photo)
            blob = await res.blob()
          } else {
            blob = photo
            contentType = photo.type || "image/jpeg"
          }

          const { error } = await supabase.storage
            .from("room-uploads")
            .upload(path, blob, { upsert: true, contentType })

          if (error) throw error

          const {
            data: { publicUrl },
          } = supabase.storage.from("room-uploads").getPublicUrl(path)

          nextUrls[i] = publicUrl
          nextErrors[i] = null
          setCapturedPhotoUrls([...nextUrls])
          setPhotoUploadErrors([...nextErrors])

          const uploadedCount = nextUrls.filter(Boolean).length
          if (uploadedCount >= 4 && !pipelineStarted) {
            // Ensure pipeline reads the right photo URLs from the DB.
            const filtered = nextUrls.filter(Boolean) as string[]
            const updateRes = await supabase
              .from("rooms")
              .update({ capture_photo_urls: filtered })
              .eq("id", roomId)

            if (updateRes.error) {
              console.error("Failed to update capture_photo_urls:", updateRes.error)
            }

            pipelineStarted = true

            void fetch("/api/pipeline/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                room_id: roomId,
                roomId,
                photo_urls: filtered,
              }),
            }).then(async (resp) => {
              if (!resp.ok) {
                const text = await resp.text().catch(() => "")
                console.error(`Pipeline start failed: ${resp.status} ${text}`)
              }
            }).catch((err) => {
              console.error("Pipeline start failed:", err)
            })
          }
        } catch (err) {
          console.error(`Upload failed for photo slot ${i + 1}:`, err)
          nextUrls[i] = null
          nextErrors[i] = "Upload failed. Retake this photo."
          setCapturedPhotoUrls([...nextUrls])
          setPhotoUploadErrors([...nextErrors])
          break
        }
      }

      setUploading(false)
    },
    [roomId, TOTAL_SLOTS]
  )

  const handleUploadComplete = useCallback(
    (files: File[]) => {
      uploadPhotos(files)
    },
    [uploadPhotos]
  )

  const uploadedCount = capturedPhotoUrls.filter(Boolean).length

  const handleContinue = useCallback(() => {
    setShowCompletion(true)
    // Redirect after completion animation
    setTimeout(() => {
      router.push(`/quiz?roomId=${roomId}&session=${roomId}`)
    }, 2500)
  }, [router, roomId])

  useEffect(() => {
    if (showCompletion) return
    if (uploadedCount === TOTAL_SLOTS) {
      handleContinue()
    }
  }, [uploadedCount, TOTAL_SLOTS, showCompletion, handleContinue])

  if (showCompletion) {
    return <CompletionScreen />
  }

  return (
    <div className="min-h-screen bg-[var(--navy-deep)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[var(--ivory)]/60 hover:text-[var(--ivory)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-sans uppercase tracking-wider hidden md:inline">Back</span>
        </button>

        <h1 className="font-serif text-lg text-[var(--ivory)]">
          Capture Your Room
        </h1>

        <div className="w-20" />
      </div>

      {/* Mode switcher (hidden on mobile — they're already using the phone) */}
      {!isMobile && (
        <div className="flex justify-center py-4">
          <ModeSwitcher mode={mode} onModeChange={setMode} />
        </div>
      )}

      {/* Radial glow background */}
      <div className="flex-1 relative px-6 py-8 flex items-start justify-center">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(30, 64, 120, 0.3) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 w-full">
          {uploading && !showCompletion && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--navy-deep)]/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-sans text-[var(--ivory)]/60 uppercase tracking-wider">
                  Uploading photos...
                </p>
              </div>
            </div>
          )}

          {(capturedPhotoUrls.some(Boolean) || photoUploadErrors.some(Boolean)) && !uploading && (
            <div className="grid grid-cols-8 gap-1.5 mb-4">
              {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded overflow-hidden border"
                  style={{
                    borderColor: photoUploadErrors[i]
                      ? '#C0504A'
                      : capturedPhotoUrls[i]
                      ? '#4A9B7F'
                      : '#1E3A5F',
                    background: '#0A1628',
                  }}
                >
                  {capturedPhotoUrls[i] ? (
                    <img
                      src={capturedPhotoUrls[i]!}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : photoUploadErrors[i] ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-1">
                      <span className="text-[#C0504A] text-[10px] font-sans text-center leading-tight">
                        ✕
                      </span>
                      <span className="text-[#C0504A] text-[9px] font-sans text-center leading-tight">
                        Retake
                      </span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[#8BA3C0] text-[10px] font-sans">{i + 1}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {mode === "phone" && (
            <QRMode
              roomId={roomId}
              onSwitchToUpload={() => setMode("upload")}
            />
          )}
          {mode === "upload" && (
            <UploadMode onComplete={handleUploadComplete} />
          )}

          {uploadedCount >= 4 && (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                onClick={handleContinue}
                className="w-full max-w-xs py-3.5 rounded-lg bg-[var(--gold)] text-[var(--navy-deep)] font-sans text-sm font-semibold uppercase tracking-widest transition-all duration-200 hover:bg-[var(--gold-light)] hover:shadow-[0_0_30px_var(--gold-glow)] animate-[slideUp_300ms_ease-out]"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
