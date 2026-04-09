'use client'

/**
 * Step 9 — Shoppable Room
 * Full-viewport redesigned room image with sonar hotspot markers and product bottom sheet.
 * Preserves all existing hotspot data, CSS animations, and store reads.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Share2, Heart, Layers, Palette, MousePointerClick } from 'lucide-react'
import { useRoomStore } from '@/lib/store/room'

// ─── Types ──────────────────────────────────────────────────────────────────
type SheetState = 'none' | 'product' | 'complete-room'

interface Hotspot {
  id: string
  top: string
  left: string
  label: string
  subtitle: string
  price: string
}

interface ProductOption {
  name: string
  price: string
  retailer: string
  matchType: 'perfect' | 'similar' | 'inspired'
}

// ─── Hotspot data (preserved from original) ──────────────────────────────────
const hotspots: Hotspot[] = [
  {
    id: 'sofa',
    top: '60%',
    left: '45%',
    label: 'Velvet Sectional Sofa',
    subtitle: 'The Midnight Series',
    price: '$4,250',
  },
  {
    id: 'armchair',
    top: '65%',
    left: '15%',
    label: 'Contour Swivel Chair',
    subtitle: 'Statement Seating',
    price: '$1,890',
  },
  {
    id: 'coffee-table',
    top: '75%',
    left: '55%',
    label: 'Brushed Brass Coffee Table',
    subtitle: 'Materiality',
    price: '$1,100',
  },
  {
    id: 'floor-lamp',
    top: '40%',
    left: '80%',
    label: 'Archival Arc Floor Lamp',
    subtitle: 'Illumination',
    price: '$745',
  },
  {
    id: 'side-table',
    top: '68%',
    left: '85%',
    label: 'Marble Plinth Side Table',
    subtitle: 'Accents',
    price: '$520',
  },
]

// ─── Mock product data ────────────────────────────────────────────────────────
const MOCK_PRODUCTS: Record<string, ProductOption[]> = {
  sofa: [
    { name: 'Velvet Sectional Sofa — Midnight Edition', price: '$4,250', retailer: 'Article', matchType: 'perfect' },
    { name: 'Modular Velvet L-Sofa', price: '$3,890', retailer: 'West Elm', matchType: 'similar' },
    { name: 'Deep Sectional Couch', price: '$2,199', retailer: 'Amazon', matchType: 'inspired' },
  ],
  armchair: [
    { name: 'Contour Swivel Lounge Chair', price: '$1,890', retailer: 'CB2', matchType: 'perfect' },
    { name: 'Arc Swivel Chair', price: '$1,450', retailer: 'Article', matchType: 'similar' },
    { name: 'Accent Armchair', price: '$599', retailer: 'Target', matchType: 'inspired' },
  ],
  'coffee-table': [
    { name: 'Brushed Brass Round Coffee Table', price: '$1,100', retailer: 'Crate & Barrel', matchType: 'perfect' },
    { name: 'Brass Drum Table', price: '$899', retailer: 'West Elm', matchType: 'similar' },
    { name: 'Metal Accent Table', price: '$349', retailer: 'IKEA', matchType: 'inspired' },
  ],
  'floor-lamp': [
    { name: 'Archival Arc Floor Lamp', price: '$745', retailer: 'One Kings Lane', matchType: 'perfect' },
    { name: 'Modern Arc Lamp', price: '$599', retailer: 'West Elm', matchType: 'similar' },
    { name: 'IKEA HEKTAR Lamp', price: '$89', retailer: 'IKEA', matchType: 'inspired' },
  ],
  'side-table': [
    { name: 'White Marble Plinth Side Table', price: '$520', retailer: 'CB2', matchType: 'perfect' },
    { name: 'Travertine Side Table', price: '$399', retailer: 'Article', matchType: 'similar' },
    { name: 'Stone Side Table', price: '$179', retailer: 'Target', matchType: 'inspired' },
  ],
}

// ─── Complementary items for "Complete the Room" ──────────────────────────────
const COMPLEMENTARY = [
  {
    label: 'Area Rug',
    reason: 'Grounds the seating arrangement with warmth.',
    products: ['Ruggable Woven $189', 'Restoration Hardware $1,200', 'CB2 Flatweave $549'],
  },
  {
    label: 'Wall Art',
    reason: 'Adds editorial depth to the backdrop.',
    products: ['Etsy Print $85', 'Saatchi Art $380', 'West Elm Canvas $249'],
  },
  {
    label: 'Throw Pillows',
    reason: 'Ties the palette together with texture.',
    products: ['Article Set $95', 'Pottery Barn $145', 'Amazon Velvet $39'],
  },
]

// ─── Stagger animation variants (preserved) ──────────────────────────────────
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 30 },
  },
}

const navVariants = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

// ─── Match badge helper ────────────────────────────────────────────────────────
function MatchBadge({ type }: { type: 'perfect' | 'similar' | 'inspired' }) {
  const map = {
    perfect: { label: 'Perfect Match', bg: 'rgba(201,168,76,0.12)', color: '#C9A84C' },
    similar: { label: 'Very Similar', bg: 'rgba(111,207,151,0.12)', color: '#6FCF97' },
    inspired: { label: 'Inspired By', bg: 'rgba(201,168,76,0.12)', color: '#C9A84C' },
  }
  const { label, bg, color } = map[type]
  return (
    <span
      className="rounded-full py-[3px] px-[10px] font-dm-sans text-[11px] font-medium"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ShoppableRoomPage() {
  const router = useRouter()
  const roomStore = useRoomStore()

  const [sheetState, setSheetState] = useState<SheetState>('none')
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null)
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null)

  // Use store render URL, fall back to existing Unsplash demo image
  const roomImageUrl = roomStore.renderUrl ??
    'https://lh3.googleusercontent.com/aida-public/AB6AXuC8ia0La6aJcotWrR2QWhtGBF4H6ATNxuqztivj0W67IwKZ4Rd_miURT0Gs0yqo_AVpIPYMC2-3YgDID0tXARBrpccOcjEeOMXP18-n2aMH7LdeAqJC-LoU1NYQ9r1xCr8EwvwUxK3n1WvixJkpT7kIFD5kzweyRs1GlgGxwevDL9xcZU9h6-Fl89RCtI30ANV5BFHbVS5TEaylTb98oyU7oq8nI9z3GOavADjy6vGCG6kkNxKqo-cqTGfO70GdJoqY7NiX1xZEPH_V'

  const activeSpot = hotspots.find((h) => h.id === activeHotspot)
  const activeProducts = activeHotspot ? (MOCK_PRODUCTS[activeHotspot] ?? []) : []
  const primaryProduct = activeProducts[0]
  const alternativeProducts = activeProducts.slice(1)

  return (
    <div className="relative w-screen overflow-hidden bg-cova-bg" style={{ height: '100svh' }}>

      {/* CSS keyframes for sonar rings + hint pulse — kept as style tag */}
      <style>{`
        @keyframes sonar-ring {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
        @keyframes hint-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* ── Background Room Image ──────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={roomImageUrl}
          alt="AI-redesigned room"
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.7) contrast(1.1)' }}
        />
      </div>

      {/* ── Frosted Glass Top Bar ──────────────────────────────────────────── */}
      <motion.nav
        variants={navVariants}
        initial="hidden"
        animate="show"
        className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(201,168,76,0.1)',
        }}
      >
        {/* Left: back chevron */}
        <button
          aria-label="Go back"
          onClick={() => router.back()}
          className="bg-none border-none cursor-pointer text-cova-ivory flex items-center"
        >
          <ChevronLeft size={22} color="#F5F0E8" />
        </button>

        {/* Center: title */}
        <span
          className="absolute left-1/2 font-dm-sans text-[15px] font-semibold text-cova-ivory"
          style={{ transform: 'translateX(-50%)' }}
        >
          Shop This Look
        </span>

        {/* Right: share + budget pill */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Share"
            className="bg-none border-none cursor-pointer text-cova-ivory p-2 flex"
          >
            <Share2 size={18} />
          </button>
          <button
            onClick={() => router.push('/budget')}
            className="text-cova-gold bg-transparent rounded-full py-[6px] px-4 font-dm-sans text-[13px] font-medium cursor-pointer"
            style={{ border: '1px solid rgba(201,168,76,0.35)' }}
          >
            Budget Room
          </button>
        </div>
      </motion.nav>

      {/* ── Hotspot Markers ───────────────────────────────────────────────── */}
      <motion.div
        className="absolute inset-0 z-10"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {hotspots.map((spot) => (
          <motion.div
            key={spot.id}
            variants={itemVariants}
            className="absolute cursor-pointer"
            style={{ top: spot.top, left: spot.left }}
            onMouseEnter={() => setHoveredHotspot(spot.id)}
            onMouseLeave={() => setHoveredHotspot(null)}
            onClick={() => {
              setActiveHotspot(spot.id)
              setSheetState('product')
            }}
          >
            {/* Sonar ring 1 — kept as inline style (CSS animation) */}
            <div style={{
              position: 'absolute',
              width: 40, height: 40, borderRadius: '50%',
              border: '1.5px solid #C9A84C',
              animation: 'sonar-ring 2s ease-out infinite',
              top: 0, left: 0,
              transform: 'translate(-50%, -50%)',
            }} />
            {/* Sonar ring 2 (delayed) — kept as inline style (CSS animation) */}
            <div style={{
              position: 'absolute',
              width: 40, height: 40, borderRadius: '50%',
              border: '1.5px solid #C9A84C',
              animation: 'sonar-ring 2s ease-out infinite',
              animationDelay: '0.7s',
              top: 0, left: 0,
              transform: 'translate(-50%, -50%)',
            }} />
            {/* Center dot */}
            <div
              className="absolute w-5 h-5 rounded-full bg-cova-gold z-[1]"
              style={{
                transform: 'translate(-50%, -50%)',
                top: 0, left: 0,
                boxShadow: '0 0 15px rgba(201,168,76,0.5)',
              }}
            />

            {/* Tooltip on hover */}
            <AnimatePresence>
              {hoveredHotspot === spot.id && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute whitespace-nowrap rounded-lg py-[6px] px-3 pointer-events-none z-20"
                  style={{
                    bottom: '120%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(9,24,41,0.95)',
                    border: '1px solid rgba(201,168,76,0.15)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <p className="font-dm-sans text-[10px] uppercase tracking-[0.12em] mb-[2px]" style={{ color: 'rgba(201,168,76,0.6)' }}>
                    {spot.subtitle}
                  </p>
                  <p className="font-dm-sans text-[13px] text-cova-ivory">
                    {spot.label}
                  </p>
                  <p className="font-dm-sans text-[13px] font-bold text-cova-gold mt-[2px]">
                    {spot.price}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Bottom hint pill ────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-8 left-1/2 z-20"
        style={{
          transform: 'translateX(-50%)',
          animation: 'hint-pulse 2.5s ease infinite',
          display: sheetState !== 'none' ? 'none' : 'flex',
        }}
      >
        <div
          className="flex items-center gap-2 rounded-full py-[10px] px-5"
          style={{
            border: '1px solid rgba(201,168,76,0.2)',
            background: 'rgba(9,24,41,0.7)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <MousePointerClick size={14} color="#C9A84C" />
          <span className="font-dm-sans text-[13px] text-cova-muted">
            Tap any marker to shop
          </span>
        </div>
      </div>

      {/* ── Right sidebar (desktop) ─────────────────────────────────────────── */}
      <div
        className="absolute right-8 z-20 hidden md:flex flex-col gap-6"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      >
        {([
          { icon: Heart, label: 'Save' },
          { icon: Layers, label: 'View 3D' },
          { icon: Palette, label: 'Finish' },
        ] as const).map(({ icon: Icon, label }) => (
          <button
            key={label}
            aria-label={label}
            className="w-12 h-12 rounded-full text-cova-ivory flex items-center justify-center cursor-pointer"
            style={{
              border: '1px solid rgba(201,168,76,0.1)',
              background: 'rgba(9,24,41,0.6)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      {/* ── Overlay behind sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {sheetState !== 'none' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheetState('none')}
            className="fixed inset-0 bg-black/60 z-[90]"
          />
        )}
      </AnimatePresence>

      {/* ── STATE B — Product Bottom Sheet ──────────────────────────────────── */}
      <AnimatePresence>
        {sheetState === 'product' && activeSpot && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[100] overflow-y-auto rounded-[24px_24px_0_0] py-2 px-6 pb-8"
            style={{
              height: '60vh',
              maxHeight: '80vh',
              background: 'rgba(9,24,41,0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            {/* Drag handle */}
            <div className="w-12 h-1 bg-[rgba(245,240,232,0.2)] rounded mx-auto mt-2 mb-4" />

            {/* Matching label */}
            <p className="font-dm-sans text-[11px] text-cova-muted uppercase tracking-[0.12em] mb-4">
              Matching: {activeSpot.label}
            </p>

            {/* Primary product card */}
            {primaryProduct && (
              <div
                className="flex gap-4 mb-6 p-4 px-5 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                }}
              >
                {/* Image placeholder */}
                <div
                  className="w-20 h-20 rounded-xl flex-shrink-0"
                  style={{
                    background: `linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)`,
                  }}
                />
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <MatchBadge type={primaryProduct.matchType} />
                  <p
                    className="font-dm-sans text-[15px] font-semibold text-cova-ivory mt-[6px] mb-1 overflow-hidden"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                  >
                    {primaryProduct.name}
                  </p>
                  <p className="font-dm-sans text-xl font-bold text-cova-ivory mb-[2px]">
                    {activeSpot.price}
                  </p>
                  <p className="font-dm-sans text-[13px] text-cova-muted">
                    {primaryProduct.retailer}
                  </p>
                </div>
              </div>
            )}

            {/* Buy Now + Try in Room buttons */}
            <div className="flex gap-[10px] mb-6">
              <button
                className="flex-1 font-dm-sans text-[15px] font-semibold bg-cova-gold border-none rounded-lg p-3 cursor-pointer"
                style={{ color: '#091829' }}
              >
                Buy Now →
              </button>
              <button
                className="flex-1 font-dm-sans text-[15px] font-medium bg-transparent text-cova-ivory rounded-lg p-3 cursor-pointer"
                style={{ border: '1px solid rgba(201,168,76,0.35)' }}
              >
                Try in Room
              </button>
            </div>

            {/* More options */}
            {alternativeProducts.length > 0 && (
              <>
                <p className="font-dm-sans text-xs text-cova-muted uppercase tracking-[0.1em] mb-3">
                  More Options
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {alternativeProducts.map((product, i) => (
                    <div
                      key={i}
                      className="flex-[0_0_140px] rounded-xl p-3"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(201,168,76,0.15)',
                      }}
                    >
                      {/* Image placeholder */}
                      <div
                        className="w-full h-20 rounded-lg mb-2"
                        style={{ background: 'rgba(201,168,76,0.08)' }}
                      />
                      <p
                        className="font-dm-sans text-[13px] text-cova-ivory mb-1 overflow-hidden"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                      >
                        {product.name}
                      </p>
                      <p className="font-dm-sans text-sm font-bold text-cova-ivory mb-[6px]">
                        {product.price}
                      </p>
                      <button className="font-dm-sans text-[13px] font-semibold text-cova-gold bg-none border-none cursor-pointer p-0">
                        Shop →
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Complete the Room link */}
            <div className="text-center mt-5">
              <button
                onClick={() => setSheetState('complete-room')}
                className="font-dm-sans text-sm font-semibold text-cova-gold bg-none border-none cursor-pointer"
              >
                Complete the Room →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STATE D — Complete the Room Panel ───────────────────────────────── */}
      <AnimatePresence>
        {sheetState === 'complete-room' && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[110] max-h-[80vh] overflow-y-auto rounded-[24px_24px_0_0] px-6 pb-10"
            style={{
              background: 'rgba(9,24,41,0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            {/* Drag handle */}
            <div className="w-12 h-1 bg-[rgba(245,240,232,0.2)] rounded mx-auto mt-2" />

            {/* Header */}
            <div className="flex items-center justify-between py-4 pb-5">
              <h2 className="font-playfair text-[22px] text-cova-ivory m-0">
                Complete the Look
              </h2>
              <button
                onClick={() => setSheetState('product')}
                className="bg-none border-none cursor-pointer text-cova-ivory"
              >
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Complementary sections */}
            {COMPLEMENTARY.map((section) => (
              <div key={section.label} className="mb-7">
                <p className="font-dm-sans text-sm font-semibold text-cova-ivory mb-1">
                  {section.label}
                </p>
                <p className="font-dm-sans text-[13px] text-cova-muted italic mb-3">
                  {section.reason}
                </p>
                <div className="flex gap-3 overflow-x-auto">
                  {section.products.map((p, i) => (
                    <div
                      key={i}
                      className="flex-[0_0_140px] rounded-xl p-3"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(201,168,76,0.15)',
                      }}
                    >
                      <div
                        className="w-full h-20 rounded-lg mb-2"
                        style={{ background: 'rgba(201,168,76,0.08)' }}
                      />
                      <p className="font-dm-sans text-[13px] text-cova-ivory mb-[6px]">{p}</p>
                      <button className="font-dm-sans text-[13px] font-semibold text-cova-gold bg-none border-none cursor-pointer p-0">
                        Shop →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
