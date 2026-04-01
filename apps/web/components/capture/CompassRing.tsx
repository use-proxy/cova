"use client"

import { Check } from "lucide-react"

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

interface CompassRingProps {
  completedCount: number
  currentIndex: number
  size?: number
  allComplete?: boolean
}

export function CompassRing({ completedCount, currentIndex, size = 180, allComplete = false }: CompassRingProps) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 20
  const nodeRadius = 8

  // Arrow pointing to current target node
  const currentAngle = (currentIndex * 45 - 90) * (Math.PI / 180)
  const arrowLength = radius * 0.5
  const arrowX = cx + Math.cos(currentAngle) * arrowLength
  const arrowY = cy + Math.sin(currentAngle) * arrowLength

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
          const isCompleted = i < completedCount
          const isCurrent = i === currentIndex && !allComplete

          return (
            <g key={dir}>
              {/* Pulse ring for current */}
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
                  <animate attributeName="r" from={String(nodeRadius + 2)} to={String(nodeRadius + 8)} dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Node */}
              <circle
                cx={x}
                cy={y}
                r={nodeRadius}
                fill={isCompleted ? "var(--gold)" : "transparent"}
                stroke={isCompleted || isCurrent ? "var(--gold)" : "var(--gold-dim)"}
                strokeWidth={isCurrent ? 2 : 1.5}
                className={isCompleted ? "animate-[scaleIn_300ms_ease-out]" : ""}
              />

              {/* Direction label */}
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

        {/* Center arrow pointing to current target */}
        {!allComplete && (
          <line
            x1={cx}
            y1={cy}
            x2={arrowX}
            y2={arrowY}
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.8"
          />
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
