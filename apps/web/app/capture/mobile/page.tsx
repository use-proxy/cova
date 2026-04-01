"use client"

import { useEffect, useState, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { Check } from "lucide-react"
import { ShotStrip } from "@/components/capture/ShotStrip"
import { CompassRing } from "@/components/capture/CompassRing"
import { useQualityChecker } from "@/components/capture/QualityChecker"

const TOTAL_SHOTS = 8
const RING_CX = 70
const RING_CY = 70

function normalizeHeading(h: number): number {
  return ((h % 360) + 360) % 360
}

function angleDelta(current: number, target: number): number {
  return ((current - target + 540) % 360) - 180
}

// ─── Permission Gate Screen ───────────────────────────────
function GyroPermissionGate({ onGranted, onDenied }: { onGranted: () => void; onDenied: () => void }) {
  // Must be synchronous — iOS cancels the permission dialog if called from async
  const handleRequest = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (DeviceOrientationEvent as any).requestPermission()
        .then((result: string) => {
          if (result === "granted") onGranted()
          else onDenied()
        })
        .catch(() => {
          onDenied()
        })
    } else {
      onGranted()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--navy-deep)] px-8">
      {/* Compass icon */}
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-8">
        <circle cx="32" cy="32" r="28" stroke="var(--gold)" strokeWidth="2" fill="none" />
        <line x1="32" y1="32" x2="32" y2="12" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="32" cy="32" r="4" fill="var(--gold)" />
      </svg>
      <h2 className="font-serif text-2xl text-[var(--ivory)] text-center mb-3">
        Enable compass guidance
      </h2>
      <p className="font-sans text-sm text-[var(--ivory)]/50 text-center mb-8 max-w-xs">
        Cova uses your compass to guide you through each angle of your room
      </p>
      <button
        onClick={handleRequest}
        className="px-8 py-3.5 rounded-lg bg-[var(--gold)] text-[var(--navy-deep)] font-sans text-sm font-semibold uppercase tracking-widest"
      >
        Enable Compass
      </button>
      <button
        onClick={onDenied}
        className="mt-4 text-xs font-sans text-[var(--ivory)]/40 uppercase tracking-wider"
      >
        Skip — use manual capture
      </button>
    </div>
  )
}

// ─── Main Mobile Capture ──────────────────────────────────
function MobileCaptureInner() {
  const searchParams = useSearchParams()
  const accessToken = searchParams.get("access_token")

  // ── Refs for rAF-based DOM updates (no re-render) ──
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const headingRef = useRef<number>(0)
  const needleRef = useRef<SVGGElement>(null)
  const arcRef = useRef<SVGCircleElement>(null)
  const guidanceRef = useRef<HTMLParagraphElement>(null)
  const captureButtonRef = useRef<HTMLButtonElement>(null)
  const lockedInRef = useRef<boolean>(false)
  const startHeadingRef = useRef<number | null>(null)
  const shotIndexRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  // ── React state (only for things that change the component tree) ──
  const [cameraReady, setCameraReady] = useState(false)
  const [gyroPermission, setGyroPermission] = useState<"pending" | "granted" | "denied" | "unavailable">("pending")
  const [shots, setShots] = useState<(string | null)[]>(Array(TOTAL_SHOTS).fill(null))
  const [shotIndex, setShotIndex] = useState(0)
  const [flash, setFlash] = useState(false)
  const [done, setDone] = useState(false)

  const quality = useQualityChecker(videoRef, cameraReady)
  const allComplete = shots.filter(Boolean).length === TOTAL_SHOTS
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)

  // ── Step 0: Auth — set session in background (does not block UI) ──
  useEffect(() => {
    if (!accessToken) return
    const supabase = createBrowserClient()
    supabase.auth.setSession({ access_token: accessToken, refresh_token: "" })
      .catch((e) => console.error("Session error:", e))
  }, [accessToken])

  // ── Step 0b: Detect gyro capability ──
  useEffect(() => {
    if (typeof DeviceOrientationEvent === "undefined") {
      setGyroPermission("unavailable")
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      // iOS — need user gesture, show permission gate
      setGyroPermission("pending")
    } else {
      // Android / desktop — auto-granted
      setGyroPermission("granted")
    }
  }, [])

  // ── Safety timeout: auto-deny if stuck on pending for 3s ──
  useEffect(() => {
    const timeout = setTimeout(() => {
      setGyroPermission((prev) => (prev === "pending" ? "denied" : prev))
    }, 3000)
    return () => clearTimeout(timeout)
  }, [])

  // ── Step 1: Start camera as soon as permission gate clears ──
  useEffect(() => {
    // Don't start camera while permission gate is showing
    if (gyroPermission === "pending") return

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
  }, [gyroPermission])

  // ── Step 2: Heading listener ──
  useEffect(() => {
    if (gyroPermission !== "granted") return
    const handler = (e: DeviceOrientationEvent) => {
      if (isIOS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = (e as any).webkitCompassHeading
        if (h != null) headingRef.current = normalizeHeading(h)
      } else {
        if (e.alpha != null) headingRef.current = normalizeHeading((360 - e.alpha) % 360)
      }
    }
    window.addEventListener("deviceorientation", handler, true)
    return () => window.removeEventListener("deviceorientation", handler, true)
  }, [gyroPermission, isIOS])

  // ── Step 3: rAF loop — DOM updates via refs only ──
  useEffect(() => {
    if (gyroPermission !== "granted") return

    const tick = () => {
      const heading = headingRef.current
      const shotIdx = shotIndexRef.current
      const startH = startHeadingRef.current

      // Rotate needle via ref
      if (needleRef.current) {
        needleRef.current.setAttribute("transform", `rotate(${heading}, ${RING_CX}, ${RING_CY})`)
      }

      // Shot 0: free capture
      if (shotIdx === 0 || startH === null) {
        if (guidanceRef.current) {
          guidanceRef.current.textContent = "Point at any wall and tap to begin"
          guidanceRef.current.style.color = "rgba(255,255,255,0.6)"
        }
        if (captureButtonRef.current) {
          captureButtonRef.current.disabled = false
          captureButtonRef.current.style.opacity = "1"
          captureButtonRef.current.style.boxShadow = "0 0 20px rgba(201,168,76,0.3)"
          captureButtonRef.current.style.borderColor = "#C9A84C"
        }
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // Shots 1-7: angle check
      const target = (startH + shotIdx * 45) % 360
      const delta = angleDelta(heading, target)
      const absDelta = Math.abs(delta)

      // Progress arc
      if (arcRef.current) {
        const CIRCUMFERENCE = 2 * Math.PI * 52 // ring radius in CompassRing
        const progress = Math.min(absDelta, 45) / 45
        const dashOffset = CIRCUMFERENCE - CIRCUMFERENCE * progress * 0.125
        arcRef.current.style.strokeDashoffset = String(dashOffset)
      }

      if (absDelta <= 15) {
        // LOCKED ON
        if (!lockedInRef.current) {
          lockedInRef.current = true
          navigator.vibrate?.(40)
        }
        if (guidanceRef.current) {
          guidanceRef.current.textContent = "\u2713 Hold steady \u2014 tap to capture"
          guidanceRef.current.style.color = "#C9A84C"
        }
        if (captureButtonRef.current) {
          captureButtonRef.current.disabled = false
          captureButtonRef.current.style.opacity = "1"
          captureButtonRef.current.style.boxShadow = "0 0 28px rgba(201,168,76,0.7)"
          captureButtonRef.current.style.borderColor = "#C9A84C"
        }
      } else {
        // NOT LOCKED ON
        lockedInRef.current = false
        if (guidanceRef.current) {
          guidanceRef.current.textContent = delta > 0 ? "\u2192 Rotate right" : "\u2190 Rotate left"
          guidanceRef.current.style.color = "rgba(255,255,255,0.6)"
        }
        if (captureButtonRef.current) {
          captureButtonRef.current.disabled = true
          captureButtonRef.current.style.opacity = "0.35"
          captureButtonRef.current.style.boxShadow = "none"
          captureButtonRef.current.style.borderColor = "rgba(201,168,76,0.25)"
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [gyroPermission])

  // ── Upload on completion ──
  useEffect(() => {
    if (!allComplete) return
    const upload = async () => {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setDone(true); return }

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

  // ── Step 4: Capture handler ──
  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || !quality.passing || allComplete) return

    // Gyro lock check (except shot 0 and desktop)
    if (gyroPermission === "granted" && shotIndexRef.current > 0 && !lockedInRef.current) return

    // Flash
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

    // Shot 0: lock start heading
    if (shotIndexRef.current === 0) {
      startHeadingRef.current = headingRef.current
    }

    const newIndex = shotIndexRef.current + 1
    shotIndexRef.current = newIndex
    lockedInRef.current = false

    setShots((prev) => {
      const next = [...prev]
      next[newIndex - 1] = dataUrl
      return next
    })
    setShotIndex(newIndex)
  }, [quality.passing, allComplete, gyroPermission])

  // ── Render: iOS Permission Gate (shown before camera) ──
  if (gyroPermission === "pending") {
    return (
      <GyroPermissionGate
        onGranted={() => setGyroPermission("granted")}
        onDenied={() => setGyroPermission("denied")}
      />
    )
  }

  // ── Render: Done ──
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

  const gyroActive = gyroPermission === "granted"
  const desktopMode = gyroPermission === "unavailable" || gyroPermission === "denied"

  // ── Render: Camera UI ──
  return (
    <div className="fixed inset-0 bg-[var(--navy-deep)] flex flex-col">
      {/* Full viewport camera */}
      <div className="relative flex-1">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

        {/* Quality rejection border */}
        {!quality.passing && cameraReady && (
          <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 30px rgba(220, 38, 38, 0.4)" }} />
        )}

        {/* Flash */}
        {flash && <div className="absolute inset-0 bg-white animate-[flash_150ms_ease-out]" />}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/50 to-transparent">
          <span className="font-serif text-sm text-[var(--ivory)]">Capture Your Room</span>
          <span className="text-sm font-sans text-[var(--gold)] font-semibold">{Math.min(shotIndex + 1, TOTAL_SHOTS)}/{TOTAL_SHOTS}</span>
        </div>

        {/* Shot strip */}
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

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-8 pt-16 px-4 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent">
        {/* Quality message */}
        {!quality.passing && quality.message && (
          <p className="text-sm font-sans text-red-400 uppercase tracking-wider text-center">
            {quality.message}
          </p>
        )}

        {/* Guidance text — updated via ref on gyro, or static on desktop */}
        <p
          ref={guidanceRef}
          className="text-xs font-sans uppercase tracking-[0.2em] text-center text-[var(--ivory)]/60"
        >
          {desktopMode
            ? `Position ${shotIndex + 1} of ${TOTAL_SHOTS} \u2014 capture each wall and corner`
            : "Point at any wall and tap to begin"}
        </p>

        {/* Compass ring */}
        {!allComplete && (
          <CompassRing
            activeIndex={shotIndex}
            currentHeading={gyroActive ? headingRef.current : null}
            startHeading={startHeadingRef.current}
            size={140}
            allComplete={allComplete}
            lockedOn={lockedInRef.current}
            needleRef={gyroActive ? needleRef : undefined}
            arcRef={gyroActive ? arcRef : undefined}
          />
        )}

        {/* Capture button — style updated via ref in rAF loop when gyro active */}
        {!allComplete && (
          <button
            ref={captureButtonRef}
            onClick={handleCapture}
            disabled={!quality.passing || !cameraReady}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-[opacity] duration-200 disabled:cursor-not-allowed"
            style={{
              border: "3px solid var(--gold)",
              background: "var(--navy-deep)",
              boxShadow: "0 0 20px var(--gold-glow)",
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
