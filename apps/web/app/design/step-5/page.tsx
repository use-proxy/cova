'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useFingerprintStore } from '@/lib/store/fingerprint'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOM_TYPES = ['Living Room', 'Bedroom', 'Kitchen', 'Dining Room', 'Office', 'Other']

const BUDGET_TIERS = [
  { label: 'Budget', range: '$500–2K', min: 500, max: 2000 },
  { label: 'Mid-Range', range: '$2K–8K', min: 2000, max: 8000 },
  { label: 'Premium', range: '$8K–20K', min: 8000, max: 20000 },
  { label: 'Luxury', range: '$20K+', min: 20000, max: 100000 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBudget(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value}`
}

function getActiveTierIndex(budgetMax: number): number {
  if (budgetMax <= 2000) return 0
  if (budgetMax <= 8000) return 1
  if (budgetMax <= 20000) return 2
  return 3
}

// ─── Animation Variants ──────────────────────────────────────────────────────

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Step5Page() {
  const router = useRouter()
  const fingerprintStore = useFingerprintStore()

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [budgetMin, setBudgetMin] = useState(2000)
  const [budgetMax, setBudgetMax] = useState(8000)

  const activeTierIndex = getActiveTierIndex(budgetMax)

  function handleContinue() {
    // Persist to fingerprint store
    if (selectedRoom) {
      fingerprintStore.setRoomType(selectedRoom)
    }

    // Map to BudgetTier type
    const tierMap = ['budget', 'mid', 'premium', 'luxury'] as const
    fingerprintStore.setBudget(tierMap[activeTierIndex], [budgetMin, budgetMax])

    router.push('/design/step-6')
  }

  return (
    <div className="min-h-screen bg-[#091829] font-dm-sans">

      {/* Gold progress bar */}
      <div
        className="fixed top-0 left-0 right-0 z-[60]"
        style={{ height: 3, background: 'rgba(201,168,76,0.15)' }}
      >
        <div
          className="h-full bg-cova-gold transition-[width] duration-[400ms] ease-out"
          style={{ width: '57%' }}
        />
      </div>

      {/* Frosted glass top bar */}
      <div
        className="sticky top-0 h-14 z-[50] flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">
          Budget Setup
        </span>
        <span className="font-dm-sans text-[13px] text-cova-muted">
          Step 4 of 7
        </span>
      </div>

      {/* Main content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="pt-12 pb-[120px] px-6 max-w-[640px] mx-auto"
      >

        {/* Section heading */}
        <motion.h1
          variants={item}
          className="font-playfair text-4xl font-normal text-cova-ivory mb-8 mt-0"
        >
          Tell us about your space.
        </motion.h1>

        {/* Room type selector */}
        <motion.div variants={item} className="mb-8">
          <p className="font-dm-sans font-medium text-[11px] text-cova-muted uppercase tracking-[0.12em] mb-3">
            ROOM TYPE
          </p>
          <div className="flex flex-wrap gap-2">
            {ROOM_TYPES.map((room) => (
              <button
                key={room}
                onClick={() => setSelectedRoom(room)}
                className="rounded-full font-dm-sans text-sm cursor-pointer transition-all duration-200 ease-out"
                style={{
                  padding: '8px 18px',
                  border: selectedRoom === room
                    ? '1px solid #C9A84C'
                    : '1px solid rgba(201,168,76,0.15)',
                  background: selectedRoom === room
                    ? '#C9A84C'
                    : 'rgba(255,255,255,0.04)',
                  color: selectedRoom === room
                    ? '#091829'
                    : '#F5F0E8',
                }}
              >
                {room}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Budget range display */}
        <motion.p
          variants={item}
          className="font-dm-sans text-lg text-cova-ivory text-center mt-8 mb-4"
        >
          Your budget: {formatBudget(budgetMin)} – {formatBudget(budgetMax)}
        </motion.p>

        {/* Budget sliders */}
        <motion.div variants={item} className="mb-4">
          <div className="mb-3">
            <label className="font-dm-sans text-[11px] text-cova-muted uppercase tracking-[0.1em] block mb-[6px]">
              Minimum
            </label>
            <input
              type="range"
              value={budgetMin}
              min={500}
              max={budgetMax - 500}
              step={500}
              onChange={(e) => setBudgetMin(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: '#C9A84C' }}
            />
          </div>
          <div>
            <label className="font-dm-sans text-[11px] text-cova-muted uppercase tracking-[0.1em] block mb-[6px]">
              Maximum
            </label>
            <input
              type="range"
              value={budgetMax}
              min={budgetMin + 500}
              max={100000}
              step={500}
              onChange={(e) => setBudgetMax(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: '#C9A84C' }}
            />
          </div>
        </motion.div>

        {/* Budget tier cards */}
        <motion.div
          variants={item}
          className="grid grid-cols-4 gap-2 mb-10"
        >
          {BUDGET_TIERS.map((tier, index) => {
            const isActive = activeTierIndex === index
            return (
              <div
                key={tier.label}
                className="rounded-xl p-3 transition-all duration-200 ease-out"
                style={{
                  border: `1px solid ${isActive ? '#C9A84C' : 'rgba(201,168,76,0.15)'}`,
                  background: isActive ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.04)',
                }}
              >
                <p
                  className="font-dm-sans font-semibold text-[13px] mb-1"
                  style={{ color: isActive ? '#C9A84C' : 'rgba(245,240,232,0.45)' }}
                >
                  {tier.label}
                </p>
                <p className="font-dm-sans text-[11px] text-cova-muted">
                  {tier.range}
                </p>
              </div>
            )
          })}
        </motion.div>

        {/* CTA */}
        <motion.div variants={item} className="flex justify-center">
          <motion.button
            onClick={handleContinue}
            whileHover={{ scale: 1.02, backgroundColor: '#D4B460' }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="bg-cova-gold text-[#091829] font-dm-sans font-semibold text-[15px] rounded-lg border-none mt-10 cursor-pointer"
            style={{ padding: '12px 24px' }}
          >
            Continue →
          </motion.button>
        </motion.div>

      </motion.div>
    </div>
  )
}
