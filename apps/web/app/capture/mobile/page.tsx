"use client"

import { useEffect, useState, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { Check } from "lucide-react"
import { ShotStrip } from "@/components/capture/ShotStrip"
import { CompassRing } from "@/components/capture/CompassRing"
import { useQualityChecker } from "@/components/capture/QualityChecker"

const TOTAL_SHOTS = 8

function normalizeHeading(h: number): number {
  return ((h % 360) + 360) % 360
}

function angleDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}

function MobileCaptureInner() {
  const searchParams = useSearchParams()
  const accessToken = searchParams.get("access_token")
  // captureToken available via searchParams.get("token") for future validation


  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const headingRef = useRef<number>(0)
  const needleRef = useRef<SVGGElement>(null)
  const rafRef = useRef<number>(0)

  const [authenticated, setAuthenticated] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [gyroAvailable, setGyroAvailable] = useState(false)
  const [gyroRequested, setGyroRequested] = useState(false)
  const [shots, setShots] = useState<(string | null)[]>(Array(TOTAL_SHOTS).fill(null))
  const [shotIndex, setShotIndex] = useState(0)
  const [startHeading, setStartHeading] = useState<number | null>(null)
  const [lockedIn, setLockedIn] = useState(false)
  const [guidance, setGuidance] = useState<"rotate-left" | "rotate-right" | "aligned" | "first">("first")
  const [flash, setFlash] = useState(false)
  const [done, setDone] = useState(false)
  const [displayHeading, setDisplayHeading] = useState<number>(0)

  const quality = useQualityChecker(videoRef, cameraReady)
  const completedCount = shots.filter(Boolean).length
  const allComplete = completedCount === TOTAL_SHOTS

  // Authenticate with access token from QR
  useEffect(() => {
    if (!accessToken) {
      setAuthenticated(true) // no token = proceed unauthenticated (token-based capture)
      return
    }
    const supabase = createBrowserClient()
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: "",
    }).then(() => setAuthenticated(true))
  }, [accessToken])

  // Start camera
  useEffect(() => {
    if (!authenticated) return
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
  }, [authenticated])

  // Gyro permission request (must be on user gesture)
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
      setGyroAvailable(true)
    }
  }, [])

  // Listen for device orientation once gyro is available
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

  // RAF loop: update compass UI from headingRef without React re-renders
  useEffect(() => {
    if (!gyroAvailable) return

    const tick = () => {
      const heading = headingRef.current
      setDisplayHeading(heading)

      // Rotate needle via ref (no re-render)
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

  // Upload + completion
  useEffect(() => {
    if (!allComplete) return
    const upload = async () => {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setDone(true); return }

      // Extract roomId from captureToken URL or use a placeholder
      const uploadPromises = shots.map(async (shot, i) => {
        if (!shot) return
        const path = `${user.id}/mobile-capture/shot_${i}.jpg`
        const res = await fetch(shot)
        const blob = await res.blob()
        await supabase.storage.from("room-videos").upload(path, blob, { upsert: true, contentType: "image/jpeg" })
      })
      await Promise.all(uploadPromises)
      setDone(true)
    }
    const timer = setTimeout(upload, 500)
    return () => clearTimeout(timer)
  }, [allComplete, shots])

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
      setStartHeading(headingRef.current)
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

  // Capture button enabled logic
  const captureEnabled = (() => {
    if (!quality.passing || !cameraReady || allComplete) return false
    if (!gyroAvailable) return true // desktop fallback
    if (shotIndex === 0) return true // first shot always ok
    return lockedIn
  })()

  // Guidance text
  const guidanceText = (() => {
    if (allComplete) return null
    if (!gyroAvailable) return `Position ${shotIndex + 1} of ${TOTAL_SHOTS}`
    if (guidance === "first") return "Point at any wall and capture to begin"
    if (guidance === "aligned") return "\u2713 Hold steady \u2014 tap to capture"
    if (guidance === "rotate-right") return "Rotate right \u2192"
    if (guidance === "rotate-left") return "\u2190 Rotate left"
    return null
  })()

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--navy-deep)] animate-[fadeIn_500ms_ease-out]">
        <div className="w-20 h-20 rounded-full bg-[var(--gold)] flex items-center justify-center mb-8 animate-[scaleIn_400ms_ease-out]">
          <Check className="w-10 h-10 text-[var(--navy-deep)]" strokeWidth={3} />
        </div>
        <h2 className="font-serif text-3xl text-[var(--ivory)] mb-3">All done!</h2>
        <p className="font-sans text-sm text-[var(--gold)]/60 uppercase tracking-[0.2em]">
          You can put your phone down.
        </p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--navy-deep)]">
        <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[var(--navy-deep)] flex flex-col">
      {/* Full viewport camera */}
      <div className="relative flex-1">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Quality rejection border */}
        {!quality.passing && cameraReady && (
          <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 30px rgba(220, 38, 38, 0.4)" }} />
        )}

        {/* Flash */}
        {flash && <div className="absolute inset-0 bg-white animate-[flash_150ms_ease-out]" />}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/50 to-transparent">
          <span className="font-serif text-sm text-[var(--ivory)]">Capture Your Room</span>
          <span className="text-sm font-sans text-[var(--gold)] font-semibold">{shotIndex + 1}/{TOTAL_SHOTS}</span>
        </div>

        {/* Shot strip below top bar */}
        <div className="absolute top-12 left-0 right-0 px-4">
          <ShotStrip shots={shots} currentIndex={shotIndex} />
        </div>

        {/* Camera loading */}
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--navy-deep)]">
            <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 pb-8 pt-16 px-4 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent">
        {/* Gyro permission button (iOS, one-time) */}
        {!gyroRequested && cameraReady && (
          <button
            onClick={requestGyroPermission}
            className="px-4 py-2 rounded-lg text-xs font-sans uppercase tracking-wider mb-2 transition-colors"
            style={{
              border: "1px solid var(--gold-dim)",
              background: "var(--navy-card)",
              color: "var(--gold)",
            }}
          >
            Enable compass guidance
          </button>
        )}

        {/* Quality message */}
        {!quality.passing && quality.message && (
          <p className="text-sm font-sans text-red-400 uppercase tracking-wider text-center">
            {quality.message}
          </p>
        )}

        {/* Guidance text */}
        {guidanceText && (
          <p className={`text-xs font-sans uppercase tracking-[0.2em] text-center ${
            guidance === "aligned" && gyroAvailable ? "text-[var(--gold)]" : "text-[var(--ivory)]/60"
          }`}>
            {guidanceText}
          </p>
        )}

        {/* Compass ring */}
        {gyroRequested && (
          <CompassRing
            activeIndex={shotIndex}
            currentHeading={gyroAvailable ? displayHeading : null}
            startHeading={startHeading}
            size={140}
            allComplete={allComplete}
            lockedOn={lockedIn}
            needleRef={needleRef}
          />
        )}

        {/* Capture button */}
        {!allComplete && (
          <button
            onClick={captureShot}
            disabled={!captureEnabled}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
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

export default function MobileCapturePage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--navy-deep)]">
        <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MobileCaptureInner />
    </Suspense>
  )
}
