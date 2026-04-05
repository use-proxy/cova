"use client"

import { useEffect, useRef, useState } from "react"

export default function CovaLandingPage() {
  const [introPhase, setIntroPhase] = useState(0)
  const [hasSeenIntro, setHasSeenIntro] = useState(false)
  const [dividerPosition, setDividerPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [currentRoom, setCurrentRoom] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [currentFingerprint, setCurrentFingerprint] = useState(0)
  const [typedText, setTypedText] = useState("")
  const [activeAxis, setActiveAxis] = useState<number | null>(null)
  const [customFingerprint, setCustomFingerprint] = useState<number[] | null>(null)
  const [activeChip, setActiveChip] = useState<number | null>(null)
  const [activeCard, setActiveCard] = useState(0)
  const [cardDragStart, setCardDragStart] = useState<number | null>(null)
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const [activeProduct, setActiveProduct] = useState<number | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const particleCanvasRef = useRef<HTMLCanvasElement>(null)
  const ctaCanvasRef = useRef<HTMLCanvasElement>(null)
  const threeContainerRef = useRef<HTMLDivElement>(null)
  const dragParticlesRef = useRef<{ x: number; y: number; vx: number; vy: number; opacity: number }[]>([])

  const rooms = [
    {
      name: "NORDIC MINIMAL",
      type: "Living Room",
      beforeUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/hero/before-neutral.jpg",
      afterUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/hero/after-nordic-minimal.jpg",
    },
    {
      name: "WARM JAPANDI",
      type: "Living Room",
      beforeUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/hero/before-neutral.jpg",
      afterUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/hero/after-warm-japandi.jpg",
    },
    {
      name: "ORGANIC MODERN",
      type: "Living Room",
      beforeUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/hero/before-neutral.jpg",
      afterUrl: "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/hero/after-organic-modern.jpg",
    },
  ]

  const fingerprints = [
    { name: "Warm Japandi", values: [0.7, 0.3, 0.8, 0.7, 0.4, 0.6], chips: ["organic textures", "warm neutrals", "minimal layers", "natural materials"] },
    { name: "Cool Minimalist", values: [0.8, 0.1, 0.2, 0.3, 0.2, 0.2], chips: ["clean lines", "negative space", "monochrome", "precision"] },
    { name: "Heritage Maximalist", values: [0.5, 0.9, 0.7, 0.4, 0.9, 0.8], chips: ["rich layers", "antique detail", "warm palette", "collected"] },
    { name: "Organic Modern", values: [0.7, 0.4, 0.6, 0.9, 0.3, 0.7], chips: ["curved forms", "natural wood", "earthy tones", "artisan craft"] },
  ]

  const axisLabels = ["Luminosity", "Density", "Temperature", "Form", "Era", "Texture"]
  const axisDescriptions = [
    { low: "Dark & Moody", high: "Bright & Airy" },
    { low: "Minimal", high: "Maximalist" },
    { low: "Cool & Slate", high: "Warm & Amber" },
    { low: "Geometric", high: "Organic" },
    { low: "Contemporary", high: "Traditional" },
    { low: "Smooth & Polished", high: "Tactile & Rough" },
  ]

  const introText = "What if your room looked like this..."

  const getDisplayFingerprint = () => customFingerprint ?? fingerprints[currentFingerprint].values

  const getStyleName = (values: number[]) => {
    const key = values.map(v => v >= 0.5 ? "1" : "0").join("")
    const styleMap: Record<string, string> = {
      "110100": "Warm Japandi", "010110": "Warm Japandi", "110110": "Warm Japandi",
      "100000": "Cool Minimalist", "000000": "Pure Minimalist",
      "101010": "Transitional", "001010": "Japandi",
      "111111": "Warm Maximalist Heritage",
    }
    return styleMap[key] ?? fingerprints[currentFingerprint].name
  }

  useEffect(() => {
    const seen = sessionStorage.getItem("seen_intro")
    if (seen) { setHasSeenIntro(true); setIntroPhase(3); return }
    let charIndex = 0
    const typeInterval = setInterval(() => {
      if (charIndex <= introText.length) { setTypedText(introText.slice(0, charIndex)); charIndex++ }
      else { clearInterval(typeInterval); setTimeout(() => setIntroPhase(2), 200) }
    }, 40)
    setIntroPhase(1)
    return () => clearInterval(typeInterval)
  }, [])

  useEffect(() => {
    if (introPhase === 2) { setTimeout(() => { setIntroPhase(3); sessionStorage.setItem("seen_intro", "true") }, 600) }
  }, [introPhase])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setCurrentRoom((prev) => (prev + 1) % rooms.length), 8000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    rooms.forEach((room) => {
      const imgBefore = new Image()
      imgBefore.src = room.beforeUrl
      const imgAfter = new Image()
      imgAfter.src = room.afterUrl
    })
  }, [])

  useEffect(() => {
    if (customFingerprint) return
    const interval = setInterval(() => setCurrentFingerprint((prev) => (prev + 1) % fingerprints.length), 3000)
    return () => clearInterval(interval)
  }, [customFingerprint])

  // Fix: attach drag handlers to window so drag works even when cursor leaves the handle
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !heroRef.current) return
      const rect = heroRef.current.getBoundingClientRect()
      const pos = ((e.clientX - rect.left) / rect.width) * 100
      setDividerPosition(Math.max(5, Math.min(95, pos)))
      dragParticlesRef.current.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        opacity: 1,
      })
    }
    const onMouseUp = () => setIsDragging(false)
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || !heroRef.current) return
      const rect = heroRef.current.getBoundingClientRect()
      const touch = e.touches[0]
      const pos = ((touch.clientX - rect.left) / rect.width) * 100
      setDividerPosition(Math.max(5, Math.min(95, pos)))
    }
    const onTouchEnd = () => setIsDragging(false)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("touchend", onTouchEnd)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [isDragging])

  useEffect(() => {
    const canvas = particleCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let animationId: number
    const animate = () => {
      if (!canvas.parentElement) return
      canvas.width = canvas.parentElement.offsetWidth
      canvas.height = canvas.parentElement.offsetHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      dragParticlesRef.current = dragParticlesRef.current.filter((p) => {
        p.x += p.vx; p.y += p.vy; p.opacity -= 0.025
        if (p.opacity <= 0) return false
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201, 168, 76, ${p.opacity})`; ctx.fill()
        return true
      })
      animationId = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(animationId)
  }, [])

  useEffect(() => {
    const canvas = ctaCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const nodes: { x: number; y: number; vx: number; vy: number }[] = []
    for (let i = 0; i < 120; i++) nodes.push({ x: Math.random() * 1200, y: Math.random() * 800, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 })
    let animationId: number
    const animate = () => {
      if (!canvas.parentElement) return
      canvas.width = canvas.parentElement.offsetWidth
      canvas.height = canvas.parentElement.offsetHeight
      const centerX = canvas.width / 2, centerY = canvas.height / 2
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      nodes.forEach((node) => {
        node.vx += (centerX - node.x) * 0.00005; node.vy += (centerY - node.y) * 0.00005
        node.x += node.vx; node.y += node.vy
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1
        ctx.beginPath(); ctx.arc(node.x, node.y, 2, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(201, 168, 76, 0.3)"; ctx.fill()
      })
      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((other) => {
          const dist = Math.hypot(node.x - other.x, node.y - other.y)
          if (dist < 120) { ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(other.x, other.y); ctx.strokeStyle = `rgba(201, 168, 76, ${0.1 * (1 - dist / 120)})`; ctx.stroke() }
        })
      })
      animationId = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(animationId)
  }, [])

  useEffect(() => {
    const container = threeContainerRef.current
    if (!container) return
    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
    script.async = true
    script.onload = () => {
      const THREE = (window as unknown as { THREE: typeof import("three") }).THREE
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000)
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setSize(container.offsetWidth, container.offsetHeight)
      renderer.setClearColor(0x000000, 0)
      container.appendChild(renderer.domElement)
      const particles = new THREE.BufferGeometry()
      const positions = new Float32Array(200 * 3)
      const velocities: number[] = []
      for (let i = 0; i < 200; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 20
        positions[i * 3 + 1] = (Math.random() - 0.5) * 20
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10
        velocities.push(0.01 + Math.random() * 0.02)
      }
      particles.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      const material = new THREE.PointsMaterial({ color: 0xc9a84c, size: 0.05, transparent: true, opacity: 0.6 })
      const particleSystem = new THREE.Points(particles, material)
      scene.add(particleSystem)
      camera.position.z = 5
      const animate = () => {
        const pos = particles.attributes.position.array as Float32Array
        for (let i = 0; i < 200; i++) { pos[i * 3 + 1] += velocities[i]; if (pos[i * 3 + 1] > 10) pos[i * 3 + 1] = -10 }
        particles.attributes.position.needsUpdate = true
        renderer.render(scene, camera)
        requestAnimationFrame(animate)
      }
      animate()
      const handleResize = () => { camera.aspect = container.offsetWidth / container.offsetHeight; camera.updateProjectionMatrix(); renderer.setSize(container.offsetWidth, container.offsetHeight) }
      window.addEventListener("resize", handleResize)
    }
    document.head.appendChild(script)
  }, [])

  const handleCTAClick = () => {
    document.body.style.transition = "transform 400ms ease, opacity 400ms ease"
    document.body.style.transformOrigin = "center center"
    document.body.style.transform = "perspective(1200px) rotateY(90deg) scale(0.8)"
    document.body.style.opacity = "0"
    setTimeout(() => { window.location.href = "/design/step-1" }, 400)
  }

  const getRadarPath = (values: number[]) => {
    const points = values.map((v, i) => { const a = (Math.PI * 2 * i) / 6 - Math.PI / 2; return { x: 200 + Math.cos(a) * 160 * v, y: 200 + Math.sin(a) * 160 * v } })
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z"
  }

  const getRadarPoints = (values: number[]) => values.map((v, i) => { const a = (Math.PI * 2 * i) / 6 - Math.PI / 2; return { x: 200 + Math.cos(a) * 160 * v, y: 200 + Math.sin(a) * 160 * v } })
  const getAxisPoint = (index: number, scale = 1) => { const a = (Math.PI * 2 * index) / 6 - Math.PI / 2; return { x: 200 + Math.cos(a) * 160 * scale, y: 200 + Math.sin(a) * 160 * scale } }

  const displayFp = getDisplayFingerprint()

  const getRoomSVGs = (roomIndex: number) => {
    const room = rooms[roomIndex]
    if (!room) return {
      before: <div className="w-full h-full" style={{ background: "#091829" }} />,
      after: <div className="w-full h-full" style={{ background: "#091829" }} />,
    }
    return {
      before: (
        <img
          src={room.beforeUrl}
          alt="Before redesign"
          className="w-full h-full object-cover"
          draggable={false}
        />
      ),
      after: (
        <img
          src={room.afterUrl}
          alt={`After redesign — ${room.name}`}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ),
    }
  }

  const currentRoomSVGs = getRoomSVGs(currentRoom)

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap');
        :root { --cova-bg:#091829; --cova-surface:#0D2035; --cova-surface-2:#112540; --cova-gold:#C9A84C; --cova-gold-light:#D4B460; --cova-ivory:#F5F0E8; --cova-muted:#8A9BB5; --cova-subtle:#4A5E7A; --cova-border:rgba(201,168,76,0.20); }
        * { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body { font-family:'Inter',sans-serif; background:var(--cova-bg); color:var(--cova-ivory); overflow-x:hidden; }
        .font-serif { font-family:'EB Garamond',serif; }
        @keyframes scrollLine { 0%{height:0;opacity:1} 80%{height:40px;opacity:1} 100%{height:40px;opacity:0} }
        @keyframes progressBar { 0%{width:0} 100%{width:100%} }
        @property --angle { syntax:'<angle>'; initial-value:0deg; inherits:false; }
        @keyframes rotateBorder { from{--angle:0deg} to{--angle:360deg} }
        .animated-border { position:relative; }
        .animated-border::before { content:''; position:absolute; inset:-1px; border-radius:17px; z-index:-1; background:conic-gradient(from var(--angle,0deg),transparent 0deg,var(--cova-gold) 60deg,transparent 120deg); animation:rotateBorder 4s linear infinite; }
        input[type=range]::-webkit-slider-thumb { appearance:none; width:14px; height:14px; border-radius:50%; background:#C9A84C; cursor:pointer; }
        input[type=range]::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:#C9A84C; cursor:pointer; border:none; }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:0.01ms!important; transition-duration:0.01ms!important; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%,-130%); } to { opacity: 1; transform: translate(-50%,-140%); } }
      `}</style>

      {/* Intro */}
      {introPhase < 3 && !hasSeenIntro && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "#000" }}>
          <p className="font-serif italic text-2xl" style={{ color: "var(--cova-gold)" }}>{typedText}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300" style={{ background: scrolled ? "rgba(13,32,53,0.85)" : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-sans text-sm font-light tracking-[0.25em]" style={{ color: "var(--cova-ivory)" }}>COVA</span>
          <div className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm transition-colors duration-200" style={{ color: "var(--cova-muted)" }}>How it works</a>
            <button className="px-5 py-2 text-sm rounded-lg transition-all duration-200" style={{ background: "transparent", border: "1px solid rgba(201,168,76,0.35)", color: "var(--cova-ivory)" }}>Sign In</button>
            <button onClick={handleCTAClick} className="px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-[#D4B460] hover:-translate-y-0.5" style={{ background: "#C9A84C", color: "#091829", border: "none", boxShadow: "0 0 40px rgba(201,168,76,0.25)" }}>Start Designing</button>
          </div>
          <button onClick={handleCTAClick} className="md:hidden px-4 py-2 text-sm font-semibold rounded-lg" style={{ background: "#C9A84C", color: "#091829", border: "none" }}>Start</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative w-full h-screen overflow-hidden" style={{ background: "var(--cova-bg)" }}>
        <div ref={threeContainerRef} className="absolute inset-0 z-10 pointer-events-none" />
        {/* Before — grayscale left panel */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 ${100 - dividerPosition}% 0 0)`,
            opacity: introPhase >= 2 ? 1 : 0,
            filter: "grayscale(100%) brightness(0.65)",
            transition: "opacity 700ms",
          }}
        >
          {currentRoomSVGs.before}
        </div>
        {/* After — warm color right panel */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 0 0 ${dividerPosition}%)`,
            opacity: introPhase >= 2 ? 1 : 0,
            transition: "opacity 700ms",
          }}
        >
          {currentRoomSVGs.after}
        </div>
        {/* Divider — full height draggable bar */}
        <div
          className="absolute top-0 bottom-0 z-20 select-none"
          style={{
            left: `${dividerPosition}%`,
            width: "2px",
            background: "var(--cova-gold)",
            opacity: introPhase >= 2 ? 1 : 0,
            cursor: "ew-resize",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            setIsDragging(true)
          }}
          onPointerMove={(e) => {
            if (!isDragging || !heroRef.current) return
            const rect = heroRef.current.getBoundingClientRect()
            const pos = ((e.clientX - rect.left) / rect.width) * 100
            setDividerPosition(Math.max(5, Math.min(95, pos)))
            dragParticlesRef.current.push({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              opacity: 0.9,
            })
          }}
          onPointerUp={() => setIsDragging(false)}
          onPointerCancel={() => setIsDragging(false)}
        >
          {/* Handle circle — stays at vertical center */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full flex items-center justify-center select-none"
            style={{
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "52px",
              height: "52px",
              background: "var(--cova-gold)",
              boxShadow: "0 0 24px rgba(201,168,76,0.6)",
              cursor: "ew-resize",
              pointerEvents: "none",
            }}
          >
            <span style={{ color: "var(--cova-bg)", fontSize: "16px", fontWeight: "bold", letterSpacing: "-2px", userSelect: "none" }}>↔</span>
          </div>
        </div>
        <canvas ref={particleCanvasRef} className="absolute inset-0 z-[25] pointer-events-none" />
        {/* Style name — bottom right, not moving */}
        <div className="absolute bottom-20 right-8 z-30" style={{ opacity: introPhase >= 2 ? 1 : 0 }}>
          <span className="font-sans text-xs tracking-[0.25em]" style={{ color: "var(--cova-gold)" }}>{rooms[currentRoom].name}</span>
        </div>
        {/* Headline — pinned to top quarter of screen */}
        <div
          className="absolute left-0 right-0 z-30 flex flex-col items-center text-center px-6 transition-opacity duration-500"
          style={{ top: "18%", opacity: introPhase >= 3 ? 1 : 0 }}
        >
          <h1
            className="font-serif text-4xl md:text-7xl"
            style={{ color: "var(--cova-ivory)", textShadow: "0 2px 40px rgba(9,24,41,0.95)" }}
          >
            Reimagine your space in seconds.
          </h1>
        </div>
        {/* CTA button — pinned to bottom quarter, does not move */}
        <div
          className="absolute left-0 right-0 z-30 flex justify-center transition-opacity duration-500"
          style={{ bottom: "22%", opacity: introPhase >= 3 ? 1 : 0 }}
        >
          <button
            onClick={handleCTAClick}
            className="px-10 py-4 text-base font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: "#C9A84C", color: "#091829", border: "none", boxShadow: "0 0 40px rgba(201,168,76,0.3)" }}
          >
            Design My Room →
          </button>
        </div>
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center z-30" style={{ opacity: introPhase >= 3 ? 1 : 0 }}>
          <div className="w-px" style={{ height: "40px", background: "var(--cova-gold)", animation: "scrollLine 2s ease-in-out infinite" }} />
          <span className="mt-2 text-[10px] tracking-[0.2em]" style={{ color: "var(--cova-subtle)" }}>SCROLL</span>
        </div>
      </section>

      <div className="w-full h-px" style={{ background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2) 20%, rgba(201,168,76,0.2) 80%, transparent)" }} />

      {/* ── THREE STEPS — DIAGONAL MINIMAL ── */}
      <section id="how-it-works" className="py-[120px] px-6 overflow-hidden" style={{ background: "var(--cova-bg)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-[100px]">
            <span className="font-sans text-xs tracking-[0.3em] mb-4 block" style={{ color: "var(--cova-gold)" }}>THE PROCESS</span>
            <h2 className="font-serif text-4xl md:text-6xl" style={{ color: "var(--cova-ivory)" }}>Three steps. One transformation.</h2>
          </div>

          <div className="relative">
            {/* Diagonal connector */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} preserveAspectRatio="none">
              <defs>
                <linearGradient id="connectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(201,168,76,0)" />
                  <stop offset="40%" stopColor="rgba(201,168,76,0.2)" />
                  <stop offset="60%" stopColor="rgba(201,168,76,0.2)" />
                  <stop offset="100%" stopColor="rgba(201,168,76,0)" />
                </linearGradient>
              </defs>
              <line x1="15%" y1="10%" x2="85%" y2="90%" stroke="url(#connectorGrad)" strokeWidth="1" strokeDasharray="6 8" />
            </svg>

            {/* Step 01 — left */}
            <div className="relative z-10 mb-[90px] flex justify-start">
              <div className="w-full md:w-[52%] flex flex-col md:flex-row items-start gap-8">
                <div
                  className="flex-shrink-0 w-full md:w-[280px]"
                  style={{
                    borderRadius: "16px",
                    overflow: "hidden",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(201,168,76,0.15)",
                    aspectRatio: "4/3",
                  }}
                >
                  <img
                    src="https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/person-taking-photo.jpg"
                    alt="Person photographing their room with a phone"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center",
                    }}
                  />
                </div>
                <div>
                  <span className="font-serif text-[90px] leading-none block" style={{ color: "var(--cova-gold)", opacity: 0.1 }}>01</span>
                  <span className="font-sans text-xs tracking-[0.25em] mb-3 block" style={{ color: "var(--cova-gold)" }}>CAPTURE</span>
                  <h3 className="font-serif text-3xl mb-4" style={{ color: "var(--cova-ivory)" }}>Show us your space.</h3>
                  <p className="font-sans text-base leading-relaxed max-w-[280px]" style={{ color: "var(--cova-muted)" }}>
                    Point your phone at any room. Our framing guide captures the perfect angle. Desktop users scan a QR code — your phone becomes the camera.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 02 — center */}
            <div className="relative z-10 mb-[90px] flex justify-center">
              <div className="w-full md:w-[52%] flex flex-col md:flex-row-reverse items-start gap-8">
                <div className="flex-shrink-0 w-full md:w-[260px]" style={{ position: "relative", height: "200px" }}>
                  {/* Left card — dark moody (pair-01-a) */}
                  <div
                    style={{
                      position: "absolute",
                      left: "0",
                      top: "10px",
                      width: "115px",
                      height: "155px",
                      borderRadius: "10px",
                      border: "1px solid #C9A84C",
                      overflow: "hidden",
                      transform: "rotate(-3deg)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    <img
                      src="https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-01-a.jpg"
                      alt="Style option A — moody dark"
                      style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.9)" }}
                    />
                  </div>
                  {/* VS label */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      zIndex: 10,
                      color: "#C9A84C",
                      fontSize: "13px",
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 600,
                    }}
                  >VS</div>
                  {/* Right card — bright airy (pair-01-b) */}
                  <div
                    style={{
                      position: "absolute",
                      right: "0",
                      top: "10px",
                      width: "115px",
                      height: "155px",
                      borderRadius: "10px",
                      border: "1px solid #C9A84C",
                      overflow: "hidden",
                      transform: "rotate(3deg)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    <img
                      src="https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-pairs/living-room/pair-01-b.jpg"
                      alt="Style option B — bright airy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                </div>
                <div>
                  <span className="font-serif text-[90px] leading-none block" style={{ color: "var(--cova-gold)", opacity: 0.1 }}>02</span>
                  <span className="font-sans text-xs tracking-[0.25em] mb-3 block" style={{ color: "var(--cova-gold)" }}>DEFINE</span>
                  <h3 className="font-serif text-3xl mb-4" style={{ color: "var(--cova-ivory)" }}>15 questions. Your exact taste.</h3>
                  <p className="font-sans text-base leading-relaxed max-w-[280px]" style={{ color: "var(--cova-muted)" }}>
                    Swipe through room pairs. We map your preferences across six dimensions into a precise style fingerprint that&apos;s entirely yours.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 03 — right */}
            <div className="relative z-10 flex justify-end">
              <div className="w-full md:w-[52%] flex flex-col md:flex-row items-start gap-8">
                <div className="flex-shrink-0 w-full md:w-[360px]">
                  {/* Shoppable render with interactive hotspots */}
                  <div
                    className="relative w-full rounded-2xl overflow-hidden"
                    style={{ aspectRatio: "16/9", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
                  >
                    <img
                      src="https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/shoppable-render.jpg"
                      alt="AI redesigned living room"
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                    {/* SVG hotspot overlay */}
                    <svg
                      className="absolute inset-0 w-full h-full"
                      style={{ cursor: "crosshair" }}
                      viewBox="0 0 100 56.25"
                      preserveAspectRatio="none"
                    >
                      {[
                        { id: 0, cx: 30, cy: 65, rx: (120/1344)*100, ry: (60/768)*56.25, label: "Sofa", name: "Burrow Block Nomad Sofa", price: "$1,595", retailer: "Burrow" },
                        { id: 1, cx: 48, cy: 82, rx: (100/1344)*100, ry: (40/768)*56.25, label: "Coffee Table", name: "CB2 Encase Marble Coffee Table", price: "$899", retailer: "CB2" },
                        { id: 2, cx: 82, cy: 40, rx: (40/1344)*100, ry: (100/768)*56.25, label: "Floor Lamp", name: "Article Cella Arc Floor Lamp", price: "$449", retailer: "Article" },
                      ].map((product) => {
                        const isActive = activeHotspot === product.id
                        const rxVB = product.rx
                        const ryVB = product.ry
                        return (
                          <g key={product.id}>
                            <ellipse cx={product.cx} cy={product.cy} rx={rxVB + 2} ry={ryVB + 2}
                              fill="rgba(201,168,76,0.25)" stroke="#C9A84C" strokeWidth="0.3"
                              style={{ opacity: isActive ? 1 : 0, transition: "opacity 200ms ease", filter: "blur(2px)" }} />
                            <ellipse cx={product.cx} cy={product.cy} rx={rxVB} ry={ryVB}
                              fill="rgba(201,168,76,0.05)" stroke="rgba(201,168,76,0.4)" strokeWidth="0.2" />
                            <circle cx={product.cx} cy={product.cy} r="1.2" fill="#C9A84C"
                              style={{ filter: "drop-shadow(0 0 3px rgba(201,168,76,0.8))" }}>
                              <animate attributeName="r" values="1.0;1.6;1.0" dur="2s" repeatCount="indefinite" begin={`${product.id * 0.6}s`} />
                              <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" begin={`${product.id * 0.6}s`} />
                            </circle>
                            <ellipse cx={product.cx} cy={product.cy} rx={rxVB + 4} ry={ryVB + 4}
                              fill="transparent" style={{ cursor: "pointer" }}
                              onMouseEnter={() => setActiveHotspot(product.id)}
                              onMouseLeave={() => setActiveHotspot(null)}
                              onClick={() => { setActiveProduct(product.id); setShowSheet(true) }} />
                          </g>
                        )
                      })}
                    </svg>
                    {/* Hover labels */}
                    {[
                      { id: 0, cx: "30%", cy: "65%", name: "Burrow Block Nomad Sofa", price: "$1,595", retailer: "Burrow" },
                      { id: 1, cx: "48%", cy: "82%", name: "CB2 Encase Marble Coffee Table", price: "$899", retailer: "CB2" },
                      { id: 2, cx: "82%", cy: "40%", name: "Article Cella Arc Floor Lamp", price: "$449", retailer: "Article" },
                    ].map((p) => (
                      <div key={p.id} className="absolute pointer-events-none"
                        style={{ left: p.cx, top: p.cy, transform: "translate(-50%, -140%)", opacity: activeHotspot === p.id ? 1 : 0, transition: "opacity 150ms ease" }}>
                        <div style={{ background: "rgba(9,24,41,0.92)", border: "1px solid rgba(201,168,76,0.5)", borderRadius: "8px", padding: "6px 10px", whiteSpace: "nowrap", backdropFilter: "blur(8px)" }}>
                          <p style={{ color: "#F5F0E8", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: 500, margin: 0 }}>{p.name}</p>
                          <p style={{ color: "#C9A84C", fontSize: "11px", fontFamily: "Inter, sans-serif", margin: 0 }}>{p.price} · {p.retailer}</p>
                        </div>
                      </div>
                    ))}
                    {/* Bottom sheet */}
                    {showSheet && activeProduct !== null && (() => {
                      const products = [
                        { name: "Burrow Block Nomad Sofa", price: "$1,595", retailer: "Burrow" },
                        { name: "CB2 Encase Marble Coffee Table", price: "$899", retailer: "CB2" },
                        { name: "Article Cella Arc Floor Lamp", price: "$449", retailer: "Article" },
                      ]
                      const p = products[activeProduct]
                      return (
                        <>
                          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.3)" }} onClick={() => setShowSheet(false)} />
                          <div className="absolute bottom-0 left-0 right-0" style={{ background: "#0D2035", borderTop: "1px solid rgba(201,168,76,0.3)", borderRadius: "16px 16px 0 0", padding: "16px", animation: "slideUp 300ms ease" }}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p style={{ color: "#F5F0E8", fontSize: "13px", fontFamily: "Inter, sans-serif", fontWeight: 600, margin: 0 }}>{p?.name}</p>
                                <p style={{ color: "#8A9BB5", fontSize: "11px", fontFamily: "Inter, sans-serif", margin: "2px 0 0 0" }}>{p?.retailer}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span style={{ color: "#C9A84C", fontSize: "15px", fontWeight: 600, fontFamily: "Inter, sans-serif" }}>{p?.price}</span>
                                <button style={{ background: "#C9A84C", color: "#091829", border: "none", borderRadius: "8px", padding: "7px 14px", fontSize: "12px", fontWeight: 600, fontFamily: "Inter, sans-serif", cursor: "pointer" }}>Buy →</button>
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
                <div>
                  <span className="font-serif text-[90px] leading-none block" style={{ color: "var(--cova-gold)", opacity: 0.1 }}>03</span>
                  <span className="font-sans text-xs tracking-[0.25em] mb-3 block" style={{ color: "var(--cova-gold)" }}>TRANSFORM</span>
                  <h3 className="font-serif text-3xl mb-4" style={{ color: "var(--cova-ivory)" }}>Shop every item in your render.</h3>
                  <p className="font-sans text-base leading-relaxed max-w-[280px]" style={{ color: "var(--cova-muted)" }}>
                    Your redesigned room arrives in 45 seconds. Tap any piece of furniture to find it in our catalog of 5,000+ products from 11 premium retailers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full h-px" style={{ background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2) 20%, rgba(201,168,76,0.2) 80%, transparent)" }} />

      {/* ── STYLE INTELLIGENCE — INTERACTIVE ── */}
      <section className="py-[120px] px-6" style={{ background: "var(--cova-surface)" }}>
        <div className="max-w-4xl mx-auto text-center mb-16">
          <span className="font-sans text-xs tracking-[0.3em] mb-4 block" style={{ color: "var(--cova-gold)" }}>STYLE INTELLIGENCE</span>
          <h2 className="font-serif text-4xl md:text-6xl mb-4" style={{ color: "var(--cova-ivory)" }}>Your taste. Precisely mapped.</h2>
          <p className="font-sans text-sm" style={{ color: "var(--cova-muted)" }}>
            Click any axis label to explore what each dimension means — then drag to adjust it.
          </p>
        </div>

        <div className="max-w-[1000px] mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-20">
          {/* Interactive radar */}
          <div className="w-[300px] md:w-[380px] flex-shrink-0">
            <svg viewBox="0 0 400 400" className="w-full" style={{ overflow: "visible" }}>
              {[0.25, 0.5, 0.75, 1].map((scale, i) => (
                <polygon key={i} points={[0,1,2,3,4,5].map((j) => { const a = (Math.PI*2*j)/6 - Math.PI/2; return `${200+Math.cos(a)*160*scale},${200+Math.sin(a)*160*scale}` }).join(" ")}
                  fill="none" stroke="#1A2A4A" strokeWidth="1" />
              ))}
              {axisLabels.map((_, i) => { const pt = getAxisPoint(i); return <line key={i} x1="200" y1="200" x2={pt.x} y2={pt.y} stroke="#1A2A4A" strokeWidth="1" /> })}
              <path d={getRadarPath(displayFp)} fill="rgba(201,168,76,0.15)" stroke="#C9A84C" strokeWidth="2" style={{ transition: "d 600ms ease" }} />
              {getRadarPoints(displayFp).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="6" fill="#C9A84C"
                  style={{ filter: "drop-shadow(0 0 10px rgba(201,168,76,0.6))", transition: "cx 600ms ease, cy 600ms ease" }} />
              ))}
              {axisLabels.map((label, i) => {
                const pt = getAxisPoint(i, 1.22)
                return (
                  <g key={i}>
                    <text x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle"
                      fill={activeAxis === i ? "#C9A84C" : "#8A9BB5"} fontSize="12" fontFamily="Inter"
                      style={{ cursor: "pointer", transition: "fill 200ms", userSelect: "none" }}
                      onClick={() => setActiveAxis(activeAxis === i ? null : i)}
                    >{label}</text>
                    <circle cx={pt.x} cy={pt.y} r="20" fill="transparent" style={{ cursor: "pointer" }}
                      onClick={() => setActiveAxis(activeAxis === i ? null : i)} />
                  </g>
                )
              })}
            </svg>

            {activeAxis !== null && (
              <div className="mt-4 p-4 rounded-xl" style={{ background: "#112540", border: "1px solid rgba(201,168,76,0.3)" }}>
                <div className="flex justify-between items-center mb-3">
                  <span className="font-sans text-xs font-semibold" style={{ color: "#C9A84C" }}>{axisLabels[activeAxis]}</span>
                  <button onClick={() => setActiveAxis(null)} style={{ color: "var(--cova-muted)", background: "none", border: "none", cursor: "pointer", fontSize: "12px" }}>✕</button>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-sans text-[10px]" style={{ color: "var(--cova-muted)" }}>{axisDescriptions[activeAxis].low}</span>
                  <span className="font-sans text-[10px]" style={{ color: "var(--cova-muted)" }}>{axisDescriptions[activeAxis].high}</span>
                </div>
                <input type="range" min="0" max="100"
                  value={Math.round((customFingerprint ?? displayFp)[activeAxis] * 100)}
                  onChange={(e) => {
                    const base = [...(customFingerprint ?? displayFp)]
                    base[activeAxis] = parseInt(e.target.value) / 100
                    setCustomFingerprint(base)
                  }}
                  className="w-full"
                  style={{ appearance: "none", height: "3px", background: `linear-gradient(to right, #C9A84C ${(customFingerprint ?? displayFp)[activeAxis]*100}%, #1A2A4A ${(customFingerprint ?? displayFp)[activeAxis]*100}%)`, borderRadius: "2px", outline: "none", cursor: "pointer" }}
                />
                <div className="flex justify-between mt-2">
                  <span className="font-sans text-[10px]" style={{ color: "var(--cova-muted)" }}>Drag to adjust</span>
                  {customFingerprint && (
                    <button onClick={() => setCustomFingerprint(null)} style={{ color: "#C9A84C", background: "none", border: "none", cursor: "pointer", fontSize: "10px", fontFamily: "Inter" }}>Reset</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right content */}
          <div className="text-center md:text-left flex-1">
            <h3 className="font-serif text-4xl md:text-5xl mb-6" style={{ color: "var(--cova-gold)" }}>
              {customFingerprint ? getStyleName(customFingerprint) : fingerprints[currentFingerprint].name}
            </h3>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-8">
              {fingerprints[currentFingerprint].chips.map((chip, i) => (
                <span key={i} className="px-4 py-2 rounded-full text-xs font-sans" style={{ background: "var(--cova-bg)", border: "1px solid var(--cova-border)", color: "var(--cova-ivory)" }}>{chip}</span>
              ))}
            </div>
            <p className="font-sans text-base mb-3" style={{ color: "var(--cova-muted)" }}>15 questions map your exact taste across six dimensions of design preference.</p>
            <p className="font-sans text-sm mb-8" style={{ color: "var(--cova-subtle)" }}>Click any axis label on the chart to explore what each dimension means.</p>
            <button onClick={handleCTAClick} className="px-8 py-3 rounded-lg font-sans text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#D4B460]"
              style={{ background: "#C9A84C", color: "#091829", border: "none", boxShadow: "0 0 40px rgba(201,168,76,0.25)" }}>
              Take the Style Quiz →
            </button>
          </div>
        </div>
      </section>

      <div className="w-full h-px" style={{ background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2) 20%, rgba(201,168,76,0.2) 80%, transparent)" }} />

      {/* ── SMART INTEGRATION — INTERACTIVE ── */}
      <section className="py-[120px] px-6" style={{ background: "var(--cova-bg)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="animated-border rounded-2xl p-10 md:p-16 grid md:grid-cols-2 gap-12 items-center" style={{ background: "#091829" }}>
            {/* Smart room photo — reacts to chip hover */}
            <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: "16/9", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
              <img
                src="https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/landing-assets/smart-room.jpg"
                alt="Smart home living room"
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
              {/* SVG glow overlay */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 56.25" preserveAspectRatio="none">
                <defs>
                  <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                    <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
                {[
                  { id: 0, cx: 50, cy: 35, rx: (180/1344)*100, ry: (90/768)*56.25 },
                  { id: 1, cx: 50, cy: 52, rx: (140/1344)*100, ry: (20/768)*56.25 },
                  { id: 2, cx: 50, cy: 8,  rx: (300/1344)*100, ry: (30/768)*56.25 },
                  { id: 3, cx: 80, cy: 68, rx: (120/1344)*100, ry: (80/768)*56.25 },
                ].map((zone) => (
                  <ellipse key={zone.id} cx={zone.cx} cy={zone.cy} rx={zone.rx} ry={zone.ry}
                    fill={activeChip === zone.id ? "rgba(201,168,76,0.2)" : "transparent"}
                    stroke={activeChip === zone.id ? "#C9A84C" : "transparent"}
                    strokeWidth="0.3"
                    filter={activeChip === zone.id ? "url(#goldGlow)" : ""}
                    style={{ transition: "all 300ms ease" }} />
                ))}
                {activeChip !== null && (() => {
                  const zones = [
                    { cx: 50, cy: 35, rx: (180/1344)*100, ry: (90/768)*56.25 },
                    { cx: 50, cy: 52, rx: (140/1344)*100, ry: (20/768)*56.25 },
                    { cx: 50, cy: 8,  rx: (300/1344)*100, ry: (30/768)*56.25 },
                    { cx: 80, cy: 68, rx: (120/1344)*100, ry: (80/768)*56.25 },
                  ]
                  const zone = zones[activeChip]
                  if (!zone) return null
                  return (
                    <ellipse cx={zone.cx} cy={zone.cy} rx={zone.rx + 2} ry={zone.ry + 2}
                      fill="transparent" stroke="rgba(201,168,76,0.5)" strokeWidth="0.3">
                      <animate attributeName="rx" values={`${zone.rx + 2};${zone.rx + 5};${zone.rx + 2}`} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="ry" values={`${zone.ry + 2};${zone.ry + 5};${zone.ry + 2}`} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.5s" repeatCount="indefinite" />
                    </ellipse>
                  )
                })()}
              </svg>
              {/* Active object label */}
              {activeChip !== null && (
                <div className="absolute pointer-events-none"
                  style={{
                    left: ["50%","50%","50%","80%"][activeChip],
                    top: ["35%","52%","8%","68%"][activeChip],
                    transform: "translate(-50%, -140%)",
                    animation: "fadeIn 150ms ease",
                  }}>
                  <div style={{ background: "rgba(9,24,41,0.9)", border: "1px solid rgba(201,168,76,0.5)", borderRadius: "6px", padding: "4px 10px", whiteSpace: "nowrap", backdropFilter: "blur(8px)" }}>
                    <span style={{ color: "#C9A84C", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
                      {["Smart TV","Soundbar","Smart Lighting","Gaming Setup"][activeChip]}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <span className="font-sans text-xs tracking-[0.3em] mb-4 block" style={{ color: "var(--cova-gold)" }}>SMART INTEGRATION</span>
              <h3 className="font-serif text-3xl md:text-4xl mb-6" style={{ color: "var(--cova-ivory)" }}>Your room. Intelligently equipped.</h3>
              <p className="font-sans text-base leading-relaxed mb-8" style={{ color: "var(--cova-muted)" }}>
                Tell Cova what tech you need. We design around it — optimal TV sizing, speaker placement for acoustics, lighting zones for every mood. Every item shoppable from Best Buy, Amazon, and B&H.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: "📺", title: "Smart TV", subtitle: "Optimized for your room" },
                  { icon: "🔊", title: "Soundbar", subtitle: "Placed for acoustics" },
                  { icon: "💡", title: "Smart Lighting", subtitle: "Zones for every mood" },
                  { icon: "🎮", title: "Gaming Setup", subtitle: "Configured for comfort" },
                ].map((chip, i) => (
                  <div key={i} className="p-5 rounded-xl flex flex-col gap-1.5 cursor-pointer"
                    style={{ background: activeChip === i ? "#112540" : "#0D2035", border: `1px solid ${activeChip === i ? "#C9A84C" : "rgba(201,168,76,0.15)"}`, boxShadow: activeChip === i ? "0 0 20px rgba(201,168,76,0.1)" : "none", transition: "all 250ms ease" }}
                    onMouseEnter={() => setActiveChip(i)} onMouseLeave={() => setActiveChip(null)}
                  >
                    <span className="text-xl mb-0.5">{chip.icon}</span>
                    <span className="font-sans text-sm font-semibold" style={{ color: activeChip === i ? "#F5F0E8" : "#C8C0B0" }}>{chip.title}</span>
                    <span className="font-sans text-xs" style={{ color: "#8A9BB5" }}>{chip.subtitle}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full h-px" style={{ background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2) 20%, rgba(201,168,76,0.2) 80%, transparent)" }} />

      {/* ── TRANSFORMATION GALLERY — SWIPEABLE CAROUSEL ── */}
      <section className="py-[100px]" style={{ background: "var(--cova-bg)" }}>
        <div className="text-center mb-16 px-6">
          <span className="font-sans text-xs tracking-[0.3em] mb-4 block" style={{ color: "var(--cova-gold)" }}>REAL TRANSFORMATIONS</span>
          <h2 className="font-serif text-4xl md:text-6xl" style={{ color: "var(--cova-ivory)" }}>Every room. Every style.</h2>
        </div>

        {(() => {
          const cards = [
            { room: "Living Room", style: "Warm Japandi", beforeBg: "#0A1520", afterBg: "#1A0E08", beforeAccent: "#1A2A3A", afterAccent: "#3D2010", afterAccent2: "#C9A84C" },
            { room: "Bedroom", style: "Organic Modern", beforeBg: "#0D1A28", afterBg: "#180E08", beforeAccent: "#1E3040", afterAccent: "#4A2A15", afterAccent2: "#C9A84C" },
            { room: "Home Office", style: "Nordic Minimal", beforeBg: "#0A1828", afterBg: "#0E1A10", beforeAccent: "#1A2A3A", afterAccent: "#1A3A20", afterAccent2: "#8BA870" },
            { room: "Dining Room", style: "Heritage Classic", beforeBg: "#0D1520", afterBg: "#1A100A", beforeAccent: "#1E2A3A", afterAccent: "#3A2010", afterAccent2: "#C9A84C" },
            { room: "Studio", style: "Cool Industrial", beforeBg: "#0A1018", afterBg: "#101820", beforeAccent: "#1A2030", afterAccent: "#2A3A50", afterAccent2: "#6496AA" },
            { room: "Living Room", style: "Coastal Luxe", beforeBg: "#0A1520", afterBg: "#0A1820", beforeAccent: "#1A2A3A", afterAccent: "#1A3A4A", afterAccent2: "#6AACCA" },
          ]

          const goTo = (idx: number) => setActiveCard(Math.max(0, Math.min(cards.length - 1, idx)))

          const renderCard = (card: typeof cards[0], i: number) => (
            <div key={i} className="w-full h-full rounded-2xl overflow-hidden relative" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              <div className="absolute inset-0 flex">
                {/* Before — grayscale */}
                <div className="w-1/2 h-full relative" style={{ background: card.beforeBg, filter: "grayscale(90%) brightness(0.75)" }}>
                  <svg viewBox="0 0 200 280" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                    <polygon points="0,180 200,180 180,280 20,280" fill={card.beforeAccent} opacity="0.6" />
                    <rect x="0" y="0" width="200" height="180" fill={card.beforeBg} />
                    <rect x="20" y="130" width="130" height="45" fill={card.beforeAccent} />
                    <rect x="25" y="124" width="35" height="10" fill={card.beforeAccent} opacity="0.8" />
                    <rect x="68" y="124" width="35" height="10" fill={card.beforeAccent} opacity="0.8" />
                    <rect x="111" y="124" width="35" height="10" fill={card.beforeAccent} opacity="0.8" />
                    <rect x="50" y="190" width="80" height="20" fill={card.beforeAccent} opacity="0.7" />
                    <rect x="120" y="30" width="60" height="70" fill="none" stroke={card.beforeAccent} strokeWidth="1" opacity="0.6" />
                    <line x1="150" y1="30" x2="150" y2="100" stroke={card.beforeAccent} strokeWidth="1" opacity="0.4" />
                    <line x1="120" y1="65" x2="180" y2="65" stroke={card.beforeAccent} strokeWidth="1" opacity="0.4" />
                    <circle cx="100" cy="20" r="8" fill={card.beforeAccent} opacity="0.5" />
                  </svg>
                  {/* Before label */}
                  <div className="absolute top-3 left-3">
                    <span className="font-sans text-[9px] tracking-[0.2em]" style={{ color: "rgba(200,192,176,0.6)" }}>BEFORE</span>
                  </div>
                </div>
                {/* Gold divider */}
                <div className="w-px h-full flex-shrink-0" style={{ background: "var(--cova-gold)" }} />
                {/* After — warm color */}
                <div className="w-1/2 h-full relative" style={{ background: card.afterBg }}>
                  <svg viewBox="0 0 200 280" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                    <defs>
                      <radialGradient id={`cg${i}`} cx="50%" cy="30%" r="60%">
                        <stop offset="0%" stopColor={`${card.afterAccent2}44`} />
                        <stop offset="100%" stopColor={`${card.afterAccent2}00`} />
                      </radialGradient>
                    </defs>
                    <polygon points="0,180 200,180 180,280 20,280" fill={card.afterAccent} opacity="0.5" />
                    <rect x="0" y="0" width="200" height="180" fill={card.afterBg} />
                    <circle cx="100" cy="30" r="80" fill={`url(#cg${i})`} />
                    <ellipse cx="100" cy="22" rx="6" ry="9" fill={card.afterAccent2} opacity="0.9" />
                    <path d="M20 130 Q20 124 28 120 L158 120 Q166 124 166 130 L166 175 L20 175 Z" fill={card.afterAccent} />
                    <line x1="60" y1="124" x2="60" y2="172" stroke={card.afterBg} strokeWidth="1" opacity="0.4" />
                    <line x1="100" y1="124" x2="100" y2="172" stroke={card.afterBg} strokeWidth="1" opacity="0.4" />
                    <line x1="138" y1="124" x2="138" y2="172" stroke={card.afterBg} strokeWidth="1" opacity="0.4" />
                    <rect x="155" y="140" width="12" height="30" fill={card.afterAccent2} rx="2" opacity="0.8" />
                    <polygon points="10,185 190,185 175,275 25,275" fill={card.afterAccent} opacity="0.3" />
                    <rect x="50" y="190" width="80" height="18" fill={card.afterAccent} rx="2" opacity="0.8" />
                    <rect x="120" y="30" width="60" height="70" fill={`${card.afterAccent2}15`} />
                    <rect x="120" y="30" width="60" height="70" fill="none" stroke={card.afterAccent} strokeWidth="1" opacity="0.5" />
                    <ellipse cx="178" cy="118" rx="12" ry="18" fill="#1A3010" opacity="0.8" />
                    <rect x="20" y="40" width="45" height="32" fill={card.afterAccent} stroke={card.afterAccent2} strokeWidth="1" opacity="0.7" />
                  </svg>
                  {/* After label */}
                  <div className="absolute top-3 right-3">
                    <span className="font-sans text-[9px] tracking-[0.2em]" style={{ color: card.afterAccent2, opacity: 0.8 }}>AFTER</span>
                  </div>
                </div>
              </div>
              {/* Bottom gradient + labels */}
              <div className="absolute inset-0" style={{ background: "linear-gradient(transparent 50%, rgba(9,24,41,0.96))" }} />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                <div>
                  <span className="inline-block px-3 py-1 rounded text-[10px] font-sans font-semibold mb-2" style={{ background: "var(--cova-gold)", color: "var(--cova-bg)" }}>{card.style}</span>
                  <p className="text-sm font-sans" style={{ color: "var(--cova-muted)" }}>{card.room}</p>
                </div>
                <div className="text-right">
                  <p className="font-sans text-xs" style={{ color: "var(--cova-subtle)" }}>{i + 1} / {cards.length}</p>
                </div>
              </div>
            </div>
          )

          return (
            <div className="max-w-5xl mx-auto px-6">
              {/* Thumbnail strip — ABOVE the main card */}
              <div className="flex gap-3 mb-6 justify-center overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {cards.map((card, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className="flex-shrink-0 transition-all duration-200"
                    style={{
                      width: "88px",
                      height: "60px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      border: `2px solid ${i === activeCard ? "#C9A84C" : "rgba(201,168,76,0.12)"}`,
                      opacity: i === activeCard ? 1 : 0.45,
                      cursor: "pointer",
                      background: card.afterBg,
                      padding: 0,
                      transform: i === activeCard ? "scale(1.08)" : "scale(1)",
                      boxShadow: i === activeCard ? "0 0 16px rgba(201,168,76,0.3)" : "none",
                    }}
                  >
                    <div className="w-full h-full flex">
                      <div className="w-1/2 h-full" style={{ background: card.beforeBg, filter: "grayscale(90%) brightness(0.7)" }} />
                      <div className="w-px h-full flex-shrink-0" style={{ background: "#C9A84C", opacity: 0.7 }} />
                      <div className="w-1/2 h-full" style={{ background: card.afterBg }} />
                    </div>
                  </button>
                ))}
              </div>

              {/* Main card — taller */}
              <div
                className="relative select-none"
                onMouseDown={(e) => setCardDragStart(e.clientX)}
                onMouseUp={(e) => {
                  if (cardDragStart === null) return
                  const diff = e.clientX - cardDragStart
                  if (diff < -40) goTo(activeCard + 1)
                  else if (diff > 40) goTo(activeCard - 1)
                  setCardDragStart(null)
                }}
                onTouchStart={(e) => setCardDragStart(e.touches[0].clientX)}
                onTouchEnd={(e) => {
                  if (cardDragStart === null) return
                  const diff = e.changedTouches[0].clientX - cardDragStart
                  if (diff < -40) goTo(activeCard + 1)
                  else if (diff > 40) goTo(activeCard - 1)
                  setCardDragStart(null)
                }}
                style={{ height: "560px", cursor: "grab", userSelect: "none" }}
              >
                <div
                  className="absolute inset-0"
                  style={{ transition: "opacity 300ms ease" }}
                >
                  {renderCard(cards[activeCard], activeCard)}
                </div>

                {/* Left arrow */}
                <button
                  onClick={() => goTo(activeCard - 1)}
                  disabled={activeCard === 0}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 z-10"
                  style={{
                    background: "rgba(9,24,41,0.7)",
                    border: `1px solid ${activeCard === 0 ? "rgba(201,168,76,0.1)" : "rgba(201,168,76,0.5)"}`,
                    color: activeCard === 0 ? "var(--cova-subtle)" : "var(--cova-gold)",
                    cursor: activeCard === 0 ? "not-allowed" : "pointer",
                    backdropFilter: "blur(8px)",
                  }}
                >←</button>

                {/* Right arrow */}
                <button
                  onClick={() => goTo(activeCard + 1)}
                  disabled={activeCard === cards.length - 1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 z-10"
                  style={{
                    background: "rgba(9,24,41,0.7)",
                    border: `1px solid ${activeCard === cards.length - 1 ? "rgba(201,168,76,0.1)" : "rgba(201,168,76,0.5)"}`,
                    color: activeCard === cards.length - 1 ? "var(--cova-subtle)" : "var(--cova-gold)",
                    cursor: activeCard === cards.length - 1 ? "not-allowed" : "pointer",
                    backdropFilter: "blur(8px)",
                  }}
                >→</button>
              </div>

              {/* Dot indicators — BELOW the main card */}
              <div className="flex justify-center gap-2 mt-6">
                {cards.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    style={{
                      width: i === activeCard ? "28px" : "8px",
                      height: "8px",
                      borderRadius: "4px",
                      background: i === activeCard ? "var(--cova-gold)" : "rgba(201,168,76,0.2)",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "all 300ms ease",
                    }}
                  />
                ))}
              </div>
            </div>
          )

        })()}
      </section>

      <div className="w-full h-px" style={{ background: "linear-gradient(to right, transparent, rgba(201,168,76,0.2) 20%, rgba(201,168,76,0.2) 80%, transparent)" }} />

      {/* ── FINAL CTA ── */}
      <section className="h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "var(--cova-bg)" }}>
        <canvas ref={ctaCanvasRef} className="absolute inset-0 pointer-events-none" />
        <div className="relative z-10 text-center px-6">
          <span className="font-sans text-sm tracking-[0.3em] mb-6 block" style={{ color: "var(--cova-gold)" }}>READY?</span>
          <h2 className="font-serif text-4xl md:text-7xl lg:text-8xl mb-10 leading-tight" style={{ color: "var(--cova-ivory)" }}>
            What could your room look like?
          </h2>
          <button onClick={handleCTAClick} className="px-14 py-5 text-lg font-semibold rounded-lg transition-all duration-200 hover:-translate-y-1 hover:bg-[#D4B460]"
            style={{ background: "#C9A84C", color: "#091829", border: "none", boxShadow: "0 0 60px rgba(201,168,76,0.35)" }}>
            Design My Room →
          </button>
          <p className="mt-6 text-sm" style={{ color: "var(--cova-subtle)" }}>No design experience needed</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-10" style={{ background: "var(--cova-bg)", borderTop: "1px solid rgba(201,168,76,0.1)" }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-sans text-sm tracking-[0.15em] font-light" style={{ color: "#F5F0E8" }}>COVA</span>
            <span style={{ color: "#4A5E7A" }}>·</span>
            <span className="font-sans text-xs" style={{ color: "#8A9BB5" }}>© 2025 Cova. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="font-sans text-xs transition-colors duration-200 hover:text-[#F5F0E8]" style={{ color: "#4A5E7A" }}>Privacy</a>
            <a href="#" className="font-sans text-xs transition-colors duration-200 hover:text-[#F5F0E8]" style={{ color: "#4A5E7A" }}>Terms</a>
          </div>
        </div>
      </footer>
    </>
  )
}
