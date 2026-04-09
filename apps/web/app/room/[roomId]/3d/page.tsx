"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ProductPanel } from "@/components/product/ProductPanel"
import { ChatBubble } from "@/components/chat/ChatBubble"
import { ChatPanel } from "@/components/chat/ChatPanel"
import type { Product } from "@/components/product/ProductCard"

export const dynamic = "force-dynamic"

// ─────────────────────────────────────────────────────────────────
// Mock data — mirrored from /product-panel test page
// ─────────────────────────────────────────────────────────────────
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
  { id: "1", label: "Linen Sofa",        x: 48, y: 58, products: MOCK_PRODUCTS },
  { id: "2", label: "Oak Coffee Table",  x: 52, y: 72, products: MOCK_PRODUCTS.slice(1) },
  { id: "3", label: "Floor Lamp",        x: 72, y: 45, products: MOCK_PRODUCTS.slice(0, 2) },
  { id: "4", label: "Area Rug",          x: 50, y: 80, products: MOCK_PRODUCTS.slice(2) },
]

// ─────────────────────────────────────────────────────────────────
// Hotspot component — same visual as /product-panel test page
// ─────────────────────────────────────────────────────────────────
function HotspotPin({
  hotspot,
  isActive,
  onClick,
}: {
  hotspot: Hotspot
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div
      className="absolute flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, zIndex: 10 }}
    >
      {/* Active label badge */}
      {isActive && (
        <span
          className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.1em] text-[#C9A84C]"
          style={{
            background: "rgba(13,31,60,0.9)",
            border: "1px solid #C9A84C",
            pointerEvents: "none",
          }}
        >
          {hotspot.label}
        </span>
      )}

      {/* Pulsing dot button */}
      <button
        onClick={onClick}
        className="group relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
        style={{
          border: `2px solid ${isActive ? "#C9A84C" : "rgba(201,168,76,0.7)"}`,
          background: isActive ? "rgba(201,168,76,0.25)" : "rgba(201,168,76,0.15)",
          boxShadow: isActive
            ? "0 0 30px rgba(201,168,76,0.5)"
            : "0 0 20px rgba(201,168,76,0.3)",
        }}
        aria-label={`View products for ${hotspot.label}`}
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

        {/* Hover label for non-active */}
        {!isActive && (
          <span
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-sans uppercase tracking-[0.08em] text-[#C9A84C] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{
              background: "rgba(13,31,60,0.9)",
              border: "1px solid rgba(201,168,76,0.3)",
            }}
          >
            {hotspot.label}
          </span>
        )}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────
export default function ThreeDRoomPage() {
  const router = useRouter()
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <>
      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes pageEnter {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes blob1Drift {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%       { transform: translate(40px, -30px) scale(1.05); }
          66%       { transform: translate(-20px, 35px) scale(0.97); }
        }
        @keyframes blob2Drift {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(-35px, 40px) scale(1.08); }
        }
      `}</style>

      {/* ── Root container — entry animation ── */}
      <div
        className="fixed inset-0 overflow-hidden"
        style={{ animation: "pageEnter 600ms ease-out both" }}
      >

        {/* ── Deep space background ── */}
        <div className="absolute inset-0" style={{ background: "#091829" }}>
          {/* Blob 1 — deep teal, top-left drift */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: "80vw",
              height: "60vh",
              top: "5%",
              left: "-10%",
              background: "radial-gradient(ellipse 80% 60% at 30% 40%, rgba(20,50,80,0.45), transparent)",
              animation: "blob1Drift 12s ease-in-out infinite",
            }}
          />
          {/* Blob 2 — deep indigo, bottom-right drift */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: "60vw",
              height: "80vh",
              bottom: "-10%",
              right: "-5%",
              background: "radial-gradient(ellipse 60% 80% at 70% 60%, rgba(40,20,60,0.35), transparent)",
              animation: "blob2Drift 12s ease-in-out infinite",
              animationDelay: "4s",
            }}
          />
        </div>

        {/* ── SparkJS mount target ── */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          data-sparkjs-3d-container="true"
        >
          <p
            className="font-sans text-[10px] uppercase tracking-widest select-none pointer-events-none"
            style={{ color: "rgba(201,168,76,0.35)", letterSpacing: "0.3em" }}
          >
            Exploring your room in 3D
          </p>
        </div>

        {/* ── TOP BAR ── */}
        <div className="absolute top-0 left-0 right-0 pt-12 px-5 flex items-start justify-end pointer-events-none">
          {/* 3D badge — top-right */}
          <span
            className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#C9A84C] rounded-full px-3 py-1 pointer-events-none"
            style={{
              border: "1px solid rgba(201,168,76,0.6)",
              background: "rgba(9,24,41,0.6)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            3D
          </span>
        </div>

        {/* ── HOTSPOTS ── */}
        {MOCK_HOTSPOTS.map((hotspot) => (
          <HotspotPin
            key={hotspot.id}
            hotspot={hotspot}
            isActive={activeHotspot?.id === hotspot.id}
            onClick={() =>
              setActiveHotspot(
                activeHotspot?.id === hotspot.id ? null : hotspot,
              )
            }
          />
        ))}

        {/* ── BOTTOM LEFT: Chat bubble ── */}
        <ChatBubble onClick={() => setChatOpen(true)} hasUnread={false} />

        {/* ── BOTTOM RIGHT: Back to 2D pill ── */}
        <div className="absolute bottom-8 right-5">
          <button
            onClick={() => router.back()}
            className="font-sans text-xs uppercase tracking-[0.15em] rounded-full px-4 py-2.5 cursor-pointer transition-all duration-200 hover:border-[#C9A84C]/60 active:scale-95"
            style={{
              color: "rgba(245,240,232,0.65)",
              background: "rgba(9,24,41,0.8)",
              border: "1px solid rgba(201,168,76,0.28)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            aria-label="Back to 2D view"
          >
            ← Back to 2D
          </button>
        </div>

        {/* ── PRODUCT PANEL ── */}
        <ProductPanel
          isOpen={activeHotspot !== null}
          onClose={() => setActiveHotspot(null)}
          furnitureName={activeHotspot?.label ?? ""}
          products={activeHotspot?.products ?? []}
          initialMatchIndex={0}
        />

        {/* ── CHAT PANEL ── */}
        <ChatPanel
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onMinimize={() => setChatOpen(false)}
        />
      </div>
    </>
  )
}
