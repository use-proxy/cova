"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/AppShell"
import { ProductPanel } from "@/components/product/ProductPanel"
import type { Product } from "@/components/product/ProductCard"

// ─── Mock data (replaced by real pipeline output in M8) ───────────────────────

const MOCK_PRODUCTS: Product[] = [
  {
    id: "1",
    name: "Nomad Modular Sofa",
    retailer: "Article",
    price: 1299,
    originalPrice: null,
    availability: "In Stock",
    matchScore: 94,
    badge: "BEST MATCH",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600",
    dimensions: ['94"W', "Linen", "Ivory"],
    affiliateUrl: "https://article.com",
    similarItems: [
      { id: "s1", name: "Haven Sofa", price: 999, image: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=300" },
      { id: "s2", name: "Luna Sectional", price: 1599, image: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=300" },
      { id: "s3", name: "Arc Loveseat", price: 849, image: "https://images.unsplash.com/photo-1550254478-ead40cc54513?w=300" },
    ],
  },
  {
    id: "2",
    name: "Timeless Oak Coffee Table",
    retailer: "CB2",
    price: 649,
    originalPrice: 899,
    availability: "Ships in 2-3 weeks",
    matchScore: 87,
    badge: "SIMILAR",
    image: "https://images.unsplash.com/photo-1532372320572-cda25653a26d?w=600",
    dimensions: ['48"W', "Oak", "Natural"],
    affiliateUrl: "https://cb2.com",
    similarItems: [
      { id: "s4", name: "Slab Table", price: 449, image: "https://images.unsplash.com/photo-1530018607912-eff2daa1bac4?w=300" },
      { id: "s5", name: "Marble Round", price: 799, image: "https://images.unsplash.com/photo-1549187774-b4e9b0445b41?w=300" },
    ],
  },
  {
    id: "3",
    name: "Woven Jute Area Rug",
    retailer: "West Elm",
    price: 349,
    originalPrice: null,
    availability: "In Stock",
    matchScore: 81,
    badge: "BUDGET PICK",
    image: "https://images.unsplash.com/photo-1600166898405-da9535204843?w=600",
    dimensions: ["8'x10'", "Jute", "Natural"],
    affiliateUrl: "https://westelm.com",
    similarItems: [
      { id: "s6", name: "Wool Flatweave", price: 299, image: "https://images.unsplash.com/photo-1615971677499-5467cbab01c0?w=300" },
    ],
  },
]

interface Hotspot {
  id: string
  label: string
  x: number
  y: number
  products: Product[]
}

const MOCK_HOTSPOTS: Hotspot[] = [
  { id: "1", label: "Linen Sofa",       x: 48, y: 58, products: MOCK_PRODUCTS },
  { id: "2", label: "Oak Coffee Table",  x: 52, y: 72, products: MOCK_PRODUCTS.slice(1) },
  { id: "3", label: "Floor Lamp",        x: 72, y: 45, products: MOCK_PRODUCTS.slice(0, 2) },
  { id: "4", label: "Area Rug",          x: 50, y: 80, products: MOCK_PRODUCTS.slice(2) },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ViewerPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null)

  return (
    <AppShell>
      <div
        className="fixed inset-0"
        style={{ background: "#0a1628" }}
      >
        {/* Room background — placeholder for Daksh's 3D/splat viewer */}
        <img
          src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1600"
          alt="Room preview"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.6 }}
        />

        {/* Dark vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(10,22,40,0.7) 100%)",
          }}
        />

        {/* ── Back to Dashboard ── */}
        <button
          className="absolute top-5 left-5 z-20 flex items-center gap-2 px-3 py-2 rounded-xl text-xs uppercase tracking-wider font-medium transition-colors duration-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
          style={{
            background: "rgba(10,22,40,0.7)",
            border: "1px solid rgba(201,168,76,0.2)",
            color: "rgba(248,246,241,0.8)",
            backdropFilter: "blur(8px)",
            fontFamily: "Inter, sans-serif",
          }}
          onClick={() => router.push("/dashboard")}
          aria-label="Back to Dashboard"
        >
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
            <path d="M13 5H1M1 5L5 1M1 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </button>

        {/* Session ID badge */}
        <div
          className="absolute top-5 right-5 z-20 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider"
          style={{
            background: "rgba(10,22,40,0.7)",
            border: "1px solid rgba(201,168,76,0.2)",
            color: "rgba(201,168,76,0.7)",
            backdropFilter: "blur(8px)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {sessionId}
        </div>

        {/* ── Hotspots ── */}
        {MOCK_HOTSPOTS.map((hotspot) => {
          const isActive = activeHotspot?.id === hotspot.id
          return (
            <div
              key={hotspot.id}
              className="absolute z-10"
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
            >
              {/* Ripple ring */}
              {!isActive && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 40,
                    height: 40,
                    top: -8,
                    left: -8,
                    border: "1px solid rgba(201,168,76,0.4)",
                    animation: "hotspotPulse 2.5s ease-out infinite",
                  }}
                />
              )}

              {/* Dot button */}
              <button
                className="relative w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
                style={{
                  background: isActive ? "#C9A84C" : "rgba(201,168,76,0.85)",
                  boxShadow: isActive
                    ? "0 0 20px rgba(201,168,76,0.7)"
                    : "0 0 12px rgba(201,168,76,0.4)",
                }}
                onClick={() => setActiveHotspot(isActive ? null : hotspot)}
                aria-label={`View ${hotspot.label}`}
              >
                <div className="w-2 h-2 rounded-full bg-white" />
              </button>

              {/* Hover label */}
              {!isActive && (
                <div
                  className="absolute left-8 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-[10px] uppercase tracking-wide whitespace-nowrap pointer-events-none"
                  style={{
                    background: "rgba(10,22,40,0.85)",
                    border: "1px solid rgba(201,168,76,0.25)",
                    color: "#C9A84C",
                    fontFamily: "Inter, sans-serif",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  {hotspot.label}
                </div>
              )}
            </div>
          )
        })}

        {/* ── Product Panel ── */}
        <ProductPanel
          isOpen={!!activeHotspot}
          onClose={() => setActiveHotspot(null)}
          furnitureName={activeHotspot?.label ?? ""}
          products={activeHotspot?.products ?? []}
        />
      </div>
    </AppShell>
  )
}
