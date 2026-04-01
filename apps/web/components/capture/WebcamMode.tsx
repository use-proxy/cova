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

function angleDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}

interface WebcamModeProps {
  onComplete: (shots: string[]) => void
}

export function WebcamMode({ onComplete }: WebcamModeProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const headingRef = useRef<number>(0)
  const needleRef = useRef<SVGGElement>(null)
  const rafRef = useRef<number>(0)

  const [shots, setShots] = useState<(string | null)[]>(Array(TOTAL_SHOTS).fill(null))
  const [shotIndex, setShotIndex] = useState(0)
  const [flash, setFlash] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)

  // Gyro state
  const [gyroAvailable, setGyroAvailable] = useState(false)
  const [gyroRequested, setGyroRequested] = useState(false)
  const [startHeading, setStartHeading] = useState<number | null>(null)
  const [lockedIn, setLockedIn] = useState(false)
  const [guidance, setGuidance] = useState<"rotate-left" | "rotate-right" | "aligned" | "first">("first")
  const [displayHeading, setDisplayHeading] = useState<number>(0)

  const quality = useQualityChecker(videoRef, cameraReady)
  const completedCount = shots.filter(Boolean).length
  const allComplete = completedCount === TOTAL_SHOTS

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
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  // Gyro permission (must be user gesture)
  const requestGyroPermission = useCallback(async () => {
    setGyroRequested(true)
    if (typeof DeviceOrientationEvent === "undefined") {
      setGyroAvailable(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission()
        setGyroAvailable(result === "granted")
      } catch {
        setGyroAvailable(false)
      }
    } else {
      // Android / desktop — auto-granted
      setGyroAvailable(true)
    }
  }, [])

  // Auto-request on desktop (no permission prompt needed, detect if events fire)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission !== "function") {
      // Not iOS — try listening immediately
      setGyroRequested(true)
      const testHandler = (e: DeviceOrientationEvent) => {
        if (e.alpha !== null) setGyroAvailable(true)
        window.removeEventListener("deviceorientation", testHandler)
      }
      window.addEventListener("deviceorientation", testHandler)
      // If no event fires within 1s, mark as unavailable
      const timeout = setTimeout(() => {
        window.removeEventListener("deviceorientation", testHandler)
        // gyroAvailable stays false (desktop)
      }, 1000)
      return () => {
        clearTimeout(timeout)
        window.removeEventListener("deviceorientation", testHandler)
      }
    }
  }, [])

  // Listen for device orientation
  useEffect(() => {
    if (!gyroAvailable) return
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const handler = (e: DeviceOrientationEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = isIOS ? (e as any).webkitCompassHeading : (360 - (e.alpha ?? 0)) % 360
      if (raw == null) return
      headingRef.current = normalizeHeading(raw)
    }
    window.addEventListener("deviceorientation", handler, true)
    return () => window.removeEventListener("deviceorientation", handler, true)
  }, [gyroAvailable])

  // RAF loop for compass updates
  useEffect(() => {
    if (!gyroAvailable) return
    const tick = () => {
      const heading = headingRef.current
      setDisplayHeading(heading)

      // Needle rotation via ref
      if (needleRef.current) {
        needleRef.current.setAttribute("transform", `rotate(${heading}, 80, 80)`)
      }

      // Guidance logic
      if (shotIndex === 0 && startHeading === null) {
        setGuidance("first")
        setLockedIn(false)
      } else if (startHeading !== null) {
        const target = normalizeHeading(startHeading + shotIndex * 45)
        const delta = angleDelta(heading, target)
        if (Math.abs(delta) <= 15) {
          if (!lockedIn) {
            setLockedIn(true)
            navigator.vibrate?.(40)
          }
          setGuidance("aligned")
        } else {
          setLockedIn(false)
          setGuidance(delta > 0 ? "rotate-right" : "rotate-left")
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [gyroAvailable, shotIndex, startHeading, lockedIn])

  // Completion
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
    if (!video || !quality.passing || allComplete) return

    // On mobile with gyro: must be locked on (except shot 0)
    if (gyroAvailable && shotIndex > 0 && !lockedIn) return

    setFlash(true)
    setTimeout(() => setFlash(false), 150)

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

    // Lock start heading on first shot
    if (shotIndex === 0 && startHeading === null) {
      setStartHeading(gyroAvailable ? headingRef.current : 0)
    }

    setShots((prev) => {
      const next = [...prev]
      next[shotIndex] = dataUrl
      return next
    })

    setLockedIn(false)
    if (shotIndex < TOTAL_SHOTS - 1) {
      setShotIndex(shotIndex + 1)
    }
  }, [shotIndex, quality.passing, allComplete, gyroAvailable, lockedIn, startHeading])

  const removeShot = useCallback((index: number) => {
    setShots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setShotIndex(index)
  }, [])

  // Capture button enabled
  const captureEnabled = (() => {
    if (!quality.passing || !cameraReady || allComplete) return false
    if (!gyroAvailable) return true // desktop always ok
    if (shotIndex === 0) return true // first shot always ok
    return lockedIn
  })()

  // Guidance text
  const guidanceText = (() => {
    if (allComplete) return null
    if (!gyroAvailable) {
      return `Position ${shotIndex + 1} of ${TOTAL_SHOTS} \u2014 ${POSITION_HINTS[shotIndex]}`
    }
    if (guidance === "first") return "Point at any wall and capture to begin"
    if (guidance === "aligned") return "\u2713 Hold steady \u2014 tap to capture"
    if (guidance === "rotate-right") return "Rotate right \u2192"
    if (guidance === "rotate-left") return "\u2190 Rotate left"
    return null
  })()

  const isGuidanceLocked = guidance === "aligned" && gyroAvailable

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto animate-[slideUp_300ms_ease-out]">
      {/* iOS gyro permission button */}
      {!gyroRequested && cameraReady && (
        <button
          onClick={requestGyroPermission}
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
        {!quality.passing && cameraReady && (
          <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "inset 0 0 30px rgba(220, 38, 38, 0.4)" }} />
        )}
        {flash && <div className="absolute inset-0 bg-white animate-[flash_150ms_ease-out]" />}
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
          currentHeading={gyroAvailable ? displayHeading : null}
          startHeading={startHeading}
          size={160}
          allComplete={allComplete}
          lockedOn={lockedIn}
          needleRef={needleRef}
        />

        {/* Direction label */}
        {guidanceText && (
          <p className={`text-xs font-sans uppercase tracking-[0.2em] text-center ${
            isGuidanceLocked ? "text-[var(--gold)]" : "text-[var(--ivory)]/60"
          }`}>
            {guidanceText}
          </p>
        )}

        {/* Capture button */}
        {!allComplete && (
          <button
            onClick={captureShot}
            disabled={!captureEnabled}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
            style={{
              border: "3px solid var(--gold)",
              background: "var(--navy-deep)",
              boxShadow: lockedIn ? "0 0 24px rgba(201,168,76,0.6)"
                : captureEnabled ? "0 0 20px var(--gold-glow)" : "none",
            }}
          >
            <div className="w-[54px] h-[54px] rounded-full bg-[var(--gold)]/20" />
          </button>
        )}
      </div>
    </div>
  )
}
