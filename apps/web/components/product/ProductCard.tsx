"use client"

import { useState, useRef, useCallback } from "react"
import { ShoppingBag, Heart, Eye } from "lucide-react"
import { ProductImageGallery } from "./ProductImageGallery"
import { SimilarItems } from "./SimilarItems"

interface SimilarItem {
  id: string
  name: string
  price: number
  image: string
}

export interface Product {
  id: string
  name: string
  retailer: string
  price: number
  originalPrice: number | null
  availability: string
  matchScore: number
  badge: string
  image: string
  dimensions: string[]
  affiliateUrl: string
  similarItems: SimilarItem[]
}

interface ProductCardProps {
  product: Product
  onClose: () => void
  onSimilarSelect: (id: string) => void
}

export function ProductCard({ product, onClose, onSimilarSelect }: ProductCardProps) {
  const [wishlisted, setWishlisted] = useState(false)
  const [showParticles, setShowParticles] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const matchBarRef = useRef<HTMLDivElement>(null)

  const handleWishlist = useCallback(() => {
    setWishlisted(true)
    setShowParticles(true)
    setTimeout(() => setShowParticles(false), 500)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }, [])

  const handleBuy = useCallback(() => {
    window.open(product.affiliateUrl, "_blank", "noopener,noreferrer")
  }, [product.affiliateUrl])

  const availabilityStyle = (() => {
    if (product.availability === "In Stock") return { bg: "rgba(20,100,60,0.12)", color: "#4ADE80" }
    if (product.availability.includes("Ships")) return { bg: "rgba(180,100,20,0.12)", color: "#C9A84C" }
    return { bg: "rgba(180,60,60,0.10)", color: "#F87171" }
  })()

  return (
    <div className="px-5 pb-8 overflow-y-auto flex-1">
      {/* Product image — stagger 200ms */}
      <div style={{ animation: "panelFadeUp 250ms ease-out 200ms both" }}>
        <ProductImageGallery image={product.image} badge={product.badge} retailer={product.retailer} />
      </div>

      {/* Product info — stagger 350ms */}
      <div style={{ animation: "panelFadeUp 250ms ease-out 350ms both" }}>
        <h3 className="font-serif text-xl text-white mt-4">{product.name}</h3>

        {/* Retailer + availability */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs font-sans text-white/50">{product.retailer}</span>
          <span
            className="text-[10px] font-sans uppercase tracking-[0.06em] px-2 py-0.5 rounded-full"
            style={{ background: availabilityStyle.bg, color: availabilityStyle.color }}
          >
            {product.availability}
          </span>
        </div>

        {/* Price */}
        <div className="mt-3 flex items-baseline gap-2">
          {product.originalPrice && (
            <span className="text-sm font-sans text-white/40 line-through">${product.originalPrice}</span>
          )}
          <span className={`font-serif text-2xl ${product.originalPrice ? "text-[#C9A84C]" : "text-white"}`}>
            ${product.price}
          </span>
        </div>

        {/* Dimension pills */}
        <div className="flex flex-wrap gap-2 mt-3">
          {product.dimensions.map((dim) => (
            <span
              key={dim}
              className="px-2.5 py-1 rounded-full text-[10px] font-sans uppercase tracking-[0.06em] text-white/50"
              style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}
            >
              {dim}
            </span>
          ))}
        </div>
      </div>

      {/* Match score — stagger 500ms */}
      <div className="mt-4" style={{ animation: "panelFadeUp 250ms ease-out 500ms both" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-sans text-white/50">Style match</span>
          <span className="text-xs font-sans text-[#C9A84C]">{product.matchScore}% match</span>
        </div>
        <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(201,168,76,0.1)" }}>
          <div
            ref={matchBarRef}
            className="h-full rounded-full"
            style={{
              "--match-score": `${product.matchScore}%`,
              width: `${product.matchScore}%`,
              background: "linear-gradient(90deg, #C9A84C, #D4B460)",
              animation: "matchFill 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 500ms both",
            } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Action buttons — stagger 650ms */}
      <div className="mt-6 flex flex-col gap-3" style={{ animation: "panelFadeUp 250ms ease-out 650ms both" }}>
        {/* Buy now */}
        <button
          onClick={handleBuy}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-sans text-sm font-semibold uppercase tracking-widest text-[#0a1628] transition-all duration-200 hover:brightness-110 hover:scale-[1.01] active:scale-[0.98]"
          style={{
            background: "linear-gradient(90deg, #C9A84C 0%, #E8C96A 48%, #C9A84C 100%)",
            backgroundSize: "200% auto",
          }}
          onMouseEnter={(e) => { (e.currentTarget.style.animation = "btnShimmer 600ms ease") }}
          onAnimationEnd={(e) => { (e.currentTarget.style.animation = "") }}
        >
          <ShoppingBag className="w-4 h-4" />
          Buy Now
        </button>

        {/* Wishlist */}
        <div className="relative">
          <button
            onClick={handleWishlist}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-sans text-xs uppercase tracking-widest transition-all duration-200"
            style={{
              border: wishlisted ? "1.5px solid #C9A84C" : "1.5px solid rgba(201,168,76,0.3)",
              color: wishlisted ? "#C9A84C" : "white",
            }}
          >
            <Heart className={`w-4 h-4 transition-all duration-300 ${wishlisted ? "fill-[#C9A84C] text-[#C9A84C] scale-110" : ""}`} />
            {wishlisted ? "Saved" : "Save to Wishlist"}
          </button>

          {/* Heart particles */}
          {showParticles && (
            <div className="absolute top-1/2 left-1/2 pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-[#C9A84C]"
                  style={{ animation: `wishParticle${i + 1} 500ms ease-out forwards` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* View in room */}
        <button
          onClick={onClose}
          className="flex items-center justify-center gap-1.5 py-2 text-xs font-sans uppercase tracking-widest text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          View in Room
        </button>
      </div>

      {/* Similar items — stagger 800ms */}
      <div style={{ animation: "panelFadeUp 250ms ease-out 800ms both" }}>
        <SimilarItems items={product.similarItems} onSelect={onSimilarSelect} />
      </div>

      {/* Toast */}
      {showToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-xl z-[60]"
          style={{
            background: "#0d1f3c",
            border: "1px solid rgba(201,168,76,0.3)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            animation: "slideUp 300ms ease-out",
          }}
        >
          <div className="w-4 h-4 rounded-full bg-[#C9A84C] flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <polyline points="1,4 3,6 7,2" stroke="#0a1628" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-xs font-sans text-white/80">Saved to wishlist</span>
        </div>
      )}
    </div>
  )
}
