"use client"

import { type Ref } from "react"
import { Check } from "lucide-react"

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

interface CompassRingProps {
  activeIndex: number
  currentHeading: number | null
  startHeading: number | null
  size?: number
  allComplete?: boolean
  lockedOn?: boolean
  needleRef?: Ref<SVGGElement>
  arcRef?: Ref<SVGCircleElement>
}

export function CompassRing({
  activeIndex,
  currentHeading,
  size = 180,
  allComplete = false,
  lockedOn = false,
  needleRef,
  arcRef,
}: CompassRingProps) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 20
  const nodeRadius = 8
  const circumference = 2 * Math.PI * radius

  // Static arrow rotation for desktop (no gyro)
  const staticArrowAngle = activeIndex * 45 - 90

  // Pulse speed: faster when locked on
  const pulseDuration = lockedOn ? "0.3s" : "1.5s"

  const hasGyro = currentHeading !== null

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--gold-dim)" strokeWidth="1" />

        {/* Progress arc — fills as user rotates toward target, updated via ref */}
        {hasGyro && arcRef && (
          <circle
            ref={arcRef}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            strokeLinecap="round"
            transform={`rotate(-90, ${cx}, ${cy})`}
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        )}

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

        {/* Compass needle — rotated via ref on mobile (RAF), static on desktop */}
        {!allComplete && (
          hasGyro && needleRef ? (
            <g ref={needleRef} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <line x1={cx} y1={cy} x2={cx} y2={cy - radius * 0.5} stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
              <circle cx={cx} cy={cy} r={4} fill="var(--gold)" />
            </g>
          ) : (
            <g style={{ transform: `rotate(${staticArrowAngle}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
              <line x1={cx} y1={cy} x2={cx + radius * 0.5} y2={cy} stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <polygon
                points={`${cx + radius * 0.5 + 6},${cy} ${cx + radius * 0.5 - 2},${cy - 4} ${cx + radius * 0.5 - 2},${cy + 4}`}
                fill="var(--gold)"
                opacity="0.8"
              />
            </g>
          )
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
