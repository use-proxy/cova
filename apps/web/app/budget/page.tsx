'use client'

/**
 * Budget Calculator Panel
 * Bottom sheet UI: tier tabs, total display, item list with tier alternatives.
 * Preserves searchParams handling (roomId) and router navigation.
 */

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

// ─── Tier data ──────────────────────────────────────────────────────────────
const TIERS = ['Budget', 'Mid-Range', 'Premium', 'Luxury']
const TOTALS = [1240, 4240, 12800, 28500]
const ORIGINAL: (number | null)[] = [1890, 4880, null, null]
const SAVINGS: (number | null)[] = [650, 640, null, null]

// ─── Item list (label + product per tier) ────────────────────────────────────
const ITEMS = [
  {
    label: 'Sofa',
    products: [
      'Andover Mills Sofa $399',
      'Rivet Sofa $899',
      'Article Timber $2,400',
      'Restoration Hardware $7,200',
    ],
  },
  {
    label: 'Coffee Table',
    products: [
      'Zinus $89',
      'Article Sven $349',
      'CB2 Sphinx $1,100',
      'Minotti $3,800',
    ],
  },
  {
    label: 'Floor Lamp',
    products: [
      'Amazon Basics $45',
      'West Elm Arched $299',
      'FLOS IC F $890',
      'Apparatus Studio $3,200',
    ],
  },
  {
    label: 'Area Rug',
    products: [
      'Ruggable $189',
      'Ruggable Premium $489',
      'CR Laine $2,100',
      'Custom Tibetan $7,500',
    ],
  },
]

// ─── Inner component (needs Suspense for useSearchParams) ────────────────────
function BudgetInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Preserve roomId from searchParams — available for callers passing ?roomId=xxx
  const roomId = searchParams.get('roomId')
  void roomId // preserved for future Supabase data loading

  const [activeTier, setActiveTier] = useState(1) // default Mid-Range

  const total = TOTALS[activeTier]
  const original = ORIGINAL[activeTier]
  const savings = SAVINGS[activeTier]
  const isPremium = activeTier >= 2

  return (
    <div className="min-h-screen bg-black/60 flex items-end">
      {/* CSS keyframes for shimmer */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        className="w-full max-h-[80vh] overflow-y-auto rounded-t-[24px] px-6 pb-10 font-dm-sans"
        style={{
          background: 'rgba(9,24,41,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {/* Drag handle */}
        <div className="w-12 h-1 rounded-full mx-auto mt-2 mb-0" style={{ background: 'rgba(245,240,232,0.2)' }} />

        {/* Header row */}
        <div className="flex items-center justify-between pt-4">
          <p className="text-lg font-semibold text-cova-ivory m-0 font-dm-sans">
            Room Budget
          </p>
          <button
            onClick={() => router.back()}
            aria-label="Close"
            className="bg-transparent border-none cursor-pointer text-cova-ivory flex items-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tier tabs */}
        <div
          className="flex mb-6 mt-2"
          style={{ borderBottom: 'rgba(201,168,76,0.1) 1px solid' }}
        >
          {TIERS.map((tier, i) => (
            <button
              key={tier}
              onClick={() => setActiveTier(i)}
              className="font-dm-sans text-sm px-4 py-3 cursor-pointer bg-transparent border-none transition-all duration-200 ease-out"
              style={{
                borderBottom: activeTier === i ? '2px solid #C9A84C' : '2px solid transparent',
                color: activeTier === i ? '#F5F0E8' : 'rgba(245,240,232,0.45)',
                marginBottom: -1,
              }}
            >
              {tier}
            </button>
          ))}
        </div>

        {/* Total display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTier}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="text-center mb-6"
          >
            <p className="font-dm-sans text-[32px] font-bold text-cova-ivory mb-1.5">
              Total Room: ${total.toLocaleString()}
            </p>

            {original !== null && (
              <p className="font-dm-sans text-lg font-medium mb-2 line-through" style={{ color: 'rgba(245,240,232,0.3)' }}>
                Was ${original.toLocaleString()}
              </p>
            )}

            <div className="flex justify-center gap-2">
              {savings !== null && (
                <span
                  className="rounded-full px-3 py-1 font-dm-sans text-[13px] font-medium"
                  style={{ background: 'rgba(111,207,151,0.12)', color: '#6FCF97' }}
                >
                  Save ${savings.toLocaleString()}
                </span>
              )}
              {isPremium && (
                <span
                  className="rounded-full px-3 py-1 font-dm-sans text-[13px] font-medium text-cova-gold"
                  style={{ background: 'rgba(201,168,76,0.12)' }}
                >
                  Premium Selection
                </span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Item list */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`items-${activeTier}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {ITEMS.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-3 gap-2"
                style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}
              >
                {/* Item label */}
                <span className="font-dm-sans text-sm font-medium text-cova-ivory shrink-0 min-w-[80px]">
                  {item.label}
                </span>

                {/* Arrow */}
                <span className="text-cova-muted font-dm-sans text-sm shrink-0">→</span>

                {/* Tier alternative */}
                <span className="font-dm-sans text-sm text-cova-ivory flex-1 text-center">
                  {item.products[activeTier]}
                </span>

                {/* Shop link */}
                <button
                  className="font-dm-sans text-[13px] font-semibold text-cova-gold bg-transparent border-none cursor-pointer shrink-0 ml-4 transition-all duration-200 ease-out"
                >
                  Shop →
                </button>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─── Page export (Suspense boundary for useSearchParams) ────────────────────
export default function BudgetPage() {
  return (
    <div className="min-h-screen bg-cova-bg">
      <Suspense fallback={
        <div className="min-h-screen bg-cova-bg flex items-end">
          <div
            className="w-full h-[80vh] rounded-t-[24px] p-6"
            style={{ background: 'rgba(9,24,41,0.95)' }}
          >
            {/* Shimmer loading rows */}
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg mb-3"
                style={{
                  background: `linear-gradient(90deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 50%, rgba(201,168,76,0.08) 100%)`,
                  backgroundSize: '200% 100%',
                  animation: `shimmer 1.5s infinite ease-in-out ${i * 0.15}s`,
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </div>
      }>
        <BudgetInner />
      </Suspense>
    </div>
  )
}
