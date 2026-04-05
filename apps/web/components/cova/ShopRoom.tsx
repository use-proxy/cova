'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedItem {
  id: string
  label: string
  left: number  // bbox center X as % of image width (0–100)
  top: number   // bbox center Y as % of image height (0–100)
}

export interface MatchedProduct {
  id: string
  name: string
  retailer: string
  price: number
  affiliate_url: string
  image_url: string
  match_score: number
  match_label: 'Perfect Match' | 'Very Similar' | 'Inspired By'
}

interface ShopRoomProps {
  renderUrl: string
  detections: DetectedItem[]
  productsByItem: Record<string, MatchedProduct[]>
  isLoadingProducts: boolean
  onBuyClick: (product: MatchedProduct) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLLAPSED_VISIBLE_PX = 130

const MATCH_COLORS = {
  'Perfect Match': '#4A9B7F',
  'Very Similar': '#C9A84C',
  'Inspired By': '#8A9BB5',
} as const

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex-shrink-0 rounded-xl overflow-hidden relative"
      style={{ width: '168px', height: '220px', backgroundColor: '#F5F0E8' }}
    >
      <motion.div
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '50%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
        }}
      />
    </div>
  )
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onBuyClick,
}: {
  product: MatchedProduct
  onBuyClick: () => void
}) {
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(product.price)

  const matchColor = MATCH_COLORS[product.match_label]

  return (
    <div
      className="flex-shrink-0 rounded-xl overflow-hidden"
      style={{ width: '168px', backgroundColor: '#091829', border: '1px solid #1E3A5F' }}
    >
      {/* Product image */}
      <div style={{ height: '112px', overflow: 'hidden', backgroundColor: '#0F1F3D' }}>
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#0F1F3D' }} />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 10px 12px' }}>
        {/* Match badge */}
        <span
          className="font-sans text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ color: matchColor, backgroundColor: `${matchColor}1A` }}
        >
          {product.match_label}
        </span>

        {/* Name */}
        <p
          className="font-sans text-[12px] font-medium mt-1.5 leading-tight"
          style={{
            color: '#F8F6F1',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {product.name}
        </p>

        {/* Retailer + price */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-sans text-[11px]" style={{ color: '#8A9BB5' }}>
            {product.retailer}
          </span>
          <span className="font-sans text-[13px] font-semibold" style={{ color: '#C9A84C' }}>
            {formattedPrice}
          </span>
        </div>

        {/* Buy button */}
        <button
          onClick={onBuyClick}
          className="w-full mt-2 font-sans text-[12px] font-semibold py-2 rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#C9A84C', color: '#091829', border: 'none', cursor: 'pointer' }}
        >
          Buy →
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShopRoom({
  renderUrl,
  detections,
  productsByItem,
  isLoadingProducts,
  onBuyClick,
}: ShopRoomProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState(detections[0]?.id ?? '')
  const [dotsVisible, setDotsVisible] = useState(false)

  // Reveal dots after 1.5s
  useEffect(() => {
    const t = setTimeout(() => setDotsVisible(true), 1500)
    return () => clearTimeout(t)
  }, [])

  // Sync activeTab when detections first arrive
  useEffect(() => {
    if (!activeTab && detections.length > 0) {
      setActiveTab(detections[0].id)
    }
  }, [detections, activeTab])

  const currentProducts = productsByItem[activeTab] ?? []
  const visibleItemCount = detections.filter((d) => d.id !== 'your-room').length

  function handleDotClick(item: DetectedItem) {
    setActiveTab(item.id)
    setIsExpanded(true)
  }

  function handlePillClick(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setActiveTab(id)
    setIsExpanded(true)
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: '#091829' }}>
      {/* ── Background render ──────────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={renderUrl}
        alt="Your redesigned room"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* ── Hotspot dots ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {dotsVisible &&
          detections.map((item) => {
            // No dot for synthetic "your-room" fallback item
            if (item.id === 'your-room') return null
            const isActive = activeTab === item.id

            return (
              <motion.button
                key={item.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                onClick={() => handleDotClick(item)}
                style={{
                  position: 'absolute',
                  left: `${item.left}%`,
                  top: `${item.top}%`,
                  transform: 'translate(-50%, -50%)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                {/* Outer ring */}
                <span
                  style={{
                    display: 'block',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'rgba(201,168,76,0.35)' : 'rgba(201,168,76,0.2)',
                    border: '2px solid #C9A84C',
                    boxShadow: isActive
                      ? '0 0 14px rgba(201,168,76,0.7)'
                      : '0 0 6px rgba(201,168,76,0.35)',
                    position: 'relative',
                  }}
                >
                  {/* Inner dot */}
                  <span
                    style={{
                      display: 'block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: '#C9A84C',
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                </span>
              </motion.button>
            )
          })}
      </AnimatePresence>

      {/* ── Bottom sheet ───────────────────────────────────────────────────── */}
      <motion.div
        animate={{ y: isExpanded ? 0 : `calc(100% - ${COLLAPSED_VISIBLE_PX}px)` }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '72vh',
          backgroundColor: '#0D2035',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Always-visible header ─────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-5 pt-3 pb-2 cursor-pointer"
          onClick={() => setIsExpanded((v) => !v)}
        >
          {/* Drag handle */}
          <div className="flex justify-center mb-3">
            <div className="w-8 h-1 rounded-full" style={{ backgroundColor: '#1E3A5F' }} />
          </div>

          {/* Title + chevron */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-sans text-[14px] font-medium" style={{ color: '#F8F6F1' }}>
              {visibleItemCount > 0 ? `${visibleItemCount} items found` : 'Tap items to explore'}
            </span>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M5 12.5l5-5 5 5"
                  stroke="#8A9BB5"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </div>

          {/* Item pills */}
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            {detections.map((item) => {
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={(e) => handlePillClick(item.id, e)}
                  className="flex-shrink-0 font-sans text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor: isActive ? '#C9A84C' : 'transparent',
                    color: isActive ? '#091829' : '#8A9BB5',
                    border: `1px solid ${isActive ? '#C9A84C' : '#1E3A5F'}`,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Expanded: product grid ────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-5 pt-2 pb-6"
          style={{ scrollbarWidth: 'none' }}
        >
          {/* Tab bar — mirrors pills for clarity when expanded */}
          <div
            className="flex gap-2 overflow-x-auto mb-4"
            style={{ scrollbarWidth: 'none' }}
          >
            {detections.map((item) => {
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="flex-shrink-0 font-sans text-[13px] font-medium px-4 py-2 rounded-full transition-colors"
                  style={{
                    backgroundColor: isActive ? '#C9A84C' : 'transparent',
                    color: isActive ? '#091829' : '#8A9BB5',
                    border: `1px solid ${isActive ? '#C9A84C' : '#1E3A5F'}`,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {/* Product cards */}
          <div
            className="flex gap-3 overflow-x-auto pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {isLoadingProducts && currentProducts.length === 0 ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : currentProducts.length > 0 ? (
              currentProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onBuyClick={() => onBuyClick(product)}
                />
              ))
            ) : (
              <p className="font-sans text-[13px]" style={{ color: '#8A9BB5' }}>
                No products found for this item.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
