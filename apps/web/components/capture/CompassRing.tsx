"use client"

import { useRef } from "react"
import { Check } from "lucide-react"

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

interface CompassRingProps {
  activeIndex: number
  currentHeading: number | null
  startHeading: number | null
  size?: number
  allComplete?: boolean
  lockedOn?: boolean
}

export function CompassRing({
  activeIndex,
  currentHeading,
  startHeading,
  size = 180,
  allComplete = false,
  lockedOn = false,
}: CompassRingProps) {
  const arrowRef = useRef<SVGGElement>(null)
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 20
  const nodeRadius = 8

  // Arrow rotation: use heading relative to start if available
  const arrowRotation = (() => {
    if (currentHeading === null || startHeading === null) {
      // Desktop fallback: point at the active node statically
      return activeIndex * 45 - 90
    }
    // Real heading: rotate arrow to show where user is facing relative to start
    const delta = currentHeading - startHeading
    return delta - 90 // SVG 0° is east, compass 0° is north
  })()

  // Pulse speed: faster when locked on
  const pulseDuration = lockedOn ? "0.3s" : "1.5s"

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Ring */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--gold-dim)" strokeWidth="1" />

        {/* Nodes */}
        {DIRECTIONS.map((dir, i) => {
          const angle = (i * 45 - 90) * (Math.PI / 180)
          const x = cx + Math.cos(angle) * radius
          const y = cy + Math.sin(angle) * radius
          const isCompleted = i < activeIndex
          const isCurrent = i === activeIndex && !allComplete

          return (
            <g key={dir}>
              {/* Pulse ring for current node */}
              {isCurrent && (
                <circle
                  cx={x}
                  cy={y}
                  r={nodeRadius + 4}
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1.5"
                  opacity="0.6"
                >
                  <animate attributeName="r" from={String(nodeRadius + 2)} to={String(nodeRadius + 8)} dur={pulseDuration} repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur={pulseDuration} repeatCount="indefinite" />
                </circle>
              )}

              {/* Sonar ping on lock-on */}
              {isCurrent && lockedOn && (
                <circle
                  cx={x}
                  cy={y}
                  r={nodeRadius}
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1"
                >
                  <animate attributeName="r" from={String(nodeRadius)} to={String(nodeRadius * 2.5)} dur="0.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="0.8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Node circle */}
              <circle
                cx={x}
                cy={y}
                r={nodeRadius}
                fill={isCompleted ? "var(--gold)" : "transparent"}
                stroke={isCompleted || isCurrent ? "var(--gold)" : "var(--gold-dim)"}
                strokeWidth={isCurrent ? 2 : 1.5}
                className={isCompleted ? "animate-[scaleIn_300ms_ease-out]" : ""}
              />

              {/* Direction label on current node */}
              {isCurrent && (
                <text
                  x={x}
                  y={y + nodeRadius + 14}
                  textAnchor="middle"
                  fill="var(--gold)"
                  fontSize="8"
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  letterSpacing="0.1em"
                >
                  {dir}
                </text>
              )}
            </g>
          )
        })}

        {/* Center rotating arrow — tracks real heading on mobile, static on desktop */}
        {!allComplete && (
          <g
            ref={arrowRef}
            style={{
              transform: `rotate(${arrowRotation}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: currentHeading !== null ? "transform 100ms ease-out" : "none",
            }}
          >
            <line
              x1={cx}
              y1={cy}
              x2={cx + radius * 0.5}
              y2={cy}
              stroke="var(--gold)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.8"
            />
            {/* Arrowhead */}
            <polygon
              points={`${cx + radius * 0.5 + 6},${cy} ${cx + radius * 0.5 - 2},${cy - 4} ${cx + radius * 0.5 - 2},${cy + 4}`}
              fill="var(--gold)"
              opacity="0.8"
            />
          </g>
        )}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill="var(--gold)" opacity="0.6" />
      </svg>

      {/* Center checkmark when all complete */}
      {allComplete && (
        <div className="absolute inset-0 flex items-center justify-center animate-[scaleIn_400ms_ease-out]">
          <div className="w-12 h-12 rounded-full bg-[var(--gold)] flex items-center justify-center">
            <Check className="w-6 h-6 text-[var(--navy-deep)]" />
          </div>
        </div>
      )}
    </div>
  )
}
