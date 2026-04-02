"use client"

import { useState, useEffect } from "react"

const STATUS_TEXTS = ["Thinking...", "Analyzing your room...", "Finding products...", "Crafting response..."]

export function TypingIndicator() {
  const [statusIdx, setStatusIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_TEXTS.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-start gap-3 max-w-[85%] animate-[msgLeft_200ms_ease-out]">
      <div
        className="px-4 py-3 rounded-2xl rounded-bl"
        style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]"
              style={{ animation: `dotBounce 1.2s ease infinite ${i * 0.2}s` }}
            />
          ))}
        </div>
        <p className="text-[10px] font-sans italic text-white/40 mt-1.5 transition-opacity duration-200">
          {STATUS_TEXTS[statusIdx]}
        </p>
      </div>
    </div>
  )
}
