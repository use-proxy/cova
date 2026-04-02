"use client"

import { useState, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"
import { ModeSwitcher, type CaptureMode } from "@/components/capture/ModeSwitcher"
import { QRMode } from "@/components/capture/QRMode"
import { WebcamMode } from "@/components/capture/WebcamMode"
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

  const [mode, setMode] = useState<CaptureMode>("phone")
  const [showCompletion, setShowCompletion] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Auto-select webcam on mobile (they're already on the phone)
  useEffect(() => {
    if (isMobile) setMode("webcam")
  }, [isMobile])

  const uploadPhotos = useCallback(
    async (photos: (string | File)[]) => {
      setUploading(true)
      const supabase = createBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const uploadPromises = photos.map(async (photo, i) => {
        const path = `${user.id}/${roomId}/shot_${i}.jpg`
        let blob: Blob

        if (typeof photo === "string") {
          // data URL from webcam
          const res = await fetch(photo)
          blob = await res.blob()
        } else {
          blob = photo
        }

        const { error } = await supabase.storage
          .from("room-videos")
          .upload(path, blob, { upsert: true, contentType: "image/jpeg" })

        if (error) console.error(`Upload failed for shot ${i}:`, error)
        return path
      })

      await Promise.all(uploadPromises)

      // Start pipeline
      await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId: user.id, captureMethod: "8-photo" }),
      })

      setShowCompletion(true)

      // Redirect to quiz after completion animation
      setTimeout(() => {
        router.push(`/quiz?session=${roomId}`)
      }, 2500)
    },
    [roomId, router]
  )

  const handleWebcamComplete = useCallback(
    (shots: string[]) => {
      uploadPhotos(shots)
    },
    [uploadPhotos]
  )

  const handleUploadComplete = useCallback(
    (files: File[]) => {
      uploadPhotos(files)
    },
    [uploadPhotos]
  )

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

          {mode === "phone" && (
            <QRMode
              roomId={roomId}
              onSwitchToUpload={() => setMode("upload")}
            />
          )}
          {mode === "webcam" && (
            <WebcamMode onComplete={handleWebcamComplete} />
          )}
          {mode === "upload" && (
            <UploadMode onComplete={handleUploadComplete} />
          )}
        </div>
      </div>
    </div>
  )
}
