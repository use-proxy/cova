"use client"

import { useState } from "react"
import { ProductPanel } from "@/components/product/ProductPanel"
import type { Product } from "@/components/product/ProductCard"

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
  { id: "1", label: "Linen Sofa", x: 48, y: 58, products: MOCK_PRODUCTS },
  { id: "2", label: "Oak Coffee Table", x: 52, y: 72, products: MOCK_PRODUCTS.slice(1) },
  { id: "3", label: "Floor Lamp", x: 72, y: 45, products: MOCK_PRODUCTS.slice(0, 2) },
  { id: "4", label: "Area Rug", x: 50, y: 80, products: MOCK_PRODUCTS.slice(2) },
]

export default function ProductPanelTestPage() {
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null)

  return (
    <div className="fixed inset-0 bg-[#0a1628]">
      {/* Placeholder room image */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1600"
          alt="Room"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] via-transparent to-[#0a1628]/50" />
      </div>

      {/* Hotspots */}
      {MOCK_HOTSPOTS.map((hotspot) => {
        const isActive = activeHotspot?.id === hotspot.id
        return (
          <div
            key={hotspot.id}
            className="absolute flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
          >
            {/* Label badge — always visible when active, hover-visible otherwise */}
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.1em] text-[#C9A84C] transition-all duration-200 ${
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              style={{
                background: "rgba(13,31,60,0.9)",
                border: `1px solid ${isActive ? "#C9A84C" : "rgba(201,168,76,0.3)"}`,
                pointerEvents: "none",
              }}
            >
              {hotspot.label}
            </span>

            {/* Pulsing dot */}
            <button
              onClick={() => setActiveHotspot(hotspot)}
              className="group relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                border: `2px solid ${isActive ? "#C9A84C" : "rgba(201,168,76,0.7)"}`,
                background: isActive ? "rgba(201,168,76,0.25)" : "rgba(201,168,76,0.15)",
                boxShadow: isActive
                  ? "0 0 30px rgba(201,168,76,0.5)"
                  : "0 0 20px rgba(201,168,76,0.3)",
              }}
            >
              {/* Pulse ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1.5px solid rgba(201,168,76,0.4)",
                  animation: "dotPulse 1.5s ease infinite",
                }}
              />
              <div className="w-3 h-3 rounded-full bg-[#C9A84C]" />

              {/* Hover label for non-active hotspots */}
              {!isActive && (
                <span
                  className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-sans uppercase tracking-[0.08em] text-[#C9A84C] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                  style={{ background: "rgba(13,31,60,0.9)", border: "1px solid rgba(201,168,76,0.3)" }}
                >
                  {hotspot.label}
                </span>
              )}
            </button>
          </div>
        )
      })}

      {/* Product Panel */}
      <ProductPanel
        isOpen={activeHotspot !== null}
        onClose={() => setActiveHotspot(null)}
        furnitureName={activeHotspot?.label ?? ""}
        products={activeHotspot?.products ?? []}
        initialMatchIndex={0}
      />
    </div>
  )
}
