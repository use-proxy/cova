"use client"

import { useState, useRef, useCallback } from "react"

interface SwipeCardProps {
  imageUrl: string
  onSwipe: (direction: "left" | "right") => void
  isTop: boolean
  style?: React.CSSProperties
  className?: string
}

export function SwipeCard({ imageUrl, onSwipe, isTop, style, className }: SwipeCardProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [swiping, setSwiping] = useState(false)
  const [imgError, setImgError] = useState(false)
  const startPos = useRef({ x: 0, y: 0 })
  const startTime = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isTop || swiping) return
    e.preventDefault()
    startPos.current = { x: e.clientX, y: e.clientY }
    startTime.current = Date.now()
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [isTop, swiping])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    setOffset({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y,
    })
  }, [dragging])

  const handlePointerUp = useCallback(() => {
    if (!dragging) return
    setDragging(false)

    const cardWidth = cardRef.current?.offsetWidth ?? 300
    const elapsed = Date.now() - startTime.current
    const velocity = Math.abs(offset.x) / Math.max(elapsed, 1)

    if (Math.abs(offset.x) > cardWidth * 0.38 || velocity > 0.5) {
      const direction = offset.x > 0 ? "right" : "left"
      setSwiping(true)
      setOffset({ x: offset.x > 0 ? window.innerWidth * 1.5 : -window.innerWidth * 1.5, y: offset.y })
      setTimeout(() => onSwipe(direction), 300)
    } else {
      setOffset({ x: 0, y: 0 })
    }
  }, [dragging, offset, onSwipe])

  const rotation = Math.min(Math.max(offset.x * 0.08, -15), 15)

  const edgeGlow = (() => {
    if (offset.x > 20) return "inset -80px 0 80px rgba(201,168,76,0.25)"
    if (offset.x < -20) return "inset 80px 0 80px rgba(239,68,68,0.2)"
    return "none"
  })()

  return (
    <div
      ref={cardRef}
      className={`absolute touch-none select-none ${className ?? ""}`}
      style={{
        ...style,
        transform: isTop
          ? `translateX(${offset.x}px) translateY(${offset.y * 0.15}px) rotate(${rotation}deg)`
          : style?.transform,
        transition: dragging ? "none" : swiping ? "transform 300ms ease-out, opacity 300ms ease-out" : "transform 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        opacity: swiping ? 0 : style?.opacity ?? 1,
        boxShadow: isTop && !swiping ? edgeGlow : "0 20px 60px rgba(0,0,0,0.5)",
        cursor: isTop ? "grab" : "default",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="w-full h-full rounded-2xl overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {imgError ? (
          <div className="w-full h-full bg-[#0d1f3c] flex items-center justify-center">
            <svg width="48" height="32" viewBox="0 0 32 20" fill="none">
              <path d="M2 18Q16 2 30 18" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>
  )
}
