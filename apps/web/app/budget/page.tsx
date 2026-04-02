"use client"

import { useState, useCallback, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { ChevronLeft } from "lucide-react"

interface Tier {
  id: number
  label: string
  range: string
  description: string
  tags: string[]
}

const TIERS: Tier[] = [
  { id: 1, label: "STARTER", range: "Under $500", description: "Accent pieces and small updates that make a big difference", tags: ["Accent pieces", "Textiles", "Lighting"] },
  { id: 2, label: "REFRESH", range: "$500 \u2013 $2,000", description: "Key furniture pieces that anchor your new style", tags: ["Statement sofa", "Coffee table", "Rugs"] },
  { id: 3, label: "REDESIGN", range: "$2,000 \u2013 $5,000", description: "A complete room overhaul with premium pieces", tags: ["Full furniture set", "Premium brands", "Lighting"] },
  { id: 4, label: "PREMIUM", range: "$5,000 \u2013 $15,000", description: "Luxury furniture and designer pieces throughout", tags: ["Designer brands", "Custom pieces", "Full room"] },
  { id: 5, label: "LUXURY", range: "$15,000+", description: "No compromises. The finest furniture available", tags: ["Bespoke", "Designer", "White glove"] },
]

// ─── Tier Card ─────────────────────────────────────────────
function TierCard({ tier, isSelected, onClick }: { tier: Tier; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}
      className="rounded-2xl relative overflow-hidden flex-shrink-0 transition-none"
      style={{
        width: 300,
        height: 280,
        padding: 28,
        background: isSelected
          ? "linear-gradient(135deg, #0d1f3c 0%, rgba(201,168,76,0.06) 50%, #0d1f3c 100%)"
          : "#0d1f3c",
        backgroundSize: isSelected ? "200% 200%" : undefined,
        animation: isSelected ? "cardShimmer 4s ease infinite" : undefined,
        border: isSelected ? "1.5px solid #C9A84C" : "1px solid rgba(201,168,76,0.2)",
        boxShadow: isSelected
          ? "0 32px 80px rgba(0,0,0,0.6), 0 0 40px rgba(201,168,76,0.15)"
          : "0 12px 40px rgba(0,0,0,0.3)",
        cursor: isSelected ? "default" : "pointer",
      }}
    >
      {/* Decorative number */}
      <span
        className="absolute font-serif font-bold pointer-events-none select-none"
        style={{ bottom: -10, right: 12, fontSize: 120, color: "rgba(201,168,76,0.04)", lineHeight: 1 }}
      >
        {tier.id}
      </span>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <p className="text-xs font-sans uppercase tracking-[0.15em] text-[#C9A84C] mb-2">{tier.label}</p>
        <p className="font-serif text-2xl text-white font-semibold mb-1">{tier.range}</p>
        <div className="w-10 h-px my-3" style={{ background: "rgba(201,168,76,0.3)" }} />
        <p className="text-xs font-sans text-white/50 leading-relaxed mb-4">{tier.description}</p>
        <div className="flex flex-wrap gap-2 mt-auto">
          {tier.tags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.08em] text-[#C9A84C]"
              style={{ border: "1px solid rgba(201,168,76,0.3)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Custom Slider ─────────────────────────────────────────
function TierSlider({ selected, onSelect }: { selected: number; onSelect: (tier: number) => void }) {
  const fillWidth = ((selected) / 4) * 100

  return (
    <div className="w-full px-5">
      {/* Track */}
      <div className="relative h-10 flex items-center">
        {/* Background track */}
        <div className="absolute left-4 right-4 h-[3px] rounded-full" style={{ background: "rgba(201,168,76,0.15)" }} />
        {/* Gold fill */}
        <div
          className="absolute left-4 h-[3px] rounded-full"
          style={{
            width: `calc(${fillWidth}% - 16px)`,
            background: "#C9A84C",
            transition: "width 400ms ease",
          }}
        />

        {/* Nodes */}
        <div className="relative flex items-center justify-between w-full px-2">
          {TIERS.map((t, i) => {
            const isActive = i === selected
            return (
              <button
                key={t.id}
                onClick={() => onSelect(i)}
                className="relative flex items-center justify-center w-8 h-8"
                aria-label={`Select ${t.label} tier`}
              >
                {/* Outer ring */}
                <div
                  className="absolute rounded-full transition-all duration-200"
                  style={{
                    width: 32,
                    height: 32,
                    border: `1.5px solid ${isActive ? "rgba(201,168,76,0.6)" : "rgba(201,168,76,0.2)"}`,
                    boxShadow: isActive ? "0 0 16px rgba(201,168,76,0.4)" : "none",
                  }}
                />
                {/* Inner dot */}
                <div
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: 8,
                    height: 8,
                    background: isActive || i <= selected ? "#C9A84C" : "#0d1f3c",
                  }}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between px-2 mt-1">
        {TIERS.map((t, i) => (
          <span
            key={t.id}
            className="text-[10px] font-sans uppercase tracking-[0.06em] transition-colors duration-200 w-8 text-center"
            style={{ color: i === selected ? "#C9A84C" : "rgba(255,255,255,0.35)" }}
          >
            {t.label.slice(0, 3)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main Budget Page ──────────────────────────────────────
function BudgetInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session")

  const [selected, setSelected] = useState(1) // 0-indexed
  const [bouncing, setBouncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPulse, setShowPulse] = useState(false)
  const dragStart = useRef<number | null>(null)

  const tier = TIERS[selected]

  // CTA pulse after 3s
  useEffect(() => {
    const timeout = setTimeout(() => setShowPulse(true), 3000)
    return () => clearTimeout(timeout)
  }, [])

  // Bounce on tier change
  useEffect(() => {
    setBouncing(true)
    const timeout = setTimeout(() => setBouncing(false), 400)
    return () => clearTimeout(timeout)
  }, [selected])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSelected((t) => Math.min(t + 1, 4))
      if (e.key === "ArrowLeft") setSelected((t) => Math.max(t - 1, 0))
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  // Swipe/drag navigation
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = e.clientX
  }, [])
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStart.current === null) return
    const delta = e.clientX - dragStart.current
    if (delta < -50) setSelected((t) => Math.min(t + 1, 4))
    if (delta > 50) setSelected((t) => Math.max(t - 1, 0))
    dragStart.current = null
  }, [])

  const handleContinue = useCallback(async () => {
    setSaving(true)
    if (sessionId) {
      try {
        const supabase = createBrowserClient()
        await supabase
          .from("style_sessions")
          .update({ budget_tier: selected + 1, budget_range: tier.range })
          .eq("id", sessionId)
      } catch (e) {
        console.error("Budget save error:", e)
      }
    }
    router.push(`/processing?session=${sessionId}`)
  }, [sessionId, selected, tier.range, router])

  return (
    <div className="fixed inset-0 bg-[#0a1628] flex flex-col overflow-hidden animate-[slideUp_300ms_ease-out]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-[60px] flex-shrink-0">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white/60 transition-colors p-2 -ml-2">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-sans uppercase tracking-[0.15em] text-white/50">Your Budget</span>
        <div className="w-9" />
      </div>

      {/* Content — vertically centered */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-5">
        {/* Headline */}
        <div className="text-center">
          <h1 className="font-serif text-2xl text-white">How much are you looking to spend?</h1>
          <p className="text-xs font-sans uppercase tracking-wider text-white/50 mt-2">
            {"We\u2019ll match furniture to your budget"}
          </p>
        </div>

        {/* 3D Carousel */}
        <div
          className="relative w-full touch-none select-none"
          style={{ perspective: 1200, height: 320 }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {TIERS.map((t, i) => {
              const offset = i - selected
              const isSelected = offset === 0
              const absOffset = Math.abs(offset)

              return (
                <div
                  key={t.id}
                  className="absolute"
                  style={{
                    transform: `
                      translateX(${offset * 220}px)
                      translateZ(${isSelected ? 0 : -120}px)
                      rotateY(${offset * -18}deg)
                      scale(${isSelected ? 1 : 0.82})
                    `,
                    opacity: isSelected ? 1 : Math.max(0.35, 1 - absOffset * 0.3),
                    zIndex: isSelected ? 10 : 5 - absOffset,
                    transition: "all 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                    animation: isSelected && bouncing ? "cardBounce 400ms ease-out" : undefined,
                  }}
                >
                  <TierCard tier={t} isSelected={isSelected} onClick={() => setSelected(i)} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Custom slider */}
        <TierSlider selected={selected} onSelect={setSelected} />

        {/* Budget estimate */}
        <p className="text-xs font-sans text-white/40 uppercase tracking-wider transition-all duration-200">
          Estimated budget: <span className="text-white/60">{tier.range}</span>
        </p>

        {/* CTA */}
        <button
          onClick={handleContinue}
          disabled={saving}
          className="w-full max-w-[480px] py-3.5 rounded-xl bg-[#C9A84C] text-[#0a1628] font-sans text-sm font-semibold uppercase tracking-widest transition-all duration-200 hover:bg-[#D4B460] disabled:opacity-50"
          style={{
            animation: showPulse && !saving ? "ctaPulse 2s ease infinite" : undefined,
          }}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  )
}

export default function BudgetPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a1628]">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BudgetInner />
    </Suspense>
  )
}
