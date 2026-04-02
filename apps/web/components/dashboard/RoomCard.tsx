"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

export interface Room {
  id: string
  name: string
  date: string
  styleBlend: string
  totalCost: number
  thumbnail: string
  sessionId: string
}

interface RoomCardProps {
  rooms: Room[]
}

export function RoomCard({ rooms }: RoomCardProps) {
  const router = useRouter()
  const featuredCardRef = useRef<HTMLDivElement>(null)
  const featuredImgRef = useRef<HTMLImageElement>(null)

  // Subtle parallax on desktop
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (isMobile || prefersReduced) return

    let rafId: number
    const handleScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (!featuredCardRef.current || !featuredImgRef.current) return
        const rect = featuredCardRef.current.getBoundingClientRect()
        const offset = rect.top * 0.12
        featuredImgRef.current.style.transform = `scale(1.1) translateY(${offset}px)`
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      cancelAnimationFrame(rafId)
    }
  }, [])

  // Empty state
  if (rooms.length === 0) {
    return (
      <section className="px-6 mt-8" aria-label="Room history">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-xl text-white"
            style={{ fontFamily: "Playfair Display, Georgia, serif" }}
          >
            Your Rooms
          </h2>
        </div>
        <div
          className="flex flex-col items-center justify-center py-16 gap-4"
          style={{ opacity: 0, animation: "slideUp 400ms ease-out 400ms forwards" }}
        >
          <svg
            width="40"
            height="28"
            viewBox="0 0 32 20"
            fill="none"
            aria-hidden="true"
            style={{ animation: "archBreathe 3s ease-in-out infinite" }}
          >
            <path
              d="M2 18Q16 2 30 18"
              stroke="#C9A84C"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          <p
            className="text-lg text-white italic text-center"
            style={{ fontFamily: "Playfair Display, Georgia, serif" }}
          >
            Your first room is waiting.
          </p>
          <p
            className="text-sm text-center"
            style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Inter, sans-serif" }}
          >
            Start by capturing your space.
          </p>
        </div>
      </section>
    )
  }

  const [featured, ...secondary] = rooms

  return (
    <section aria-label="Room history">
      {/* Section header */}
      <div className="flex items-center justify-between px-6 mt-8 mb-4">
        <h2
          className="text-xl text-white"
          style={{ fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Your Rooms
        </h2>
        <button
          className="text-xs cursor-pointer opacity-70 hover:opacity-100 transition-opacity duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C] rounded"
          style={{ color: "#C9A84C", fontFamily: "Inter, sans-serif", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
          aria-label="See all rooms"
        >
          See all
        </button>
      </div>

      {/* Featured card */}
      <div
        ref={featuredCardRef}
        className="mx-6 rounded-3xl overflow-hidden relative cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
        style={{
          height: 260,
          border: "1px solid rgba(201,168,76,0.2)",
          opacity: 0,
          animation: "dashCardIn 500ms ease-out 400ms forwards",
        }}
        onClick={() => router.push(`/viewer/${featured.sessionId}`)}
        role="link"
        tabIndex={0}
        aria-label={`View ${featured.name} room, designed ${featured.date}`}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(`/viewer/${featured.sessionId}`)
        }}
      >
        {/* Parallax image */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            ref={featuredImgRef}
            src={featured.thumbnail}
            alt={`${featured.name} — ${featured.styleBlend} design`}
            className="w-full h-full object-cover group-hover:scale-[1.02]"
            style={{
              transform: "scale(1.1)",
              transition: "transform 400ms ease",
              willChange: "transform",
            }}
            loading="lazy"
          />
        </div>

        {/* Bottom gradient overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(10,22,40,0.95) 0%, rgba(10,22,40,0.2) 60%, transparent 100%)",
          }}
        />

        {/* LATEST badge */}
        <div
          className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.1em] font-medium"
          style={{
            background: "#C9A84C",
            color: "#0a1628",
            fontFamily: "Inter, sans-serif",
          }}
          aria-label="Most recent room"
        >
          Latest
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p
            className="text-lg text-white leading-snug"
            style={{ fontFamily: "Playfair Display, Georgia, serif" }}
          >
            {featured.name} · {featured.date}
          </p>
          <p
            className="text-[10px] uppercase tracking-[0.12em] mt-1"
            style={{ color: "#C9A84C", fontFamily: "Inter, sans-serif" }}
          >
            {featured.styleBlend}
          </p>
          <div className="flex items-center justify-between mt-3">
            <span
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter, sans-serif" }}
            >
              ${featured.totalCost.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                className="px-3 rounded-full text-[10px] uppercase tracking-wide font-medium cursor-pointer hover:opacity-90 transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{
                  height: 32,
                  background: "#C9A84C",
                  color: "#0a1628",
                  fontFamily: "Inter, sans-serif",
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/viewer/${featured.sessionId}`)
                }}
                aria-label={`View ${featured.name} room`}
              >
                View Room
              </button>
              <button
                className="px-3 rounded-full text-[10px] uppercase tracking-wide font-medium cursor-pointer hover:bg-[rgba(201,168,76,0.1)] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
                style={{
                  height: 32,
                  border: "1px solid rgba(201,168,76,0.55)",
                  color: "#C9A84C",
                  fontFamily: "Inter, sans-serif",
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Shop ${featured.name} furniture`}
              >
                Shop
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary room cards — horizontal scroll */}
      {secondary.length > 0 && (
        <div
          className="flex gap-4 px-6 mt-4 overflow-x-auto scrollbar-hide pb-1"
          role="list"
          aria-label="Previous rooms"
        >
          {secondary.map((room, i) => (
            <div
              key={room.id}
              role="listitem"
              className="flex-shrink-0 rounded-2xl overflow-hidden relative cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
              style={{
                width: 180,
                aspectRatio: "3 / 2",
                border: "1px solid rgba(201,168,76,0.2)",
                opacity: 0,
                animation: `slideUp 400ms ease-out ${600 + i * 100}ms forwards`,
              }}
              onClick={() => router.push(`/viewer/${room.sessionId}`)}
              tabIndex={0}
              aria-label={`View ${room.name} room, designed ${room.date}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/viewer/${room.sessionId}`)
              }}
            >
              <img
                src={room.thumbnail}
                alt={`${room.name} — ${room.styleBlend} design`}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[400ms]"
                loading="lazy"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to top, rgba(10,22,40,0.9) 0%, transparent 55%)",
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p
                  className="text-sm text-white leading-tight"
                  style={{ fontFamily: "Playfair Display, Georgia, serif" }}
                >
                  {room.name}
                </p>
                <p
                  className="text-[9px] uppercase tracking-wide mt-0.5"
                  style={{ color: "rgba(201,168,76,0.8)", fontFamily: "Inter, sans-serif" }}
                >
                  {room.styleBlend}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
