"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQualityChecker } from "./QualityChecker"
import { ShotStrip } from "./ShotStrip"
import { CompassRing } from "./CompassRing"

const TOTAL_SHOTS = 8

const POSITION_HINTS = [
  "Face the first wall or corner",
  "Turn 45\u00B0 to your right",
  "Turn 45\u00B0 to your right",
  "Turn 45\u00B0 to your right",
  "Turn 45\u00B0 to your right",
  "Turn 45\u00B0 to your right",
  "Turn 45\u00B0 to your right",
  "Turn 45\u00B0 to your right \u2014 last shot",
]

function normalizeHeading(h: number): number {
  return ((h % 360) + 360) % 360
}

interface WebcamModeProps {
  onComplete: (shots: string[]) => void
}

export function WebcamMode({ onComplete }: WebcamModeProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [shots, setShots] = useState<(string | null)[]>(Array(TOTAL_SHOTS).fill(null))
  const [shotIndex, setShotIndex] = useState(0)
  const [flash, setFlash] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)

  // Orientation state
  const [currentHeading, setCurrentHeading] = useState<number | null>(null)
  const [startHeading, setStartHeading] = useState<number | null>(null)
  const [hasGyroscope, setHasGyroscope] = useState(false)
  const [orientationPermission, setOrientationPermission] = useState<"unknown" | "granted" | "denied">("unknown")
  const [needsPermissionButton, setNeedsPermissionButton] = useState(false)

  const quality = useQualityChecker(videoRef, cameraReady)

  const completedCount = shots.filter(Boolean).length
  const allComplete = completedCount === TOTAL_SHOTS

  // Compute target heading for current shot
  const targetHeading = startHeading !== null ? normalizeHeading(startHeading + shotIndex * 45) : null

  // Check lock-on: within ±15° of target
  const lockedOn = (() => {
    if (currentHeading === null || targetHeading === null) return false
    const delta = ((currentHeading - targetHeading + 540) % 360) - 180
    return Math.abs(delta) <= 15
  })()

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

  // Device orientation setup
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heading = (e as any).webkitCompassHeading ?? (e.alpha !== null ? 360 - e.alpha : null)
      if (heading === null) return
      setHasGyroscope(true)
      setCurrentHeading(normalizeHeading(heading))
    }

    const startListening = () => {
      window.addEventListener("deviceorientation", handleOrientation, true)
      setOrientationPermission("granted")
    }

    // Check if iOS permission API exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      // iOS 13+ — needs user gesture, show button
      setNeedsPermissionButton(true)
    } else {
      // Android / desktop — no permission needed, just listen
      startListening()
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true)
    }
  }, [])

  // Haptic feedback on lock-on
  useEffect(() => {
    if (lockedOn && navigator.vibrate) {
      navigator.vibrate(40)
    }
  }, [lockedOn])

  // Handle completion
  useEffect(() => {
    if (allComplete) {
      const timer = setTimeout(() => {
        onComplete(shots.filter(Boolean) as string[])
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [allComplete, shots, onComplete])

  const requestOrientationPermission = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (DeviceOrientationEvent as any).requestPermission()
      if (permission === "granted") {
        setOrientationPermission("granted")
        setNeedsPermissionButton(false)
        // Re-add listener after permission grant
        const handleOrientation = (e: DeviceOrientationEvent) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const heading = (e as any).webkitCompassHeading ?? (e.alpha !== null ? 360 - e.alpha : null)
          if (heading === null) return
          setHasGyroscope(true)
          setCurrentHeading(normalizeHeading(heading))
        }
        window.addEventListener("deviceorientation", handleOrientation, true)
      } else {
        setOrientationPermission("denied")
        setNeedsPermissionButton(false)
      }
    } catch {
      setOrientationPermission("denied")
      setNeedsPermissionButton(false)
    }
  }, [])

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

    // On first capture, lock the start heading
    if (shotIndex === 0 && startHeading === null && currentHeading !== null) {
      setStartHeading(currentHeading)
    } else if (shotIndex === 0 && startHeading === null) {
      // Desktop with no gyroscope — lock heading 0
      setStartHeading(0)
    }

    setShots((prev) => {
      const next = [...prev]
      next[shotIndex] = dataUrl
      return next
    })

    if (shotIndex < TOTAL_SHOTS - 1) {
      setShotIndex(shotIndex + 1)
    }
  }, [shotIndex, quality.passing, allComplete, startHeading, currentHeading])

  const removeShot = useCallback((index: number) => {
    setShots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setShotIndex(index)
  }, [])

  // Build guidance text
  const guidanceText = (() => {
    if (allComplete) return null

    if (!hasGyroscope) {
      // Desktop — position counter + hint
      return `Position ${shotIndex + 1} of ${TOTAL_SHOTS} \u2014 ${POSITION_HINTS[shotIndex]}`
    }

    // Mobile with gyroscope
    if (lockedOn) {
      return "\u2713 Hold steady \u2014 tap to capture"
    }

    // Directional guidance: which way to turn
    if (currentHeading !== null && targetHeading !== null) {
      const delta = ((targetHeading - currentHeading + 540) % 360) - 180
      if (delta > 15) return "Rotate right \u2192"
      if (delta < -15) return "\u2190 Rotate left"
    }

    return POSITION_HINTS[shotIndex]
  })()

  // Whether guidance text indicates lock-on (for gold color)
  const isGuidanceLocked = lockedOn && hasGyroscope

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto animate-[slideUp_300ms_ease-out]">
      {/* iOS orientation permission button */}
      {needsPermissionButton && orientationPermission === "unknown" && (
        <button
          onClick={requestOrientationPermission}
          className="px-4 py-2 rounded-lg text-xs font-sans uppercase tracking-wider transition-colors"
          style={{
            border: "1px solid var(--gold-dim)",
            background: "var(--navy-card)",
            color: "var(--gold)",
          }}
        >
          Enable compass guidance
        </button>
      )}

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
      <ShotStrip shots={shots} currentIndex={shotIndex} onRemove={removeShot} />

      {/* Compass + controls */}
      <div className="flex flex-col items-center gap-4">
        <CompassRing
          activeIndex={shotIndex}
          currentHeading={currentHeading}
          startHeading={startHeading}
          size={160}
          allComplete={allComplete}
          lockedOn={lockedOn}
        />

        {/* Direction label */}
        {guidanceText && (
          <p
            className={`text-xs font-sans uppercase tracking-[0.2em] text-center ${
              isGuidanceLocked ? "text-[var(--gold)]" : "text-[var(--ivory)]/60"
            }`}
          >
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
              boxShadow: lockedOn
                ? "0 0 20px #C9A84C"
                : quality.passing
                  ? "0 0 20px var(--gold-glow)"
                  : "none",
            }}
          >
            <div className="w-[54px] h-[54px] rounded-full bg-[var(--gold)]/20" />
          </button>
        )}
      </div>
    </div>
  )
}
