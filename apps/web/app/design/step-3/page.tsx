"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useFingerprintStore } from "@/lib/store"
import { STOCK_PHOTOS as QUIZ_STOCK_PHOTOS } from "@/lib/ai/quiz-data"
import { StepIndicator } from "@/components/cova/StepIndicator"

const axisLabels = ["Luminosity", "Density", "Temperature", "Form", "Era", "Texture"]
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

export default function Step3Page() {
  const router = useRouter()

  // Read fingerprint from Zustand store (set by Step 2 quiz)
  const { fingerprint: storedFingerprint, styleName: storedStyleName, roomType } = useFingerprintStore()

  // Resolve stock photos for the current room type
  const stockPhotosForRoom = QUIZ_STOCK_PHOTOS[roomType ?? "living-room"] ?? QUIZ_STOCK_PHOTOS["living-room"] ?? []
  const STOCK_PHOTOS = stockPhotosForRoom.map((p, i) => ({
    url: p.url,
    name: (roomType ?? "living-room").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + ` ${i + 1}`,
  }))

  // Fall back to mock if store empty (direct navigation in dev)
  const [fingerprint, setFingerprint] = useState<number[]>(
    storedFingerprint ?? [0.7, 0.3, 0.8, 0.7, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5]
  )
  const [styleName, setStyleName] = useState(storedStyleName ?? "Warm Japandi")
  const [styleChips, setStyleChips] = useState<string[]>([
    "organic textures", "warm neutrals", "minimal layers", "natural materials"
  ])
  const palette = derivepalette(fingerprint)

  // Render URLs — populated by real FLUX renders
  const [renderUrls, setRenderUrls] = useState<(string | null)[]>([null, null, null])
  const [renderJobIds, setRenderJobIds] = useState<(string | null)[]>([null, null, null])
  const renderPollRef = useRef<NodeJS.Timeout[]>([])

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
  const [authVisible, setAuthVisible] = useState(false)
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

  // Fire 3 FLUX renders in parallel as soon as the page mounts.
  // This runs during Phase 1 animation (~8s) so renders are ready
  // or nearly ready when the user reaches Phase 2.
  useEffect(() => {
    const fireRenders = async () => {
      // Skip if stock photo URLs not configured (dev without env vars)
      if (!STOCK_PHOTOS[0].url) return

      const jobs = await Promise.all(
        STOCK_PHOTOS.map(async (photo) => {
          try {
            const res = await fetch("/api/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                photo_url: photo.url,
                fingerprint_vector: fingerprint,
                room_type: photo.name.toLowerCase().replace(" ", "_"),
                budget: [500, 5000], // will be overridden by store later
                inclusions: [],
                style_card_mode: true, // flag so API skips keep_mask/detect
              }),
            })
            const data = await res.json()
            return data.render_session_id as string | null
          } catch {
            return null
          }
        })
      )
      setRenderJobIds(jobs)
    }
    fireRenders()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll render jobs until all complete
  useEffect(() => {
    renderJobIds.forEach((jobId, i) => {
      if (!jobId || renderUrls[i]) return

      const poll = async () => {
        try {
          const res = await fetch(`/api/render/status?session_id=${jobId}`)
          const data = await res.json()
          if (data.render_url) {
            setRenderUrls((prev) => {
              const next = [...prev]
              next[i] = data.render_url
              return next
            })
            setCardsLoaded((prev) => {
              const next = [...prev]
              next[i] = true
              return next
            })
          } else {
            // Still processing — poll again in 3s
            const timer = setTimeout(poll, 3000)
            renderPollRef.current.push(timer)
          }
        } catch {
          // Retry on error
          const timer = setTimeout(poll, 5000)
          renderPollRef.current.push(timer)
        }
      }
      poll()
    })

    return () => {
      renderPollRef.current.forEach(clearTimeout)
      renderPollRef.current = []
    }
  }, [renderJobIds]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // t=2800ms: Style name types in
    const t7 = setTimeout(() => {
      setShowCursor(true)
      let i = 0
      const typeInterval = setInterval(() => {
        if (i < styleName.length) {
          setTypedName(styleName.slice(0, i + 1))
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
    // t=5200ms: Auth section rises
    const t10 = setTimeout(() => setAuthVisible(true), 5200)

    return () => {
      ;[t1, t2, t3, t4, t5, t6, t7, t8, t9, t10].forEach(clearTimeout)
    }
  }, [styleName, styleChips])

  // "Feel right" text shows after all 3 cards have real renders
  useEffect(() => {
    if (cardsLoaded.every((c) => c)) {
      setTimeout(() => setFeelRightVisible(true), 500)
    }
  }, [cardsLoaded])

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
    setRenderUrls([null, null, null])
    setFeelRightVisible(false)

    try {
      // Step 1: Get updated fingerprint from refinement text
      const fpRes = await fetch("/api/quiz/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: [], // no new quiz responses
          refinement: adjustText,
          current_fingerprint: fingerprint,
          entry_path: "refinement",
        }),
      })
      const fpData = await fpRes.json()
      const newFingerprint: number[] = fpData.fingerprint ?? fingerprint
      const newStyleName: string = fpData.style_name ?? styleName
      const newStyleChips: string[] = fpData.style_tags ?? styleChips

      setFingerprint(newFingerprint)
      setStyleName(newStyleName)
      setStyleChips(newStyleChips)

      // Step 2: Fire 3 new renders with updated fingerprint
      const newJobs = await Promise.all(
        STOCK_PHOTOS.map(async (photo) => {
          if (!photo.url) return null
          try {
            const res = await fetch("/api/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                photo_url: photo.url,
                fingerprint_vector: newFingerprint,
                room_type: photo.name.toLowerCase().replace(" ", "_"),
                budget: [500, 5000],
                inclusions: [],
                style_card_mode: true,
              }),
            })
            const data = await res.json()
            return data.render_session_id as string | null
          } catch {
            return null
          }
        })
      )

      setRenderJobIds(newJobs)
      setAdjustText("")
      setSelectedChips([])
    } catch {
      // On failure, restore loaded state so user isn't stuck
      setCardsLoaded([true, true, true])
    } finally {
      setIsRegenerating(false)
    }
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

  const shapePath = fingerprint.map((v, i) => {
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

      <StepIndicator currentStep={3} totalSteps={11} />

      {/* Share button */}
      <button
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pt-16 pb-8">
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
            {fingerprint.map((v, i) => {
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

        {/* Auth section */}
        <div
          className="flex flex-col items-center"
          style={{
            opacity: authVisible ? 1 : 0,
            transform: authVisible ? "translateY(0)" : "translateY(30px)",
            transition: "opacity 500ms ease, transform 500ms ease",
          }}
        >
          <p
            className="text-[10px] font-sans text-[#C9A84C] mb-5"
            style={{ letterSpacing: "0.3em" }}
          >
            SAVE YOUR DESIGN DNA
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={proceedToPhase2}
              className="flex items-center justify-center gap-3 w-[200px] h-12 bg-white rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-sm font-medium text-[#1A1A1A]">Sign in with Google</span>
            </button>

            <button
              onClick={proceedToPhase2}
              className="flex items-center justify-center gap-3 w-[200px] h-12 bg-black rounded-lg hover:bg-gray-900 transition-colors"
            >
              <svg width="16" height="20" viewBox="0 0 16 20" fill="white">
                <path d="M12.152 0c.09.916-.273 1.823-.774 2.49-.51.676-1.362 1.2-2.175 1.13-.102-.867.319-1.776.793-2.333C10.52.691 11.432.187 12.152 0zM14.957 16.473c-.357.81-.528 1.172-.987 1.884-.64.993-1.543 2.23-2.662 2.242-1-.011-1.259-.639-2.617-.631-1.359.008-1.64.644-2.64.656-1.119.012-1.973-1.126-2.614-2.119C1.7 15.77.794 11.613 2.626 8.803c.656-.995 1.823-1.623 3.066-1.64 1.118-.017 2.174.743 2.86.743.685 0 1.968-.918 3.316-.784.564.023 2.15.224 3.166 1.688-.082.05-1.89 1.087-1.87 3.241.024 2.573 2.296 3.43 2.32 3.442-.018.046-.363 1.23-1.527 2.98z" />
              </svg>
              <span className="text-sm font-medium text-white">Sign in with Apple</span>
            </button>
          </div>

          <button
            onClick={proceedToPhase2}
            className="mt-4 text-xs font-sans text-[#4A5E7A] hover:text-[#8A9BB5] transition-colors cursor-pointer"
          >
            or continue as guest &rarr;
          </button>
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
            {STOCK_PHOTOS.map((photo, i) => (
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
                ) : renderUrls[i] ? (
                  // Real FLUX render
                  <>
                    <img
                      src={renderUrls[i]!}
                      alt={`${photo.name} redesigned in ${styleName}`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(transparent 55%, rgba(9,24,41,0.85))" }}
                    />
                    <div className="absolute bottom-4 left-4 flex items-center gap-3">
                      <span className="text-[13px] font-sans text-[#8A9BB5]">{photo.name}</span>
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] font-sans text-[#091829]"
                        style={{ background: "#C9A84C" }}
                      >
                        {styleName}
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
                    <div className="absolute bottom-4 left-4 flex items-center gap-3">
                      <span className="text-[13px] font-sans text-[#8A9BB5]">{photo.name}</span>
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] font-sans text-[#091829]"
                        style={{ background: "#C9A84C" }}
                      >
                        {styleName}
                      </span>
                    </div>
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
              onClick={() => router.push("/design/step-4")}
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
      `}</style>
    </div>
  )
}
