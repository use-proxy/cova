"use client"

import { useEffect, useState, useRef, useCallback, type Ref } from "react"
import { createBrowserClient } from "@/lib/supabase/client"
import { Check } from "lucide-react"

const TOTAL_SHOTS = 8
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

type AppState = "initializing" | "camera-permission" | "compass-permission" | "capturing"

function normalizeHeading(h: number): number {
  return ((h % 360) + 360) % 360
}

function angleDelta(current: number, target: number): number {
  return ((current - target + 540) % 360) - 180
}

// ─── Quality check (runs on setInterval, not rAF) ───────────
function useQualityCheck(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) {
  const [passing, setPassing] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!enabled) { setPassing(true); setMessage(null); return }

    const check = () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      if (!canvasRef.current) canvasRef.current = document.createElement("canvas")
      const canvas = canvasRef.current
      canvas.width = 320
      canvas.height = 180
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, 320, 180)
      const data = ctx.getImageData(0, 0, 320, 180)

      // Mean brightness
      let brightnessSum = 0
      const pixels = data.data.length / 4
      for (let i = 0; i < data.data.length; i += 4) {
        brightnessSum += 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2]
      }
      const brightness = brightnessSum / pixels
      if (brightness < 40) { setPassing(false); setMessage("Too dark \u2014 find more light"); return }
      if (brightness > 220) { setPassing(false); setMessage("Too bright \u2014 avoid direct light"); return }

      // Laplacian variance (blur detection)
      const gray = new Float32Array(320 * 180)
      for (let i = 0; i < pixels; i++) {
        const idx = i * 4
        gray[i] = 0.299 * data.data[idx] + 0.587 * data.data[idx + 1] + 0.114 * data.data[idx + 2]
      }
      let sum = 0, sumSq = 0, count = 0
      for (let y = 1; y < 179; y++) {
        for (let x = 1; x < 319; x++) {
          const idx = y * 320 + x
          const lap = gray[idx - 320] + gray[idx + 320] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx]
          sum += lap; sumSq += lap * lap; count++
        }
      }
      const mean = sum / count
      const variance = sumSq / count - mean * mean
      if (variance < 80) { setPassing(false); setMessage("Too much motion \u2014 hold steady"); return }

      setPassing(true)
      setMessage(null)
    }

    const interval = setInterval(check, 500)
    return () => clearInterval(interval)
  }, [videoRef, enabled])

  return { passing, message }
}

// ─── Mini Shot Strip ─────────────────────────────────────────
function ShotStripMobile({ shots, currentIndex }: { shots: (string | null)[]; currentIndex: number }) {
  return (
    <div className="flex gap-1.5 px-4 overflow-x-auto scrollbar-hide">
      {shots.map((shot, i) => (
        <div
          key={i}
          className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden"
          style={{
            border: shot
              ? "1px solid rgba(201,168,76,0.3)"
              : i === currentIndex
                ? "1.5px solid #C9A84C"
                : "1.5px dashed rgba(201,168,76,0.25)",
          }}
        >
          {shot ? (
            <div className="relative w-full h-full">
              <img src={shot} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="w-3 h-3 text-[#C9A84C]" />
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#0a1628]">
              <span className="text-[8px] text-white/20">{i + 1}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Compass Ring (inline, optimized for mobile) ─────────────
function MobileCompassRing({
  activeIndex,
  allComplete,
  lockedOn,
  needleRef,
  arcRef,
  hasGyro,
}: {
  activeIndex: number
  allComplete: boolean
  lockedOn: boolean
  needleRef: Ref<SVGGElement>
  arcRef: Ref<SVGCircleElement>
  hasGyro: boolean
}) {
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 20
  const nodeRadius = 7
  const circumference = 2 * Math.PI * radius
  const pulseDur = lockedOn ? "0.3s" : "1.5s"
  const staticAngle = activeIndex * 45 - 90

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(201,168,76,0.2)" strokeWidth="1" />

      {/* Progress arc */}
      {hasGyro && (
        <circle
          ref={arcRef}
          cx={cx} cy={cy} r={radius}
          fill="none" stroke="#C9A84C" strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={circumference}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      )}

      {DIRECTIONS.map((dir, i) => {
        const angle = (i * 45 - 90) * (Math.PI / 180)
        const x = cx + Math.cos(angle) * radius
        const y = cy + Math.sin(angle) * radius
        const completed = i < activeIndex
        const current = i === activeIndex && !allComplete

        return (
          <g key={dir}>
            {current && (
              <circle cx={x} cy={y} r={nodeRadius + 4} fill="none" stroke="#C9A84C" strokeWidth="1.5" opacity="0.6">
                <animate attributeName="r" from={String(nodeRadius + 2)} to={String(nodeRadius + 8)} dur={pulseDur} repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur={pulseDur} repeatCount="indefinite" />
              </circle>
            )}
            {current && lockedOn && (
              <circle cx={x} cy={y} r={nodeRadius} fill="none" stroke="#C9A84C" strokeWidth="1">
                <animate attributeName="r" from={String(nodeRadius)} to={String(nodeRadius * 2.5)} dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.8" to="0" dur="0.8s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={x} cy={y} r={nodeRadius}
              fill={completed ? "#C9A84C" : "transparent"}
              stroke={completed || current ? "#C9A84C" : "rgba(201,168,76,0.2)"}
              strokeWidth={current ? 2 : 1.5}
            />
            {current && (
              <text x={x} y={y + nodeRadius + 13} textAnchor="middle" fill="#C9A84C" fontSize="7" fontFamily="Inter,sans-serif" fontWeight="600" letterSpacing="0.1em">
                {dir}
              </text>
            )}
          </g>
        )
      })}

      {/* Needle */}
      {!allComplete && (
        hasGyro ? (
          <g ref={needleRef} style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - radius * 0.5} stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={4} fill="#C9A84C" />
          </g>
        ) : (
          <g style={{ transform: `rotate(${staticAngle}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
            <line x1={cx} y1={cy} x2={cx + radius * 0.5} y2={cy} stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <circle cx={cx} cy={cy} r={3} fill="#C9A84C" opacity="0.6" />
          </g>
        )
      )}

      {allComplete && (
        <g>
          <circle cx={cx} cy={cy} r={20} fill="#C9A84C" />
          <polyline points={`${cx - 8},${cy} ${cx - 2},${cy + 6} ${cx + 8},${cy - 6}`} fill="none" stroke="#0a1628" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function MobileCapturePage() {
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

  const [appState, setAppState] = useState<AppState>("initializing")
  const [cameraError, setCameraError] = useState(false)
  const [gyroAvailable, setGyroAvailable] = useState(false)
  const [shots, setShots] = useState<(string | null)[]>(Array(TOTAL_SHOTS).fill(null))
  const [shotIndex, setShotIndex] = useState(0)
  const [flash, setFlash] = useState(false)
  const [done, setDone] = useState(false)
  const [lockedOn, setLockedOn] = useState(false)

  const quality = useQualityCheck(videoRef, appState === "capturing")
  const allComplete = shots.filter(Boolean).length === TOTAL_SHOTS
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)

  // ── STATE 1: Initialize ──
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("access_token")
    if (token) {
      const supabase = createBrowserClient()
      supabase.auth.setSession({ access_token: token, refresh_token: "" }).catch(() => {})
    }
    setAppState("camera-permission")
  }, [])

  // ── STATE 2: Request camera ──
  const requestCamera = useCallback(async () => {
    setCameraError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      // Check if iOS needs compass permission
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const needsCompassPermission = isIOS && typeof (DeviceOrientationEvent as any).requestPermission === "function"
      setAppState(needsCompassPermission ? "compass-permission" : "capturing")
      if (!needsCompassPermission) {
        // Non-iOS: try to detect gyro silently
        const testHandler = (e: DeviceOrientationEvent) => {
          if (e.alpha !== null) setGyroAvailable(true)
          window.removeEventListener("deviceorientation", testHandler)
        }
        window.addEventListener("deviceorientation", testHandler)
        setTimeout(() => window.removeEventListener("deviceorientation", testHandler), 1000)
      }
    } catch {
      setCameraError(true)
    }
  }, [isIOS])

  // ── STATE 3: Compass permission (iOS only, synchronous .then()) ──
  const handleCompassPermission = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(DeviceOrientationEvent as any)
      .requestPermission()
      .then((result: string) => {
        setGyroAvailable(result === "granted")
        setAppState("capturing")
      })
      .catch(() => {
        setGyroAvailable(false)
        setAppState("capturing")
      })
  }, [])

  const skipCompass = useCallback(() => {
    setGyroAvailable(false)
    setAppState("capturing")
  }, [])

  // ── Gyro listener (starts when capturing + gyro available) ──
  useEffect(() => {
    if (appState !== "capturing" || !gyroAvailable) return
    const handler = (e: DeviceOrientationEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = isIOS ? (e as any).webkitCompassHeading : (360 - (e.alpha ?? 0)) % 360
      if (raw == null) return
      headingRef.current = normalizeHeading(raw)
    }
    window.addEventListener("deviceorientation", handler, true)
    return () => window.removeEventListener("deviceorientation", handler, true)
  }, [appState, gyroAvailable, isIOS])

  // ── rAF loop for compass (starts when capturing + gyro available) ──
  useEffect(() => {
    if (appState !== "capturing" || !gyroAvailable) return
    const cx = 80, cy = 80, radius = 60

    const tick = () => {
      const heading = headingRef.current
      const shotIdx = shotIndexRef.current
      const startH = startHeadingRef.current

      if (needleRef.current) {
        needleRef.current.setAttribute("transform", `rotate(${heading}, ${cx}, ${cy})`)
      }

      if (shotIdx === 0 || startH === null) {
        if (guidanceRef.current) {
          guidanceRef.current.textContent = "Point at any wall to begin"
          guidanceRef.current.style.color = "rgba(255,255,255,0.6)"
        }
        if (captureButtonRef.current) {
          captureButtonRef.current.style.opacity = "1"
          captureButtonRef.current.style.boxShadow = "0 0 20px rgba(201,168,76,0.3)"
          captureButtonRef.current.style.borderColor = "#C9A84C"
        }
        lockedInRef.current = false
        setLockedOn(false)
      } else {
        const target = (startH + shotIdx * 45) % 360
        const delta = angleDelta(heading, target)
        const absDelta = Math.abs(delta)

        if (arcRef.current) {
          const circumference = 2 * Math.PI * radius
          const progress = Math.min(absDelta, 45) / 45
          arcRef.current.style.strokeDashoffset = String(circumference - circumference * progress * 0.125)
        }

        if (absDelta <= 15) {
          if (!lockedInRef.current) {
            lockedInRef.current = true
            setLockedOn(true)
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
          if (lockedInRef.current) { lockedInRef.current = false; setLockedOn(false) }
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
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [appState, gyroAvailable])

  // ── Capture handler ──
  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || allComplete) return
    if (!quality.passing) return
    if (gyroAvailable && shotIndexRef.current > 0 && !lockedInRef.current) return

    setFlash(true)
    setTimeout(() => setFlash(false), 100)

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

    if (shotIndexRef.current === 0) {
      startHeadingRef.current = headingRef.current
    }

    const idx = shotIndexRef.current
    shotIndexRef.current = idx + 1
    lockedInRef.current = false
    setLockedOn(false)

    setShots((prev) => {
      const next = [...prev]
      next[idx] = dataUrl
      return next
    })
    setShotIndex(idx + 1)

    // Upload in background
    const supabase = createBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch(dataUrl).then((r) => r.blob()).then((blob) => {
        const path = `${user.id}/mobile-capture/shot_${idx}.jpg`
        supabase.storage.from("room-videos").upload(path, blob, { upsert: true, contentType: "image/jpeg" })
      })
    })
  }, [allComplete, quality.passing, gyroAvailable])

  // ── Completion ──
  useEffect(() => {
    if (allComplete && !done) {
      const timer = setTimeout(() => setDone(true), 800)
      return () => clearTimeout(timer)
    }
  }, [allComplete, done])

  // ── Cleanup ──
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  // Done screen
  if (done) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a1628]">
        <div className="w-20 h-20 rounded-full bg-[#C9A84C] flex items-center justify-center mb-8 animate-[scaleIn_400ms_ease-out]">
          <Check className="w-10 h-10 text-[#0a1628]" strokeWidth={3} />
        </div>
        <h2 className="font-serif text-3xl text-[#F5F0E8] mb-3">All done!</h2>
        <p className="font-sans text-sm text-[#C9A84C]/60 uppercase tracking-[0.2em]">You can put your phone down.</p>
      </div>
    )
  }

  // State 1: Initializing (blank dark screen, ~200ms)
  if (appState === "initializing") {
    return <div className="fixed inset-0 bg-[#0a1628]" />
  }

  // State 2: Camera permission
  if (appState === "camera-permission") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a1628] px-8">
        {/* Camera icon */}
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-8">
          <rect x="8" y="18" width="48" height="34" rx="4" stroke="#C9A84C" strokeWidth="2" fill="none" />
          <circle cx="32" cy="35" r="10" stroke="#C9A84C" strokeWidth="2" fill="none" />
          <circle cx="32" cy="35" r="4" fill="#C9A84C" />
          <rect x="22" y="14" width="12" height="6" rx="2" stroke="#C9A84C" strokeWidth="1.5" fill="none" />
        </svg>
        <h2 className="font-serif text-2xl text-[#F5F0E8] text-center mb-3">
          {cameraError ? "Camera access denied" : "Allow camera access"}
        </h2>
        <p className="font-sans text-sm text-[#F5F0E8]/50 text-center mb-8 max-w-xs">
          {cameraError
            ? "Please go to Settings \u2192 Safari \u2192 Camera and allow access"
            : "Cova needs your camera to capture the room"}
        </p>
        <button
          onClick={requestCamera}
          className="px-8 py-3.5 rounded-lg bg-[#C9A84C] text-[#0a1628] font-sans text-sm font-semibold uppercase tracking-widest"
        >
          {cameraError ? "Try Again" : "Open Camera"}
        </button>
      </div>
    )
  }

  // State 3: Compass permission (iOS only)
  if (appState === "compass-permission") {
    return (
      <div className="fixed inset-0 bg-[#0a1628]">
        {/* Camera running behind */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {/* Bottom sheet overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#0d1f3c] rounded-t-2xl px-6 pt-4 pb-10" style={{ border: "1px solid rgba(201,168,76,0.15)", borderBottom: "none" }}>
          <div className="w-10 h-1 rounded-full bg-[#C9A84C]/30 mx-auto mb-6" />
          <h3 className="font-serif text-xl text-[#F5F0E8] text-center mb-2">Enable compass for guided capture</h3>
          <p className="font-sans text-sm text-[#F5F0E8]/50 text-center mb-6">Cova tracks your rotation to get the perfect 8 angles</p>
          <button
            onClick={handleCompassPermission}
            className="w-full py-3.5 rounded-lg bg-[#C9A84C] text-[#0a1628] font-sans text-sm font-semibold uppercase tracking-widest mb-3"
          >
            Enable Compass
          </button>
          <button onClick={skipCompass} className="w-full py-2 text-xs font-sans text-[#F5F0E8]/40 uppercase tracking-wider">
            Skip
          </button>
        </div>
      </div>
    )
  }

  // State 4: Capturing
  const desktopMode = !gyroAvailable

  return (
    <div className="fixed inset-0 bg-[#0a1628]">
      {/* Camera feed */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

      {/* Quality rejection border */}
      {!quality.passing && (
        <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 30px rgba(220,38,38,0.4)" }} />
      )}

      {/* Flash */}
      {flash && <div className="absolute inset-0 bg-white animate-[flash_100ms_ease-out]" />}

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-[120px]" style={{ background: "linear-gradient(to bottom, rgba(10,22,40,0.85), transparent)" }} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 pt-12 px-5 flex items-center justify-between">
        <div className="w-12" />
        <span className="text-xs font-sans uppercase tracking-[0.15em] text-[#F5F0E8]/50">Capture Your Room</span>
        <span className="text-sm font-sans text-[#C9A84C] font-semibold">{Math.min(shotIndex + 1, TOTAL_SHOTS)} / {TOTAL_SHOTS}</span>
      </div>

      {/* Shot strip */}
      <div className="absolute top-[72px] left-0 right-0">
        <ShotStripMobile shots={shots} currentIndex={shotIndex} />
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-[200px]" style={{ background: "linear-gradient(to top, rgba(10,22,40,0.92), transparent)" }} />

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-10 flex flex-col items-center gap-3">
        {/* Quality message */}
        {!quality.passing && quality.message && (
          <p className="text-xs font-sans text-red-400 uppercase tracking-wider text-center px-4">{quality.message}</p>
        )}

        {/* Guidance text */}
        <p
          ref={guidanceRef}
          className="text-xs font-sans uppercase tracking-[0.2em] text-center text-[#F5F0E8]/60 px-4"
        >
          {desktopMode ? `Position ${shotIndex + 1} of ${TOTAL_SHOTS} \u2014 capture each wall and corner` : "Point at any wall to begin"}
        </p>

        {/* Compass ring */}
        {!allComplete && (
          <MobileCompassRing
            activeIndex={shotIndex}
            allComplete={allComplete}
            lockedOn={lockedOn}
            needleRef={needleRef}
            arcRef={arcRef}
            hasGyro={gyroAvailable}
          />
        )}

        {/* Capture button */}
        {!allComplete && (
          <button
            ref={captureButtonRef}
            onClick={handleCapture}
            disabled={!quality.passing}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center disabled:cursor-not-allowed"
            style={{
              border: "2.5px solid #C9A84C",
              background: "#0a1628",
              boxShadow: "0 0 20px rgba(201,168,76,0.3)",
            }}
          >
            <div className="w-[54px] h-[54px] rounded-full" style={{ background: "rgba(201,168,76,0.15)" }} />
          </button>
        )}
      </div>
    </div>
  )
}
