"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"

// ─── Constants ─────────────────────────────────────────────
const PARTICLE_COUNT = 80
const TARGET_DURATION = 46000
const RING_R = 68
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R

const STAGES = [
  { text: "Analyzing your room geometry\u2026", duration: 6000 },
  { text: "Understanding your style profile\u2026", duration: 5000 },
  { text: "Generating design concepts\u2026", duration: 7000 },
  { text: "Rendering photorealistic details\u2026", duration: 8000 },
  { text: "Placing furniture with precision\u2026", duration: 6000 },
  { text: "Perfecting the lighting\u2026", duration: 5000 },
  { text: "Adding finishing touches\u2026", duration: 5000 },
  { text: "Almost ready\u2026", duration: 4000 },
]

const TIPS = [
  "Tip: Natural light doubles the impact of any redesign",
  "Tip: Anchor your room with a statement rug first",
  "Tip: Mix textures to add depth without clutter",
  "Tip: The 60-30-10 color rule never fails",
  "Tip: Scale matters more than style",
]

// ─── Progress curve ────────────────────────────────────────
function calculateProgress(elapsed: number): number {
  const t = Math.min(elapsed / TARGET_DURATION, 1)
  if (t < 0.3) return t * 1.2
  if (t < 0.8) return 0.36 + (t - 0.3) * 0.88
  if (t < 0.95) return 0.80 + (t - 0.8) * 1.0
  return 0.95 + (t - 0.95) * 0.8
}

// ─── Particle system ───────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; baseOpacity: number; isGold: boolean
  pulseSpeed: number; pulseOffset: number
}

function createParticles(w: number, h: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4 + 0.1,
    vy: (Math.random() - 0.5) * 0.4 + 0.1,
    size: 1 + Math.random() * 2,
    baseOpacity: 0.1 + Math.random() * 0.3,
    isGold: Math.random() > 0.5,
    pulseSpeed: 0.02 + Math.random() * 0.03,
    pulseOffset: Math.random() * Math.PI * 2,
  }))
}

function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const particlesRef = useRef<Particle[]>([])
  const frameRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      if (particlesRef.current.length === 0) {
        particlesRef.current = createParticles(canvas.width, canvas.height)
      }
    }
    resize()
    window.addEventListener("resize", resize)

    let rafId: number
    const draw = () => {
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const particles = particlesRef.current
      frameRef.current++
      const frame = frameRef.current

      // Move + draw particles
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0

        const opacity = p.baseOpacity + Math.sin(frame * p.pulseSpeed + p.pulseOffset) * 0.15
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.isGold
          ? `rgba(201,168,76,${opacity})`
          : `rgba(255,255,255,${opacity * 0.6})`
        ctx.fill()
      }

      // Connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(201,168,76,${(1 - dist / 120) * 0.08})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("resize", resize)
    }
  }, [canvasRef])
}

// ─── Progress Ring SVG ─────────────────────────────────────
function ProgressRing({ progress, complete }: { progress: number; complete: boolean }) {
  const dashoffset = RING_CIRCUMFERENCE * (1 - progress)
  const pct = Math.round(progress * 100)

  // Tick marks at 45° increments
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45 - 90) * (Math.PI / 180)
    const r1 = 86, r2 = 90
    return {
      x1: 90 + Math.cos(angle) * r1, y1: 90 + Math.sin(angle) * r1,
      x2: 90 + Math.cos(angle) * r2, y2: 90 + Math.sin(angle) * r2,
    }
  })

  return (
    <div className="relative" style={{ width: 180, height: 180 }}>
      <svg width={180} height={180} viewBox="0 0 180 180">
        {/* Outer rotating decorative ring */}
        <g style={{ animation: "ringRotate 20s linear infinite", transformOrigin: "90px 90px" }}>
          <circle cx={90} cy={90} r={84} fill="none" stroke="rgba(201,168,76,0.08)" strokeWidth={1} />
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(201,168,76,0.2)" strokeWidth={1} />
          ))}
        </g>

        {/* Middle ring */}
        <circle cx={90} cy={90} r={76} fill="none" stroke="rgba(201,168,76,0.12)" strokeWidth={1} />

        {/* Inner glow ring */}
        <circle cx={90} cy={90} r={60} fill="none" stroke="rgba(201,168,76,0.06)" strokeWidth={8} />

        {/* Progress arc */}
        <circle
          cx={90} cy={90} r={RING_R}
          fill="none" stroke="#C9A84C" strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashoffset}
          transform="rotate(-90, 90, 90)"
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {complete ? (
          <span className="font-serif text-2xl text-[#C9A84C] animate-[scaleIn_300ms_ease-out]">{"\u2713"}</span>
        ) : (
          <>
            <span className="font-serif text-2xl text-white">{pct}%</span>
            <span className="text-[10px] font-sans uppercase tracking-[0.15em] text-white/40 mt-1">complete</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Detail Pills ──────────────────────────────────────────
function DetailPills() {
  const pills = ["FLUX AI", "DEPTH PRO", "3D RENDER"]
  return (
    <div className="flex items-center gap-3">
      {pills.map((label, i) => (
        <div
          key={label}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full"
          style={{
            border: "1px solid rgba(201,168,76,0.2)",
            background: "rgba(201,168,76,0.05)",
            animation: `fadeIn 400ms ease-out ${600 + i * 200}ms both`,
          }}
        >
          <div
            className="rounded-full bg-[#C9A84C]"
            style={{
              width: 6, height: 6,
              animation: `dotPulse 1.5s ease infinite ${i * 0.5}s`,
            }}
          />
          <span className="text-[10px] font-sans uppercase tracking-[0.1em] text-[#C9A84C]/70">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Processing Page ──────────────────────────────────
function ProcessingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [stageFading, setStageFading] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
  const [tipFading, setTipFading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [showReady, setShowReady] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [breathingActive, setBreathingActive] = useState(false)
  const archPathRef = useRef<SVGPathElement>(null)
  const startTimeRef = useRef(Date.now())

  useParticleCanvas(canvasRef)

  // Mount animation
  useEffect(() => { setMounted(true) }, [])

  // Arch draw-on animation via ref (accurate path length)
  useEffect(() => {
    if (archPathRef.current) {
      const length = archPathRef.current.getTotalLength()
      archPathRef.current.style.strokeDasharray = String(length)
      archPathRef.current.style.strokeDashoffset = String(length)
      requestAnimationFrame(() => {
        if (archPathRef.current) {
          archPathRef.current.style.transition = "stroke-dashoffset 1.4s ease-in-out"
          archPathRef.current.style.strokeDashoffset = "0"
        }
      })
    }
    const timer = setTimeout(() => setBreathingActive(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  // Progress ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const p = calculateProgress(elapsed)
      setProgress(p)
      if (p >= 0.99) clearInterval(interval)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Stage cycling
  useEffect(() => {
    let idx = 0
    const advance = () => {
      if (idx >= STAGES.length - 1) return
      const timeout = setTimeout(() => {
        setStageFading(true)
        setTimeout(() => {
          idx++
          setStageIndex(idx)
          setStageFading(false)
          advance()
        }, 300)
      }, STAGES[idx].duration)
      return timeout
    }
    const t = advance()
    return () => { if (t) clearTimeout(t) }
  }, [])

  // Tip cycling
  useEffect(() => {
    const startDelay = setTimeout(() => {
      const interval = setInterval(() => {
        setTipFading(true)
        setTimeout(() => {
          setTipIndex((i) => (i + 1) % TIPS.length)
          setTipFading(false)
        }, 300)
      }, 6000)
      return () => clearInterval(interval)
    }, 1000)
    return () => clearTimeout(startDelay)
  }, [])

  // Poll for real completion
  useEffect(() => {
    if (!sessionId || sessionId === "test") return
    const supabase = createBrowserClient()
    const poll = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("render_sessions")
          .select("status, render_url")
          .eq("id", sessionId)
          .single()
        if (data?.status === "complete") {
          clearInterval(poll)
          triggerCompletion()
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(poll)
  }, [sessionId])

  // Dev fallback: auto-advance after 47s
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!complete) triggerCompletion()
    }, 47000)
    return () => clearTimeout(timeout)
  }, [complete])

  const triggerCompletion = useCallback(() => {
    setProgress(1)
    setComplete(true)
    setTimeout(() => setShowReady(true), 600)
    setTimeout(() => {
      router.push(`/viewer/${sessionId ?? "test"}`)
    }, 1800)
  }, [router, sessionId])

  return (
    <div
      className="fixed inset-0 bg-[#0a1628] overflow-hidden"
      style={{ opacity: mounted ? 1 : 0, transition: "opacity 600ms ease-out" }}
    >
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />

      {/* Radial glows */}
      <div
        className="absolute pointer-events-none z-[1]"
        style={{
          width: 600, height: 600,
          top: "50%", left: "50%",
          background: "radial-gradient(circle, rgba(201,168,76,0.12), transparent 70%)",
          animation: "glow1drift 8s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute pointer-events-none z-[1]"
        style={{
          width: 400, height: 400,
          left: "10%", bottom: "20%",
          background: "radial-gradient(circle, rgba(20,80,80,0.15), transparent 70%)",
          animation: "glow2drift 11s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute pointer-events-none z-[1]"
        style={{
          width: 350, height: 350,
          right: "15%", top: "25%",
          background: "radial-gradient(circle, rgba(180,100,20,0.12), transparent 70%)",
          animation: "glow3drift 9s ease-in-out infinite alternate",
        }}
      />

      {/* Main content */}
      <div className="relative z-[2] flex flex-col items-center justify-center min-h-screen px-6 gap-6">
        {/* Arch logo — draw on + breathe + glow */}
        <div className="relative flex items-center justify-center">
          {/* Soft gold glow behind arch */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 120, height: 80,
              background: "radial-gradient(ellipse, rgba(201,168,76,0.2), transparent 70%)",
              animation: "archGlow 3s ease-in-out infinite",
            }}
          />
          <svg
            width={80} height={50} viewBox="0 0 32 20" fill="none"
            style={{ animation: breathingActive ? "archBreathe 3s ease-in-out infinite" : "none" }}
          >
            <path
              ref={archPathRef}
              d="M2 18 Q16 2 30 18"
              stroke="#C9A84C"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Headline */}
        <h1
          className="font-serif text-3xl text-white text-center"
          style={{ animation: "fadeSlideUp 500ms ease-out 400ms both" }}
        >
          Designing your <span className="italic text-[#C9A84C]">space</span>.
        </h1>

        {/* Stage text */}
        <p
          className="text-sm font-sans uppercase tracking-widest text-white/50 text-center h-5 transition-opacity duration-300"
          style={{ opacity: stageFading || showReady ? 0 : 1 }}
        >
          {STAGES[stageIndex].text}
        </p>

        {/* "Your room is ready" text (on completion) */}
        {showReady && (
          <p className="font-serif text-2xl italic text-[#C9A84C] text-center animate-[fadeIn_400ms_ease-out]">
            Your room is ready.
          </p>
        )}

        {/* Progress ring */}
        <ProgressRing progress={progress} complete={complete} />

        {/* Detail pills */}
        {!complete && <DetailPills />}

        {/* Tip */}
        {!complete && (
          <p
            className="text-xs font-sans italic text-white/40 text-center max-w-[280px] h-8 transition-opacity duration-300"
            style={{ opacity: tipFading ? 0 : 1, animation: "fadeIn 400ms ease-out 1000ms both" }}
          >
            {TIPS[tipIndex]}
          </p>
        )}
      </div>

      {/* Completion flash */}
      {complete && (
        <div
          className="fixed inset-0 z-50 bg-white pointer-events-none"
          style={{ animation: "completionFlash 200ms ease-out 1200ms both" }}
        />
      )}
    </div>
  )
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#0a1628]" />}>
      <ProcessingInner />
    </Suspense>
  )
}
