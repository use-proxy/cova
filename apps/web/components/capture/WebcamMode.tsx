"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQualityChecker } from "./QualityChecker"
import { ShotStrip } from "./ShotStrip"
import { CompassRing } from "./CompassRing"

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const
const TOTAL_SHOTS = 8

interface WebcamModeProps {
  onComplete: (shots: string[]) => void
}

export function WebcamMode({ onComplete }: WebcamModeProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [shots, setShots] = useState<(string | null)[]>(Array(TOTAL_SHOTS).fill(null))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flash, setFlash] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [hasGyroscope, setHasGyroscope] = useState(false)
  const [heading, setHeading] = useState<number | null>(null)
  const quality = useQualityChecker(videoRef, cameraReady)

  const completedCount = shots.filter(Boolean).length
  const allComplete = completedCount === TOTAL_SHOTS

  // Target angle for current index (0=N=0°, 1=NE=45°, etc.)
  const targetAngle = currentIndex * 45
  // Check if heading is roughly aligned (within 30° of target)
  const isAligned = heading !== null
    ? Math.abs(((heading - targetAngle + 540) % 360) - 180) < 30
      || Math.abs(heading - targetAngle) < 30
      || Math.abs(heading - targetAngle + 360) < 30
    : false

  // Start webcam
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setCameraReady(true)
        }
      } catch (err) {
        console.error("Camera access denied:", err)
      }
    }
    startCamera()

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Request device orientation (mobile guidance only — never blocks capture)
  useEffect(() => {
    const requestOrientation = async () => {
      try {
        const DOE = DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>
        }
        if (typeof DOE.requestPermission === "function") {
          const permission = await DOE.requestPermission()
          if (permission !== "granted") return
        }

        const handler = (e: DeviceOrientationEvent) => {
          if (e.alpha !== null) {
            setHasGyroscope(true)
            // alpha is 0-360 compass heading (0=N, 90=E, etc.)
            setHeading(Math.round(e.alpha))
          }
        }
        window.addEventListener("deviceorientation", handler)
        return () => window.removeEventListener("deviceorientation", handler)
      } catch {
        // No gyroscope available (desktop) — that's fine
      }
    }
    requestOrientation()
  }, [])

  // Handle completion
  useEffect(() => {
    if (allComplete) {
      const timer = setTimeout(() => {
        onComplete(shots.filter(Boolean) as string[])
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [allComplete, shots, onComplete])

  const captureShot = useCallback(() => {
    const video = videoRef.current
    // Capture enabled whenever quality passes — heading does NOT block
    if (!video || !quality.passing || allComplete) return

    // Flash effect
    setFlash(true)
    setTimeout(() => setFlash(false), 150)

    // Capture frame
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

    setShots((prev) => {
      const next = [...prev]
      next[currentIndex] = dataUrl
      return next
    })

    if (currentIndex < TOTAL_SHOTS - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }, [currentIndex, quality.passing, allComplete])

  const removeShot = useCallback((index: number) => {
    setShots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setCurrentIndex(index)
  }, [])

  // Build guidance text
  const guidanceText = (() => {
    if (allComplete) return null
    if (!hasGyroscope) {
      // Desktop — simple position counter
      return `Position ${currentIndex + 1} of ${TOTAL_SHOTS} \u2014 capture each corner and wall of your room`
    }
    // Mobile with gyroscope
    if (isAligned) {
      return `Facing ${DIRECTIONS[currentIndex]} \u2014 ready to capture`
    }
    return `Turn to face ${DIRECTIONS[currentIndex]}`
  })()

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto animate-[slideUp_300ms_ease-out]">
      {/* Webcam feed */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden" style={{ border: "1px solid var(--gold-dim)" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Quality rejection border */}
        {!quality.passing && cameraReady && (
          <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "inset 0 0 30px rgba(220, 38, 38, 0.4)" }} />
        )}

        {/* Flash overlay */}
        {flash && (
          <div className="absolute inset-0 bg-white animate-[flash_150ms_ease-out]" />
        )}

        {/* Camera not ready */}
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--navy-deep)]">
            <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Quality message */}
      {!quality.passing && quality.message && (
        <p className="text-sm font-sans text-red-400 uppercase tracking-wider text-center">
          {quality.message}
        </p>
      )}

      {/* Shot strip */}
      <ShotStrip shots={shots} currentIndex={currentIndex} onRemove={removeShot} />

      {/* Compass + controls */}
      <div className="flex flex-col items-center gap-4">
        <CompassRing
          completedCount={completedCount}
          currentIndex={currentIndex}
          size={160}
          allComplete={allComplete}
        />

        {/* Direction label */}
        {guidanceText && (
          <p className="text-xs font-sans uppercase tracking-[0.2em] text-[var(--ivory)]/60 text-center">
            {guidanceText}
          </p>
        )}

        {/* Capture button */}
        {!allComplete && (
          <button
            onClick={captureShot}
            disabled={!quality.passing || !cameraReady}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
            style={{
              border: "3px solid var(--gold)",
              background: "var(--navy-deep)",
              boxShadow: quality.passing ? "0 0 20px var(--gold-glow)" : "none",
            }}
          >
            <div className="w-[54px] h-[54px] rounded-full bg-[var(--gold)]/20" />
          </button>
        )}
      </div>
    </div>
  )
}
