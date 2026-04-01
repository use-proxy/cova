"use client"

import { useState, useRef, useEffect, useCallback } from "react"

// Scroll animation hook
function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

// Animated counter hook
function useCountUp(end: number, duration: number = 2000, isVisible: boolean) {
  const [count, setCount] = useState(0)
  const countRef = useRef(0)

  useEffect(() => {
    if (!isVisible) return
    
    const startTime = Date.now()
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      countRef.current = Math.floor(eased * end)
      setCount(countRef.current)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [end, duration, isVisible])

  return count
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--navy-darker)]">
      <Nav />
      <Hero />
      <DemoVideo />
      <Interactive3DRoom />
      <ProcessSteps />
      <BeforeAfter />
      <Testimonials />
      <Stats />
      <Footer />
    </main>
  )
}

// Navigation - just wordmark + one gold button
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-12 py-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <a 
          href="/" 
          className="text-[var(--ivory)] font-serif text-2xl tracking-wide lowercase"
        >
          cova
        </a>
        
        <button className="bg-[var(--gold-primary)] text-[var(--navy-darker)] px-6 py-2.5 text-sm font-serif tracking-wider uppercase transition-all duration-300 hover:bg-[var(--gold-light)] hover:shadow-[0_0_30px_rgba(201,168,76,0.3)] flex items-center justify-center">
          <span className="hidden md:inline">Get Early Access</span>
          <span className="md:hidden text-lg">&#8594;</span>
        </button>
      </div>
    </nav>
  )
}

// Hero Section - Headline, subtext, CTAs
function Hero() {
  const { ref, isVisible } = useScrollAnimation()

  return (
    <section ref={ref} className="pt-32 md:pt-40 pb-8 px-6 md:px-12">
      <div className="max-w-4xl mx-auto text-center">
        {/* Eyebrow */}
        <p 
          className={`text-[var(--gold-primary)] font-serif italic text-sm tracking-[0.3em] uppercase mb-6 transition-all duration-700 ${
            isVisible ? 'opacity-70 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          AI-Powered Interior Design
        </p>
        
        {/* Headline */}
        <h1 
          className={`font-serif text-[var(--ivory)] text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-[1.1] tracking-tight text-balance mb-6 transition-all duration-700 delay-[60ms] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          Reimagine your space in <span className="italic text-[var(--gold-primary)]">seconds</span>.
        </h1>
        
        {/* Subtext */}
        <p 
          className={`font-serif text-[var(--ivory)]/60 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10 transition-all duration-700 delay-[120ms] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          Upload a photo, get matched to a style, and watch AI transform your room with shoppable furniture from the world&apos;s best retailers.
        </p>
        
        {/* CTA Buttons */}
        <div 
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-[180ms] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <button className="bg-[var(--gold-primary)] text-[var(--navy-darker)] px-8 py-3.5 font-serif text-sm tracking-wider uppercase transition-all duration-300 hover:bg-[var(--gold-light)] hover:shadow-[0_0_40px_rgba(201,168,76,0.3)]">
            Start Designing Free
          </button>
          <button className="border border-[var(--gold-primary)]/40 text-[var(--ivory)] px-8 py-3.5 font-serif text-sm tracking-wider uppercase transition-all duration-300 hover:border-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/5">
            See How It Works
          </button>
        </div>
      </div>
    </section>
  )
}

// Demo Video Section - Full-width autoplay placeholder
function DemoVideo() {
  const { ref, isVisible } = useScrollAnimation()

  return (
    <section ref={ref} className="py-12 md:py-16 px-6 md:px-12">
      <div className="max-w-[960px] mx-auto">
        {/* Video Container */}
        <div 
          className={`relative aspect-video rounded-sm overflow-hidden transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ 
            border: '1px solid rgba(201, 168, 76, 0.25)',
            animation: 'borderGlow 3s ease-in-out infinite'
          }}
        >
          {/* Dark Placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1520] via-[#0d1a28] to-[#091520]">
            {/* Subtle grid pattern */}
            <div 
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: 'linear-gradient(rgba(201, 168, 76, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(201, 168, 76, 0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px'
              }}
            />
          </div>
          
          {/* Play Icon and Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Demo Coming Soon Label */}
            <p className="absolute top-8 font-serif text-[var(--gold-primary)] text-[10px] tracking-[0.4em] uppercase">
              Demo Coming Soon
            </p>
            
            <div className="relative">
              {/* Pulse rings */}
              <div className="absolute inset-0 -m-4 rounded-full border border-[var(--gold-primary)]/30 animate-[pulse_2s_ease-in-out_infinite]" />
              <div className="absolute inset-0 -m-8 rounded-full border border-[var(--gold-primary)]/20 animate-[pulse_2s_ease-in-out_infinite_0.5s]" />
              
              {/* Play button with CSS triangle */}
              <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-[var(--gold-primary)] flex items-center justify-center bg-[var(--navy-darker)]/80 backdrop-blur-sm cursor-pointer transition-all duration-300 hover:bg-[var(--gold-primary)]/10 hover:scale-105">
                {/* CSS Triangle Play Icon */}
                <div 
                  className="ml-1"
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '12px solid transparent',
                    borderBottom: '12px solid transparent',
                    borderLeft: '20px solid var(--gold-primary)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Caption */}
        <p 
          className={`text-center mt-6 text-[var(--ivory)]/40 uppercase tracking-[0.25em] transition-all duration-700 delay-[60ms] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ fontSize: '0.65rem' }}
        >
          30 seconds. Real furniture. Real prices.
        </p>
      </div>
      
      {/* Keyframes for border glow */}
      <style jsx>{`
        @keyframes borderGlow {
          0%, 100% {
            box-shadow: 0 0 10px rgba(201, 168, 76, 0.1), inset 0 0 10px rgba(201, 168, 76, 0.05);
          }
          50% {
            box-shadow: 0 0 25px rgba(201, 168, 76, 0.25), inset 0 0 15px rgba(201, 168, 76, 0.1);
          }
        }
      `}</style>
    </section>
  )
}

// Interactive 3D Room Section
function Interactive3DRoom() {
  const [activeHotspot, setActiveHotspot] = useState<string | null>('sofa')
  const { ref, isVisible } = useScrollAnimation()
  
  const hotspots = [
    { 
      id: 'sofa', 
      name: 'Linen Sofa', 
      price: '$649', 
      retailer: 'Wayfair',
      position: { left: '25%', top: '58%' }
    },
    { 
      id: 'lamp', 
      name: 'Arc Floor Lamp', 
      price: '$289', 
      retailer: 'West Elm',
      position: { left: '70%', top: '35%' }
    },
    { 
      id: 'table', 
      name: 'Walnut Side Table', 
      price: '$199', 
      retailer: 'CB2',
      position: { left: '55%', top: '62%' }
    }
  ]

  return (
    <section ref={ref} className="py-24 md:py-32 bg-[#0B1F3A]">
      <div className="px-6 md:px-12">
        <div className="max-w-[1060px] mx-auto">
          {/* Eyebrow */}
          <p 
            className={`text-[var(--gold-primary)] font-serif italic text-sm tracking-widest uppercase mb-4 text-center opacity-70 transition-all duration-700 ${
              isVisible ? 'translate-y-0' : 'translate-y-6 !opacity-0'
            }`}
          >
            Explore the space
          </p>
          
          {/* Headline */}
          <h2 
            className={`font-serif text-[var(--ivory)] text-3xl md:text-4xl lg:text-5xl leading-tight tracking-tight text-center mb-12 transition-all duration-700 delay-[60ms] ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            Step inside a <span className="italic text-[var(--gold-primary)]">redesigned</span> room.
          </h2>
          
          {/* 3D Room Container */}
          <div 
            className={`relative aspect-video rounded-sm overflow-hidden transition-all duration-700 delay-[120ms] ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
            style={{ border: '1px solid rgba(201, 168, 76, 0.2)' }}
          >
            {/* Room Illustration */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f33] to-[#0a1828]">
              {/* Back wall */}
              <div className="absolute inset-[8%] bg-gradient-to-b from-[#0f2540] to-[#0c1d30]">
                {/* Window */}
                <div className="absolute top-[10%] left-[15%] w-[25%] h-[40%] border border-[var(--gold-primary)]/20 bg-gradient-to-b from-[rgba(201,168,76,0.03)] to-transparent">
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                    <div className="border-r border-b border-[var(--gold-primary)]/10" />
                    <div className="border-b border-[var(--gold-primary)]/10" />
                    <div className="border-r border-[var(--gold-primary)]/10" />
                    <div />
                  </div>
                </div>
                
                {/* Art frame */}
                <div className="absolute top-[15%] right-[15%] w-[20%] h-[30%] border border-[var(--gold-primary)]/25 bg-[#0a1520]" />
              </div>
              
              {/* Floor with perspective */}
              <div 
                className="absolute bottom-0 left-0 right-0 h-[40%]"
                style={{
                  background: 'linear-gradient(to bottom, #0a1520, #080f18)',
                  transform: 'perspective(600px) rotateX(20deg)',
                  transformOrigin: 'bottom'
                }}
              />
              
              {/* Furniture - Sofa */}
              <div className="absolute bottom-[22%] left-[12%] w-[32%] h-[18%] bg-gradient-to-b from-[#1a3050] to-[#142538] rounded-lg shadow-2xl">
                <div className="absolute top-0 left-[5%] right-[5%] h-[60%] bg-[#1d3555] rounded-t-md" />
                <div className="absolute bottom-0 left-0 w-[8%] h-[15%] bg-[#0a1520] rounded-sm" />
                <div className="absolute bottom-0 right-0 w-[8%] h-[15%] bg-[#0a1520] rounded-sm" />
              </div>
              
              {/* Furniture - Floor Lamp */}
              <div className="absolute bottom-[22%] right-[18%] w-[3%] h-[45%]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[180%] h-[25%] bg-gradient-to-b from-[var(--gold-primary)]/20 to-transparent rounded-full" />
                <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full h-[80%] bg-[#1a2a3a]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150%] h-[5%] bg-[#0f1f2f] rounded-full" />
              </div>
              
              {/* Furniture - Side Table */}
              <div className="absolute bottom-[22%] left-[48%] w-[12%] h-[12%]">
                <div className="absolute top-0 left-[10%] right-[10%] h-[30%] bg-[#2a4055] rounded-sm" />
                <div className="absolute top-[25%] left-[20%] right-[20%] h-[75%] bg-[#1d3045]" />
              </div>
              
              {/* Rug */}
              <div className="absolute bottom-[18%] left-[20%] w-[35%] h-[8%] bg-[#12202f] rounded-sm opacity-80" />
              
              {/* Plant */}
              <div className="absolute bottom-[22%] left-[8%] w-[6%] h-[20%]">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[30%] bg-[#1a2838] rounded-sm" />
                <div className="absolute bottom-[25%] left-1/2 -translate-x-1/2 w-[150%] h-[80%] bg-[#0d2520] rounded-full opacity-70" />
              </div>
              
              {/* Ambient light glow */}
              <div className="absolute top-[10%] right-[25%] w-40 h-40 rounded-full bg-[var(--gold-primary)] opacity-[0.04] blur-3xl" />
            </div>
            
            {/* Hotspots */}
            {hotspots.map((hotspot) => (
              <div 
                key={hotspot.id}
                className="absolute z-10"
                style={{ left: hotspot.position.left, top: hotspot.position.top }}
                onMouseEnter={() => setActiveHotspot(hotspot.id)}
                onMouseLeave={() => setActiveHotspot(hotspot.id === 'sofa' ? 'sofa' : null)}
              >
                {/* Pulsing dot */}
                <div className="relative cursor-pointer">
                  <div className="w-4 h-4 rounded-full bg-[var(--gold-primary)] shadow-[0_0_20px_rgba(201,168,76,0.6)]">
                    <div className="absolute inset-0 rounded-full bg-[var(--gold-primary)] animate-ping opacity-40" />
                  </div>
                  
                  {/* Tooltip Card */}
                  {activeHotspot === hotspot.id && (
                    <div 
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 min-w-[180px] md:min-w-[220px] bg-[#0B1F3A]/95 backdrop-blur-md rounded-sm p-3 md:p-4 shadow-2xl"
                      style={{ 
                        border: '1px solid rgba(201, 168, 76, 0.12)',
                        boxShadow: 'inset 0 1px 1px rgba(245, 240, 232, 0.03), 0 20px 40px -10px rgba(0, 0, 0, 0.5)'
                      }}
                    >
                      <p className="font-serif text-[var(--ivory)] text-sm md:text-base">{hotspot.name}</p>
                      <p className="font-serif text-[var(--gold-primary)] text-lg md:text-xl mt-1">{hotspot.price}</p>
                      <p className="text-[var(--ivory)]/50 text-xs mt-1">{hotspot.retailer}</p>
                      {hotspot.id === 'sofa' && (
                        <a 
                          href="#" 
                          className="mt-3 inline-flex items-center gap-1 text-[var(--gold-primary)] font-serif text-xs tracking-wider uppercase hover:underline"
                        >
                          Buy on Wayfair <span>&#8594;</span>
                        </a>
                      )}
                      {/* Arrow pointing down */}
                      <div 
                        className="absolute top-full left-1/2 -translate-x-1/2"
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: '6px solid rgba(201, 168, 76, 0.12)'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Feature Pills */}
          <div 
            className={`flex flex-wrap items-center justify-center gap-3 md:gap-4 mt-8 transition-all duration-700 delay-[180ms] ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            {['Photorealistic 3D', 'Hotspot Shopping', '15,000+ Products'].map((pill, i) => (
              <span 
                key={pill}
                className="px-4 py-2 text-[var(--ivory)] font-serif text-xs uppercase tracking-[0.12em] bg-[var(--navy-darker)] rounded-sm"
                style={{ 
                  border: '1px solid rgba(201, 168, 76, 0.3)',
                  transitionDelay: `${180 + i * 60}ms`
                }}
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// Process steps - 3 column grid with 01/02/03
function ProcessSteps() {
  const { ref, isVisible } = useScrollAnimation()
  
  const steps = [
    { number: "01", title: "Capture", description: "Upload a photo of any room in your home." },
    { number: "02", title: "Imagine", description: "Swipe through AI-generated design concepts." },
    { number: "03", title: "Transform", description: "Shop your favorites with one tap." }
  ]

  return (
    <section ref={ref} className="py-32 px-6 md:px-12">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {steps.map((step, index) => (
            <div 
              key={step.number}
              className={`relative py-12 md:py-16 px-8 md:px-12 transition-all duration-700 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              } ${
                index !== steps.length - 1 
                  ? 'md:border-r border-b md:border-b-0 border-[var(--gold-primary)]/20' 
                  : ''
              }`}
              style={{ transitionDelay: `${index * 60}ms` }}
            >
              <span className="font-serif text-6xl md:text-7xl text-[var(--gold-primary)]/20 tracking-tight">
                {step.number}
              </span>
              
              <h3 className="font-serif text-2xl md:text-3xl text-[var(--ivory)] mt-6 mb-4 tracking-wide">
                {step.title}
              </h3>
              
              <p className="text-[var(--ivory)]/60 font-serif text-base leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Before/After with clip-path reveal
function BeforeAfter() {
  const [revealPosition, setRevealPosition] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const { ref, isVisible } = useScrollAnimation()

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.min(Math.max((x / rect.width) * 100, 5), 95)
    setRevealPosition(percentage)
  }

  return (
    <section ref={ref} className="py-24 md:py-32">
      <div 
        className={`w-full bg-[var(--navy-darker)] transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <div 
          ref={containerRef}
          className="relative w-full aspect-[16/7] md:aspect-[21/9] cursor-ew-resize select-none overflow-hidden"
          onMouseMove={(e) => handleMove(e.clientX)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        >
          {/* Before Panel */}
          <div 
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - revealPosition}% 0 0)` }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a1520] via-[#0d1a28] to-[#091520]">
              <div className="absolute inset-0">
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#080f18] to-transparent" />
                <div className="absolute bottom-[15%] left-[10%] w-[30%] h-[25%] bg-[#0c1822] rounded-sm opacity-80" />
                <div className="absolute bottom-[15%] right-[15%] w-[20%] h-[40%] bg-[#0a1520] rounded-sm opacity-70" />
                <div className="absolute bottom-[15%] left-[50%] w-[15%] h-[20%] bg-[#0d1925] rounded-full opacity-60" />
                <div className="absolute top-[15%] left-[20%] w-[25%] h-[35%] border border-[#1a2a3a] bg-[#0c1620]/50" />
              </div>
            </div>
            <div className="absolute top-8 left-8 md:top-12 md:left-12">
              <span className="font-serif text-[var(--gold-primary)] text-sm tracking-[0.3em] uppercase">
                Before
              </span>
            </div>
          </div>
          
          {/* After Panel */}
          <div 
            className="absolute inset-0"
            style={{ clipPath: `inset(0 0 0 ${revealPosition}%)` }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f33] via-[#0f2540] to-[#0a1828]">
              <div className="absolute inset-0">
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[rgba(201,168,76,0.05)] to-transparent" />
                <div className="absolute bottom-[15%] left-[10%] w-[28%] h-[22%] bg-[#142538] rounded-lg opacity-90 shadow-2xl" />
                <div className="absolute bottom-[15%] right-[12%] w-[18%] h-[45%] bg-[#0f1f30] rounded-lg opacity-85 shadow-2xl" />
                <div className="absolute bottom-[15%] left-[48%] w-[18%] h-[18%] bg-[#132030] rounded-full opacity-75 shadow-xl" />
                <div className="absolute top-[15%] left-[20%] w-[25%] h-[35%] border border-[var(--gold-primary)]/30 bg-gradient-to-b from-[rgba(201,168,76,0.08)] to-transparent rounded-sm" />
                <div className="absolute top-[10%] right-[30%] w-40 h-40 rounded-full bg-[var(--gold-primary)] opacity-[0.04] blur-3xl" />
                <div className="absolute bottom-[20%] left-[40%] w-32 h-32 rounded-full bg-[var(--gold-light)] opacity-[0.03] blur-2xl" />
              </div>
            </div>
            <div className="absolute top-8 right-8 md:top-12 md:right-12">
              <span className="font-serif text-[var(--gold-primary)] text-sm tracking-[0.3em] uppercase">
                After
              </span>
            </div>
          </div>
          
          {/* Divider Line */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-[var(--gold-primary)] shadow-[0_0_20px_rgba(201,168,76,0.5)]"
            style={{ left: `${revealPosition}%` }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 border-[var(--gold-primary)] bg-[var(--navy-darker)] flex items-center justify-center shadow-lg">
              <div className="flex items-center gap-0.5">
                <svg className="w-3 h-3 text-[var(--gold-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <svg className="w-3 h-3 text-[var(--gold-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Testimonials - Draggable horizontal scroll
function Testimonials() {
  const { ref, isVisible } = useScrollAnimation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const testimonials = [
    { quote: "I redesigned my entire living room in a lunch break.", author: "Sarah K.", location: "Brooklyn" },
    { quote: "The 3D viewer is unlike anything I've seen from a design tool.", author: "James T.", location: "Austin" },
    { quote: "Bought two pieces directly from the app. Arrived exactly as rendered.", author: "Priya M.", location: "SF" }
  ]

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setScrollLeft(scrollRef.current.scrollLeft)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    scrollRef.current.scrollLeft = scrollLeft - walk
  }, [isDragging, startX, scrollLeft])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!scrollRef.current) return
    setStartX(e.touches[0].pageX - scrollRef.current.offsetLeft)
    setScrollLeft(scrollRef.current.scrollLeft)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!scrollRef.current) return
    const x = e.touches[0].pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    scrollRef.current.scrollLeft = scrollLeft - walk
  }, [startX, scrollLeft])

  return (
    <section ref={ref} className="py-16 md:py-20 overflow-hidden">
      <div 
        ref={scrollRef}
        className={`flex gap-6 px-6 md:px-12 overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {testimonials.map((testimonial, index) => (
          <div 
            key={index}
            className="flex-shrink-0 w-[320px] md:w-[400px] bg-[#0B1F3A] rounded-sm p-6 md:p-8 select-none"
            style={{ 
              border: '1px solid rgba(201, 168, 76, 0.12)',
              transitionDelay: `${index * 60}ms`
            }}
          >
            <p className="font-serif text-[var(--ivory)] text-base md:text-lg leading-relaxed italic mb-6">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
            <p className="font-serif text-[var(--gold-primary)] text-sm">
              {testimonial.author}, <span className="text-[var(--ivory)]/50">{testimonial.location}</span>
            </p>
          </div>
        ))}
      </div>
      
      {/* Hide scrollbar styles */}
      <style jsx>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  )
}

// Stats row - 4 metrics with gold labels and count-up animation
function Stats() {
  const { ref, isVisible } = useScrollAnimation()
  
  const stats = [
    { value: 30, suffix: "s", label: "Time to first render" },
    { value: 40, suffix: "+", label: "Design styles" },
    { value: 3, suffix: "", label: "Retailers connected" },
    { value: 0, prefix: "$", suffix: "", label: "To get started" }
  ]

  return (
    <section ref={ref} className="py-24 md:py-32 px-6 md:px-12 border-t border-b border-[var(--gold-primary)]/10">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8">
          {stats.map((stat, index) => (
            <StatItem 
              key={stat.label} 
              stat={stat} 
              isVisible={isVisible} 
              delay={index * 60}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function StatItem({ 
  stat, 
  isVisible, 
  delay 
}: { 
  stat: { value: number; suffix: string; prefix?: string; label: string; isDecimal?: boolean }
  isVisible: boolean
  delay: number
}) {
  const count = useCountUp(stat.isDecimal ? stat.value * 10 : stat.value, 2000, isVisible)
  const displayValue = stat.isDecimal ? (count / 10).toFixed(1) : count

  return (
    <div 
      className={`text-center transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="font-serif text-4xl md:text-5xl lg:text-6xl text-[var(--ivory)] tracking-tight">
        {stat.prefix}{displayValue}{stat.suffix}
      </span>
      <p className="font-serif text-[var(--gold-primary)] text-xs md:text-sm tracking-[0.2em] uppercase mt-4">
        {stat.label}
      </p>
    </div>
  )
}

// Footer - just headline and CTA
function Footer() {
  const { ref, isVisible } = useScrollAnimation()

  return (
    <footer ref={ref} className="py-32 md:py-40 px-6 md:px-12">
      <div className="max-w-4xl mx-auto text-center">
        <h2 
          className={`font-serif text-[var(--ivory)] text-3xl md:text-5xl lg:text-6xl leading-tight tracking-tight text-balance mb-8 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          Your dream space is one swipe away.
        </h2>
        
        <div 
          className={`w-16 h-px bg-[var(--gold-primary)] mx-auto mb-12 transition-all duration-700 delay-[60ms] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        />
        
        <button 
          className={`bg-[var(--gold-primary)] text-[var(--navy-darker)] px-10 py-4 font-serif text-sm tracking-wider uppercase transition-all duration-300 hover:bg-[var(--gold-light)] hover:shadow-[0_0_50px_rgba(201,168,76,0.3)] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ transitionDelay: '120ms' }}
        >
          Start Designing
        </button>
        
        <p 
          className={`font-serif text-[var(--ivory)]/30 text-xs tracking-wider mt-24 transition-all duration-700 delay-[180ms] ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          © 2024 Cova. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
