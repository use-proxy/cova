'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'

// ─── Anchor images ─────────────────────────────────────────────────────────────

const ANCHOR_IMAGES = [
  { id: 1, src: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&q=80', alt: 'Clean modern living room' },
  { id: 2, src: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80', alt: 'Warm bohemian space' },
  { id: 3, src: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80', alt: 'Contemporary bedroom' },
  { id: 4, src: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=600&q=80', alt: 'Scandinavian interior' },
  { id: 5, src: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80', alt: 'Industrial loft' },
  { id: 6, src: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80', alt: 'Luxury living room' },
  { id: 7, src: 'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=600&q=80', alt: 'Light airy bedroom' },
  { id: 8, src: 'https://images.unsplash.com/photo-1583845112203-29329902332e?w=600&q=80', alt: 'Japanese minimal' },
  { id: 9, src: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80', alt: 'Modern sofa' },
]

// Heights for masonry-like variation (alternating pattern across 3 columns)
const CARD_HEIGHTS = [260, 240, 280, 280, 260, 240, 240, 280, 260]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Step2Page() {
  const router = useRouter()
  const [selected, setSelected] = useState<number[]>([])

  function handleToggle(id: number) {
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id))
    } else if (selected.length < 2) {
      setSelected([...selected, id])
    }
    // If already 2 selected and this card isn't one of them, do nothing
  }

  function handleContinue() {
    if (selected.length < 2) return
    router.push('/design/step-3')
  }

  const canContinue = selected.length === 2

  return (
    <div className="min-h-screen bg-[#091829] font-dm-sans">
      {/* Gold progress bar — position fixed, z-index 60 */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div
          className="h-full bg-cova-gold transition-all duration-[400ms] ease-out"
          style={{ width: `${(1 / 7) * 100}%` }}
        />
      </div>

      {/* Frosted glass top bar */}
      <div
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6 border-b border-[rgba(201,168,76,0.1)]"
        style={{
          background: 'rgba(9,24,41,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {/* Wordmark */}
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        {/* Center label */}
        <span
          className="font-dm-sans font-semibold text-[15px] text-cova-ivory absolute left-1/2"
          style={{ transform: 'translateX(-50%)' }}
        >
          Choose your anchors
        </span>
        {/* Step counter */}
        <span className="font-dm-sans text-[13px] text-cova-muted">
          Step 1 of 7
        </span>
      </div>

      {/* Main content */}
      <div className="pt-20 pb-[120px] px-6 max-w-[1200px] mx-auto">
        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-playfair text-4xl font-normal text-cova-ivory mb-8"
        >
          Choose two rooms that feel like you.
        </motion.h1>

        {/* Image grid */}
        <motion.div
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
          initial="hidden"
          animate="show"
          className="grid grid-cols-3 gap-4"
        >
          {ANCHOR_IMAGES.map((img, i) => {
            const isSelected = selected.includes(img.id)
            const isDimmed = selected.length === 2 && !isSelected
            const cardHeight = CARD_HEIGHTS[i] ?? 260

            return (
              <motion.div
                key={img.id}
                variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
                onClick={() => handleToggle(img.id)}
                className="relative rounded-xl overflow-hidden transition-all duration-200 ease-out"
                style={{
                  cursor: isDimmed ? 'default' : 'pointer',
                  outline: isSelected ? '2px solid #C9A84C' : 'none',
                  opacity: isDimmed ? 0.5 : 1,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.alt}
                  className="w-full object-cover block"
                  style={{ height: cardHeight }}
                />

                {/* Gold checkmark badge */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-cova-gold flex items-center justify-center"
                    >
                      <Check size={16} color="#091829" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {/* Selection counter pill */}
      <div
        className="fixed z-40 bg-[rgba(255,255,255,0.04)] border border-[rgba(201,168,76,0.15)] rounded-full font-dm-sans text-sm text-cova-gold whitespace-nowrap"
        style={{
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 20px',
        }}
      >
        {selected.length} of 2 selected
      </div>

      {/* CTA button */}
      <div
        className="fixed z-40"
        style={{
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="bg-cova-gold text-[#091829] font-dm-sans font-semibold text-base rounded-lg transition-all duration-[300ms] ease-out"
          style={{
            padding: '14px 40px',
            border: 'none',
            cursor: canContinue ? 'pointer' : 'default',
            opacity: canContinue ? 1 : 0.4,
            pointerEvents: canContinue ? 'auto' : 'none',
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
