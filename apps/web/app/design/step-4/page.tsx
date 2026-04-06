"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useFingerprintStore } from "@/lib/store"
import { useSessionStore } from "@/lib/store/session"
import { StepIndicator } from "@/components/cova/StepIndicator"
import { createBrowserClient } from "@/lib/supabase/client"

const axisLabels = ["Luminosity", "Temperature", "Form", "Texture", "Nature", "Scale"]
const adjustChips = ["Warmer", "Cooler", "More minimal", "More layered", "More modern", "More classic"]

// Fallback palette derived from fingerprint values
function derivepalette(fp: number[]): string[] {
  const warm = fp[2] > 0.5 // temperature
  const bright = fp[0] > 0.5 // luminosity
  if (warm && bright) return ["#C9A84C", "#D4956A", "#8B6914", "#F5E6C8", "#3D2010"]
  if (warm && !bright) return ["#8B6914", "#5C3D1A", "#3D2010", "#C9A84C", "#1A0E08"]
  if (!warm && bright) return ["#8A9BB5", "#6A8AA0", "#4A6E8A", "#F5F0E8", "#1A2A3A"]
  return ["#4A5E7A", "#2A3A4A", "#1A2A3A", "#8A9BB5", "#091829"]
}

// mock data for palette animation (uses derived palette length)
const mockData = { palette: [1, 2, 3, 4, 5] }

export default function Step4Page() {
  const router = useRouter()
  const { setStep } = useSessionStore()

  // Read fingerprint from Zustand store (set by Step 3 quiz)
  const { fingerprint: storedFingerprint, styleName: storedStyleName, roomType, budgetTier, showcasePredictionIds, setShowcasePredictionIds, setFingerprint: setStoreFingerprint } = useFingerprintStore()

  // Fall back to mock if store empty (direct navigation in dev)
  const [fingerprint, setFingerprint] = useState<number[]>(
    storedFingerprint ?? [0.7, 0.3, 0.8, 0.7, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5]
  )
  const [styleName] = useState(storedStyleName ?? "Warm Artisan")
  const [styleChips] = useState<string[]>([
    "organic textures", "warm neutrals", "minimal layers", "natural materials"
  ])
  const palette = derivepalette(fingerprint)

  // Showcase images — populated from anchor_renders table (url + label)
  const [showcaseImages, setShowcaseImages] = useState<Array<{ url: string; label: string } | null>>([null, null, null])

  const [phase, setPhase] = useState<1 | 2>(1)
  const [irisOpen, setIrisOpen] = useState(false)
  const [gridVisible, setGridVisible] = useState(false)
  const [axesDrawn, setAxesDrawn] = useState<boolean[]>([false, false, false, false, false, false])
  const [shapeDrawn, setShapeDrawn] = useState(false)
  const [verticesVisible, setVerticesVisible] = useState<boolean[]>([false, false, false, false, false, false])
  const [labelsVisible, setLabelsVisible] = useState(false)
  const [typedName, setTypedName] = useState("")
  const [showCursor, setShowCursor] = useState(false)
  const [paletteVisible, setPaletteVisible] = useState<boolean[]>([false, false, false, false, false])
  const [chipsVisible, setChipsVisible] = useState<boolean[]>([false, false, false, false])
  const [showAdjustPanel, setShowAdjustPanel] = useState(false)
  const [adjustText, setAdjustText] = useState("")
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [cardsLoaded, setCardsLoaded] = useState([false, false, false])
  const [dividerDrawn, setDividerDrawn] = useState(false)
  const [phase2ContentVisible, setPhase2ContentVisible] = useState(false)
  const [cardsVisible, setCardsVisible] = useState([false, false, false])
  const [feelRightVisible, setFeelRightVisible] = useState(false)

  const phase2Ref = useRef<HTMLDivElement>(null)

  // Load showcase images: poll predictions from store, fallback to anchor_renders
  useEffect(() => {
    const pendingIds = showcasePredictionIds

    if (!pendingIds || pendingIds.length === 0) {
      // No predictions fired — load from anchor_renders directly
      void (async () => {
        try {
          const supabase = createBrowserClient()
          const normalizedRoomType = (roomType ?? 'living_room').replace(/-/g, '_').toLowerCase()
          const { data, error } = await supabase
            .from('anchor_renders')
            .select('image_url, label')
            .eq('room_type', normalizedRoomType)
            .limit(3)
          if (error || !data || data.length === 0) {
            const { data: fallback } = await supabase
              .from('anchor_renders')
              .select('image_url, label')
              .limit(3)
            if (fallback && fallback.length > 0) {
              setShowcaseImages(fallback.map((r: { image_url: string; label: string | null }) => ({ url: r.image_url, label: r.label ?? 'Room' })))
              setCardsLoaded([true, true, true])
            }
            return
          }
          setShowcaseImages(data.map((r: { image_url: string; label: string | null }) => ({ url: r.image_url, label: r.label ?? 'Room' })))
          setCardsLoaded([true, true, true])
        } catch { /* shimmer stays */ }
      })()
      return
    }

    // Poll each prediction — update card as it resolves
    const pollOne = async (predictionId: string, index: number, label: string) => {
      const maxAttempts = 30 // 90s max
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise<void>(r => setTimeout(r, 3000))
        try {
          const res = await fetch(
            `/api/render/status?prediction_id=${predictionId}&showcase_mode=true`,
            { credentials: 'include' }
          )
          if (res.ok) {
            const d = await res.json() as { status: string; render_url?: string }
            if (d.status === 'complete' && d.render_url) {
              setShowcaseImages(prev => { const next = [...prev]; next[index] = { url: d.render_url!, label }; return next })
              setCardsLoaded(prev => { const next = [...prev]; next[index] = true; return next })
              return
            }
            if (d.status === 'failed') break
          }
        } catch { /* keep polling */ }
      }
      // Timed out or failed — mark card loaded so user isn't stuck
      setCardsLoaded(prev => { const next = [...prev]; next[index] = true; return next })
    }

    // Clear stored IDs so a refresh doesn't re-poll stale predictions
    setShowcasePredictionIds(null)

    pendingIds.forEach((item, i) => {
      void pollOne(item.predictionId, i, item.label)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 1 animation sequence
  useEffect(() => {
    // t=200ms: Iris opens
    const t1 = setTimeout(() => setIrisOpen(true), 200)
    // t=400ms: Grid fades in
    const t2 = setTimeout(() => setGridVisible(true), 400)
    // t=600ms: Axes extend one by one
    const t3 = setTimeout(() => {
      axisLabels.forEach((_, i) => {
        setTimeout(() => {
          setAxesDrawn((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * 80)
      })
    }, 600)
    // t=1100ms: Shape traces
    const t4 = setTimeout(() => setShapeDrawn(true), 1100)
    // t=1900ms: Vertices appear
    const t5 = setTimeout(() => {
      axisLabels.forEach((_, i) => {
        setTimeout(() => {
          setVerticesVisible((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * 60)
      })
    }, 1900)
    // t=2300ms: Labels fade in
    const t6 = setTimeout(() => setLabelsVisible(true), 2300)
    // t=2800ms: "Your Design DNA" types in (style name never shown per Rule 8)
    const TYPING_TEXT = "Your Design DNA"
    const t7 = setTimeout(() => {
      setShowCursor(true)
      let i = 0
      const typeInterval = setInterval(() => {
        if (i < TYPING_TEXT.length) {
          setTypedName(TYPING_TEXT.slice(0, i + 1))
          i++
        } else {
          clearInterval(typeInterval)
          setTimeout(() => setShowCursor(false), 500)
        }
      }, 60)
    }, 2800)
    // t=3800ms: Palette slides in
    const t8 = setTimeout(() => {
      mockData.palette.forEach((_, i) => {
        setTimeout(() => {
          setPaletteVisible((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * 80)
      })
    }, 3800)
    // t=4400ms: Chips fade in
    const t9 = setTimeout(() => {
      styleChips.forEach((_, i) => {
        setTimeout(() => {
          setChipsVisible((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * 100)
      })
    }, 4400)
    // t=5200ms: Auto-proceed to phase 2 (user is already authenticated)
    const t10 = setTimeout(() => proceedToPhase2(), 5200)

    return () => {
      ;[t1, t2, t3, t4, t5, t6, t7, t8, t9, t10].forEach(clearTimeout)
    }
  }, [styleName, styleChips]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Feel right" text shows after all 3 cards have real renders
  useEffect(() => {
    if (cardsLoaded.every((c) => c)) {
      setTimeout(() => setFeelRightVisible(true), 500)
    }
  }, [cardsLoaded])

  const handleShare = async () => {
    const shareData = { title: "My Design DNA", text: "Check out my personalized design style from Cova!", url: window.location.href }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch { /* user cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(window.location.href) } catch { /* ignore */ }
    }
  }

  const proceedToPhase2 = () => {
    setPhase(2)
    // Draw divider
    setTimeout(() => setDividerDrawn(true), 100)
    // Show phase 2 content
    setTimeout(() => setPhase2ContentVisible(true), 500)
    // Show cards with stagger
    setTimeout(() => {
      ;[0, 1, 2].forEach((i) => {
        setTimeout(() => {
          setCardsVisible((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * 150)
      })
    }, 600)
    // Scroll to phase 2
    setTimeout(() => {
      phase2Ref.current?.scrollIntoView({ behavior: "smooth" })
    }, 300)
  }

  const handleChipToggle = (chip: string) => {
    setSelectedChips((prev) => {
      const isSelected = prev.includes(chip)
      const newChips = isSelected ? prev.filter((c) => c !== chip) : [...prev, chip]
      setAdjustText(newChips.join(", "))
      return newChips
    })
  }

  const handleRegenerate = async () => {
    if (!adjustText.trim() && selectedChips.length === 0) return
    setIsRegenerating(true)
    setShowAdjustPanel(false)
    setCardsLoaded([false, false, false])
    setShowcaseImages([null, null, null])
    setFeelRightVisible(false)

    // Apply chip adjustments directly to fingerprint dimensions
    const adjustmentMap: Record<string, Record<number, number>> = {
      'Warmer':       { 2: Math.min(1, (fingerprint[2] ?? 0.5) + 0.2) },
      'Cooler':       { 2: Math.max(0, (fingerprint[2] ?? 0.5) - 0.2) },
      'More minimal': { 1: Math.max(0, (fingerprint[1] ?? 0.5) - 0.2) },
      'More layered': { 1: Math.min(1, (fingerprint[1] ?? 0.5) + 0.2) },
      'More modern':  { 4: Math.max(0, (fingerprint[4] ?? 0.5) - 0.2) },
      'More classic': { 4: Math.min(1, (fingerprint[4] ?? 0.5) + 0.2) },
    }
    const modifiedFp = [...fingerprint]
    selectedChips.forEach(chip => {
      const adj = adjustmentMap[chip]
      if (adj) {
        Object.entries(adj).forEach(([dim, val]) => { modifiedFp[parseInt(dim)] = val })
      }
    })

    setFingerprint(modifiedFp)
    setStoreFingerprint(modifiedFp, styleName)

    const SHOWCASE_INPUTS = [
      { photo_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024', label: 'Living Room' },
      { photo_url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1024', label: 'Bedroom' },
      { photo_url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1024', label: 'Home Office' },
    ]

    await Promise.allSettled(
      SHOWCASE_INPUTS.map(async (input, index) => {
        try {
          const renderRes = await fetch('/api/render', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photo_url: input.photo_url,
              fingerprint_vector: modifiedFp,
              room_type: roomType ?? 'living_room',
              budget: budgetTier ?? 'mid',
              inclusions: [],
              constraints: [],
              showcase_mode: true,
              style_name: styleName,
            }),
          })
          if (!renderRes.ok) {
            setCardsLoaded(prev => { const next = [...prev]; next[index] = true; return next })
            return
          }
          const renderData = await renderRes.json() as { prediction_id: string }
          // Poll until complete
          for (let i = 0; i < 30; i++) {
            await new Promise<void>(r => setTimeout(r, 3000))
            const statusRes = await fetch(
              `/api/render/status?prediction_id=${renderData.prediction_id}&showcase_mode=true`,
              { credentials: 'include' }
            )
            if (statusRes.ok) {
              const status = await statusRes.json() as { status: string; render_url?: string }
              if (status.status === 'complete' && status.render_url) {
                setShowcaseImages(prev => { const next = [...prev]; next[index] = { url: status.render_url!, label: input.label }; return next })
                setCardsLoaded(prev => { const next = [...prev]; next[index] = true; return next })
                return
              }
              if (status.status === 'failed') break
            }
          }
          // Timed out
          setCardsLoaded(prev => { const next = [...prev]; next[index] = true; return next })
        } catch {
          setCardsLoaded(prev => { const next = [...prev]; next[index] = true; return next })
        }
      })
    )

    setIsRegenerating(false)
    setAdjustText('')
    setSelectedChips([])
  }

  // Calculate radar chart points
  const chartSize = 320
  const chartCenter = chartSize / 2
  const maxRadius = chartSize / 2 - 40

  const getPoint = (index: number, value: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180)
    const radius = value * maxRadius
    return {
      x: chartCenter + radius * Math.cos(angle),
      y: chartCenter + radius * Math.sin(angle),
    }
  }

  const getAxisEndpoint = (index: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180)
    return {
      x: chartCenter + maxRadius * Math.cos(angle),
      y: chartCenter + maxRadius * Math.sin(angle),
    }
  }

  const getLabelPosition = (index: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180)
    const radius = maxRadius + 24
    return {
      x: chartCenter + radius * Math.cos(angle),
      y: chartCenter + radius * Math.sin(angle),
    }
  }

  // Use only 6 specific dims for 6-axis chart: luminosity[0], temperature[2], form[3], texture[5], nature[7], scale[9]
  const chartFingerprint = [fingerprint[0] ?? 0.5, fingerprint[2] ?? 0.5, fingerprint[3] ?? 0.5, fingerprint[5] ?? 0.5, fingerprint[7] ?? 0.5, fingerprint[9] ?? 0.5]

  const shapePath = chartFingerprint.map((v, i) => {
    const point = getPoint(i, v)
    return `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`
  }).join(" ") + " Z"

  const shapePathLength = 800

  // Hexagon grid paths
  const getHexagonPath = (scale: number) => {
    const points = [0, 1, 2, 3, 4, 5].map((i) => {
      const angle = (i * 60 - 90) * (Math.PI / 180)
      const radius = maxRadius * scale
      return `${chartCenter + radius * Math.cos(angle)},${chartCenter + radius * Math.sin(angle)}`
    })
    return `M ${points.join(" L ")} Z`
  }

  return (
    <div className="min-h-screen bg-[#091829] relative overflow-x-hidden">
      {/* Iris overlay - black covers content, then shrinks to reveal */}
      <div
        className="fixed inset-0 bg-black z-50 pointer-events-none"
        style={{
          clipPath: irisOpen ? "circle(0% at 50% 50%)" : "circle(150% at 50% 50%)",
          transition: "clip-path 800ms cubic-bezier(0.4,0,0.2,1)",
        }}
      />

      <StepIndicator currentStep={4} totalSteps={10} />

      {/* Share button */}
      <button
        onClick={handleShare}
        className="fixed top-6 right-6 z-40 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 group"
        style={{
          background: "rgba(13,32,53,0.8)",
          border: "1px solid rgba(201,168,76,0.3)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#C9A84C"
          e.currentTarget.style.boxShadow = "0 0 16px rgba(201,168,76,0.2)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(201,168,76,0.3)"
          e.currentTarget.style.boxShadow = "none"
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        <span className="absolute top-full mt-2 text-[11px] text-[#8A9BB5] font-sans whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Share your Design DNA
        </span>
      </button>

      {/* Phase 1 Content */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pt-16 pb-8 relative">
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          <div style={{ position: "absolute", top: "15%", left: "10%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)", animation: "floatOrb1 8s ease-in-out infinite" }} />
          <div style={{ position: "absolute", bottom: "20%", right: "8%", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(138,155,181,0.06) 0%, transparent 70%)", animation: "floatOrb2 10s ease-in-out infinite" }} />
        </div>
        {/* Style name with typing effect */}
        <div className="h-16 mb-4 flex items-center justify-center">
          <h1 className="font-serif text-4xl md:text-[52px] text-[#C9A84C] tracking-wide">
            {typedName}
            {showCursor && <span className="animate-pulse">|</span>}
          </h1>
        </div>

        {/* Radar Chart */}
        <div className="relative" style={{ width: chartSize, height: chartSize }}>
          <svg width={chartSize} height={chartSize} className="md:w-80 md:h-80 w-[260px] h-[260px]">
            {/* Grid hexagons */}
            {[0.25, 0.5, 0.75, 1].map((scale, i) => (
              <path
                key={i}
                d={getHexagonPath(scale)}
                fill="none"
                stroke="rgba(26,42,74,1)"
                strokeWidth="1"
                style={{
                  opacity: gridVisible ? 1 : 0,
                  transition: `opacity 400ms ease ${i * 100}ms`,
                }}
              />
            ))}

            {/* Axis lines */}
            {axisLabels.map((_, i) => {
              const end = getAxisEndpoint(i)
              const lineLength = Math.sqrt(
                Math.pow(end.x - chartCenter, 2) + Math.pow(end.y - chartCenter, 2)
              )
              return (
                <line
                  key={i}
                  x1={chartCenter}
                  y1={chartCenter}
                  x2={end.x}
                  y2={end.y}
                  stroke="rgba(26,42,74,1)"
                  strokeWidth="1"
                  strokeDasharray={lineLength}
                  strokeDashoffset={axesDrawn[i] ? 0 : lineLength}
                  style={{
                    transition: "stroke-dashoffset 300ms ease-out",
                  }}
                />
              )
            })}

            {/* Fingerprint shape */}
            <path
              d={shapePath}
              fill="rgba(201,168,76,0.12)"
              stroke="#C9A84C"
              strokeWidth="2"
              strokeDasharray={shapePathLength}
              strokeDashoffset={shapeDrawn ? 0 : shapePathLength}
              style={{
                transition: "stroke-dashoffset 800ms ease-in-out, fill-opacity 800ms ease-in-out",
                fillOpacity: shapeDrawn ? 1 : 0,
              }}
            />

            {/* Vertex dots */}
            {chartFingerprint.map((v, i) => {
              const point = getPoint(i, v)
              return (
                <circle
                  key={i}
                  cx={point.x}
                  cy={point.y}
                  r="8"
                  fill="#C9A84C"
                  style={{
                    filter: "drop-shadow(0 0 8px rgba(201,168,76,0.8))",
                    transform: verticesVisible[i] ? "scale(1)" : "scale(0)",
                    transformOrigin: `${point.x}px ${point.y}px`,
                    transition: "transform 200ms cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                />
              )
            })}

            {/* Axis labels */}
            {axisLabels.map((label, i) => {
              const pos = getLabelPosition(i)
              return (
                <text
                  key={i}
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#8A9BB5"
                  fontSize="11"
                  fontFamily="var(--font-inter), Inter, sans-serif"
                  style={{
                    opacity: labelsVisible ? 1 : 0,
                    transition: "opacity 300ms ease",
                  }}
                >
                  {label}
                </text>
              )
            })}
          </svg>
        </div>

        {/* Color palette */}
        <div className="flex gap-2.5 mt-8 mb-6">
          {palette.map((color, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded-md"
              style={{
                backgroundColor: color,
                opacity: paletteVisible[i] ? 1 : 0,
                transform: paletteVisible[i] ? "translateX(0)" : "translateX(-20px)",
                transition: "opacity 300ms ease, transform 300ms ease",
              }}
            />
          ))}
        </div>

        {/* Descriptor chips */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-10">
          {styleChips.map((chip, i) => (
            <span
              key={i}
              className="px-3.5 py-1.5 rounded-full text-xs font-sans text-[#F5F0E8]"
              style={{
                background: "#0D2035",
                border: "1px solid rgba(201,168,76,0.3)",
                opacity: chipsVisible[i] ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
            >
              {chip}
            </span>
          ))}
        </div>

      </div>

      {/* Phase 2 Content */}
      {phase === 2 && (
        <div ref={phase2Ref} className="px-6 pb-16">
          {/* Gold divider */}
          <div className="max-w-[600px] mx-auto mb-12">
            <div
              className="h-px bg-[#C9A84C]"
              style={{
                width: dividerDrawn ? "100%" : "0%",
                transition: "width 400ms ease-out",
              }}
            />
          </div>

          {/* Phase 2 heading */}
          <div
            style={{
              opacity: phase2ContentVisible ? 1 : 0,
              transform: phase2ContentVisible ? "translateY(0)" : "translateY(16px)",
              transition: "opacity 400ms ease, transform 400ms ease",
            }}
          >
            <h2 className="font-serif text-4xl text-[#F5F0E8] text-center mb-2">
              Your style in action.
            </h2>
            <p className="text-sm font-sans text-[#8A9BB5] text-center mb-10">
              Three rooms redesigned to your exact taste.
            </p>
          </div>

          {/* Style cards */}
          <div className="max-w-[600px] mx-auto space-y-6">
            {showcaseImages.map((img, i) => (
              <div
                key={i}
                className="relative w-full rounded-2xl overflow-hidden cursor-pointer"
                style={{
                  aspectRatio: "16/9",
                  background: "#0D2035",
                  opacity: cardsVisible[i] ? 1 : 0,
                  transform: cardsVisible[i] ? "translateY(0)" : "translateY(24px)",
                  transition: "opacity 500ms ease, transform 500ms ease",
                  filter: isRegenerating ? "blur(4px)" : "blur(0)",
                }}
              >
                {!cardsLoaded[i] ? (
                  // Loading state — shimmer + spinner
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center"
                    style={{
                      background: "linear-gradient(90deg, #0D2035 0%, #112540 50%, #0D2035 100%)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.5s ease infinite",
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full mb-3"
                      style={{
                        border: "2px solid rgba(201,168,76,0.2)",
                        borderTopColor: "#C9A84C",
                        animation: "spin 800ms linear infinite",
                      }}
                    />
                    <span className="text-xs font-sans text-[#4A5E7A]">
                      {isRegenerating ? "Redesigning..." : "Designing your room..."}
                    </span>
                  </div>
                ) : img ? (
                  // Anchor render image
                  <>
                    <img
                      src={img.url}
                      alt={`${img.label} redesigned to your style`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(transparent 55%, rgba(9,24,41,0.85))" }}
                    />
                    <div className="absolute bottom-4 left-4 flex items-center gap-3">
                      <span className="text-[13px] font-sans text-[#8A9BB5]">{img.label}</span>
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] font-sans text-[#091829]"
                        style={{ background: "#C9A84C" }}
                      >
                        Your style
                      </span>
                    </div>
                  </>
                ) : (
                  // Fallback: render failed, show styled placeholder
                  <>
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(160deg, ${palette[0]}22 0%, ${palette[2]}44 50%, ${palette[4]}22 100%)`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-sans text-[#4A5E7A]">Preview unavailable</span>
                    </div>
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(transparent 55%, rgba(9,24,41,0.85))" }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Feel right text and CTAs */}
          <div
            className="max-w-[480px] mx-auto mt-10"
            style={{
              opacity: feelRightVisible ? 1 : 0,
              transition: "opacity 400ms ease",
            }}
          >
            <p className="text-sm font-sans italic text-[#8A9BB5] text-center mb-6">
              Does this feel right?
            </p>

            <button
              onClick={() => { setStep(5); router.push("/design/step-5"); }}
              className="w-full py-[18px] px-10 rounded-xl text-[15px] font-semibold font-sans transition-all duration-200"
              style={{
                background: "#C9A84C",
                color: "#091829",
                letterSpacing: "0.03em",
                boxShadow: "0 0 40px rgba(201,168,76,0.25)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#D4B460"
                e.currentTarget.style.boxShadow = "0 0 60px rgba(201,168,76,0.4)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#C9A84C"
                e.currentTarget.style.boxShadow = "0 0 40px rgba(201,168,76,0.25)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              Yes, design my room &rarr;
            </button>

            <button
              onClick={() => setShowAdjustPanel(true)}
              className="w-full mt-3 py-3.5 px-10 rounded-xl text-sm font-sans transition-all duration-200"
              style={{
                background: "transparent",
                border: "1px solid rgba(201,168,76,0.3)",
                color: "#8A9BB5",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#C9A84C"
                e.currentTarget.style.color = "#F5F0E8"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(201,168,76,0.3)"
                e.currentTarget.style.color = "#8A9BB5"
              }}
            >
              Adjust my style
            </button>
          </div>
        </div>
      )}

      {/* Adjust Panel Overlay */}
      {showAdjustPanel && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowAdjustPanel(false)}
        />
      )}

      {/* Adjust Panel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[60vh] md:max-h-[60vh] overflow-y-auto"
        style={{
          background: "#0D2035",
          borderTopLeftRadius: "20px",
          borderTopRightRadius: "20px",
          borderTop: "1px solid rgba(201,168,76,0.2)",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          padding: "32px 24px 48px",
          transform: showAdjustPanel ? "translateY(0)" : "translateY(100%)",
          transition: "transform 400ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Handle bar */}
        <div
          className="w-8 h-1 rounded-sm mx-auto mb-6 cursor-grab"
          style={{ background: "rgba(201,168,76,0.3)" }}
          onClick={() => setShowAdjustPanel(false)}
        />

        <h3 className="font-serif text-2xl text-[#F5F0E8] mb-1.5">
          Describe what feels off
        </h3>
        <p className="text-[13px] font-sans text-[#8A9BB5] mb-6">
          Or tap a quick adjustment below
        </p>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-2.5 mb-5">
          {adjustChips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipToggle(chip)}
              className="px-4 py-2 rounded-full text-xs font-sans transition-all duration-200"
              style={{
                background: selectedChips.includes(chip) ? "rgba(201,168,76,0.08)" : "#112540",
                border: selectedChips.includes(chip)
                  ? "1px solid #C9A84C"
                  : "1px solid rgba(201,168,76,0.2)",
                color: selectedChips.includes(chip) ? "#F5F0E8" : "#8A9BB5",
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Text input */}
        <textarea
          value={adjustText}
          onChange={(e) => setAdjustText(e.target.value)}
          placeholder="e.g. warmer tones, less cluttered, more modern..."
          className="w-full min-h-[80px] p-4 rounded-xl text-sm font-sans resize-none transition-all duration-200 focus:outline-none"
          style={{
            background: "#091829",
            border: "1px solid rgba(201,168,76,0.2)",
            color: "#F5F0E8",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(201,168,76,0.6)"
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201,168,76,0.08)"
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(201,168,76,0.2)"
            e.currentTarget.style.boxShadow = "none"
          }}
        />

        {/* Regenerate button */}
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="w-full mt-5 py-4 rounded-xl text-sm font-semibold font-sans flex items-center justify-center gap-2"
          style={{
            background: "#C9A84C",
            color: "#091829",
            opacity: isRegenerating ? 0.7 : 1,
          }}
        >
          {isRegenerating && (
            <div
              className="w-4 h-4 rounded-full"
              style={{
                border: "2px solid rgba(9,24,41,0.2)",
                borderTopColor: "#091829",
                animation: "spin 800ms linear infinite",
              }}
            />
          )}
          {isRegenerating ? "Regenerating..." : "Regenerate my style"}
        </button>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-25px, 20px) scale(1.08); }
          70% { transform: translate(15px, -10px) scale(0.92); }
        }
      `}</style>
    </div>
  )
}

