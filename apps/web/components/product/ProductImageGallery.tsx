"use client"

import { useState, useRef, useCallback } from "react"

interface ProductImageGalleryProps {
  image: string
  badge: string
  retailer: string
}

export function ProductImageGallery({ image, badge, retailer }: ProductImageGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [imgError, setImgError] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: y * -8, y: x * 8 })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 })
  }, [])

  const badgeStyle = badge === "BEST MATCH"
    ? { background: "#C9A84C", color: "#0a1628" }
    : { background: "transparent", border: "1px solid rgba(201,168,76,0.4)", color: "#C9A84C" }

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden"
      style={{ aspectRatio: "4/3", background: "rgba(255,245,220,0.04)" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="w-full h-full p-4 transition-transform duration-200"
        style={{
          transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.02)`,
        }}
      >
        {imgError ? (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="48" height="32" viewBox="0 0 32 20" fill="none">
              <path d="M2 18Q16 2 30 18" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        ) : (
          <img
            src={image}
            alt=""
            className="w-full h-full object-contain"
            draggable={false}
            onError={() => setImgError(true)}
          />
        )}
      </div>

      {/* Badge */}
      <div
        className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.08em]"
        style={badgeStyle}
      >
        {badge}
      </div>

      {/* Retailer badge */}
      <div
        className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.06em] text-white/60"
        style={{ background: "rgba(13,31,60,0.9)", border: "1px solid rgba(201,168,76,0.2)" }}
      >
        {retailer}
      </div>
    </div>
  )
}
