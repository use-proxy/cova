"use client"

import { useState, useCallback, Suspense } from "react"
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
  {
    id: 1,
    label: "STARTER",
    range: "Under $500",
    description: "Accent pieces and small updates that make a big difference",
    tags: ["Accent pieces", "Textiles", "Lighting"],
  },
  {
    id: 2,
    label: "REFRESH",
    range: "$500 \u2013 $2,000",
    description: "Key furniture pieces that anchor your new style",
    tags: ["Statement sofa", "Coffee table", "Rugs"],
  },
  {
    id: 3,
    label: "REDESIGN",
    range: "$2,000 \u2013 $5,000",
    description: "A complete room overhaul with premium pieces",
    tags: ["Full furniture set", "Premium brands", "Lighting"],
  },
  {
    id: 4,
    label: "PREMIUM",
    range: "$5,000 \u2013 $15,000",
    description: "Luxury furniture and designer pieces throughout",
    tags: ["Designer brands", "Custom pieces", "Full room"],
  },
  {
    id: 5,
    label: "LUXURY",
    range: "$15,000+",
    description: "No compromises. The finest furniture available",
    tags: ["Bespoke", "Designer", "White glove"],
  },
]

function BudgetInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session")

  const [selectedTier, setSelectedTier] = useState(2)
  const [transitioning, setTransitioning] = useState(false)
  const [saving, setSaving] = useState(false)

  const tier = TIERS[selectedTier - 1]

  const handleTierChange = useCallback((value: number) => {
    if (value === selectedTier) return
    setTransitioning(true)
    setTimeout(() => {
      setSelectedTier(value)
      setTransitioning(false)
    }, 150)
  }, [selectedTier])

  const handleContinue = useCallback(async () => {
    setSaving(true)
    if (sessionId) {
      try {
        const supabase = createBrowserClient()
        await supabase
          .from("style_sessions")
          .update({
            budget_tier: selectedTier,
            budget_range: tier.range,
          })
          .eq("id", sessionId)
      } catch (e) {
        console.error("Budget save error:", e)
      }
    }
    router.push(`/furniture?session=${sessionId}`)
  }, [sessionId, selectedTier, tier.range, router])

  return (
    <div className="fixed inset-0 bg-[#0a1628] flex flex-col overflow-hidden animate-[slideUp_300ms_ease-out]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-[60px] flex-shrink-0">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white/60 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-sans uppercase tracking-[0.15em] text-white/50">Your Budget</span>
        <div className="w-5" />
      </div>

      {/* Content — centered, max 480px */}
      <div className="flex-1 flex flex-col items-center px-5 overflow-y-auto">
        <div className="w-full max-w-[480px]">
          {/* Headline */}
          <div className="mt-8 mb-2 text-center">
            <h1 className="font-serif text-2xl text-white">How much are you looking to spend?</h1>
            <p className="text-xs font-sans uppercase tracking-wider text-white/50 mt-2">
              {"We\u2019ll match furniture to your budget"}
            </p>
          </div>

          {/* Tier card */}
          <div className="mt-8">
            <div
              className="rounded-2xl p-6 transition-all duration-150"
              style={{
                background: "#0d1f3c",
                border: "1px solid rgba(201,168,76,0.3)",
                opacity: transitioning ? 0 : 1,
                transform: transitioning ? "scale(0.97)" : "scale(1)",
              }}
            >
              {/* Tier label */}
              <p className="text-xs font-sans uppercase tracking-[0.15em] text-[#C9A84C] mb-1">
                {tier.label}
              </p>
              {/* Price range */}
              <p className="font-serif text-3xl text-white">{tier.range}</p>
              {/* Divider */}
              <div className="h-px my-3" style={{ background: "rgba(201,168,76,0.2)" }} />
              {/* Description */}
              <p className="text-sm font-sans text-white/50 leading-relaxed">{tier.description}</p>
              {/* Mood tags */}
              <div className="flex flex-wrap gap-2 mt-4">
                {tier.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.08em] text-[#C9A84C]"
                    style={{ border: "1px solid rgba(201,168,76,0.3)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Slider */}
          <div className="mt-6 px-1">
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={selectedTier}
              onChange={(e) => handleTierChange(Number(e.target.value))}
              className="budget-slider w-full"
            />
          </div>

          {/* Tier dots */}
          <div className="flex items-center justify-between mt-3 px-1">
            {TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTierChange(t.id)}
                className="flex items-center justify-center p-1"
              >
                <div
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: selectedTier === t.id ? 8 : 6,
                    height: selectedTier === t.id ? 8 : 6,
                    background: selectedTier === t.id ? "#C9A84C" : "transparent",
                    border: selectedTier === t.id ? "none" : "1.5px solid rgba(201,168,76,0.4)",
                  }}
                />
              </button>
            ))}
          </div>

          {/* CTA button */}
          <div className="mt-8 pb-8">
            <button
              onClick={handleContinue}
              disabled={saving}
              className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-[#0a1628] font-sans text-sm font-semibold uppercase tracking-widest transition-all duration-200 hover:bg-[#D4B460] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>
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
