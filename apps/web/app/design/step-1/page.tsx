'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { StepIndicator } from '@/components/cova/StepIndicator'
import { CovaButton } from '@/components/cova/CovaButton'
import { Switch } from '@/components/ui/switch'
import { useFingerprintStore, useSessionStore } from '@/lib/store'

// ─── Data ─────────────────────────────────────────────────────────────────────

type BudgetTier = 'budget' | 'mid' | 'premium' | 'luxury'

const BUDGET_RANGE_MAP: Record<BudgetTier, [number, number]> = {
  budget:  [200, 500],
  mid:     [500, 2000],
  premium: [2000, 5000],
  luxury:  [5000, 25000],
}

const BUDGET_PREVIEW: Record<BudgetTier, string> = {
  budget:  'Expect essentials — sofa, key lighting, a few accent pieces',
  mid:     'Full room furnished with quality, well-made pieces',
  premium: 'Elevated materials and statement furniture',
  luxury:  'Investment pieces, designer brands, bespoke details',
}

const BUDGET_PILLS: Array<{ tier: BudgetTier; label: string }> = [
  { tier: 'budget',  label: 'Budget ($200–500)' },
  { tier: 'mid',     label: 'Mid-Range ($500–2K)' },
  { tier: 'premium', label: 'Premium ($2–5K)' },
  { tier: 'luxury',  label: 'Luxury ($5K+)' },
]

const ROOMS: Array<{ id: string; name: string; emoji: string; preset?: boolean }> = [
  { id: 'living-room',      name: 'Living Room',     emoji: '🛋️' },
  { id: 'bedroom',          name: 'Bedroom',          emoji: '🛏️' },
  { id: 'studio',           name: 'Studio',           emoji: '🏠' },
  { id: 'home-office',      name: 'Home Office',      emoji: '💻' },
  { id: 'dining-room',      name: 'Dining Room',      emoji: '🍽️' },
  { id: 'bathroom',         name: 'Bathroom',         emoji: '🚿' },
  { id: 'outdoor',          name: 'Outdoor',          emoji: '🌿' },
  { id: 'dorm-room',        name: 'Dorm Room',        emoji: '📚', preset: true },
  { id: 'first-apartment',  name: 'First Apartment',  emoji: '🔑', preset: true },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Step1Page() {
  const router = useRouter()

  const { roomType: storedRoomType, budgetTier: storedBudgetTier, setRoomType, setBudget, setGiftMode } = useFingerprintStore()
  const { setStep } = useSessionStore()

  // Local UI state — pre-populated from store (handles back navigation)
  const [selectedRoom, setSelectedRoom] = useState<string | null>(storedRoomType)
  const [selectedBudget, setSelectedBudget] = useState<BudgetTier | null>(storedBudgetTier as BudgetTier | null)
  const [isGiftMode, setIsGiftMode] = useState(false)

  // Sync store → local on mount in case store was hydrated from sessionStorage after render
  useEffect(() => {
    if (storedRoomType) setSelectedRoom(storedRoomType)
    if (storedBudgetTier) setSelectedBudget(storedBudgetTier as BudgetTier)
  }, [storedRoomType, storedBudgetTier])

  function handleContinue() {
    if (!selectedRoom) return
    const tier = selectedBudget ?? 'mid'
    setRoomType(selectedRoom)
    setBudget(tier, BUDGET_RANGE_MAP[tier])
    setGiftMode(isGiftMode)
    setStep(2)
    router.push('/design/step-2')
  }

  return (
    <div className="bg-cova-bg min-h-screen flex flex-col items-center px-6 py-8 font-sans pb-32">
      <div className="max-w-2xl w-full mx-auto">
        <StepIndicator currentStep={1} totalSteps={9} />

        {/* Heading */}
        <h1 className="font-serif text-3xl text-cova-ivory mt-8 mb-2">
          What are we designing today?
        </h1>
        <p className="text-sm text-cova-muted mb-8">Choose a room to get started</p>

        {/* Room type grid */}
        <div className="grid grid-cols-3 gap-3">
          {ROOMS.map((room, index) => {
            const isSelected = selectedRoom === room.id
            return (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04 }}
                className="relative"
              >
                {/* Using <button> so Playwright locator('button', {hasText}) finds it */}
                <button
                  type="button"
                  onClick={() => setSelectedRoom(room.id)}
                  className={[
                    'w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl',
                    'bg-cova-surface border cursor-pointer transition-all duration-150',
                    'hover:border-cova-border-gold hover:bg-cova-surface-3',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-cova-gold',
                    isSelected
                      ? 'border-cova-border-gold bg-cova-surface-3'
                      : 'border-cova-border',
                  ].join(' ')}
                >
                  {/* Gold checkmark badge */}
                  {isSelected && (
                    <span className="absolute top-2 right-2 text-xs bg-cova-gold text-cova-bg rounded-full w-5 h-5 flex items-center justify-center font-semibold z-10 pointer-events-none">
                      ✓
                    </span>
                  )}

                  <span className="text-2xl">{room.emoji}</span>
                  <span className="text-sm text-cova-ivory font-medium text-center leading-tight px-2">
                    {room.name}
                  </span>
                  {room.preset && (
                    <span className="text-xs text-cova-gold border border-cova-border rounded-full px-2 py-0.5">
                      Preset
                    </span>
                  )}
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* Budget selector */}
        <div className="mt-8">
          <p className="text-xs uppercase tracking-widest text-cova-muted mb-3">Budget</p>

          <div className="flex flex-row gap-2 flex-wrap">
            {BUDGET_PILLS.map(({ tier, label }) => {
              const isSelected = selectedBudget === tier
              return (
                <button
                  key={tier}
                  onClick={() => setSelectedBudget(tier)}
                  className={[
                    'px-4 py-2 rounded-full text-sm transition-all duration-150',
                    isSelected
                      ? 'bg-cova-gold text-cova-bg border border-cova-gold font-medium'
                      : 'bg-cova-surface border border-cova-border text-cova-ivory hover:border-cova-border-gold',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Budget preview text */}
          <p className="text-sm text-cova-muted mt-3 min-h-[1.25rem]">
            {selectedBudget ? BUDGET_PREVIEW[selectedBudget] : ''}
          </p>
        </div>

        {/* Gift mode toggle */}
        <div className="mt-4 flex items-center gap-3">
          <span className={`text-sm ${isGiftMode ? 'text-cova-ivory' : 'text-cova-muted'}`}>
            {isGiftMode ? 'Gift mode on' : 'Designing for someone else?'}
          </span>
          <Switch
            checked={isGiftMode}
            onCheckedChange={(checked) => setIsGiftMode(checked)}
            aria-label="Gift mode"
          />
        </div>
      </div>

      {/* Sticky CTA bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="fixed bottom-0 left-0 right-0 bg-cova-bg border-t border-cova-border-dim px-6 py-4"
      >
        <div className="max-w-2xl mx-auto">
          <CovaButton
            variant="primary"
            size="lg"
            disabled={!selectedRoom}
            onClick={handleContinue}
            className="w-full"
          >
            Start Designing →
          </CovaButton>
        </div>
      </motion.div>
    </div>
  )
}
